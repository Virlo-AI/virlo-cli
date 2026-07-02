import type { Command } from 'commander';
import { action, compact, runPaid } from '../lib/cli';
import { intArg } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';

export function registerTrends(program: Command): void {
  const trends = program.command('trends').description('AI-detected trends (these reads cost credits)');

  trends
    .command('list')
    .description(withCostMarker('Trend groups in a date range (default last 24h)', 'trends.list'))
    .option('--start <date>', 'start date (ISO 8601)')
    .option('--end <date>', 'end date (ISO 8601)')
    .option('--limit <n>', 'max trend groups (1-100)', intArg)
    .option('--top-exemplars <n>', 'exemplars per trend (0-20)', intArg)
    .action(
      action(async ({ opts, ctx }) => {
        await runPaid(ctx, 'trends.list', {
          method: 'GET',
          path: '/v1/trends',
          query: compact({
            start_date: opts.start as string | undefined,
            end_date: opts.end as string | undefined,
            limit: opts.limit as number | undefined,
            top_exemplars: opts.topExemplars as number | undefined,
          }),
        });
      }),
    );

  trends
    .command('digest')
    .description(withCostMarker("Today's trends (EST), single group", 'trends.digest'))
    .option('--top-exemplars <n>', 'exemplars per trend (0-20)', intArg)
    .action(
      action(async ({ opts, ctx }) => {
        await runPaid(ctx, 'trends.digest', {
          method: 'GET',
          path: '/v1/trends/digest',
          query: compact({ top_exemplars: opts.topExemplars as number | undefined }),
        });
      }),
    );
}
