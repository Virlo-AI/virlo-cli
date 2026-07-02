import { type Command, Option } from 'commander';
import { action, compact, runRead } from '../lib/cli';
import { addPaging, choiceOption, PLATFORMS } from '../lib/flags';

export function registerHashtags(program: Command): void {
  const hashtags = program.command('hashtags').description('Hashtag performance (free reads)');

  const list = hashtags
    .command('list')
    .description('Hashtag stats over a date range')
    .requiredOption('--start <date>', 'start date (YYYY-MM-DD)')
    .requiredOption('--end <date>', 'end date (YYYY-MM-DD, <=90 days after start)')
    .addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS))
    .addOption(new Option('--order-by <field>', 'sort field').choices(['count', 'views']))
    .addOption(new Option('--sort <dir>', 'sort direction').choices(['asc', 'desc']));
  addPaging(list, 'hashtags per page (1-100)');
  list.action(
    action(async ({ opts, ctx }) => {
      const platform = opts.platform as string | undefined;
      const path = platform ? `/v1/${platform}/hashtags` : '/v1/hashtags';
      await runRead(ctx, {
        method: 'GET',
        path,
        query: compact({
          start_date: opts.start as string,
          end_date: opts.end as string,
          order_by: opts.orderBy as string | undefined,
          sort: opts.sort as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  hashtags
    .command('performance')
    .argument('<hashtag>', 'the hashtag (with or without #)')
    .description('Aggregated metrics for one hashtag')
    .option('--start <date>', 'start date (YYYY-MM-DD)')
    .option('--end <date>', 'end date (YYYY-MM-DD)')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const hashtag = positional[0]!;
        await runRead(ctx, {
          method: 'GET',
          path: `/v1/hashtags/${encodeURIComponent(hashtag)}/performance`,
          query: compact({ start_date: opts.start as string, end_date: opts.end as string }),
        });
      }),
    );
}
