import { Argument, type Command, Option } from 'commander';
import { action, compact, runPaid } from '../lib/cli';
import { addPaging, choiceOption, intArg, PLATFORMS } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';

export function registerSounds(program: Command): void {
  const sounds = program.command('sounds').description('Sound intelligence (these reads cost credits)');

  const trending = sounds
    .command('trending')
    .description(withCostMarker('Trending / breakout sounds', 'sounds.trending'))
    .addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS))
    .addOption(new Option('--sort <field>', 'sort field').choices(['usage_count', 'video_count']))
    .option('--commerce-only', 'only commerce-eligible sounds');
  addPaging(trending, 'sounds per page (1-100)');
  trending.action(
    action(async ({ opts, ctx }) => {
      await runPaid(ctx, 'sounds.trending', {
        method: 'GET',
        path: '/v1/sounds/trending',
        query: compact({
          platform: opts.platform as string | undefined,
          sort: opts.sort as string | undefined,
          commerce_only: opts.commerceOnly as boolean | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  const search = sounds
    .command('search')
    .argument('<query>', 'search text (min 2 chars)')
    .description(withCostMarker('Search sounds by text', 'sounds.search'))
    .addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS));
  addPaging(search);
  search.action(
    action(async ({ positional, opts, ctx }) => {
      await runPaid(ctx, 'sounds.search', {
        method: 'GET',
        path: '/v1/sounds/search',
        query: compact({
          q: positional[0],
          platform: opts.platform as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  const byCreator = sounds
    .command('by-creator')
    .addArgument(new Argument('<platform>', 'platform').choices([...PLATFORMS]))
    .argument('<handle>', 'creator handle')
    .description(withCostMarker("A creator's sounds", 'sounds.by-creator'))
    .addOption(new Option('--sort <field>', 'sort field').choices(['usage_count', 'video_count']));
  addPaging(byCreator);
  byCreator.action(
    action(async ({ positional, opts, ctx }) => {
      const [platform, handle] = positional;
      await runPaid(ctx, 'sounds.by-creator', {
        method: 'GET',
        path: `/v1/sounds/by-creator/${platform}/${encodeURIComponent(handle!)}`,
        query: compact({
          sort: opts.sort as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  sounds
    .command('get')
    .argument('<sound_id>')
    .description(withCostMarker('Sound metadata + aggregate stats', 'sounds.get'))
    .action(
      action(async ({ positional, ctx }) => {
        await runPaid(ctx, 'sounds.get', { method: 'GET', path: `/v1/sounds/${positional[0]}` });
      }),
    );

  sounds
    .command('usage-history')
    .argument('<sound_id>')
    .description(withCostMarker('Daily usage snapshots for a sound', 'sounds.usage-history'))
    .option('--start <date>', 'start date (YYYY-MM-DD)')
    .option('--end <date>', 'end date (YYYY-MM-DD)')
    .option('--limit <n>', 'days (1-365)', intArg)
    .action(
      action(async ({ positional, opts, ctx }) => {
        await runPaid(ctx, 'sounds.usage-history', {
          method: 'GET',
          path: `/v1/sounds/${positional[0]}/usage-history`,
          query: compact({
            start_date: opts.start as string | undefined,
            end_date: opts.end as string | undefined,
            limit: opts.limit as number | undefined,
          }),
        });
      }),
    );

  const videos = sounds
    .command('videos')
    .argument('<sound_id>')
    .description(withCostMarker('Videos using a sound', 'sounds.videos'))
    .addOption(choiceOption('--platform <p>', 'limit to one platform', PLATFORMS))
    .addOption(new Option('--sort <field>', 'sort field').choices(['views_desc', 'publish_date_desc']));
  addPaging(videos);
  videos.action(
    action(async ({ positional, opts, ctx }) => {
      await runPaid(ctx, 'sounds.videos', {
        method: 'GET',
        path: `/v1/sounds/${positional[0]}/videos`,
        query: compact({
          platform: opts.platform as string | undefined,
          sort: opts.sort as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );
}
