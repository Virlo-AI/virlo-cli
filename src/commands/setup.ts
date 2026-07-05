import fs from 'node:fs';
import path from 'node:path';
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
import { nextStepsNote, offerAgentHandoff } from '../lib/agent-handoff';
import { GLOBAL_DIR, PROJECT_DIR, relativeOrAbs, writeSkillFile } from './skill';
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

/**
 * Setup step 2: offer to install the agent skill inline so the user never has
 * to discover `virlo skill install` on their own. Returns the SKILL.md path
 * when a skill ends up available (just installed or already present) — the
 * agent handoff step only makes sense when it is, and seeds that path into
 * the example prompt for agents that don't auto-discover skills.
 */
async function offerSkillInstall(): Promise<string | null> {
  const existingDir = [PROJECT_DIR, GLOBAL_DIR].find((d) =>
    fs.existsSync(path.join(d, 'SKILL.md')),
  );
  if (existingDir) {
    const existingFile = path.join(existingDir, 'SKILL.md');
    p.log.info(`Virlo agent skill already installed (${existingFile}).`);
    return existingFile;
  }

  const choice = await p.select({
    message: 'Install the Virlo agent skill? It teaches AI agents (Claude Code, etc.) to use this CLI.',
    options: [
      { value: 'global', label: 'Yes — all projects (recommended)', hint: GLOBAL_DIR },
      { value: 'project', label: 'Yes — just this directory', hint: relativeOrAbs(PROJECT_DIR) },
      { value: 'skip', label: 'Not now', hint: 'later: virlo skill install' },
    ],
  });
  if (p.isCancel(choice) || choice === 'skip') return null;

  const file = writeSkillFile(choice === 'global' ? GLOBAL_DIR : PROJECT_DIR);
  p.log.success(`Skill installed → ${pc.cyan(file)}`);
  return file;
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
    'Key saved',
  );

  // Steps 2–3: install the agent skill inline, then (when a supported agent
  // is on PATH) offer to hand the terminal straight into a live session with
  // an example query — so setup never ends at an empty command line.
  const skillFile = await offerSkillInstall();
  const handoff = skillFile ? await offerAgentHandoff(skillFile) : ('unavailable' as const);
  if (handoff !== 'launched') {
    p.note(nextStepsNote(), 'Try these next');
    p.outro('Ready.');
  }
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
