import { type Command, Option } from 'commander';
import { action, compact, runRead } from '../lib/cli';
import { addPaging, addVideoFilters, choiceOption, PLATFORMS, videoFilterQuery } from '../lib/flags';

/**
 * Register the sub-resource read commands shared by `orbit` and `comet`
 * (videos, slideshows, ads, outliers, sounds, trends, analysis). These are all
 * free reads on already-paid runs. `base` selects the /v1/<base>/<id>/... prefix.
 */
export function addInsightSubcommands(parent: Command, base: 'orbit' | 'comet'): void {
  const idArg = base === 'orbit' ? '<orbit_id>' : '<comet_id>';
  const path = (id: string, suffix: string) => `/v1/${base}/${id}/${suffix}`;

  const videos = parent.command('videos').argument(idArg).description('Videos in the run');
  addVideoFilters(videos);
  videos.action(
    action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, { method: 'GET', path: path(positional[0]!, 'videos'), query: videoFilterQuery(opts) });
    }),
  );

  const slideshows = parent.command('slideshows').argument(idArg).description('Slideshows in the run');
  addVideoFilters(slideshows);
  slideshows.action(
    action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: path(positional[0]!, 'slideshows'),
        query: videoFilterQuery(opts),
      });
    }),
  );

  const ads = parent.command('ads').argument(idArg).description('Meta ads in the run');
  ads.addOption(new Option('--order-by <field>', 'sort field').choices(['created_at', 'page_like_count']));
  ads.addOption(new Option('--sort <dir>', 'sort direction').choices(['asc', 'desc']));
  addPaging(ads);
  ads.action(
    action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: path(positional[0]!, 'ads'),
        query: compact({
          order_by: opts.orderBy as string | undefined,
          sort: opts.sort as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  const outliers = parent.command('outliers').argument(idArg).description('Creator outliers in the run');
  outliers.addOption(
    new Option('--order-by <field>', 'sort field').choices([
      'outlier_ratio',
      'avg_views',
      'follower_count',
      'weighted_score',
    ]),
  );
  outliers.addOption(new Option('--sort <dir>', 'sort direction').choices(['asc', 'desc']));
  outliers.addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS));
  addPaging(outliers);
  outliers.action(
    action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: path(positional[0]!, 'creators/outliers'),
        query: compact({
          order_by: opts.orderBy as string | undefined,
          sort: opts.sort as string | undefined,
          platform: opts.platform as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  const sounds = parent.command('sounds').argument(idArg).description('Top sounds in the run (free)');
  addPaging(sounds);
  sounds.action(
    action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: path(positional[0]!, 'sounds'),
        query: compact({ page: opts.page as number | undefined, limit: opts.limit as number | undefined }),
      });
    }),
  );

  const trends = parent.command('trends').argument(idArg).description('AI trend batches for the run');
  trends.option('--latest', 'only the latest batch');
  trends.option('--stable-key <key>', 'filter by stable trend key');
  trends.option('--start <date>', 'start date (ISO 8601)');
  trends.option('--end <date>', 'end date (ISO 8601)');
  addPaging(trends);
  trends.action(
    action(async ({ positional, opts, ctx }) => {
      const id = positional[0]!;
      if (opts.latest) {
        await runRead(ctx, { method: 'GET', path: path(id, 'trends/latest') });
        return;
      }
      await runRead(ctx, {
        method: 'GET',
        path: path(id, 'trends'),
        query: compact({
          stable_key: opts.stableKey as string | undefined,
          start_date: opts.start as string | undefined,
          end_date: opts.end as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  const analysis = parent.command('analysis').argument(idArg).description('AI analysis for the run');
  analysis.option('--latest', 'only the latest analysis');
  analysis.option('--start <date>', 'start date (ISO 8601)');
  analysis.option('--end <date>', 'end date (ISO 8601)');
  addPaging(analysis);
  analysis.action(
    action(async ({ positional, opts, ctx }) => {
      const id = positional[0]!;
      if (opts.latest) {
        await runRead(ctx, { method: 'GET', path: path(id, 'analysis/latest') });
        return;
      }
      await runRead(ctx, {
        method: 'GET',
        path: path(id, 'analysis'),
        query: compact({
          start_date: opts.start as string | undefined,
          end_date: opts.end as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );
}
