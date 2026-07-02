import { type Command, Option } from 'commander';
import { action, compact, req, runPaid, runRead } from '../lib/cli';
import { addPaging, choiceOption, COMET_CADENCES, csv, intArg, PLATFORMS, TIME_PERIODS } from '../lib/flags';
import { withCostMarker } from '../domain/endpoints';
import { cometCreateSchema, cometUpdateSchema, parse } from '../lib/validate';
import { addInsightSubcommands } from './insightsSubresources';
import { ValidationError } from '../client/errors';

export function registerComet(program: Command): void {
  const comet = program.command('comet').description('Niche monitor (recurring scheduled scrape)');

  comet
    .command('create')
    .description(withCostMarker('Create a recurring niche monitor', 'comet.create'))
    .requiredOption('--name <name>', 'name for this monitor')
    .requiredOption('--keywords <list>', 'comma-separated keywords (1-20)', csv)
    .requiredOption('--platforms <list>', 'comma-separated platforms (>=1)', csv)
    .addOption(choiceOption('--cadence <c>', 'run cadence', COMET_CADENCES).makeOptionMandatory())
    .requiredOption('--min-views <n>', 'minimum views', intArg)
    .addOption(choiceOption('--time-range <window>', 'time window', TIME_PERIODS).makeOptionMandatory())
    .option('--meta-ads', 'also scrape Meta ads')
    .option('--exclude-keywords <list>', 'comma-separated keywords to exclude', csv)
    .option('--exclude-keywords-strict', 'strict exclude matching')
    .option('--intent <text>', 'intent description to refine results')
    .option('--data-intelligence', 'enable AI data intelligence (+$1.00/run)')
    .option('--inactive', 'create paused (is_active=false)')
    .action(
      action(async ({ opts, ctx }) => {
        const body = parse(
          cometCreateSchema,
          compact({
            name: opts.name,
            keywords: opts.keywords,
            platforms: opts.platforms,
            cadence: opts.cadence,
            min_views: opts.minViews,
            time_range: opts.timeRange,
            is_active: opts.inactive ? false : undefined,
            meta_ads_enabled: opts.metaAds,
            exclude_keywords: opts.excludeKeywords,
            exclude_keywords_strict: opts.excludeKeywordsStrict,
            intent: opts.intent,
            data_intelligence_enabled: opts.dataIntelligence,
          }),
        );
        await runPaid(ctx, 'comet.create', { method: 'POST', path: '/v1/comet', body });
      }),
    );

  const list = comet.command('list').description('List your niche monitors');
  list.option('--include-inactive', 'include paused monitors');
  list.action(
    action(async ({ opts, ctx }) => {
      await runRead(ctx, {
        method: 'GET',
        path: '/v1/comet',
        query: compact({ include_inactive: opts.includeInactive ? 'true' : undefined }),
      });
    }),
  );

  comet
    .command('get')
    .argument('<comet_id>')
    .description('Monitor config + latest analysis')
    .action(
      action(async ({ positional, ctx }) => {
        await runRead(ctx, { method: 'GET', path: `/v1/comet/${positional[0]}` });
      }),
    );

  comet
    .command('update')
    .argument('<comet_id>')
    .description('Update a niche monitor (only provided fields change)')
    .option('--name <name>', 'new name')
    .option('--keywords <list>', 'comma-separated keywords (1-20)', csv)
    .option('--platforms <list>', 'comma-separated platforms', csv)
    .addOption(choiceOption('--cadence <c>', 'run cadence', COMET_CADENCES))
    .option('--min-views <n>', 'minimum views', intArg)
    .addOption(choiceOption('--time-range <window>', 'time window', TIME_PERIODS))
    .option('--meta-ads', 'enable Meta ads')
    .option('--disable-meta-ads', 'disable Meta ads')
    .option('--intent <text>', 'intent description')
    .option('--data-intelligence', 'enable AI data intelligence')
    .option('--disable-data-intelligence', 'disable AI data intelligence')
    .option('--activate', 'set active')
    .option('--deactivate', 'set paused')
    .action(
      action(async ({ positional, opts, ctx }) => {
        const isActive = opts.activate ? true : opts.deactivate ? false : undefined;
        const metaAds = opts.metaAds ? true : opts.disableMetaAds ? false : undefined;
        const dataIntel = opts.dataIntelligence
          ? true
          : opts.disableDataIntelligence
            ? false
            : undefined;
        const rawBody = compact({
          name: opts.name,
          keywords: opts.keywords,
          platforms: opts.platforms,
          cadence: opts.cadence,
          min_views: opts.minViews,
          time_range: opts.timeRange,
          is_active: isActive,
          meta_ads_enabled: metaAds,
          intent: opts.intent,
          data_intelligence_enabled: dataIntel,
        });
        if (Object.keys(rawBody).length === 0) {
          throw new ValidationError('Nothing to update — pass at least one field to change (see --help).');
        }
        const body = parse(cometUpdateSchema, rawBody);
        await runRead(ctx, { method: 'PUT', path: `/v1/comet/${positional[0]}`, body });
      }),
    );

  comet
    .command('delete')
    .argument('<comet_id>')
    .description('Soft-delete (pause) a niche monitor')
    .action(
      action(async ({ positional, ctx }) => {
        const id = positional[0]!;
        await req(ctx, { method: 'DELETE', path: `/v1/comet/${id}` });
        if (ctx.json) process.stdout.write(`${JSON.stringify({ deleted: id })}\n`);
        else process.stdout.write(`Deleted comet ${id}.\n`);
      }),
    );

  addInsightSubcommands(comet, 'comet');
}
