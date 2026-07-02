import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// src/config/paths.ts reads VIRLO_CONFIG_DIR at module load time, so every
// test that needs a particular config dir must set the env var and then
// reset the module registry before dynamically importing config.ts (which
// transitively imports paths.ts).

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

async function loadConfigModule(configDir: string) {
  process.env.VIRLO_CONFIG_DIR = configDir;
  vi.resetModules();
  return import('../src/config/config');
}

describe('resolveConfig', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    restoreEnv();
    vi.resetModules();
  });

  it('falls back to the default base URL and undefined key when nothing is set', async () => {
    delete process.env.VIRLO_API_KEY;
    delete process.env.VIRLO_BASE_URL;
    const { resolveConfig, DEFAULT_BASE_URL } = await loadConfigModule(tmpDir);

    const resolved = resolveConfig();
    expect(resolved.apiKey).toBeUndefined();
    expect(resolved.apiKeySource).toBeUndefined();
    expect(resolved.baseUrl).toBe(DEFAULT_BASE_URL);
    expect(resolved.baseUrlSource).toBe('default');
  });

  it('file values are used when present and nothing else overrides them', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ apiKey: 'file-key', baseUrl: 'https://file.example.com' }),
    );
    delete process.env.VIRLO_API_KEY;
    delete process.env.VIRLO_BASE_URL;
    const { resolveConfig } = await loadConfigModule(tmpDir);

    const resolved = resolveConfig();
    expect(resolved.apiKey).toBe('file-key');
    expect(resolved.apiKeySource).toBe('file');
    expect(resolved.baseUrl).toBe('https://file.example.com');
    expect(resolved.baseUrlSource).toBe('file');
  });

  it('env values take precedence over file values', async () => {
    fs.writeFileSync(
      path.join(tmpDir, 'config.json'),
      JSON.stringify({ apiKey: 'file-key', baseUrl: 'https://file.example.com' }),
    );
    process.env.VIRLO_API_KEY = 'env-key';
    process.env.VIRLO_BASE_URL = 'https://env.example.com';
    const { resolveConfig } = await loadConfigModule(tmpDir);

    const resolved = resolveConfig();
    expect(resolved.apiKey).toBe('env-key');
    expect(resolved.apiKeySource).toBe('env');
    expect(resolved.baseUrl).toBe('https://env.example.com');
    expect(resolved.baseUrlSource).toBe('env');
  });

  it('flag overrides take precedence over env values', async () => {
    process.env.VIRLO_API_KEY = 'env-key';
    process.env.VIRLO_BASE_URL = 'https://env.example.com';
    const { resolveConfig } = await loadConfigModule(tmpDir);

    const resolved = resolveConfig({ apiKey: 'flag-key', baseUrl: 'https://flag.example.com' });
    expect(resolved.apiKey).toBe('flag-key');
    expect(resolved.apiKeySource).toBe('flag');
    expect(resolved.baseUrl).toBe('https://flag.example.com');
    expect(resolved.baseUrlSource).toBe('flag');
  });

  it('normalizes trailing slashes on the base URL regardless of source', async () => {
    delete process.env.VIRLO_API_KEY;
    delete process.env.VIRLO_BASE_URL;
    const { resolveConfig } = await loadConfigModule(tmpDir);

    const resolved = resolveConfig({ baseUrl: 'https://example.com///' });
    expect(resolved.baseUrl).toBe('https://example.com');
  });
});

describe('maskKey', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    restoreEnv();
    vi.resetModules();
  });

  it('returns (none) for an empty string', async () => {
    const { maskKey } = await loadConfigModule(tmpDir);
    expect(maskKey('')).toBe('(none)');
  });

  it('keeps the virlo_tkn_ prefix and shows only the last 4 characters', async () => {
    const { maskKey } = await loadConfigModule(tmpDir);
    expect(maskKey('virlo_tkn_abcdEFGH1234')).toBe('virlo_tkn_…1234');
  });

  it('shows only the last 4 characters when there is no known prefix', async () => {
    const { maskKey } = await loadConfigModule(tmpDir);
    expect(maskKey('some-other-key-7890')).toBe('…7890');
  });
});
