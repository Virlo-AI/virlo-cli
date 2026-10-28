import type { Command } from 'commander';
import pc from 'picocolors';
import { action, compact, runPaid, type Ctx } from '../lib/cli';
import { renderHuman } from '../lib/output';
import { withCostMarker } from '../domain/endpoints';
import { ValidationError } from '../client/errors';
import type { QueryValue } from '../client/http';
import { fmtCount, shellQuote, snippet, type RawRequest } from './raw';

/**
 * `virlo raw meta`: live Meta Ad Library data from /v1/raw/meta. One page per call,
 * 1 credit per call. Same paging rules as `virlo raw`: pass `pagination.next_cursor`
 * back with `--cursor`, with the same filters.
 */

export type RawMetaOp = 'ad-search' | 'ad' | 'advertiser-search' | 'advertiser-ads';

export const RAW_AD_STATUSES = ['active', 'inactive', 'all'] as const;
export const RAW_AD_MEDIA_TYPES = ['all', 'image', 'video', 'meme', 'none'] as const;

export interface RawMetaFilters {
  country?: string;
  status?: string;
  mediaType?: string;
}

export interface RawMetaOptions extends RawMetaFilters {
  cursor?: string;
  /** advertiser-ads: read the argument as a name even when it is all digits. */
  byName?: boolean;
}

const NUMERIC_ID = /^\d{1,19}$/;

function text(value: string, label: string): string {
  const v = value.trim();
  if (v.length < 1 || v.length > 200) {
    throw new ValidationError(`${label} must be 1-200 characters.`);
  }
  return v;
}

/** `us` -> `US`, `all` -> `ALL`. Anything else that is not 2 letters is a local error. */
export function normalizeCountry(country: string | undefined): string | undefined {
  if (country === undefined) return undefined;
  const c = country.trim().toUpperCase();
  if (!/^([A-Z]{2}|ALL)$/.test(c)) {
    throw new ValidationError(`Unknown country "${country}". Use a 2-letter code such as US or GB, or ALL.`);
  }
  return c;
}

function oneOf(value: string | undefined, allowed: readonly string[], flag: string): string | undefined {
  if (value === undefined) return undefined;
  const v = value.trim().toLowerCase();
  if (!allowed.includes(v)) {
    throw new ValidationError(`Unknown ${flag} "${value}". Use one of: ${allowed.join(', ')}.`);
  }
  return v;
}

function filterQuery(o: RawMetaOptions): Record<string, QueryValue> {
  return compact({
    country: normalizeCountry(o.country),
    status: oneOf(o.status, RAW_AD_STATUSES, '--status'),
    media_type: oneOf(o.mediaType, RAW_AD_MEDIA_TYPES, '--media-type'),
    cursor: o.cursor?.trim() || undefined,
  }) as Record<string, QueryValue>;
}

/** Build the API path + query for one Meta op. Validates input locally. */
export function buildRawMetaRequest(op: RawMetaOp, arg: string, o: RawMetaOptions = {}): RawRequest {
  const base = '/v1/raw/meta';
  switch (op) {
    case 'ad-search': {
      const q = text(arg, 'Search query');
      return { path: `${base}/ads/search`, query: { q, ...filterQuery(o) } };
    }
    case 'ad': {
      const id = arg.trim();
      if (!NUMERIC_ID.test(id)) throw new ValidationError('Ad ID must be a numeric ID.');
      return { path: `${base}/ads/${id}`, query: {} };
    }
    case 'advertiser-search': {
      const q = text(arg, 'Search query');
      return {
        path: `${base}/advertisers/search`,
        query: compact({ q, country: normalizeCountry(o.country) }) as Record<string, QueryValue>,
      };
    }
    case 'advertiser-ads': {
      const v = arg.trim();
      if (!o.byName && NUMERIC_ID.test(v)) {
        return { path: `${base}/advertisers/${v}/ads`, query: filterQuery(o) };
      }
      const name = text(v, 'Advertiser name');
      return { path: `${base}/advertisers/ads`, query: { name, ...filterQuery(o) } };
    }
  }
}

/* ------------------------------------------------------------------ */
/* Human rendering                                                     */
/* ------------------------------------------------------------------ */

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

function day(v: unknown): string | null {
  return typeof v === 'string' ? v.slice(0, 10) : null;
}

/** {lower: 1000, upper: 5000} -> "1K-5K"; open bounds become "<5K" / ">1M"; null stays null. */
export function fmtRange(v: unknown, prefix = ''): string | null {
  const r = obj(v);
  const lo = fmtCount(r.lower);
  const hi = fmtCount(r.upper);
  if (lo && hi) return lo === hi ? `${prefix}${lo}` : `${prefix}${lo}-${prefix}${hi}`;
  if (lo) return `>${prefix}${lo}`;
  if (hi) return `<${prefix}${hi}`;
  return null;
}

function spendOf(v: unknown): string | null {
  const range = fmtRange(v);
  if (!range) return null;
  const currency = obj(v).currency;
  return typeof currency === 'string' ? `${range} ${currency}` : range;
}

function firstCreative(ad: Obj): Obj {
  return Array.isArray(ad.creatives) ? obj(ad.creatives[0]) : {};
}

function adRow(v: unknown): Obj {
  const o = obj(v);
  const creative = firstCreative(o);
  return {
    id: o.id,
    advertiser: obj(o.advertiser).name ?? null,
    active: o.is_active,
    started: day(o.started_at),
    media: o.media_type,
    text: snippet(creative.body ?? creative.title, 60),
  };
}

function adSummary(v: unknown): Obj {
  const o = obj(v);
  const advertiser = obj(o.advertiser);
  const creative = firstCreative(o);
  return {
    id: o.id,
    url: o.url,
    advertiser: advertiser.name,
    page_id: advertiser.page_id,
    is_active: o.is_active,
    started_at: o.started_at,
    ended_at: o.ended_at,
    media_type: o.media_type,
    platforms: Array.isArray(o.publisher_platforms) ? o.publisher_platforms : [],
    creatives: Array.isArray(o.creatives) ? o.creatives.length : 0,
    variants: o.variant_count,
    reach: fmtRange(o.reach),
    impressions: fmtRange(o.impressions),
    spend: spendOf(o.spend),
    title: snippet(creative.title, 120),
    body: snippet(creative.body, 200),
    cta: creative.cta_text,
    link_url: creative.link_url,
  };
}

function advertiserRow(v: unknown): Obj {
  const o = obj(v);
  return {
    page_id: o.page_id,
    name: o.name,
    verified: o.verified,
    likes: fmtCount(o.likes),
    category: o.category,
    instagram: typeof o.instagram_handle === 'string' ? `@${o.instagram_handle}` : null,
    ig_followers: fmtCount(o.instagram_followers),
  };
}

function advertiserLabel(v: unknown): string | null {
  const o = obj(v);
  if (typeof o.page_id !== 'string') return null;
  return typeof o.name === 'string' ? `${o.name} (${o.page_id})` : o.page_id;
}

/** Human-readable text for one Meta response body. Takes the full body, not just `data`. */
export function renderRawMeta(op: RawMetaOp, body: unknown): string {
  const b = obj(body);
  const data = b.data;
  switch (op) {
    case 'ad-search':
      return renderHuman(Array.isArray(data) ? data.map(adRow) : data);
    case 'ad':
      return renderHuman(adSummary(data));
    case 'advertiser-search':
      return renderHuman(Array.isArray(data) ? data.map(advertiserRow) : data);
    case 'advertiser-ads': {
      const rows = Array.isArray(data) ? data.map(adRow) : [];
      const label = advertiserLabel(b.advertiser);
      const head = label ? `${pc.bold('advertiser:')} ${label}\n` : '';
      return `${head}${renderHuman(rows)}`;
    }
  }
}

/** The exact command that fetches the next page, with the same filters. */
export function nextMetaPageCommand(op: RawMetaOp, arg: string, o: RawMetaOptions, cursor: string): string {
  const parts = ['virlo', 'raw', 'meta', op, arg];
  if (o.byName) parts.push('--by-name');
  if (o.country !== undefined) parts.push('--country', o.country);
  if (o.status !== undefined) parts.push('--status', o.status);
  if (o.mediaType !== undefined) parts.push('--media-type', o.mediaType);
  parts.push('--cursor', cursor);
  return parts.map(shellQuote).join(' ');
}

interface RawPagination {
  next_cursor?: string | null;
  has_more?: boolean;
}

function optionsFrom(opts: Record<string, unknown>): RawMetaOptions {
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return {
    country: str(opts.country),
    status: str(opts.status),
    mediaType: str(opts.mediaType),
    cursor: str(opts.cursor),
    byName: Boolean(opts.byName),
  };
}

async function runRawMeta(ctx: Ctx, op: RawMetaOp, arg: string, o: RawMetaOptions): Promise<void> {
  const { path, query } = buildRawMetaRequest(op, arg, o);
  const res = await runPaid(ctx, `raw.meta.${op}`, { method: 'GET', path, query }, false);

  if (ctx.json) {
    // The full body, so the cursor (and the resolved advertiser) travel with the data.
    process.stdout.write(`${JSON.stringify(res.raw, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderRawMeta(op, res.raw)}\n`);
  const page = obj(obj(res.raw).pagination) as RawPagination;
  if (page.has_more && typeof page.next_cursor === 'string' && page.next_cursor) {
    process.stderr.write(
      pc.dim('More results. Next page (1 credit):\n') +
        `  ${nextMetaPageCommand(op, arg, o, page.next_cursor)}\n`,
    );
  }
}

const COUNTRY_HELP = 'country where the ads ran: 2-letter code (US, GB, ...) or ALL (default ALL)';

export function registerRawMeta(raw: Command): void {
  const meta = raw
    .command('meta')
    .description(
      'Live Meta Ad Library data: ad search, one ad, advertiser search, advertiser ads (1 credit per call, one page per call)',
    );

  const filters = (cmd: Command) =>
    cmd
      .option('--country <code>', COUNTRY_HELP)
      .option('--status <s>', `${RAW_AD_STATUSES.join(' | ')} (default active)`)
      .option('--media-type <t>', `${RAW_AD_MEDIA_TYPES.join(' | ')} (default all; none = text only)`)
      .option('--cursor <c>', 'next-page cursor from the previous response (pass the same filters)');

  filters(
    meta
      .command('ad-search')
      .argument('<query>', 'keyword(s), 1-200 characters; matches ad text and advertiser names')
      .description(withCostMarker('Search ads by keyword', 'raw.meta.ad-search')),
  ).action(
    action(async ({ positional, opts, ctx }) => runRawMeta(ctx, 'ad-search', positional[0]!, optionsFrom(opts))),
  );

  meta
    .command('ad')
    .argument('<ad-id>', 'Ad Library ID of the ad (digits only)')
    .description(withCostMarker('One ad: advertiser, dates, creatives, reach where shown', 'raw.meta.ad'))
    .action(action(async ({ positional, opts, ctx }) => runRawMeta(ctx, 'ad', positional[0]!, optionsFrom(opts))));

  meta
    .command('advertiser-search')
    .argument('<query>', 'advertiser name or part of it, 1-200 characters')
    .option('--country <code>', 'country to suggest advertisers for: 2-letter code or ALL (default ALL)')
    .description(withCostMarker('Search advertisers; returns page IDs for advertiser-ads', 'raw.meta.advertiser-search'))
    .action(
      action(async ({ positional, opts, ctx }) =>
        runRawMeta(ctx, 'advertiser-search', positional[0]!, optionsFrom(opts)),
      ),
    );

  filters(
    meta
      .command('advertiser-ads')
      .argument(
        '<page-id-or-name>',
        'numeric page ID, or an advertiser name (resolves to the first live match)',
      )
      .option('--by-name', 'read the argument as a name even when it is all digits')
      .description(withCostMarker("One advertiser's ads", 'raw.meta.advertiser-ads')),
  ).action(
    action(async ({ positional, opts, ctx }) =>
      runRawMeta(ctx, 'advertiser-ads', positional[0]!, optionsFrom(opts)),
    ),
  );
}
