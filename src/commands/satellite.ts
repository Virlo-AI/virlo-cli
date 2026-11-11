import fs from 'node:fs';
import { Argument, type Command, Option } from 'commander';
import { action, compact, type Ctx, req, runPaid, runRead } from '../lib/cli';
import { output, renderHuman } from '../lib/output';
import { pollUntilTerminal } from '../lib/poll';
import type { ApiResponse } from '../client/http';
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

/** The status route for each run type that `refresh` can repeat. */
const STATUS_PATHS: Record<string, string> = {
  creator_lookup: '/v1/satellite/creator/status',
  hashtag_lookup: '/v1/satellite/hashtags/status',
  sound_lookup: '/v1/satellite/sounds/status',
  video_outlier: '/v1/satellite/video-outlier/status',
  place_lookup: '/v1/satellite/place/status',
};

/** The place lookup body. The API takes exactly one of the three ways to name a place. */
export function buildPlaceBody(opts: Record<string, unknown>): Record<string, unknown> {
  const target = compact({
    query: opts.query as string | undefined,
    place_id: opts.placeId as string | undefined,
    poi_id: opts.poiId as string | undefined,
  });
  if (Object.keys(target).length !== 1) {
    throw new ValidationError('Name the place with exactly one of --query, --place-id or --poi-id.');
  }
  return compact({ ...target, max_videos: opts.maxVideos as number | undefined });
}

interface MetricChange {
  before: number;
  after: number;
  change: number;
  change_pct: number | null;
}

interface RunComparison {
  previous_run_id: string;
  days_between: number;
  metrics: Record<string, MetricChange>;
  posts: {
    new_count: number;
    in_both: number;
    dropped_count: number;
    biggest_gains: Record<string, unknown>[];
  } | null;
}

/** Human view of a comparison. The default renderer would cut `metrics` to one short line. */
export function renderComparison(data: unknown): string {
  const d = data as RunComparison;
  const rows = Object.entries(d.metrics).map(([metric, m]) => ({
    metric,
    before: m.before,
    after: m.after,
    change: m.change,
    change_pct: m.change_pct === null ? null : `${(m.change_pct * 100).toFixed(1)}%`,
  }));
  const lines = [`Compared with run ${d.previous_run_id}, ${d.days_between} days earlier`, renderHuman(rows)];
  if (d.posts) {
    lines.push(`Posts: ${d.posts.new_count} new, ${d.posts.in_both} in both, ${d.posts.dropped_count} dropped`);
    if (d.posts.biggest_gains.length > 0) {
      lines.push('Biggest view gains:', renderHuman(d.posts.biggest_gains));
    }
  }
  return lines.join('\n');
}

/**
 * Wait for a lookup that was just started, then print its result. A cached start
 * carries the earlier run's id in `job_id`, so that run is read directly.
 */
async function waitForLookup(
  ctx: Ctx,
  start: ApiResponse,
  statusPath: string,
  label: string,
  maxMs?: number,
): Promise<void> {
  const id = jobId(start.data, 'job_id');
  if (!id) {
    output(start, ctx);
    return;
  }
  const final =
    (start.data as Record<string, unknown>).cached === true
      ? await req(ctx, { method: 'GET', path: `/v1/satellite/runs/${id}` })
      : await pollUntilTerminal({
          fetch: () => req(ctx, { method: 'GET', path: `${statusPath}/${id}` }),
          json: ctx.json,
          label,
          intervalMs: 5_000,
          maxMs,
        });
  output(final, ctx);
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

  satellite
    .command('place')
    .description(withCostMarker('Start a TikTok place lookup (beta)', 'satellite.place'))
    .option('--query <name>', 'place name; several matches list the candidates for free')
    .option('--place-id <id>', 'Virlo place id')
    .option('--poi-id <id>', "TikTok's own place id")
    .option('--max-videos <n>', 'most posts to return (1-200, default 100)', intArg)
    .option('--watch', 'poll until the job completes')
    .action(
      action(async ({ opts, ctx }) => {
        const body = buildPlaceBody(opts);
        const res = await runPaid(
          ctx,
          'satellite.place',
          { method: 'POST', path: '/v1/satellite/place', body },
          false,
        );
        if ((res.data as Record<string, unknown> | null)?.status === 'candidates') {
          output(res, ctx);
          if (!ctx.json) {
            process.stderr.write('Pick one and re-run with --place-id <id>.\n');
          }
          return;
        }
        if (!opts.watch) {
          output(res, ctx);
          return;
        }
        await waitForLookup(ctx, res, '/v1/satellite/place/status', 'place lookup', 10 * 60_000);
      }),
    );

  satellite
    .command('place-status')
    .argument('<job_id>')
    .description('Poll a place lookup (results expire after 24 hours)')
    .action(
      action(async ({ positional, ctx }) => {
        await runRead(ctx, {
          method: 'GET',
          path: `/v1/satellite/place/status/${encodeURIComponent(positional[0]!)}`,
        });
      }),
    );

  satellite
    .command('compare')
    .argument('<run_id>', 'the newer run')
    .description("Show what changed since your team's previous run of the same subject")
    .option('--previous-run-id <id>', 'compare with this earlier run instead of the latest one')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const res = await req(ctx, {
          method: 'GET',
          path: `/v1/satellite/runs/${encodeURIComponent(positional[0]!)}/compare`,
          query: compact({ previous_run_id: opts.previousRunId as string | undefined }),
        });
        if (ctx.json) output(res, ctx);
        else process.stdout.write(`${renderComparison(res.data)}\n`);
      }),
    );

  satellite
    .command('refresh')
    .argument('<run_id>', 'the run to repeat')
    .description(withCostMarker('Repeat a saved lookup with the same options', 'satellite.refresh'))
    .option('--watch', 'poll until the new job completes')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const runId = encodeURIComponent(positional[0]!);
        // The run's type names the status route. Reading it first is free, so a bad id stops here.
        const run = opts.watch
          ? await req<{ type?: string }>(ctx, { method: 'GET', path: `/v1/satellite/runs/${runId}` })
          : undefined;
        const statusPath = run?.data.type ? STATUS_PATHS[run.data.type] : undefined;
        const res = await runPaid(
          ctx,
          'satellite.refresh',
          { method: 'POST', path: `/v1/satellite/runs/${runId}/refresh` },
          !statusPath,
        );
        if (statusPath) await waitForLookup(ctx, res, statusPath, `refresh of ${positional[0]}`);
      }),
    );
}
