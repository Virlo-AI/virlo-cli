import pc from 'picocolors';
import { confirm, isCancel } from '@clack/prompts';
import type { SpendInfo } from '../client/http';
import { costHint } from '../domain/endpoints';
import { ValidationError } from '../client/errors';

export interface SpendContext {
  /** Endpoint key from domain/endpoints.ts, e.g. "orbit.create". */
  key: string;
  json: boolean;
  /** From the global --yes flag: confirm paid commands without prompting. */
  yes: boolean;
}

/**
 * SEAM for spend safety. This is the SINGLE place every paid command routes through
 * before it spends credits. Implemented today:
 *   - `--yes` bypasses confirmation and proceeds (with a cost-hint line to stderr).
 *   - Non-interactive sessions (no TTY) or `--json` callers MUST pass `--yes`, or the
 *     call is rejected with a ValidationError before any request is made.
 *   - Interactive human sessions get a y/N confirm prompt (default No); declining or
 *     cancelling raises a ValidationError and nothing is charged.
 *
 * Still future: per-session / daily spend caps, `--dry-run`.
 */
export async function assertCanSpend(ctx: SpendContext): Promise<void> {
  const hint = costHint(ctx.key);

  if (ctx.yes) {
    if (!ctx.json && hint) {
      process.stderr.write(pc.dim(`• This call spends credits (${hint}).\n`));
    }
    return;
  }

  const hintSuffix = hint ? ` (${hint})` : '';

  if (!process.stdin.isTTY || ctx.json) {
    throw new ValidationError(
      `This command spends credits${hintSuffix}. Re-run with --yes to confirm, or check ` +
        `existing free resources first (virlo orbit list, virlo comet list, ...).`,
    );
  }

  const proceed = await confirm({
    message: `This command spends credits${hintSuffix}. Proceed?`,
    initialValue: false,
  });

  if (isCancel(proceed) || proceed !== true) {
    throw new ValidationError('Cancelled — no credits spent.');
  }
}

/** Report the actual amount spent, read from the response headers. Always to stderr. */
export function recordSpend(spend: SpendInfo | undefined): void {
  if (!spend) return;
  const parts: string[] = [];
  if (spend.cost != null) parts.push(`spent ${spend.cost}`);
  else if (spend.creditsUsed != null) parts.push(`spent ${spend.creditsUsed} credits`);
  if (spend.balanceRemaining != null) parts.push(`${spend.balanceRemaining} remaining`);
  else if (spend.creditsRemaining != null) parts.push(`${spend.creditsRemaining} credits remaining`);
  if (parts.length === 0) return;
  process.stderr.write(pc.yellow(`💲 ${parts.join(' · ')}\n`));
}
