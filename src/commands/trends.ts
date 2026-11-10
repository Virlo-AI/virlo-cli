import type { Command } from 'commander';
import { action, compact, runPaid } from '../lib/cli';
import { csv, intArg } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';

/** Categories every topic carries (GET /v1/topic-trends). Add, never rename. */
export const TOPIC_CATEGORIES = [
  'entertainment',
  'memes',
  'sports',
  'fashion_beauty',
  'gaming_tech',
  'lifestyle',
  'politics',
  'news',
] as const;

const CATEGORY_HELP = `comma-separated categories (${TOPIC_CATEGORIES.join(', ')})`;

/** --region, --category and --exclude-category, shared by every Topic Trends read. */
function addTopicFilters(cmd: Command): Command {
  return cmd
    .option('--region <code>', "region code, default 'global' (e.g. us, gb, au)")
    .option('--category <list>', `only these topics: ${CATEGORY_HELP}`, csv)
    .option(
      '--exclude-category <list>',
      'leave these categories out (e.g. politics,news for pop culture without politics)',
      csv,
    );
}

function filterQuery(opts: Record<string, unknown>) {
  return {
    region: opts.region as string | undefined,
    category: opts.category as string[] | undefined,
    exclude_category: opts.excludeCategory as string[] | undefined,
  };
}

export function registerTrends(program: Command): void {
  const trends = program
    .command('trends')
    .alias('topic-trends')
    .description('Topic Trends: what people are talking about, by region (these reads cost credits)');

  addTopicFilters(
    trends
      .command('list')
      .description(withCostMarker('Topic Trends in a date range (default last 24h)', 'trends.list'))
      .option('--start <date>', 'start date (ISO 8601)')
      .option('--end <date>', 'end date (ISO 8601)')
      .option('--limit <n>', 'max topics in total (1-100)', intArg)
      .option('--top-exemplars <n>', 'example videos per topic (0-20)', intArg),
  ).action(
    action(async ({ opts, ctx }) => {
      await runPaid(ctx, 'trends.list', {
        method: 'GET',
        path: '/v1/topic-trends',
        query: compact({
          ...filterQuery(opts),
          start_date: opts.start as string | undefined,
          end_date: opts.end as string | undefined,
          limit: opts.limit as number | undefined,
          top_exemplars: opts.topExemplars as number | undefined,
        }),
      });
    }),
  );

  addTopicFilters(
    trends
      .command('today')
      .alias('digest')
      .description(withCostMarker("Today's Topic Trends for a region, in ranking order", 'trends.today'))
      .option('--limit <n>', 'max topics (1-100)', intArg)
      .option('--top-exemplars <n>', 'example videos per topic (0-20)', intArg),
  ).action(
    action(async ({ opts, ctx }) => {
      await runPaid(ctx, 'trends.today', {
        method: 'GET',
        path: '/v1/topic-trends/today',
        query: compact({
          ...filterQuery(opts),
          limit: opts.limit as number | undefined,
          top_exemplars: opts.topExemplars as number | undefined,
        }),
      });
    }),
  );
}
