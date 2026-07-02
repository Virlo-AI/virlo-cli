import type { ResolvedConfig } from '../config/config';
import {
  ApiError,
  AuthError,
  ConfigError,
  InsufficientCreditsError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from './errors';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type QueryValue = string | number | boolean | string[] | undefined | null;

export interface RequestOptions {
  method: HttpMethod;
  /** Fully-resolved path beginning with /v1, e.g. "/v1/orbit/abc". */
  path: string;
  query?: Record<string, QueryValue>;
  body?: unknown;
  config: ResolvedConfig;
  verbose?: boolean;
}

export interface SpendInfo {
  creditsUsed?: number;
  cost?: string; // normalized "$X.XX"
  creditsRemaining?: number;
  balanceRemaining?: string; // normalized "$X.XX"
}

export interface RateLimitInfo {
  limit?: number;
  remaining?: number;
  resetAt?: number; // unix seconds
}

export interface Pagination {
  page?: number;
  limit?: number;
  total?: number;
  total_pages?: number;
  has_next_page?: boolean;
  has_prev_page?: boolean;
}

export interface ApiResponse<T = unknown> {
  data: T;
  pagination?: Pagination;
  message?: string;
  spend?: SpendInfo;
  rateLimit?: RateLimitInfo;
  status: number;
  /** Full parsed response body, before envelope unwrapping. */
  raw: unknown;
}

export function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(`${baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) {
        if (value.length === 0) continue;
        url.searchParams.set(key, value.join(',')); // API accepts CSV for array filters
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

function numFromHeader(headers: Headers, name: string): number | undefined {
  const raw = headers.get(name);
  if (raw == null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function dollarsFromHeader(headers: Headers, name: string): string | undefined {
  const raw = headers.get(name);
  if (raw == null) return undefined;
  const trimmed = raw.trim();
  if (trimmed.startsWith('$')) return trimmed;
  const n = Number(trimmed);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : trimmed;
}

function extractSpend(headers: Headers): SpendInfo | undefined {
  const spend: SpendInfo = {
    creditsUsed: numFromHeader(headers, 'x-credits-used'),
    cost: dollarsFromHeader(headers, 'x-cost'),
    creditsRemaining: numFromHeader(headers, 'x-credits-remaining'),
    balanceRemaining: dollarsFromHeader(headers, 'x-balance-remaining'),
  };
  const hasAny = Object.values(spend).some((v) => v !== undefined);
  return hasAny ? spend : undefined;
}

function extractRateLimit(headers: Headers): RateLimitInfo | undefined {
  const info: RateLimitInfo = {
    limit: numFromHeader(headers, 'x-ratelimit-limit'),
    remaining: numFromHeader(headers, 'x-ratelimit-remaining'),
    resetAt: numFromHeader(headers, 'x-ratelimit-reset'),
  };
  const hasAny = Object.values(info).some((v) => v !== undefined);
  return hasAny ? info : undefined;
}

/** NestJS validation errors arrive as { message: string | string[] }. */
export function extractMessage(body: unknown, fallback: string): string {
  if (body && typeof body === 'object') {
    const m = (body as Record<string, unknown>).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) return m.join('; ');
    const e = (body as Record<string, unknown>).error;
    if (typeof e === 'string') return e;
  }
  if (typeof body === 'string' && body.trim()) return body.trim();
  return fallback;
}

export function mapError(status: number, body: unknown, headers: Headers): VirloErrorLike {
  const b = (body && typeof body === 'object' ? (body as Record<string, unknown>) : {}) as Record<
    string,
    unknown
  >;
  switch (status) {
    case 401:
      return new AuthError(
        extractMessage(body, 'Unauthorized (401). Check your API key with `virlo whoami`.'),
      );
    case 402:
      return new InsufficientCreditsError(extractMessage(body, 'Insufficient credits (402).'), {
        requiredCredits: typeof b.required_credits === 'number' ? b.required_credits : undefined,
        remainingCredits: typeof b.remaining_credits === 'number' ? b.remaining_credits : undefined,
        requiredAmount: typeof b.required_amount === 'string' ? b.required_amount : undefined,
        remainingBalance: typeof b.remaining_balance === 'string' ? b.remaining_balance : undefined,
      });
    case 429: {
      const retryAfter = numFromHeader(headers, 'retry-after');
      const suffix = retryAfter != null ? ` Retry after ${retryAfter}s.` : '';
      return new RateLimitError(extractMessage(body, 'Rate limited (429).') + suffix, retryAfter);
    }
    case 400:
      return new ValidationError(extractMessage(body, 'Bad request (400).'));
    case 404:
      return new NotFoundError(extractMessage(body, 'Not found (404).'));
    default:
      return new ApiError(`API error (${status}): ${extractMessage(body, 'request failed')}`, status, body);
  }
}

type VirloErrorLike =
  | AuthError
  | InsufficientCreditsError
  | RateLimitError
  | ValidationError
  | NotFoundError
  | ApiError;

function redactHeaders(headers: Record<string, string>): Record<string, string> {
  const copy = { ...headers };
  if (copy.Authorization) copy.Authorization = 'Bearer virlo_tkn_…(redacted)';
  return copy;
}

const DEFAULT_TIMEOUT_MS = 60_000;

/** Resolve the request timeout from VIRLO_TIMEOUT_MS, falling back to the default on invalid values. */
export function resolveTimeoutMs(): number {
  const raw = process.env.VIRLO_TIMEOUT_MS;
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

/** Perform an authenticated request and return the unwrapped envelope + metadata. */
export async function request<T = unknown>(opts: RequestOptions): Promise<ApiResponse<T>> {
  if (!opts.config.apiKey) {
    throw new ConfigError(
      'No API key configured. Run `virlo setup`, or set the VIRLO_API_KEY env var, or pass --api-key. ' +
        'Need a key? Sign up at https://dev.virlo.ai then Dashboard → API Keys → Generate Key.',
    );
  }

  const url = buildUrl(opts.config.baseUrl, opts.path, opts.query);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.config.apiKey}`,
    Accept: 'application/json',
  };
  let bodyStr: string | undefined;
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    bodyStr = JSON.stringify(opts.body);
  }

  if (opts.verbose) {
    process.stderr.write(`→ ${opts.method} ${url}\n`);
    process.stderr.write(`  headers: ${JSON.stringify(redactHeaders(headers))}\n`);
    if (bodyStr) process.stderr.write(`  body: ${bodyStr}\n`);
  }

  const timeoutMs = resolveTimeoutMs();
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.method,
      headers,
      body: bodyStr,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if ((err as Error).name === 'TimeoutError') {
      const seconds = timeoutMs % 1000 === 0 ? String(timeoutMs / 1000) : (timeoutMs / 1000).toFixed(1);
      throw new NetworkError(
        `Request timed out after ${seconds}s calling ${url} (override with VIRLO_TIMEOUT_MS)`,
      );
    }
    throw new NetworkError(`Network error calling ${url}: ${(err as Error).message}`);
  }

  const text = await res.text();
  let parsed: unknown;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (opts.verbose) {
    process.stderr.write(`← ${res.status} ${res.statusText}\n`);
  }

  if (!res.ok) {
    throw mapError(res.status, parsed, res.headers);
  }

  const envelope = (parsed && typeof parsed === 'object' ? parsed : {}) as Record<string, unknown>;
  const hasDataKey = 'data' in envelope;
  const data = (hasDataKey ? envelope.data : parsed) as T;

  return {
    data,
    pagination: hasDataKey ? (envelope.pagination as Pagination | undefined) : undefined,
    message: typeof envelope.message === 'string' ? envelope.message : undefined,
    spend: extractSpend(res.headers),
    rateLimit: extractRateLimit(res.headers),
    status: res.status,
    raw: parsed,
  };
}
