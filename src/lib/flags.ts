import { Command, InvalidArgumentError, Option } from 'commander';
import { compact } from './cli';

/** Enum value sets mirroring the server DTOs. */
export const PLATFORMS = ['youtube', 'tiktok', 'instagram'] as const;
export const TIME_PERIODS = ['today', 'this_week', 'this_month', 'this_year'] as const;
export const COMET_CADENCES = ['daily', 'weekly', 'monthly', 'cron'] as const;
export const TRACKING_CADENCES = [
  'six_hours',
  'twelve_hours',
  'daily',
  'every_other_day',
  'weekly',
  'bi_weekly',
  'monthly',
] as const;
export const COLLECTION_DEPTHS = ['standard', 'deep', 'full'] as const;

/** Parse a comma-separated list into a trimmed, non-empty string array. */
export function csv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Parse an integer option, raising a commander usage error on bad input. */
export function intArg(value: string): number {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) throw new InvalidArgumentError('must be an integer.');
  return n;
}

/** Parse a float option, raising a commander usage error on bad input. */
export function floatArg(value: string): number {
  const n = Number.parseFloat(value);
  if (!Number.isFinite(n)) throw new InvalidArgumentError('must be a number.');
  return n;
}

/** Parse repeated `--header k:v` flags into a map (commander collector). */
export function headerCollector(value: string, previous: Record<string, string> = {}) {
  const idx = value.indexOf(':');
  if (idx === -1) throw new InvalidArgumentError('expected format key:value');
  const key = value.slice(0, idx).trim();
  const val = value.slice(idx + 1).trim();
  if (!key) throw new InvalidArgumentError('header name is empty');
  return { ...previous, [key]: val };
}

/** Register the global options on the root program (inherited by all subcommands). */
export function addGlobalOptions(program: Command): void {
  program
    .option('--json', 'output raw JSON (data only) to stdout — for scripting / Claude')
    .option('--api-key <key>', 'override the configured API key (or set VIRLO_API_KEY)')
    .option('--base-url <url>', 'override the API base URL (or set VIRLO_BASE_URL)')
    .option('-y, --yes', 'confirm paid commands without prompting (required for 💲 commands when non-interactive or --json)')
    .option('-v, --verbose', 'log requests to stderr (API key redacted)');
}

/** Add standard pagination options to a command. */
export function addPaging(cmd: Command, limitHelp = 'items per page (max varies by endpoint)'): Command {
  cmd.option('--page <n>', 'page number (1-indexed)', intArg);
  cmd.option('--limit <n>', limitHelp, intArg);
  return cmd;
}

/** Add a date-range pair to a command. */
export function addDateRange(cmd: Command, help = 'YYYY-MM-DD'): Command {
  cmd.option('--start <date>', `start date (${help})`);
  cmd.option('--end <date>', `end date (${help})`);
  return cmd;
}

/** Build a choices-constrained option. */
export function choiceOption(flags: string, description: string, choices: readonly string[]): Option {
  return new Option(flags, description).choices(choices as string[]);
}

/** Shared filter options for orbit/comet videos & slideshows sub-resources. */
export function addVideoFilters(cmd: Command): Command {
  cmd.option('--min-views <n>', 'minimum views', intArg);
  cmd.addOption(new Option('--platforms <list>', 'comma-separated platforms').argParser(csv));
  cmd.option('--start <date>', 'start date (YYYY-MM-DD)');
  cmd.option('--end <date>', 'end date (YYYY-MM-DD)');
  cmd.addOption(
    new Option('--order-by <field>', 'sort field').choices(['publish_date', 'views', 'created_at']),
  );
  cmd.addOption(new Option('--sort <dir>', 'sort direction').choices(['asc', 'desc']));
  cmd.option('--intent-match', 'only intent-matched results');
  addPaging(cmd);
  return cmd;
}

/** Build the query object for the shared video/slideshow filters. */
export function videoFilterQuery(opts: Record<string, unknown>) {
  return compact({
    min_views: opts.minViews as number | undefined,
    platforms: opts.platforms as string[] | undefined,
    start_date: opts.start as string | undefined,
    end_date: opts.end as string | undefined,
    order_by: opts.orderBy as string | undefined,
    sort: opts.sort as string | undefined,
    intent_match: opts.intentMatch as boolean | undefined,
    page: opts.page as number | undefined,
    limit: opts.limit as number | undefined,
  });
}
