import type { Command } from 'commander';
import pc from 'picocolors';
import { resolveConfig, type ResolvedConfig } from '../config/config';
import { InsufficientCreditsError, RateLimitError, VirloError } from '../client/errors';
import { request, type ApiResponse, type RequestOptions } from '../client/http';
import { output } from './output';
import { assertCanSpend, recordSpend } from './spend-guard';

export interface Ctx {
  json: boolean;
  verbose: boolean;
  yes: boolean;
  config: ResolvedConfig;
}

export interface HandlerArgs {
  positional: string[];
  opts: Record<string, unknown>;
  ctx: Ctx;
  command: Command;
}

export type Handler = (args: HandlerArgs) => Promise<void> | void;

function buildCtx(command: Command): Ctx {
  const g = command.optsWithGlobals();
  return {
    json: Boolean(g.json),
    verbose: Boolean(g.verbose),
    yes: Boolean(g.yes),
    config: resolveConfig({ apiKey: g.apiKey as string, baseUrl: g.baseUrl as string }),
  };
}

/**
 * Wrap a command action: parse commander args into (positional, opts, ctx),
 * run the handler, and funnel all errors through reportError with a stable exit code.
 */
export function action(handler: Handler) {
  return async (...raw: unknown[]): Promise<void> => {
    const command = raw[raw.length - 1] as Command;
    const positional = raw.slice(0, Math.max(0, raw.length - 2)) as string[];
    const opts = command.optsWithGlobals();
    const ctx = buildCtx(command);
    try {
      await handler({ positional, opts, ctx, command });
    } catch (err) {
      reportError(err, ctx.json);
    }
  };
}

export function reportError(err: unknown, json: boolean): void {
  process.exitCode = err instanceof VirloError ? err.exitCode : 1;
  const message = err instanceof Error ? err.message : String(err);

  if (json) {
    const payload: Record<string, unknown> = {
      type: err instanceof VirloError ? err.type : 'error',
      message,
    };
    if (err instanceof InsufficientCreditsError) payload.details = err.details;
    if (err instanceof RateLimitError && err.retryAfterSeconds != null)
      payload.retry_after = err.retryAfterSeconds;
    process.stderr.write(`${JSON.stringify({ error: payload })}\n`);
    return;
  }

  process.stderr.write(pc.red(`✖ ${message}\n`));
  if (err instanceof InsufficientCreditsError) {
    const { requiredAmount, remainingBalance } = err.details;
    if (requiredAmount || remainingBalance) {
      process.stderr.write(
        pc.dim(
          `  need ${requiredAmount ?? '?'}, have ${remainingBalance ?? '?'} — add funds at https://dev.virlo.ai/dashboard/billing\n`,
        ),
      );
    }
  }
}

/** Low-level authenticated request bound to the command context. */
export function req<T = unknown>(
  ctx: Ctx,
  opts: Omit<RequestOptions, 'config' | 'verbose'>,
): Promise<ApiResponse<T>> {
  return request<T>({ ...opts, config: ctx.config, verbose: ctx.verbose });
}

/** Free read: request + render. */
export async function runRead<T = unknown>(
  ctx: Ctx,
  opts: Omit<RequestOptions, 'config' | 'verbose'>,
): Promise<ApiResponse<T>> {
  const res = await req<T>(ctx, opts);
  output(res, ctx);
  return res;
}

/** Paid call: spend-guard → request → record spend → render. Returns the response. */
export async function runPaid<T = unknown>(
  ctx: Ctx,
  key: string,
  opts: Omit<RequestOptions, 'config' | 'verbose'>,
  render = true,
): Promise<ApiResponse<T>> {
  await assertCanSpend({ key, json: ctx.json, yes: ctx.yes });
  const res = await req<T>(ctx, opts);
  recordSpend(res.spend);
  if (render) output(res, ctx);
  return res;
}

/** Drop undefined values so we never send empty query keys / body fields. */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k as keyof T] = v as T[keyof T];
  }
  return out;
}
