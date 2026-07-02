import fs from 'node:fs';
import { CONFIG_DIR, CONFIG_FILE } from './paths';

/** Production API base URL. The API repo hardcodes no host; this is the prod target. */
export const DEFAULT_BASE_URL = 'https://api.virlo.ai';

export interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
}

export type Source = 'flag' | 'env' | 'file' | 'default';

export interface ResolvedConfig {
  apiKey?: string;
  baseUrl: string;
  apiKeySource?: Source;
  baseUrlSource: Source;
}

export interface ConfigOverrides {
  apiKey?: string;
  baseUrl?: string;
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

/** Read the on-disk config, returning {} when absent. Throws on malformed JSON. */
export function readStoredConfig(): StoredConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(CONFIG_FILE, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Failed to read config at ${CONFIG_FILE}: ${(err as Error).message}`);
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredConfig) : {};
  } catch {
    throw new Error(`Config at ${CONFIG_FILE} is not valid JSON. Fix it or run \`virlo setup\`.`);
  }
}

/** Persist config with locked-down permissions (dir 0700, file 0600). */
export function writeStoredConfig(cfg: StoredConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(CONFIG_DIR, 0o700);
  } catch {
    /* best effort on platforms without chmod */
  }
  fs.writeFileSync(CONFIG_FILE, `${JSON.stringify(cfg, null, 2)}\n`, { mode: 0o600 });
  try {
    fs.chmodSync(CONFIG_FILE, 0o600);
  } catch {
    /* best effort */
  }
}

/** Delete the config file. Returns false if there was nothing to delete. */
export function deleteStoredConfig(): boolean {
  try {
    fs.unlinkSync(CONFIG_FILE);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
}

/**
 * Resolve effective config. Precedence (highest first): CLI flag > env var > file > default.
 * The API key has no default; the base URL defaults to production.
 */
export function resolveConfig(overrides: ConfigOverrides = {}): ResolvedConfig {
  const stored = readStoredConfig();
  const envKey = process.env.VIRLO_API_KEY?.trim() || undefined;
  const envUrl = process.env.VIRLO_BASE_URL?.trim() || undefined;

  let apiKey: string | undefined;
  let apiKeySource: Source | undefined;
  if (overrides.apiKey) {
    apiKey = overrides.apiKey;
    apiKeySource = 'flag';
  } else if (envKey) {
    apiKey = envKey;
    apiKeySource = 'env';
  } else if (stored.apiKey) {
    apiKey = stored.apiKey;
    apiKeySource = 'file';
  }

  let baseUrl: string;
  let baseUrlSource: Source;
  if (overrides.baseUrl) {
    baseUrl = overrides.baseUrl;
    baseUrlSource = 'flag';
  } else if (envUrl) {
    baseUrl = envUrl;
    baseUrlSource = 'env';
  } else if (stored.baseUrl) {
    baseUrl = stored.baseUrl;
    baseUrlSource = 'file';
  } else {
    baseUrl = DEFAULT_BASE_URL;
    baseUrlSource = 'default';
  }

  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl), apiKeySource, baseUrlSource };
}

/** Mask an API key for display: virlo_tkn_…ab12 (never reveal the middle). */
export function maskKey(key: string): string {
  if (!key) return '(none)';
  const last4 = key.slice(-4);
  const prefix = key.startsWith('virlo_tkn_') ? 'virlo_tkn_' : '';
  return `${prefix}…${last4}`;
}
