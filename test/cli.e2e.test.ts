import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');
const pkg = require('../package.json') as { version: string };

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the built binary with a controlled environment. stdin is not
 * inherited (stdio 'ignore'), so it is never a TTY — matching the
 * non-interactive / agent-driven usage this CLI is designed for.
 */
function run(args: string[], env: Record<string, string | undefined> = {}): Promise<RunResult> {
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete childEnv[key];
    else childEnv[key] = value;
  }

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: childEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

describe('CLI e2e (exit codes)', () => {
  let configDir: string;

  beforeEach(() => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-e2e-'));
  });

  afterEach(() => {
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  it('missing required option -> exit 2, stderr mentions "required option"', async () => {
    const res = await run(['orbit', 'create', '--name', 'x'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('required option');
  });

  it('missing required option with --json -> exit 2, JSON error.type === "usage_error"', async () => {
    const res = await run(['orbit', 'create', '--name', 'x', '--json'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
    const parsed = JSON.parse(res.stderr.trim());
    expect(parsed.error.type).toBe('usage_error');
  });

  it('nested subcommand usage error (bad --platform choice) -> exit 2', async () => {
    const res = await run(['tracking', 'creators', 'add', '--platform', 'twitter', '--handle', 'x'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
  });

  it('unknown top-level command -> exit 2', async () => {
    const res = await run(['orbits'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
  });

  it('no API key configured -> exit 3, error.type === "config_error"', async () => {
    const res = await run(['account', 'balance', '--json'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: undefined,
      VIRLO_BASE_URL: undefined,
    });
    expect(res.code).toBe(3);
    const parsed = JSON.parse(res.stderr.trim());
    expect(parsed.error.type).toBe('config_error');
  });

  it('paid command without --yes on non-TTY stdin -> exit 2, stderr mentions --yes', async () => {
    const res = await run(['sounds', 'get', '123'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--yes');
  });

  it('paid command with --json and no --yes -> exit 2, error.type === "validation_error"', async () => {
    const res = await run(['sounds', 'get', '123', '--json'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
    const parsed = JSON.parse(res.stderr.trim());
    expect(parsed.error.type).toBe('validation_error');
  });

  it('comet update with no fields to change -> exit 2', async () => {
    const res = await run(['comet', 'update', 'abc'], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
    });
    expect(res.code).toBe(2);
  });

  it('setup on non-TTY stdin -> exit 3', async () => {
    const res = await run(['setup'], {
      VIRLO_CONFIG_DIR: configDir,
    });
    expect(res.code).toBe(3);
  });

  it('--version -> exit 0, stdout matches package.json version', async () => {
    const res = await run(['--version'], {
      VIRLO_CONFIG_DIR: configDir,
    });
    expect(res.code).toBe(0);
    expect(res.stdout.trim()).toBe(pkg.version);
  });
});

describe('CLI e2e (network timeout)', () => {
  let configDir: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-e2e-timeout-'));
    server = http.createServer(() => {
      // Never respond — simulates a hung server so the client-side timeout fires.
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected server to bind to a TCP port');
    }
    port = address.port;
  });

  afterEach(async () => {
    fs.rmSync(configDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it('request timeout -> exit 7, stderr mentions "timed out"', async () => {
    const res = await run(['account', 'balance', '--base-url', `http://127.0.0.1:${port}`], {
      VIRLO_CONFIG_DIR: configDir,
      VIRLO_API_KEY: 'virlo_tkn_fake',
      VIRLO_TIMEOUT_MS: '1000',
    });
    expect(res.code).toBe(7);
    expect(res.stderr).toContain('timed out');
  }, 10_000);
});
