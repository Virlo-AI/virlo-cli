import { createRequire } from 'node:module';
import { Command, CommanderError } from 'commander';
import { addGlobalOptions } from './lib/flags';
import { printBanner } from './lib/banner';
import { registerSetup } from './commands/setup';
import { registerAccount } from './commands/account';
import { registerHashtags } from './commands/hashtags';
import { registerVideos } from './commands/videos';
import { registerTrends } from './commands/trends';
import { registerOrbit } from './commands/orbit';
import { registerComet } from './commands/comet';
import { registerSatellite } from './commands/satellite';
import { registerSounds } from './commands/sounds';
import { registerTracking } from './commands/tracking';
import { registerWebhooks } from './commands/webhooks';
import { registerSkill } from './commands/skill';

// dist/index.js (built) sits at the package root's dist/ dir, and src/index.ts
// (run via tsx) sits at the package root's src/ dir — '../package.json' resolves
// to the package root's package.json from both locations.
const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

// Parsing failed before we get a chance to read parsed options, so detect
// --json the same way commander would find it anywhere on the command line.
const jsonMode = process.argv.includes('--json');

// Commander usage errors (missing required option, invalid choice, unknown
// command/option, bad argument, ...) must honor the CLI's exit-code contract
// (2 = usage/validation) and, in --json mode, the single-line JSON error
// shape used by reportError — instead of commander's default `process.exit(1)`
// + plain-text stderr. exitOverride() makes commander throw a CommanderError
// instead of exiting, which we catch in main(). It must be configured before
// any subcommands are registered: Command#copyInheritedSettings() (used by
// `.command()`) copies the parent's exit callback and output configuration at
// subcommand-creation time, and that copy cascades through every subsequent
// `.command()` call (grandchildren copy from their already-configured parent),
// so setting it once here on the root is sufficient for the whole tree.
const program = new Command();

program.exitOverride();
program.configureOutput({
  // Suppress commander's own plain-text usage-error output in --json mode so
  // only our single JSON line hits stderr; leave it untouched otherwise
  // (including normal --help / --version, which write to stdout via writeOut).
  writeErr: (str: string) => {
    if (!jsonMode) process.stderr.write(str);
  },
});

program
  .name('virlo')
  .description(
    'Virlo CLI — short-form social intelligence from your terminal.\n\n' +
      'Reads are free; commands marked 💲 spend credits. Use --json for machine output.',
  )
  .version(pkg.version, '--version', 'print version')
  .showHelpAfterError('(run with --help for usage)')
  .showSuggestionAfterError();

// Global options live on the root...
addGlobalOptions(program);

// ...and on every descendant command, so they parse whether placed before or
// after the command name (e.g. both `virlo --json account balance` and
// `virlo account balance --json` work). optsWithGlobals() merges them.
//
// Also defensively re-applies exitOverride()/configureOutput() to every node:
// copyInheritedSettings() already propagates them at `.command()`-creation
// time (see above), but walking the tree here guards against any future
// subcommand that gets attached via `addCommand()` with its own pre-built
// Command instance rather than through `.command()`.
function addGlobalsToDescendants(cmd: Command): void {
  for (const sub of cmd.commands) {
    addGlobalOptions(sub);
    sub.exitOverride();
    sub.configureOutput(program.configureOutput());
    addGlobalsToDescendants(sub);
  }
}

registerSetup(program);
registerAccount(program);
registerHashtags(program);
registerVideos(program);
registerTrends(program);
registerOrbit(program);
registerComet(program);
registerSatellite(program);
registerSounds(program);
registerTracking(program);
registerWebhooks(program);
registerSkill(program);

addGlobalsToDescendants(program);

// Commander codes that represent successful, non-error termination (help or
// version text was printed as requested) — these must exit 0 with no error
// output, not be treated as usage failures.
const COMMANDER_SUCCESS_CODES = new Set(['commander.helpDisplayed', 'commander.help', 'commander.version']);

async function main(): Promise<void> {
  if (process.argv.slice(2).length === 0) {
    printBanner();
    program.outputHelp();
    return;
  }
  try {
    await program.parseAsync(process.argv);
  } catch (err) {
    if (err instanceof CommanderError) {
      if (COMMANDER_SUCCESS_CODES.has(err.code)) {
        process.exitCode = 0;
        return;
      }
      // All other commander.* usage codes (missing required option, invalid
      // --choices value, unknown command/option, bad argument, excess
      // arguments, ...) map to exit code 2 per the CLI's contract. Commander
      // has already written its plain-text message (+ help/suggestion hints)
      // to stderr via configureOutput's writeErr, unless --json suppressed it.
      process.exitCode = 2;
      if (jsonMode) {
        process.stderr.write(
          `${JSON.stringify({ error: { type: 'usage_error', message: err.message } })}\n`,
        );
      }
      return;
    }
    throw err;
  }
}

main().catch((err) => {
  process.stderr.write(`✖ ${err instanceof Error ? err.message : String(err)}\n`);
  process.exitCode = 1;
});
