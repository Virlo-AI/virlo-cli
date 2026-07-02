import { afterEach, describe, expect, it } from 'vitest';
import { buildUrl, extractMessage, mapError, resolveTimeoutMs } from '../src/client/http';
import {
  ApiError,
  AuthError,
  InsufficientCreditsError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../src/client/errors';

describe('buildUrl', () => {
  it('encodes query values', () => {
    const url = buildUrl('https://api.example.com', '/v1/foo', { q: 'hello world', n: 5 });
    expect(url).toBe('https://api.example.com/v1/foo?q=hello+world&n=5');
  });

  it('joins array values as a CSV query param', () => {
    const url = buildUrl('https://api.example.com', '/v1/foo', { platforms: ['tiktok', 'youtube'] });
    expect(url).toBe('https://api.example.com/v1/foo?platforms=tiktok%2Cyoutube');
  });

  it('skips undefined, null, and empty-array values', () => {
    const url = buildUrl('https://api.example.com', '/v1/foo', {
      a: undefined,
      b: null,
      c: [],
      d: 'kept',
    });
    expect(url).toBe('https://api.example.com/v1/foo?d=kept');
  });

  it('prefixes the path with / when missing', () => {
    const url = buildUrl('https://api.example.com', 'v1/foo');
    expect(url).toBe('https://api.example.com/v1/foo');
  });
});

describe('extractMessage', () => {
  it('returns a string message field', () => {
    expect(extractMessage({ message: 'oops' }, 'fallback')).toBe('oops');
  });

  it('joins a string[] message field with "; "', () => {
    expect(extractMessage({ message: ['name is required', 'keywords must not be empty'] }, 'fallback')).toBe(
      'name is required; keywords must not be empty',
    );
  });

  it('falls back to an error field when message is absent', () => {
    expect(extractMessage({ error: 'bad request' }, 'fallback')).toBe('bad request');
  });

  it('handles a plain-string body', () => {
    expect(extractMessage('  something broke  ', 'fallback')).toBe('something broke');
  });

  it('falls back to the provided default when nothing usable is found', () => {
    expect(extractMessage({}, 'fallback')).toBe('fallback');
    expect(extractMessage(null, 'fallback')).toBe('fallback');
    expect(extractMessage(undefined, 'fallback')).toBe('fallback');
    expect(extractMessage('   ', 'fallback')).toBe('fallback');
  });
});

describe('mapError', () => {
  const noHeaders = new Headers();

  it('maps 401 to AuthError with exit code 3', () => {
    const err = mapError(401, {}, noHeaders);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.exitCode).toBe(3);
  });

  it('maps 402 to InsufficientCreditsError with exit code 4 and details', () => {
    const body = {
      required_credits: 10,
      remaining_credits: 2,
      required_amount: '$1.00',
      remaining_balance: '$0.20',
    };
    const err = mapError(402, body, noHeaders);
    expect(err).toBeInstanceOf(InsufficientCreditsError);
    expect(err.exitCode).toBe(4);
    expect((err as InsufficientCreditsError).details).toEqual({
      requiredCredits: 10,
      remainingCredits: 2,
      requiredAmount: '$1.00',
      remainingBalance: '$0.20',
    });
  });

  it('maps 429 to RateLimitError with exit code 5 and a retry-after suffix', () => {
    const headers = new Headers({ 'retry-after': '30' });
    const err = mapError(429, {}, headers);
    expect(err).toBeInstanceOf(RateLimitError);
    expect(err.exitCode).toBe(5);
    expect(err.message).toContain('Retry after 30s.');
    expect((err as RateLimitError).retryAfterSeconds).toBe(30);
  });

  it('maps 400 to ValidationError with exit code 2', () => {
    const err = mapError(400, {}, noHeaders);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.exitCode).toBe(2);
  });

  it('maps 404 to NotFoundError with exit code 6', () => {
    const err = mapError(404, {}, noHeaders);
    expect(err).toBeInstanceOf(NotFoundError);
    expect(err.exitCode).toBe(6);
  });

  it('maps other statuses (e.g. 500) to ApiError with exit code 1', () => {
    const err = mapError(500, { message: 'boom' }, noHeaders);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.exitCode).toBe(1);
    expect((err as ApiError).status).toBe(500);
  });
});

describe('resolveTimeoutMs', () => {
  const original = process.env.VIRLO_TIMEOUT_MS;

  afterEach(() => {
    if (original === undefined) delete process.env.VIRLO_TIMEOUT_MS;
    else process.env.VIRLO_TIMEOUT_MS = original;
  });

  it('defaults to 60000 when unset', () => {
    delete process.env.VIRLO_TIMEOUT_MS;
    expect(resolveTimeoutMs()).toBe(60_000);
  });

  it('uses a valid override', () => {
    process.env.VIRLO_TIMEOUT_MS = '3000';
    expect(resolveTimeoutMs()).toBe(3000);
  });

  it('falls back to the default for negative, non-numeric, or non-integer values', () => {
    process.env.VIRLO_TIMEOUT_MS = '-5';
    expect(resolveTimeoutMs()).toBe(60_000);
    process.env.VIRLO_TIMEOUT_MS = 'abc';
    expect(resolveTimeoutMs()).toBe(60_000);
    process.env.VIRLO_TIMEOUT_MS = '1.5';
    expect(resolveTimeoutMs()).toBe(60_000);
  });
});
