import { type Command, Option } from 'commander';
import { action, compact, req, runPaid, runRead } from '../lib/cli';
import { output } from '../lib/output';
import { pollUntilTerminal } from '../lib/poll';
import { addPaging, choiceOption, COLLECTION_DEPTHS, intArg, PLATFORMS, TRACKING_CADENCES } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';
import { ValidationError } from '../client/errors';

const STATUSES = ['active', 'paused'] as const;

export function registerTracking(program: Command): void {
  const tracking = program.command('tracking').description('Long-term creator & video monitoring');

  // ---- creators ----------------------------------------------------------
  const creators = tracking.command('creators').description('Track creators over time');

  creators
    .command('add')
    .description(withCostMarker('Start tracking a creator', 'tracking.creators.add'))
    .option('--url <url>', 'creator profile URL')
    .option('--handle <handle>', 'creator handle')
    .addOption(choiceOption('--platform <p>', 'platform', PLATFORMS).makeOptionMandatory())
    .addOption(choiceOption('--cadence <c>', 'scrape cadence', TRACKING_CADENCES))
    .addOption(choiceOption('--depth <d>', 'collection depth', COLLECTION_DEPTHS))
    .action(
      action(async ({ opts, ctx }) => {
        if (!opts.url && !opts.handle) {
          throw new ValidationError('Provide --url or --handle.');
        }
        const body = compact({
          url: opts.url as string | undefined,
          handle: opts.handle as string | undefined,
          platform: opts.platform as string,
          scrape_cadence: opts.cadence as string | undefined,
          collection_depth: opts.depth as string | undefined,
        });
        await runPaid(ctx, 'tracking.creators.add', { method: 'POST', path: '/v1/tracking/creators', body });
      }),
    );

  const creatorsList = creators.command('list').description('List tracked creators');
  creatorsList.addOption(choiceOption('--platform <p>', 'filter by platform', PLATFORMS));
  creatorsList.option('--search <text>', 'search by name/handle');
  addPaging(creatorsList, 'creators per page (default 20, max 100)');
  creatorsList.action(
    action(async ({ opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: '/v1/tracking/creators',
        query: compact({
          platform: opts.platform as string | undefined,
          search: opts.search as string | undefined,
          page: opts.page as number | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }),
  );

  creators
    .command('get')
    .argument('<id>')
    .description('Tracked creator details')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'GET', path: `/v1/tracking/creators/${positional[0]}` });
    }));

  creators
    .command('report')
    .argument('<id>')
    .description('Latest AI report for a tracked creator')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'GET', path: `/v1/tracking/creators/${positional[0]}/report` });
    }));

  creators
    .command('snapshots')
    .argument('<id>')
    .description('Metric snapshots over time')
    .option('--start <date>', 'start date (ISO 8601)')
    .option('--end <date>', 'end date (ISO 8601)')
    .option('--limit <n>', 'snapshots (1-365, default 30)', intArg)
    .action(action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: `/v1/tracking/creators/${positional[0]}/snapshots`,
        query: compact({
          start_date: opts.start as string | undefined,
          end_date: opts.end as string | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }));

  const posts = creators
    .command('posts')
    .argument('<id>')
    .description('Posts from a tracked creator')
    .option('--start <date>', 'start date')
    .option('--end <date>', 'end date')
    .addOption(
      new Option('--sort <field>', 'sort field').choices([
        'publish_date_desc',
        'publish_date_asc',
        'views_desc',
      ]),
    );
  addPaging(posts, 'posts per page (default 50, max 200)');
  posts.action(action(async ({ positional, opts, ctx }) => {
    await runRead(ctx, {
      method: 'GET',
      path: `/v1/tracking/creators/${positional[0]}/posts`,
      query: compact({
        start_date: opts.start as string | undefined,
        end_date: opts.end as string | undefined,
        sort: opts.sort as string | undefined,
        page: opts.page as number | undefined,
        limit: opts.limit as number | undefined,
      }),
    });
  }));

  creators
    .command('post')
    .argument('<id>')
    .argument('<post_id>')
    .description('A single tracked post')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: `/v1/tracking/creators/${positional[0]}/posts/${positional[1]}`,
      });
    }));

  creators
    .command('collect')
    .argument('<id>')
    .description(withCostMarker('Collect more posts now', 'tracking.creators.collect'))
    .addOption(choiceOption('--depth <d>', 'collection depth', COLLECTION_DEPTHS))
    .option('--watch', 'poll until the collection finishes')
    .action(action(async ({ positional, opts, ctx }) => {
      const id = positional[0]!;
      const body = compact({ depth: opts.depth as string | undefined });
      const watch = Boolean(opts.watch);
      const res = await runPaid(
        ctx,
        'tracking.creators.collect',
        { method: 'POST', path: `/v1/tracking/creators/${id}/posts/collect`, body },
        !watch,
      );
      if (!watch) return;
      const collectionId = (res.data as Record<string, unknown> | undefined)?.collection_id;
      if (typeof collectionId !== 'string') {
        output(res, ctx);
        return;
      }
      const final = await pollUntilTerminal({
        fetch: () =>
          req(ctx, {
            method: 'GET',
            path: `/v1/tracking/creators/${id}/posts/collect/${collectionId}`,
          }),
        json: ctx.json,
        label: `collection ${collectionId}`,
        intervalMs: 5_000,
      });
      output(final, ctx);
    }));

  creators
    .command('collect-status')
    .argument('<id>')
    .argument('<collection_id>')
    .description('Poll a post-collection job')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: `/v1/tracking/creators/${positional[0]}/posts/collect/${positional[1]}`,
      });
    }));

  creators
    .command('cadence')
    .argument('<id>')
    .description('Posting-frequency analytics')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'GET', path: `/v1/tracking/creators/${positional[0]}/posting-cadence` });
    }));

  creators
    .command('update')
    .argument('<id>')
    .description('Update tracking status / cadence')
    .addOption(choiceOption('--status <s>', 'active | paused', STATUSES))
    .addOption(choiceOption('--cadence <c>', 'scrape cadence', TRACKING_CADENCES))
    .action(action(async ({ positional, opts, ctx }) => {
      const body = compact({
        status: opts.status as string | undefined,
        scrape_cadence: opts.cadence as string | undefined,
      });
      if (Object.keys(body).length === 0) {
        throw new ValidationError('Nothing to update — pass at least one of --status, --cadence.');
      }
      await runRead(ctx, { method: 'PATCH', path: `/v1/tracking/creators/${positional[0]}`, body });
    }));

  creators
    .command('remove')
    .argument('<id>')
    .description('Stop tracking a creator')
    .action(action(async ({ positional, ctx }) => {
      const id = positional[0]!;
      await req(ctx, { method: 'DELETE', path: `/v1/tracking/creators/${id}` });
      if (ctx.json) process.stdout.write(`${JSON.stringify({ removed: id })}\n`);
      else process.stdout.write(`Stopped tracking creator ${id}.\n`);
    }));

  // ---- videos ------------------------------------------------------------
  const videos = tracking.command('videos').description('Track individual videos over time');

  videos
    .command('add')
    .description(withCostMarker('Start tracking a video', 'tracking.videos.add'))
    .requiredOption('--url <url>', 'video URL')
    .addOption(choiceOption('--platform <p>', 'platform', PLATFORMS).makeOptionMandatory())
    .option('--tracking-account-id <id>', 'associate with a tracked creator')
    .addOption(choiceOption('--cadence <c>', 'scrape cadence', TRACKING_CADENCES))
    .action(action(async ({ opts, ctx }) => {
      const body = compact({
        url: opts.url as string,
        platform: opts.platform as string,
        tracking_account_id: opts.trackingAccountId as string | undefined,
        scrape_cadence: opts.cadence as string | undefined,
      });
      await runPaid(ctx, 'tracking.videos.add', { method: 'POST', path: '/v1/tracking/videos', body });
    }));

  const videosList = videos.command('list').description('List tracked videos');
  videosList.addOption(choiceOption('--platform <p>', 'filter by platform', PLATFORMS));
  videosList.option('--search <text>', 'search');
  addPaging(videosList, 'videos per page (default 20, max 100)');
  videosList.action(action(async ({ opts, ctx }) => {
    await runRead(ctx, {
      method: 'GET',
      path: '/v1/tracking/videos',
      query: compact({
        platform: opts.platform as string | undefined,
        search: opts.search as string | undefined,
        page: opts.page as number | undefined,
        limit: opts.limit as number | undefined,
      }),
    });
  }));

  videos
    .command('get')
    .argument('<id>')
    .description('Tracked video details')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'GET', path: `/v1/tracking/videos/${positional[0]}` });
    }));

  videos
    .command('report')
    .argument('<id>')
    .description('Latest AI report for a tracked video')
    .action(action(async ({ positional, ctx }) => {
      await runRead(ctx, { method: 'GET', path: `/v1/tracking/videos/${positional[0]}/report` });
    }));

  videos
    .command('snapshots')
    .argument('<id>')
    .description('Metric snapshots over time')
    .option('--start <date>', 'start date (ISO 8601)')
    .option('--end <date>', 'end date (ISO 8601)')
    .option('--limit <n>', 'snapshots (1-365, default 30)', intArg)
    .action(action(async ({ positional, opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: `/v1/tracking/videos/${positional[0]}/snapshots`,
        query: compact({
          start_date: opts.start as string | undefined,
          end_date: opts.end as string | undefined,
          limit: opts.limit as number | undefined,
        }),
      });
    }));

  videos
    .command('update')
    .argument('<id>')
    .description('Update tracking status / cadence')
    .addOption(choiceOption('--status <s>', 'active | paused', STATUSES))
    .addOption(choiceOption('--cadence <c>', 'scrape cadence', TRACKING_CADENCES))
    .action(action(async ({ positional, opts, ctx }) => {
      const body = compact({
        status: opts.status as string | undefined,
        scrape_cadence: opts.cadence as string | undefined,
      });
      if (Object.keys(body).length === 0) {
        throw new ValidationError('Nothing to update — pass at least one of --status, --cadence.');
      }
      await runRead(ctx, { method: 'PATCH', path: `/v1/tracking/videos/${positional[0]}`, body });
    }));

  videos
    .command('remove')
    .argument('<id>')
    .description('Stop tracking a video')
    .action(action(async ({ positional, ctx }) => {
      const id = positional[0]!;
      await req(ctx, { method: 'DELETE', path: `/v1/tracking/videos/${id}` });
      if (ctx.json) process.stdout.write(`${JSON.stringify({ removed: id })}\n`);
      else process.stdout.write(`Stopped tracking video ${id}.\n`);
    }));
}
