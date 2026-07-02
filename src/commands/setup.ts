import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import {
  DEFAULT_BASE_URL,
  deleteStoredConfig,
  maskKey,
  readStoredConfig,
  resolveConfig,
  writeStoredConfig,
  type ResolvedConfig,
} from '../config/config';
import { CONFIG_FILE } from '../config/paths';
import { request } from '../client/http';
import { printBanner } from '../lib/banner';
import { action, reportError } from '../lib/cli';
import { ConfigError, VirloError } from '../client/errors';

interface BalancePayload {
  balance?: string;
  credits_remaining?: number;
  status?: string;
}

/** Validate a key+baseUrl pair by hitting the free balance endpoint. */
async function fetchBalance(apiKey: string, baseUrl: string): Promise<BalancePayload> {
  const config: ResolvedConfig = {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ''),
    apiKeySource: 'flag',
    baseUrlSource: 'flag',
  };
  const res = await request<BalancePayload>({ method: 'GET', path: '/v1/account/balance', config });
  return res.data ?? {};
}

async function runSetup(reset: boolean): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new ConfigError(
      'virlo setup is interactive and needs a TTY. Non-interactive environments should set the VIRLO_API_KEY env var (or pass --api-key) instead.',
    );
  }
  printBanner();
  p.intro(pc.bold(pc.magenta('Virlo CLI setup')));

  const existing = readStoredConfig();
  if (existing.apiKey && !reset) {
    const proceed = await p.confirm({
      message: `A config already exists at ${CONFIG_FILE} (key ${maskKey(existing.apiKey)}). Overwrite it?`,
      initialValue: false,
    });
    if (p.isCancel(proceed) || !proceed) {
      p.cancel('Setup cancelled — existing config kept.');
      return;
    }
  }

  p.note(
    [
      "Don't have a key yet?",
      `  1. Sign up at ${pc.cyan('https://dev.virlo.ai/')}`,
      `  2. Go to ${pc.cyan('Dashboard → API Keys → Generate Key')}`,
      '  3. Copy the key (starts with "virlo_tkn_") and paste it below',
    ].join('\n'),
    'Need an API key?',
  );

  const apiKey = await p.password({
    message: 'Paste your Virlo API key (virlo_tkn_…)',
    validate: (value) => {
      if (!value) return 'API key is required.';
      if (!value.startsWith('virlo_tkn_')) return 'Key should start with "virlo_tkn_".';
      return undefined;
    },
  });
  if (p.isCancel(apiKey)) {
    p.cancel('Setup cancelled.');
    return;
  }

  // There is a single public production environment, so the wizard does not
  // prompt for it. (Local dev can still point elsewhere via the VIRLO_BASE_URL
  // env var or the --base-url flag.)
  const resolvedBaseUrl = DEFAULT_BASE_URL;

  const spin = p.spinner();
  spin.start('Validating key against the API');
  let balance: BalancePayload;
  try {
    balance = await fetchBalance(apiKey, resolvedBaseUrl);
    spin.stop('Key validated ✓');
  } catch (err) {
    spin.stop('Validation failed ✗');
    const message = err instanceof Error ? err.message : String(err);
    p.cancel(`Could not validate the key: ${message}`);
    process.exitCode = err instanceof VirloError ? err.exitCode : 1;
    return;
  }

  // Persist only the key; the base URL always resolves to prod (or an env/flag override).
  writeStoredConfig({ apiKey });

  const balanceLine =
    balance.balance != null
      ? `${balance.balance}${balance.credits_remaining != null ? ` (${balance.credits_remaining} credits)` : ''}`
      : 'unknown';
  p.note(
    [
      `Saved to ${pc.cyan(CONFIG_FILE)} (chmod 600).`,
      `Endpoint: ${pc.cyan(resolvedBaseUrl)}`,
      `Balance:  ${pc.green(balanceLine)}`,
      '',
      pc.yellow('⚠ The key is stored in plaintext on disk. Anyone with read access to'),
      pc.yellow('  this file can spend your credits. Override per-call with VIRLO_API_KEY.'),
    ].join('\n'),
    'Done',
  );
  p.outro('Ready. Try: ' + pc.cyan('virlo account balance'));
}

export function registerSetup(program: Command): void {
  program
    .command('setup')
    .description('Interactive wizard: store your API key')
    .option('--reset', 'overwrite any existing config without prompting')
    .action(
      action(async ({ opts }) => {
        await runSetup(Boolean(opts.reset));
      }),
    );

  program
    .command('whoami')
    .description('Show the configured key (masked), base URL, and live balance')
    .action(
      action(async ({ ctx }) => {
        if (!ctx.config.apiKey) {
          throw new VirloError('No API key configured. Run `virlo setup`.');
        }
        const res = await request<BalancePayload>({
          method: 'GET',
          path: '/v1/account/balance',
          config: ctx.config,
          verbose: ctx.verbose,
        });
        const payload = {
          api_key: maskKey(ctx.config.apiKey),
          api_key_source: ctx.config.apiKeySource,
          base_url: ctx.config.baseUrl,
          base_url_source: ctx.config.baseUrlSource,
          ...res.data,
        };
        if (ctx.json) {
          process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
        } else {
          process.stdout.write(
            [
              `${pc.cyan('key')}      ${payload.api_key} ${pc.dim(`(${payload.api_key_source})`)}`,
              `${pc.cyan('base url')} ${payload.base_url} ${pc.dim(`(${payload.base_url_source})`)}`,
              `${pc.cyan('balance')}  ${pc.green(payload.balance ?? 'unknown')}` +
                (payload.credits_remaining != null
                  ? pc.dim(` (${payload.credits_remaining} credits)`)
                  : ''),
            ].join('\n') + '\n',
          );
        }
      }),
    );

  program
    .command('logout')
    .description('Delete the stored config (removes the saved API key)')
    .action(
      action(async ({ ctx }) => {
        const removed = deleteStoredConfig();
        const message = removed
          ? `Removed ${CONFIG_FILE}.`
          : 'No stored config to remove.';
        if (ctx.json) process.stdout.write(`${JSON.stringify({ removed, path: CONFIG_FILE })}\n`);
        else process.stdout.write(`${message}\n`);
      }),
    );
}

// re-exported for potential reuse/testing
export { resolveConfig, reportError };
