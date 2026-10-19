import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertRawPlatform,
  buildRawRequest,
  fmtCount,
  looksLikeUrl,
  nextPageCommand,
  renderRaw,
  videoRefQuery,
} from '../src/commands/raw';
import { ValidationError } from '../src/client/errors';
import { isPaid } from '../src/domain/endpoints';

describe('looksLikeUrl / videoRefQuery', () => {
  it('treats http(s) links as URLs', () => {
    expect(looksLikeUrl('https://www.tiktok.com/@a/video/7300')).toBe(true);
    expect(looksLikeUrl('http://youtube.com/shorts/abc')).toBe(true);
  });

  it('treats scheme-less links as URLs', () => {
    expect(looksLikeUrl('youtu.be/abc123')).toBe(true);
    expect(looksLikeUrl('www.instagram.com/reel/Cxyz/')).toBe(true);
  });

  it('treats bare IDs as IDs', () => {
    expect(looksLikeUrl('7300123456789')).toBe(false);
    expect(looksLikeUrl('dQw4w9WgXcQ')).toBe(false);
    expect(looksLikeUrl('Cxyz_1-2')).toBe(false);
  });

  it('maps a URL to url= and an ID to id=', () => {
    expect(videoRefQuery('https://youtu.be/abc')).toEqual({ url: 'https://youtu.be/abc' });
    expect(videoRefQuery(' 7300 ')).toEqual({ id: '7300' });
  });

  it('rejects an empty reference', () => {
    expect(() => videoRefQuery('  ')).toThrow(ValidationError);
  });
});

describe('assertRawPlatform', () => {
  it('accepts the three platforms, case-insensitive', () => {
    expect(assertRawPlatform('tiktok', 'search')).toBe('tiktok');
    expect(assertRawPlatform('YouTube', 'video')).toBe('youtube');
    expect(assertRawPlatform('instagram', 'creator')).toBe('instagram');
  });

  it('rejects an unknown platform with exit code 2', () => {
    try {
      assertRawPlatform('twitter', 'search');
      throw new Error('expected a throw');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as ValidationError).exitCode).toBe(2);
    }
  });

  it('rejects instagram for transcripts with a clear message', () => {
    expect(() => assertRawPlatform('instagram', 'transcript')).toThrow(/not available for instagram/);
    expect(assertRawPlatform('youtube', 'transcript')).toBe('youtube');
  });
});

describe('buildRawRequest', () => {
  it('search: q and cursor', () => {
    expect(buildRawRequest('search', 'tiktok', 'morning routine', 'c1')).toEqual({
      path: '/v1/raw/tiktok/search',
      query: { q: 'morning routine', cursor: 'c1' },
    });
  });

  it('search: no cursor key on page 1, length checked', () => {
    expect(buildRawRequest('search', 'youtube', 'ai').query).toEqual({ q: 'ai' });
    expect(() => buildRawRequest('search', 'youtube', '   ')).toThrow(ValidationError);
    expect(() => buildRawRequest('search', 'youtube', 'x'.repeat(201))).toThrow(ValidationError);
  });

  it('hashtag: strips # and encodes the path segment', () => {
    expect(buildRawRequest('hashtag', 'instagram', '#fit tok', 'c2')).toEqual({
      path: '/v1/raw/instagram/hashtag/fit%20tok',
      query: { cursor: 'c2' },
    });
  });

  it('video / transcript: url vs id', () => {
    expect(buildRawRequest('video', 'tiktok', 'https://www.tiktok.com/@a/video/1')).toEqual({
      path: '/v1/raw/tiktok/video',
      query: { url: 'https://www.tiktok.com/@a/video/1' },
    });
    expect(buildRawRequest('transcript', 'youtube', 'abc')).toEqual({
      path: '/v1/raw/youtube/video/transcript',
      query: { id: 'abc' },
    });
  });

  it('comments: ref plus cursor', () => {
    expect(buildRawRequest('comments', 'youtube', 'abc', 'c3')).toEqual({
      path: '/v1/raw/youtube/video/comments',
      query: { id: 'abc', cursor: 'c3' },
    });
  });

  it('creator / creator-videos: strips @', () => {
    expect(buildRawRequest('creator', 'tiktok', '@amy')).toEqual({
      path: '/v1/raw/tiktok/creator/amy',
      query: {},
    });
    expect(buildRawRequest('creator-videos', 'youtube', 'UCabc', 'c4')).toEqual({
      path: '/v1/raw/youtube/creator/UCabc/videos',
      query: { cursor: 'c4' },
    });
  });
});

describe('rendering helpers', () => {
  it('fmtCount', () => {
    expect(fmtCount(999)).toBe('999');
    expect(fmtCount(1200)).toBe('1.2K');
    expect(fmtCount(3_000_000)).toBe('3M');
    expect(fmtCount(null)).toBeNull();
  });

  it('nextPageCommand quotes args that need it', () => {
    expect(nextPageCommand('search', ['tiktok', 'morning routine'], 'abc+/=')).toBe(
      "virlo raw search tiktok 'morning routine' --cursor abc+/=",
    );
  });

  it('transcript renders the text', () => {
    expect(renderRaw('transcript', { text: 'hello world' })).toBe('hello world');
  });

  it('comments render author and text', () => {
    const out = renderRaw('comments', [{ id: '1', text: 'great', likes: 5, reply_count: 0, author: { handle: 'bo' } }]);
    expect(out).toContain('@bo');
    expect(out).toContain('great');
  });

  it('every raw op is marked paid', () => {
    for (const op of ['search', 'hashtag', 'video', 'comments', 'transcript', 'creator', 'creator-videos']) {
      expect(isPaid(`raw.${op}`)).toBe(true);
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

describe('virlo raw e2e (mock API)', () => {
  let configDir: string;
  let server: http.Server;
  let baseUrl: string;
  let seen: string[];

  const video = {
    id: '7300',
    platform: 'tiktok',
    url: 'https://example.com/v/7300',
    caption: 'a caption',
    hashtags: [],
    published_at: '2026-10-01T00:00:00Z',
    duration_seconds: 10,
    thumbnail_url: null,
    author: { id: '1', handle: 'amy', display_name: null, avatar_url: null, verified: null },
    stats: { views: 1000, likes: 10, comments: 1, shares: 0, saves: null },
    sound: null,
    platform_data: {},
  };

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-raw-'));
    seen = [];
    server = http.createServer((req, res) => {
      seen.push(req.url ?? '');
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ data: [video], pagination: { next_cursor: 'next+1', has_more: true } }));
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

  it('passes the cursor and prints the next-page command', async () => {
    const res = await run(['raw', 'search', 'tiktok', 'ai tools', '--cursor', 'p2', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/raw/tiktok/search?q=ai+tools&cursor=p2']);
    expect(res.stdout).toContain('7300');
    expect(res.stderr).toContain("virlo raw search tiktok 'ai tools' --cursor next+1");
  });

  it('--json prints the full body (data + pagination) to stdout', async () => {
    const res = await run(['raw', 'creator-videos', 'tiktok', '@amy', '--json', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(seen).toEqual(['/v1/raw/tiktok/creator/amy/videos']);
    const body = JSON.parse(res.stdout);
    expect(body.data[0].id).toBe('7300');
    expect(body.pagination.next_cursor).toBe('next+1');
  });

  it('rejects instagram transcripts locally, before any request', async () => {
    const res = await run(['raw', 'transcript', 'instagram', 'abc', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('not available for instagram');
    expect(seen).toEqual([]);
  });

  it('requires --yes when non-interactive', async () => {
    const res = await run(['raw', 'video', 'tiktok', '7300', '--base-url', baseUrl], env());
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--yes');
    expect(seen).toEqual([]);
  });
});
