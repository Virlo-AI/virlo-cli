import os from 'node:os';
import path from 'node:path';

/** Root directory for CLI state. Overridable via VIRLO_CONFIG_DIR (handy for tests). */
export const CONFIG_DIR =
  process.env.VIRLO_CONFIG_DIR?.trim() || path.join(os.homedir(), '.virlo');

export const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
