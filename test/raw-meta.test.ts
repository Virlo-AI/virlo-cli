import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRawMetaRequest,
  fmtRange,
  nextMetaPageCommand,
  normalizeCountry,
  renderRawMeta,
} from '../src/commands/raw-meta';
import { ValidationError } from '../src/client/errors';
import { isPaid } from '../src/domain/endpoints';

describe('normalizeCountry', () => {
  it('upper-cases 2-letter codes and ALL', () => {
    expect(normalizeCountry('us')).toBe('US');
    expect(normalizeCountry(' all ')).toBe('ALL');
    expect(normalizeCountry(undefined)).toBeUndefined();
  });

  it('rejects anything else with exit code 2', () => {
    try {
      normalizeCountry('USA');
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).exitCode).toBe(2);
    }
  });
});

describe('buildRawMetaRequest', () => {
  it('ad-search: q, filters and cursor', () => {
    expect(
      buildRawMetaRequest('ad-search', 'running shoes', {
        country: 'gb',
        status: 'ALL',
        mediaType: 'video',
        cursor: 'c1',
      }),
    ).toEqual({
      path: '/v1/raw/meta/ads/search',
      query: { q: 'running shoes', country: 'GB', status: 'all', media_type: 'video', cursor: 'c1' },
    });
  });

  it('ad-search: no filter keys when none are given, length checked', () => {
    expect(buildRawMetaRequest('ad-search', 'nike').query).toEqual({ q: 'nike' });
    expect(() => buildRawMetaRequest('ad-search', '   ')).toThrow(ValidationError);
    expect(() => buildRawMetaRequest('ad-search', 'x'.repeat(201))).toThrow(ValidationError);
  });

  it('rejects an unknown status or media type', () => {
    expect(() => buildRawMetaRequest('ad-search', 'nike', { status: 'paused' })).toThrow(/--status/);
    expect(() => buildRawMetaRequest('ad-search', 'nike', { mediaType: 'gif' })).toThrow(/--media-type/);
  });

  it('ad: numeric ID in the path', () => {
    expect(buildRawMetaRequest('ad', ' 1035817839464984 ')).toEqual({
      path: '/v1/raw/meta/ads/1035817839464984',
      query: {},
    });
    expect(() => buildRawMetaRequest('ad', 'abc')).toThrow(ValidationError);
    expect(() => buildRawMetaRequest('ad', '1'.repeat(20))).toThrow(ValidationError);
  });

  it('advertiser-search: q and country only', () => {
    expect(buildRawMetaRequest('advertiser-search', 'nike', { country: 'us', status: 'all' })).toEqual({
      path: '/v1/raw/meta/advertisers/search',
      query: { q: 'nike', country: 'US' },
    });
  });

  it('advertiser-ads: digits go in the path as a page ID', () => {
    expect(buildRawMetaRequest('advertiser-ads', '15087023444', { status: 'inactive', cursor: 'c2' })).toEqual({
      path: '/v1/raw/meta/advertisers/15087023444/ads',
      query: { status: 'inactive', cursor: 'c2' },
    });
  });

  it('advertiser-ads: other text, or --by-name, goes in ?name=', () => {
    expect(buildRawMetaRequest('advertiser-ads', 'Gymshark')).toEqual({
      path: '/v1/raw/meta/advertisers/ads',
      query: { name: 'Gymshark' },
    });
    expect(buildRawMetaRequest('advertiser-ads', '1800', { byName: true })).toEqual({
      path: '/v1/raw/meta/advertisers/ads',
      query: { name: '1800' },
    });
  });
});

describe('meta rendering helpers', () => {
  it('fmtRange', () => {
    expect(fmtRange({ lower: 1000, upper: 5000 })).toBe('1K-5K');
    expect(fmtRange({ lower: 1200, upper: 1200 })).toBe('1.2K');
    expect(fmtRange({ lower: 1_000_000, upper: null })).toBe('>1M');
    expect(fmtRange({ lower: null, upper: 100 })).toBe('<100');
    expect(fmtRange(null)).toBeNull();
  });

  it('nextMetaPageCommand keeps the filters and quotes args that need it', () => {
    expect(
      nextMetaPageCommand('ad-search', 'running shoes', { country: 'US', mediaType: 'video' }, 'abc+/='),
    ).toBe("virlo raw meta ad-search 'running shoes' --country US --media-type video --cursor abc+/=");
    expect(nextMetaPageCommand('advertiser-ads', '1800', { byName: true }, 'x')).toBe(
      'virlo raw meta advertiser-ads 1800 --by-name --cursor x',
    );
  });

  it('advertiser-ads names the resolved advertiser above the ads', () => {
    const out = renderRawMeta('advertiser-ads', {
      data: [{ id: '42', advertiser: { name: 'Gymshark' }, is_active: true, media_type: 'video', creatives: [{ body: 'new drop' }] }],
      advertiser: { page_id: '15087023444', name: 'Gymshark' },
      pagination: { next_cursor: null, has_more: false },
    });
    expect(out).toContain('Gymshark (15087023444)');
    expect(out).toContain('new drop');
  });

  it('advertiser-search renders handles and counts', () => {
    const out = renderRawMeta('advertiser-search', {
      data: [{ page_id: '1', name: 'Nike', likes: 39_000_000, instagram_handle: 'nike', instagram_followers: null }],
    });
    expect(out).toContain('@nike');
    expect(out).toContain('39M');
  });

  it('every meta op is marked paid', () => {
    for (const op of ['ad-search', 'ad', 'advertiser-search', 'advertiser-ads']) {
      expect(isPaid(`raw.meta.${op}`)).toBe(true);
    }
  });
});

/* ------------------------------------------------------------------ */
/* e2e against the built binary and a mock API                         */
/* ------------------------------------------------------------------ */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI_PATH = path.join(__dirname, '..', 'dist', 'index.js');

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], env: Record<string, string>): Promise<RunResult> {
  return new Promise((resolve, reject) => {
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

describe('virlo raw meta e2e (mock API)', () => {
  let configDir: string;
  let server: http.Server;
  let baseUrl: string;
  let seen: string[];

  const ad = {
    id: '1035817839464984',
    url: 'https://example.com/ad/1035817839464984',
    advertiser: { page_id: '15087023444', name: 'Gymshark', avatar_url: null, url: 'https://example.com/p' },
    is_active: true,
    started_at: '2026-10-01T00:00:00Z',
    ended_at: null,
    publisher_platforms: ['facebook', 'instagram'],
    media_type: 'image',
    creatives: [{ body: 'new drop', title: null, description: null, caption: null, cta_text: null, cta_type: null, link_url: null, image_urls: [], videos: [] }],
    variant_count: null,
    page_categories: [],
    reach: null,
    spend: null,
    impressions: null,
    platform_data: {},
  };

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-raw-meta-'));
    seen = [];
    server = http.createServer((req, res) => {
      seen.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          data: [ad],
          advertiser: { page_id: '15087023444', name: 'Gymshark' },
          pagination: { next_cursor: 'next+1', has_more: true },
        }),
      );
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

  it('passes filters and cursor, and prints the next-page command with the same filters', async () => {
    const res = await run(
      ['raw', 'meta', 'ad-search', 'running shoes', '--country', 'us', '--cursor', 'p2', '--yes', '--base-url', baseUrl],
      env(),
    );
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/raw/meta/ads/search?q=running+shoes&country=US&cursor=p2']);
    expect(res.stdout).toContain('1035817839464984');
    expect(res.stderr).toContain("virlo raw meta ad-search 'running shoes' --country us --cursor next+1");
  });

  it('advertiser-ads by name, --json prints data, advertiser and pagination', async () => {
    const res = await run(
      ['raw', 'meta', 'advertiser-ads', 'gymshark', '--status', 'all', '--json', '--yes', '--base-url', baseUrl],
      env(),
    );
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/raw/meta/advertisers/ads?name=gymshark&status=all']);
    const body = JSON.parse(res.stdout);
    expect(body.data[0].id).toBe('1035817839464984');
    expect(body.advertiser.page_id).toBe('15087023444');
    expect(body.pagination.next_cursor).toBe('next+1');
  });

  it('advertiser-ads by page ID uses the path', async () => {
    const res = await run(['raw', 'meta', 'advertiser-ads', '15087023444', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/raw/meta/advertisers/15087023444/ads']);
    expect(res.stdout).toContain('Gymshark (15087023444)');
  });

  it('rejects a non-numeric ad ID locally, before any request', async () => {
    const res = await run(['raw', 'meta', 'ad', 'abc', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('numeric');
    expect(seen).toEqual([]);
  });

  it('requires --yes when non-interactive', async () => {
    const res = await run(['raw', 'meta', 'advertiser-search', 'nike', '--base-url', baseUrl], env());
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--yes');
    expect(seen).toEqual([]);
  });
});
