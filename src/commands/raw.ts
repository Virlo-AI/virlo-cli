import type { Command } from 'commander';
import pc from 'picocolors';
import { action, compact, runPaid, type Ctx } from '../lib/cli';
import { renderHuman } from '../lib/output';
import { withCostMarker } from '../domain/endpoints';
import { ValidationError } from '../client/errors';
import type { QueryValue } from '../client/http';

/**
 * `virlo raw` — live platform data from /v1/raw. One page per call, 1 credit per call.
 * Paging is explicit: a list response carries `pagination.next_cursor`, which the
 * caller passes back with `--cursor`.
 */

export const RAW_PLATFORMS = ['tiktok', 'youtube', 'instagram'] as const;
export const RAW_TRANSCRIPT_PLATFORMS = ['tiktok', 'youtube'] as const;
export type RawPlatform = (typeof RAW_PLATFORMS)[number];

export type RawOp =
  | 'search'
  | 'hashtag'
  | 'video'
  | 'comments'
  | 'transcript'
  | 'creator'
  | 'creator-videos';

/** Throw a ValidationError (exit 2) unless the platform is supported for this op. */
export function assertRawPlatform(platform: string, op: RawOp): RawPlatform {
  const p = platform.trim().toLowerCase();
  if (op === 'transcript') {
    if (p === 'instagram') {
      throw new ValidationError(
        'Transcripts are not available for instagram. Use tiktok or youtube.',
      );
    }
    if (!(RAW_TRANSCRIPT_PLATFORMS as readonly string[]).includes(p)) {
      throw new ValidationError(`Unknown platform "${platform}". Use one of: tiktok, youtube.`);
    }
    return p as RawPlatform;
  }
  if (!(RAW_PLATFORMS as readonly string[]).includes(p)) {
    throw new ValidationError(
      `Unknown platform "${platform}". Use one of: ${RAW_PLATFORMS.join(', ')}.`,
    );
  }
  return p as RawPlatform;
}

/** True when the input looks like a URL (with or without a scheme) rather than a bare ID. */
export function looksLikeUrl(input: string): boolean {
  const s = input.trim();
  if (/^https?:\/\//i.test(s)) return true;
  // Scheme-less links such as "youtu.be/abc" or "www.tiktok.com/@a/video/1".
  return /^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(s);
}

/** Map a <url-or-id> argument to the `url=` or `id=` query param. */
export function videoRefQuery(input: string): { url: string } | { id: string } {
  const s = input.trim();
  if (!s) throw new ValidationError('Pass a video URL or ID.');
  return looksLikeUrl(s) ? { url: s } : { id: s };
}

function stripPrefix(value: string, prefix: string, label: string): string {
  const v = value.trim().replace(new RegExp(`^\\${prefix}+`), '');
  if (!v) throw new ValidationError(`Pass a ${label}.`);
  return v;
}

export interface RawRequest {
  path: string;
  query: Record<string, QueryValue>;
}

/** Build the API path + query for one raw operation. Validates input locally. */
export function buildRawRequest(
  op: RawOp,
  platform: string,
  arg: string,
  cursor?: string,
): RawRequest {
  const p = assertRawPlatform(platform, op);
  const base = `/v1/raw/${p}`;
  const c = cursor?.trim() || undefined;
  switch (op) {
    case 'search': {
      const q = arg.trim();
      if (q.length < 1 || q.length > 200) {
        throw new ValidationError('Search query must be 1-200 characters.');
      }
      return { path: `${base}/search`, query: compact({ q, cursor: c }) };
    }
    case 'hashtag': {
      const tag = stripPrefix(arg, '#', 'hashtag');
      return { path: `${base}/hashtag/${encodeURIComponent(tag)}`, query: compact({ cursor: c }) };
    }
    case 'video':
      return { path: `${base}/video`, query: { ...videoRefQuery(arg) } };
    case 'comments':
      return { path: `${base}/video/comments`, query: compact({ ...videoRefQuery(arg), cursor: c }) };
    case 'transcript':
      return { path: `${base}/video/transcript`, query: { ...videoRefQuery(arg) } };
    case 'creator': {
      const handle = stripPrefix(arg, '@', 'creator handle');
      return { path: `${base}/creator/${encodeURIComponent(handle)}`, query: {} };
    }
    case 'creator-videos': {
      const handle = stripPrefix(arg, '@', 'creator handle');
      return {
        path: `${base}/creator/${encodeURIComponent(handle)}/videos`,
        query: compact({ cursor: c }),
      };
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

/** 1234 -> 1.2K, 3400000 -> 3.4M. null stays null (rendered as a dash). */
export function fmtCount(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const abs = Math.abs(v);
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1e9) return `${trim(v / 1e9)}B`;
  if (abs >= 1e6) return `${trim(v / 1e6)}M`;
  if (abs >= 1e3) return `${trim(v / 1e3)}K`;
  return String(v);
}

export function snippet(v: unknown, max = 60): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

function handleOf(author: unknown): string | null {
  const a = obj(author);
  return typeof a.handle === 'string' ? `@${a.handle}` : null;
}

function videoRow(v: unknown): Obj {
  const o = obj(v);
  const stats = obj(o.stats);
  return {
    id: o.id,
    author: handleOf(o.author),
    views: fmtCount(stats.views),
    likes: fmtCount(stats.likes),
    published: typeof o.published_at === 'string' ? o.published_at.slice(0, 10) : null,
    caption: snippet(o.caption),
  };
}

function videoSummary(v: unknown): Obj {
  const o = obj(v);
  const stats = obj(o.stats);
  const sound = obj(o.sound);
  return {
    id: o.id,
    url: o.url,
    author: handleOf(o.author),
    published_at: o.published_at,
    duration_seconds: o.duration_seconds,
    views: fmtCount(stats.views),
    likes: fmtCount(stats.likes),
    comments: fmtCount(stats.comments),
    shares: fmtCount(stats.shares),
    saves: fmtCount(stats.saves),
    sound: snippet([sound.title, sound.artist].filter(Boolean).join(' · ')),
    hashtags: Array.isArray(o.hashtags) ? o.hashtags : [],
    caption: snippet(o.caption, 200),
  };
}

function creatorSummary(v: unknown): Obj {
  const o = obj(v);
  const stats = obj(o.stats);
  return {
    handle: typeof o.handle === 'string' ? `@${o.handle}` : null,
    display_name: o.display_name,
    followers: fmtCount(stats.followers),
    following: fmtCount(stats.following),
    likes: fmtCount(stats.likes),
    videos: fmtCount(stats.videos),
    verified: o.verified,
    bio: snippet(o.bio, 200),
    url: o.url,
    external_url: o.external_url,
  };
}

function commentRow(v: unknown): Obj {
  const o = obj(v);
  return {
    author: handleOf(o.author),
    likes: fmtCount(o.likes),
    replies: fmtCount(o.reply_count),
    text: snippet(o.text, 80),
  };
}

/** Human-readable text for one raw response `data` payload. */
export function renderRaw(op: RawOp, data: unknown): string {
  switch (op) {
    case 'search':
    case 'hashtag':
    case 'creator-videos':
      return renderHuman(Array.isArray(data) ? data.map(videoRow) : data);
    case 'comments':
      return renderHuman(Array.isArray(data) ? data.map(commentRow) : data);
    case 'video':
      return renderHuman(videoSummary(data));
    case 'creator':
      return renderHuman(creatorSummary(data));
    case 'transcript': {
      const text = obj(data).text;
      return typeof text === 'string' && text.trim() ? text : pc.dim('(empty transcript)');
    }
  }
}

/** Quote one shell word only when needed. */
export function shellQuote(s: string): string {
  if (/^[A-Za-z0-9_@#%+=:,./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The exact command that fetches the next page. */
export function nextPageCommand(op: RawOp, args: string[], cursor: string): string {
  return ['virlo', 'raw', op, ...args, '--cursor', cursor].map(shellQuote).join(' ');
}

interface RawPagination {
  next_cursor?: string | null;
  has_more?: boolean;
}

async function runRaw(ctx: Ctx, op: RawOp, args: string[], cursor?: string): Promise<void> {
  const [platform, arg] = args;
  const { path, query } = buildRawRequest(op, platform!, arg!, cursor);
  const res = await runPaid(ctx, `raw.${op}`, { method: 'GET', path, query }, false);

  if (ctx.json) {
    // The full body, so the cursor travels with the data in one parse.
    process.stdout.write(`${JSON.stringify(res.raw, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${renderRaw(op, res.data)}\n`);
  const page = obj(obj(res.raw).pagination) as RawPagination;
  if (page.has_more && typeof page.next_cursor === 'string' && page.next_cursor) {
    process.stderr.write(
      pc.dim('More results. Next page (1 credit):\n') +
        `  ${nextPageCommand(op, args, page.next_cursor)}\n`,
    );
  }
}

const PLATFORM_HELP = 'tiktok | youtube | instagram';
const REF_HELP = 'video URL or platform video ID';

export function registerRaw(program: Command): Command {
  const raw = program
    .command('raw')
    .description(
      'Live platform data: search, hashtags, videos, comments, transcripts, creators, Meta ads via `raw meta` (1 credit per call, one page per call)',
    );

  const paged = (cmd: Command) => cmd.option('--cursor <c>', 'next-page cursor from the previous response');

  paged(
    raw
      .command('search')
      .argument('<platform>', PLATFORM_HELP)
      .argument('<query>', 'keyword(s), 1-200 characters')
      .description(withCostMarker('Search short-form videos by keyword', 'raw.search')),
  ).action(action(async ({ positional, opts, ctx }) => runRaw(ctx, 'search', positional, opts.cursor as string)));

  paged(
    raw
      .command('hashtag')
      .argument('<platform>', PLATFORM_HELP)
      .argument('<hashtag>', 'the hashtag (with or without #)')
      .description(withCostMarker('Videos for a hashtag', 'raw.hashtag')),
  ).action(action(async ({ positional, opts, ctx }) => runRaw(ctx, 'hashtag', positional, opts.cursor as string)));

  raw
    .command('video')
    .argument('<platform>', PLATFORM_HELP)
    .argument('<url-or-id>', REF_HELP)
    .description(withCostMarker('One video: stats, caption, author, sound', 'raw.video'))
    .action(action(async ({ positional, ctx }) => runRaw(ctx, 'video', positional)));

  paged(
    raw
      .command('comments')
      .argument('<platform>', PLATFORM_HELP)
      .argument('<url-or-id>', REF_HELP)
      .description(withCostMarker('Comments on a video', 'raw.comments')),
  ).action(action(async ({ positional, opts, ctx }) => runRaw(ctx, 'comments', positional, opts.cursor as string)));

  raw
    .command('transcript')
    .argument('<platform>', 'tiktok | youtube')
    .argument('<url-or-id>', REF_HELP)
    .description(withCostMarker('Transcript of a video (tiktok, youtube)', 'raw.transcript'))
    .action(action(async ({ positional, ctx }) => runRaw(ctx, 'transcript', positional)));

  raw
    .command('creator')
    .argument('<platform>', PLATFORM_HELP)
    .argument('<handle>', 'creator handle (with or without @; YouTube also takes a UC... channel ID)')
    .description(withCostMarker('Creator profile and stats', 'raw.creator'))
    .action(action(async ({ positional, ctx }) => runRaw(ctx, 'creator', positional)));

  paged(
    raw
      .command('creator-videos')
      .argument('<platform>', PLATFORM_HELP)
      .argument('<handle>', 'creator handle (with or without @)')
      .description(withCostMarker("A creator's recent short-form videos", 'raw.creator-videos')),
  ).action(
    action(async ({ positional, opts, ctx }) => runRaw(ctx, 'creator-videos', positional, opts.cursor as string)),
  );

  return raw;
}
