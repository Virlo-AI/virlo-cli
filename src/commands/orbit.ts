import { type Command, Option } from 'commander';
import pc from 'picocolors';
import { action, compact, req, runPaid, runRead } from '../lib/cli';
import { output } from '../lib/output';
import { pollUntilTerminal } from '../lib/poll';
import { addPaging, choiceOption, csv, intArg, PLATFORMS, TIME_PERIODS } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';
import { orbitCreateSchema } from '../lib/validate';
import { parse } from '../lib/validate';
import { addInsightSubcommands } from './insightsSubresources';

/** When a run is done but its AI analysis hasn't populated, tell the user where to look. */
function noteAnalysisPending(data: unknown, json: boolean, id: string): void {
  if (json || !data || typeof data !== 'object') return;
  const analysis = (data as Record<string, unknown>).analysis;
  if (analysis == null) {
    process.stderr.write(
      pc.dim(
        `Scrape complete; AI analysis may still be generating. Check with \`virlo orbit analysis ${id} --latest\`.\n`,
      ),
    );
  }
}

function dataId(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const d = data as Record<string, unknown>;
  const id = d.orbit_id ?? d.id;
  return typeof id === 'string' ? id : undefined;
}

export function registerOrbit(program: Command): void {
  const orbit = program.command('orbit').description('Keyword search (one-shot multi-platform scrape)');

  const create = orbit
    .command('create')
    .description(withCostMarker('Queue a keyword search', 'orbit.create'))
    .requiredOption('--name <name>', 'name for this search')
    .requiredOption('--keywords <list>', 'comma-separated keywords (1-10)', csv)
    .addOption(choiceOption('--time-period <window>', 'time window', TIME_PERIODS).makeOptionMandatory())
    .addOption(new Option('--platforms <list>', 'comma-separated platforms').argParser(csv))
    .option('--min-views <n>', 'minimum views', intArg)
    .option('--enable-meta-ads', 'also scrape Meta ads')
    .option('--exclude-keywords <list>', 'comma-separated keywords to exclude', csv)
    .option('--exclude-keywords-strict', 'strict exclude matching')
    .option('--intent <text>', 'intent description to refine results')
    .option('--data-intelligence', 'enable AI data intelligence (+$1.00)')
    .option('--watch', 'poll until the run reaches a terminal state');
  create.action(
    action(async ({ opts, ctx }) => {
      const body = parse(
        orbitCreateSchema,
        compact({
          name: opts.name,
          keywords: opts.keywords,
          platforms: opts.platforms,
          min_views: opts.minViews,
          time_period: opts.timePeriod,
          enable_meta_ads: opts.enableMetaAds,
          exclude_keywords: opts.excludeKeywords,
          exclude_keywords_strict: opts.excludeKeywordsStrict,
          intent: opts.intent,
          data_intelligence_enabled: opts.dataIntelligence,
        }),
      );

      const watch = Boolean(opts.watch);
      const res = await runPaid(ctx, 'orbit.create', { method: 'POST', path: '/v1/orbit', body }, !watch);
      if (!watch) return;

      const id = dataId(res.data);
      if (!id) {
        output(res, ctx);
        return;
      }
      const final = await pollUntilTerminal({
        fetch: () => req(ctx, { method: 'GET', path: `/v1/orbit/${id}` }),
        json: ctx.json,
        label: `orbit ${id}`,
      });
      output(final, ctx);
      noteAnalysisPending(final.data, ctx.json, id);
    }),
  );

  const list = orbit.command('list').description('List your keyword searches');
  addPaging(list);
  list.action(
    action(async ({ opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: '/v1/orbit',
        query: compact({ page: opts.page as number | undefined, limit: opts.limit as number | undefined }),
      });
    }),
  );

  orbit
    .command('get')
    .argument('<orbit_id>')
    .description('Status + results for a search')
    .addOption(
      new Option('--order-by <field>', 'sort videos by').choices([
        'views',
        'likes',
        'shares',
        'comments',
        'bookmarks',
        'publish_date',
        'author.followers',
      ]),
    )
    .addOption(new Option('--sort <dir>', 'sort direction').choices(['asc', 'desc']))
    .option('--watch', 'poll until the run reaches a terminal state')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const id = positional[0]!;
        const query = compact({
          order_by: opts.orderBy as string | undefined,
          sort: opts.sort as string | undefined,
        });
        if (opts.watch) {
          const final = await pollUntilTerminal({
            fetch: () => req(ctx, { method: 'GET', path: `/v1/orbit/${id}`, query }),
            json: ctx.json,
            label: `orbit ${id}`,
          });
          output(final, ctx);
          noteAnalysisPending(final.data, ctx.json, id);
          return;
        }
        await runRead(ctx, { method: 'GET', path: `/v1/orbit/${id}`, query });
      }),
    );

  addInsightSubcommands(orbit, 'orbit');
}
