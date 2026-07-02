import fs from 'node:fs';
import { Argument, type Command, Option } from 'commander';
import { action, compact, req, runPaid, runRead } from '../lib/cli';
import { output } from '../lib/output';
import { pollUntilTerminal } from '../lib/poll';
import { floatArg, intArg, PLATFORMS } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';
import { batchCreatorsSchema, parse } from '../lib/validate';
import { ValidationError } from '../client/errors';

function platformArg(): Argument {
  return new Argument('<platform>', 'youtube | tiktok | instagram').choices([...PLATFORMS]);
}

function jobId(data: unknown, ...keys: string[]): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  for (const k of keys) {
    if (typeof d[k] === 'string') return d[k] as string;
  }
  return undefined;
}

export function registerSatellite(program: Command): void {
  const satellite = program.command('satellite').description('On-demand creator & video lookups');

  satellite
    .command('creator')
    .addArgument(platformArg())
    .argument('<username>', 'creator handle (with or without @)')
    .description(withCostMarker('Start a creator lookup', 'satellite.creator'))
    .option('--include <list>', 'comma-separated extras: videos,outliers')
    .option('--cross-links', 'resolve cross-platform links')
    .option('--max-videos <n>', 'videos to analyze (1-100)', intArg)
    .option('--outlier-threshold <n>', 'outlier ratio threshold (>=0.1)', floatArg)
    .option('--watch', 'poll until the job completes')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const [platform, username] = positional;
        const query = compact({
          include: opts.include as string | undefined,
          cross_links: opts.crossLinks as boolean | undefined,
          max_videos: opts.maxVideos as number | undefined,
          outlier_threshold: opts.outlierThreshold as number | undefined,
        });
        const watch = Boolean(opts.watch);
        const res = await runPaid(
          ctx,
          'satellite.creator',
          { method: 'GET', path: `/v1/satellite/creator/${platform}/${encodeURIComponent(username!)}`, query },
          !watch,
        );
        if (!watch) return;
        const id = jobId(res.data, 'job_id');
        if (!id) {
          output(res, ctx);
          return;
        }
        const final = await pollUntilTerminal({
          fetch: () => req(ctx, { method: 'GET', path: `/v1/satellite/creator/status/${id}` }),
          json: ctx.json,
          label: `creator lookup ${id}`,
        });
        output(final, ctx);
      }),
    );

  satellite
    .command('creator-status')
    .argument('<job_id>')
    .description('Poll a creator lookup job')
    .action(
      action(async ({ positional, ctx }) => {
        await runRead(ctx, { method: 'GET', path: `/v1/satellite/creator/status/${positional[0]}` });
      }),
    );

  satellite
    .command('batch')
    .description(withCostMarker('Start a batch creator lookup (<=25)', 'satellite.batch'))
    .requiredOption('--file <path>', 'JSON file: array of {"platform","username"}')
    .option('--include <list>', 'comma-separated extras: videos,outliers')
    .option('--cross-links', 'resolve cross-platform links')
    .option('--max-videos <n>', 'videos per creator (1-100)', intArg)
    .option('--outlier-threshold <n>', 'outlier ratio threshold (>=0.1)', floatArg)
    .option('--watch', 'poll until the batch completes')
    .action(
      action(async ({ opts, ctx }) => {
        const file = opts.file as string;
        let json: unknown;
        try {
          json = JSON.parse(fs.readFileSync(file, 'utf8'));
        } catch (err) {
          throw new ValidationError(`Could not read --file as JSON: ${(err as Error).message}`);
        }
        const creators = parse(batchCreatorsSchema, json);
        const body = compact({
          creators,
          include: opts.include as string | undefined,
          cross_links: opts.crossLinks as boolean | undefined,
          max_videos: opts.maxVideos as number | undefined,
          outlier_threshold: opts.outlierThreshold as number | undefined,
        });
        const watch = Boolean(opts.watch);
        const res = await runPaid(
          ctx,
          'satellite.batch',
          { method: 'POST', path: '/v1/satellite/creators/batch', body },
          !watch,
        );
        if (!watch) return;
        const id = jobId(res.data, 'batch_id');
        if (!id) {
          output(res, ctx);
          return;
        }
        const final = await pollUntilTerminal({
          fetch: () => req(ctx, { method: 'GET', path: `/v1/satellite/creators/batch/${id}` }),
          json: ctx.json,
          label: `batch ${id}`,
        });
        output(final, ctx);
      }),
    );

  satellite
    .command('batch-status')
    .argument('<batch_id>')
    .description('Poll a batch creator lookup')
    .action(
      action(async ({ positional, ctx }) => {
        await runRead(ctx, { method: 'GET', path: `/v1/satellite/creators/batch/${positional[0]}` });
      }),
    );

  satellite
    .command('video-outlier')
    .argument('<url>', 'video URL')
    .description(withCostMarker('Start a video-outlier analysis', 'satellite.video-outlier'))
    .addOption(
      new Option('--platform <p>', 'video platform').choices([...PLATFORMS]).makeOptionMandatory(),
    )
    .option('--watch', 'poll until the job completes')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const body = { url: positional[0], platform: opts.platform };
        const watch = Boolean(opts.watch);
        const res = await runPaid(
          ctx,
          'satellite.video-outlier',
          { method: 'POST', path: '/v1/satellite/video-outlier', body },
          !watch,
        );
        if (!watch) return;
        const id = jobId(res.data, 'job_id');
        if (!id) {
          output(res, ctx);
          return;
        }
        const final = await pollUntilTerminal({
          fetch: () => req(ctx, { method: 'GET', path: `/v1/satellite/video-outlier/status/${id}` }),
          json: ctx.json,
          label: `video-outlier ${id}`,
          intervalMs: 5_000,
          maxMs: 6 * 60_000,
        });
        output(final, ctx);
      }),
    );

  satellite
    .command('video-outlier-status')
    .argument('<job_id>')
    .description('Poll a video-outlier job (results expire ~5 min)')
    .action(
      action(async ({ positional, ctx }) => {
        await runRead(ctx, {
          method: 'GET',
          path: `/v1/satellite/video-outlier/status/${positional[0]}`,
        });
      }),
    );
}
