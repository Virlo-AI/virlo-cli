import { describe, expect, it, vi } from 'vitest';
import { classifyStatus, extractStatus, pollUntilTerminal } from '../src/lib/poll';
import { NetworkError, VirloError } from '../src/client/errors';
import type { ApiResponse } from '../src/client/http';

describe('extractStatus', () => {
  it('reads a top-level status field, lower-cased', () => {
    expect(extractStatus({ status: 'Completed' })).toBe('completed');
  });

  it('reads a top-level state field', () => {
    expect(extractStatus({ state: 'PENDING' })).toBe('pending');
  });

  it('reads a nested latest_run.status field', () => {
    expect(extractStatus({ latest_run: { status: 'Failed' } })).toBe('failed');
  });

  it('reads a nested run.status field', () => {
    expect(extractStatus({ run: { status: 'Done' } })).toBe('done');
  });

  it('prefers status over state/nested fields when multiple are present', () => {
    expect(extractStatus({ status: 'completed', state: 'pending' })).toBe('completed');
  });

  it('returns undefined for non-object input', () => {
    expect(extractStatus(null)).toBeUndefined();
    expect(extractStatus(undefined)).toBeUndefined();
    expect(extractStatus('completed')).toBeUndefined();
    expect(extractStatus(42)).toBeUndefined();
  });

  it('returns undefined when no known field is present', () => {
    expect(extractStatus({ foo: 'bar' })).toBeUndefined();
  });
});

describe('classifyStatus', () => {
  it('classifies known done statuses, including partial_failure, as done', () => {
    for (const s of ['completed', 'complete', 'partial_failure', 'done', 'finished', 'success']) {
      expect(classifyStatus(s)).toBe('done');
    }
  });

  it('classifies known failed statuses as failed', () => {
    for (const s of ['failed', 'error', 'errored', 'cancelled', 'canceled']) {
      expect(classifyStatus(s)).toBe('failed');
    }
  });

  it('classifies unknown or undefined statuses as pending', () => {
    expect(classifyStatus('queued')).toBe('pending');
    expect(classifyStatus(undefined)).toBe('pending');
  });
});

function mkResponse<T>(data: T): ApiResponse<T> {
  return { data, status: 200, raw: data };
}

describe('pollUntilTerminal', () => {
  it('resolves after transient NetworkErrors (2 failures then success)', async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      if (calls <= 2) throw new NetworkError('transient hiccup');
      return mkResponse({ status: 'completed' });
    });

    const res = await pollUntilTerminal({ fetch, json: true, intervalMs: 1 });
    expect(res.data).toEqual({ status: 'completed' });
    expect(calls).toBe(3);
  });

  it('throws after 3 consecutive NetworkErrors', async () => {
    const fetch = vi.fn(async () => {
      throw new NetworkError('down');
    });

    await expect(pollUntilTerminal({ fetch, json: true, intervalMs: 1 })).rejects.toThrow(NetworkError);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('rethrows a non-NetworkError immediately without retrying', async () => {
    const boom = new VirloError('nope');
    const fetch = vi.fn(async () => {
      throw boom;
    });

    await expect(pollUntilTerminal({ fetch, json: true, intervalMs: 1 })).rejects.toBe(boom);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps polling while status is pending, then returns on terminal status', async () => {
    let calls = 0;
    const fetch = vi.fn(async () => {
      calls += 1;
      return mkResponse({ status: calls < 3 ? 'pending' : 'failed' });
    });

    const res = await pollUntilTerminal({ fetch, json: true, intervalMs: 1 });
    expect(res.data).toEqual({ status: 'failed' });
    expect(calls).toBe(3);
  });
});
