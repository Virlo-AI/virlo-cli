import pc from 'picocolors';
import { NetworkError, VirloError } from '../client/errors';
import type { ApiResponse } from '../client/http';

const DONE = new Set(['completed', 'complete', 'partial_failure', 'done', 'finished', 'success']);
const FAILED = new Set(['failed', 'error', 'errored', 'cancelled', 'canceled']);

/** Dig a status string out of a response payload, tolerant of where it lives. */
export function extractStatus(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const candidates = [
    d.status,
    d.state,
    (d.latest_run as Record<string, unknown> | undefined)?.status,
    (d.run as Record<string, unknown> | undefined)?.status,
  ];
  const s = candidates.find((c) => typeof c === 'string');
  return typeof s === 'string' ? s.toLowerCase() : undefined;
}

export function classifyStatus(status: string | undefined): 'done' | 'failed' | 'pending' {
  if (status && DONE.has(status)) return 'done';
  if (status && FAILED.has(status)) return 'failed';
  return 'pending';
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface PollOptions<T> {
  fetch: () => Promise<ApiResponse<T>>;
  json: boolean;
  label?: string;
  intervalMs?: number;
  maxMs?: number;
}

/**
 * Poll `fetch` until the payload reports a terminal status. Returns the terminal
 * response (both done and failed — the caller decides how to render a failure).
 * Note: orbit/comet may report `completed` before their AI analysis is `finalized`;
 * callers should flag that analysis fields may still be null.
 */
export async function pollUntilTerminal<T>(o: PollOptions<T>): Promise<ApiResponse<T>> {
  const interval = o.intervalMs ?? 10_000;
  const maxMs = o.maxMs ?? 50 * 60_000;
  const startedAt = Date.now();
  let consecutiveFailures = 0;
  let lastStatus: string | undefined;

  for (;;) {
    try {
      const res = await o.fetch();
      consecutiveFailures = 0;
      const status = extractStatus(res.data);
      lastStatus = status;
      if (classifyStatus(status) !== 'pending') return res;
    } catch (err) {
      if (!(err instanceof NetworkError)) throw err;
      consecutiveFailures++;
      // Tolerate up to 3 consecutive network hiccups before giving up on the wait entirely.
      if (consecutiveFailures >= 3) throw err;
      if (!o.json) {
        process.stderr.write(pc.dim(`… network hiccup (attempt ${consecutiveFailures}/3), retrying\n`));
      }
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed > maxMs) {
      throw new VirloError(
        `Timed out after ${Math.round(elapsed / 60_000)}m waiting for ${o.label ?? 'job'} ` +
          `(last status: ${lastStatus ?? 'unknown'}). It may still finish — re-run the get/status command later.`,
      );
    }
    if (!o.json && consecutiveFailures === 0) {
      process.stderr.write(
        pc.dim(`… ${o.label ?? 'working'}: ${lastStatus ?? 'pending'} (waited ${Math.round(elapsed / 1000)}s)\n`),
      );
    }
    await sleep(interval);
  }
}
