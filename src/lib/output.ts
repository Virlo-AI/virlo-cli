import pc from 'picocolors';
import type { ApiResponse } from '../client/http';

export interface OutputContext {
  json: boolean;
}

const MAX_COL_WIDTH = 48;
const MAX_COLUMNS = 8;

/** Keys we surface first in tables when present — the useful "headline" fields. */
const PREFERRED_KEYS = [
  'id',
  'orbit_id',
  'comet_id',
  'job_id',
  'batch_id',
  'name',
  'title',
  'hashtag',
  'handle',
  'username',
  'platform',
  'status',
  'cadence',
  'scrape_cadence',
  'views',
  'total_views',
  'video_count',
  'usage_count',
  'follower_count',
  'followers',
  'weighted_score',
  'outlier_ratio',
  'url',
  'created_at',
  'started_at',
  'publish_date',
];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function truncate(s: string, max = MAX_COL_WIDTH): string {
  const oneLine = s.replace(/\s+/g, ' ');
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return pc.dim('—');
  if (Array.isArray(value)) return pc.dim(`[${value.length}]`);
  if (isPlainObject(value)) return pc.dim('{…}');
  if (typeof value === 'boolean') return value ? pc.green('yes') : pc.dim('no');
  return truncate(String(value));
}

function visibleLength(s: string): number {
  // Strip ANSI color codes when measuring width.
  // eslint-disable-next-line no-control-regex
  return s.replace(/\[[0-9;]*m/g, '').length;
}

function pad(s: string, width: number): string {
  const len = visibleLength(s);
  return len >= width ? s : s + ' '.repeat(width - len);
}

function pickColumns(rows: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) for (const k of Object.keys(row)) seen.add(k);
  const ordered: string[] = [];
  for (const k of PREFERRED_KEYS) if (seen.has(k)) ordered.push(k);
  for (const k of seen) if (!ordered.includes(k)) ordered.push(k);
  return ordered.slice(0, MAX_COLUMNS);
}

function renderTable(rows: Record<string, unknown>[]): string {
  const columns = pickColumns(rows);
  const header = columns.map((c) => pc.bold(c));
  const body = rows.map((row) => columns.map((c) => formatCell(row[c])));

  const widths = columns.map((_, i) =>
    Math.max(visibleLength(header[i] ?? ''), ...body.map((r) => visibleLength(r[i] ?? ''))),
  );

  const lines: string[] = [];
  lines.push(header.map((h, i) => pad(h, widths[i] ?? 0)).join('  '));
  lines.push(pc.dim(widths.map((w) => '─'.repeat(w)).join('  ')));
  for (const r of body) lines.push(r.map((cell, i) => pad(cell, widths[i] ?? 0)).join('  '));
  return lines.join('\n');
}

function renderObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj);
  if (keys.length === 0) return pc.dim('(empty object)');
  const width = Math.max(...keys.map((k) => k.length));
  const lines: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    let rendered: string;
    if (Array.isArray(v)) {
      rendered =
        v.length > 0 && isPlainObject(v[0])
          ? pc.dim(`[${v.length} items]`)
          : pc.dim(`[${v.map((x) => String(x)).join(', ')}]`);
    } else if (isPlainObject(v)) {
      rendered = pc.dim(truncate(JSON.stringify(v), 80));
    } else if (v === null || v === undefined) {
      rendered = pc.dim('—');
    } else if (typeof v === 'boolean') {
      rendered = v ? pc.green('yes') : pc.dim('no');
    } else {
      rendered = String(v);
    }
    lines.push(`${pc.cyan(pad(k, width))}  ${rendered}`);
  }
  return lines.join('\n');
}

function tableWithCount(rows: Record<string, unknown>[]): string {
  return `${renderTable(rows)}\n${pc.dim(`${rows.length} row${rows.length === 1 ? '' : 's'}`)}`;
}

/** Produce a human-friendly string for any JSON value returned by the API. */
export function renderHuman(value: unknown): string {
  if (value === null || value === undefined) return pc.dim('(no data)');
  if (Array.isArray(value)) {
    if (value.length === 0) return pc.dim('(empty list)');
    if (isPlainObject(value[0])) return tableWithCount(value as Record<string, unknown>[]);
    return value.map((v) => `• ${String(v)}`).join('\n');
  }
  if (isPlainObject(value)) {
    // Promote a single nested array-of-objects (e.g. {total, limit, orbits:[…]})
    // to a table, with the surrounding scalar fields shown above it.
    const listProps = Object.entries(value).filter(
      ([, v]) => Array.isArray(v) && v.length > 0 && isPlainObject(v[0]),
    );
    if (listProps.length === 1) {
      const [key, rows] = listProps[0]!;
      const rest = Object.fromEntries(Object.entries(value).filter(([k]) => k !== key));
      const head = Object.keys(rest).length > 0 ? `${renderObject(rest)}\n${pc.bold(`${key}:`)}\n` : '';
      return `${head}${tableWithCount(rows as Record<string, unknown>[])}`;
    }
    return renderObject(value);
  }
  return String(value);
}

/** Write the response payload to stdout (pure JSON when --json, else human format). */
export function printData(value: unknown, ctx: OutputContext): void {
  if (ctx.json) {
    process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderHuman(value)}\n`);
  }
}

/** Write pagination + rate-limit notices to stderr (kept off stdout so JSON stays clean). */
export function printMeta(result: ApiResponse, ctx: OutputContext): void {
  if (ctx.json) {
    // stdout must stay a pure data payload; surface pagination as a single stderr line
    // so a machine consumer can still discover more pages without polluting stdout.
    if (result.pagination) {
      process.stderr.write(`${JSON.stringify({ pagination: result.pagination })}\n`);
    }
    return;
  }
  const p = result.pagination;
  if (p && p.total != null) {
    const pageInfo =
      p.page != null && p.total_pages != null ? ` (page ${p.page}/${p.total_pages})` : '';
    const more = p.has_next_page ? pc.dim(' — more with --page ' + ((p.page ?? 1) + 1)) : '';
    process.stderr.write(pc.dim(`${p.total} total${pageInfo}`) + more + '\n');
  }
  if (result.message) process.stderr.write(pc.dim(`${result.message}\n`));
}

/** Convenience: render a full ApiResponse (data to stdout, meta to stderr). */
export function output(result: ApiResponse, ctx: OutputContext): void {
  printData(result.data, ctx);
  printMeta(result, ctx);
}
