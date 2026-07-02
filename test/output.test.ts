import { afterEach, describe, expect, it, vi } from 'vitest';
import { printMeta, renderHuman } from '../src/lib/output';
import type { ApiResponse } from '../src/client/http';

describe('renderHuman', () => {
  it('renders "(empty list)" for an empty array', () => {
    expect(renderHuman([])).toContain('(empty list)');
  });

  it('renders a table with a row-count line for an array of objects', () => {
    const result = renderHuman([
      { id: '1', name: 'a' },
      { id: '2', name: 'b' },
    ]);
    expect(result).toContain('id');
    expect(result).toContain('name');
    expect(result).toContain('2 rows');
  });

  it('renders a single-row table with singular "row" wording', () => {
    const result = renderHuman([{ id: '1', name: 'a' }]);
    expect(result).toContain('1 row');
    expect(result).not.toContain('1 rows');
  });

  it('renders key-value lines for a plain object', () => {
    const result = renderHuman({ foo: 'bar', count: 3 });
    expect(result).toContain('foo');
    expect(result).toContain('bar');
    expect(result).toContain('count');
    expect(result).toContain('3');
  });
});

describe('printMeta', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('writes exactly one {"pagination":...} line to stderr in json mode when pagination is present', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result: ApiResponse = {
      data: {},
      status: 200,
      raw: {},
      pagination: { page: 1, limit: 20, total: 42 },
    };

    printMeta(result, { json: true });

    expect(writeSpy).toHaveBeenCalledTimes(1);
    expect(writeSpy).toHaveBeenCalledWith(`${JSON.stringify({ pagination: result.pagination })}\n`);
  });

  it('writes nothing to stderr in json mode when pagination is absent', () => {
    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result: ApiResponse = { data: {}, status: 200, raw: {} };

    printMeta(result, { json: true });

    expect(writeSpy).not.toHaveBeenCalled();
  });
});
