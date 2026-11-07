import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isPaid } from '../src/domain/endpoints';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');

function run(args: string[], env: Record<string, string>) {
  return new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      env: { ...process.env, ...env },
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

describe('virlo trends (Topic Trends) e2e (mock API)', () => {
  let configDir: string;
  let server: http.Server;
  let baseUrl: string;
  let seen: string[];

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-trends-'));
    seen = [];
    server = http.createServer((req, res) => {
      seen.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: { trends: [] } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('expected a TCP port');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    fs.rmSync(configDir, { recursive: true, force: true });
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  const env = () => ({ VIRLO_CONFIG_DIR: configDir, VIRLO_API_KEY: 'virlo_tkn_fake' });

  it('today calls /v1/topic-trends/today with region and category filters', async () => {
    const res = await run(
      ['trends', 'today', '--region', 'au', '--exclude-category', 'politics, news', '--json', '--yes', '--base-url', baseUrl],
      env(),
    );
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/topic-trends/today?region=au&exclude_category=politics%2Cnews']);
  });

  it('topic-trends and digest still work as aliases', async () => {
    const res = await run(['topic-trends', 'digest', '--json', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/topic-trends/today']);
  });

  it('list calls /v1/topic-trends with category', async () => {
    const res = await run(
      ['trends', 'list', '--category', 'memes,entertainment', '--limit', '10', '--json', '--yes', '--base-url', baseUrl],
      env(),
    );
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/topic-trends?category=memes%2Centertainment&limit=10']);
  });

  it('both reads are marked paid', () => {
    expect(isPaid('trends.list')).toBe(true);
    expect(isPaid('trends.today')).toBe(true);
  });
});
