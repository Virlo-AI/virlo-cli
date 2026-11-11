import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPlaceBody, renderComparison } from '../src/commands/satellite';
import { ValidationError } from '../src/client/errors';
import { isPaid } from '../src/domain/endpoints';

const comparison = {
  run_id: 'run-new',
  previous_run_id: 'run-old',
  previous_created_at: '2026-11-03T00:00:00Z',
  days_between: 7.02,
  metrics: {
    followers: { before: 100, after: 125, change: 25, change_pct: 0.25 },
    avg_views: { before: 0, after: 40, change: 40, change_pct: null },
  },
  posts: {
    new_count: 4,
    new_ids: ['a'],
    in_both: 20,
    dropped_count: 1,
    biggest_gains: [{ id: 'v1', url: null, views_before: 10, views_after: 30, views_gained: 20 }],
  },
};

describe('buildPlaceBody', () => {
  it('sends the one place reference plus max_videos', () => {
    expect(buildPlaceBody({ query: 'MCG', maxVideos: 50 })).toEqual({ query: 'MCG', max_videos: 50 });
    expect(buildPlaceBody({ placeId: 'abc' })).toEqual({ place_id: 'abc' });
    expect(buildPlaceBody({ poiId: '225' })).toEqual({ poi_id: '225' });
  });

  it('rejects zero or several references', () => {
    expect(() => buildPlaceBody({})).toThrow(ValidationError);
    expect(() => buildPlaceBody({ query: 'MCG', poiId: '225' })).toThrow(/exactly one/);
  });
});

describe('renderComparison', () => {
  it('shows every metric with its percent change, and the post counts', () => {
    const text = renderComparison(comparison);
    expect(text).toContain('run-old');
    expect(text).toContain('followers');
    expect(text).toContain('25.0%');
    expect(text).toContain('avg_views');
    expect(text).toContain('Posts: 4 new, 20 in both, 1 dropped');
    expect(text).toContain('v1');
  });

  it('leaves out the post lines when a run has no posts list', () => {
    expect(renderComparison({ ...comparison, posts: null })).not.toContain('Posts:');
  });
});

describe('satellite cost keys', () => {
  it('marks place and refresh as paid', () => {
    expect(isPaid('satellite.place')).toBe(true);
    expect(isPaid('satellite.refresh')).toBe(true);
  });
});

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

describe('virlo satellite place, compare, refresh e2e (mock API)', () => {
  let configDir: string;
  let server: http.Server;
  let baseUrl: string;
  let seen: { line: string; body: string }[];

  function answer(line: string, body: string): { status: number; data: unknown } {
    if (line === 'POST /v1/satellite/place') {
      const target = JSON.parse(body) as { query?: string };
      if (target.query === 'many') {
        return {
          status: 200,
          data: {
            status: 'candidates',
            message: 'More than one TikTok place matches.',
            total: 2,
            candidates: [
              { id: 'p1', name: 'One', kind: 'venue', locality: null, city: null, country: 'AU', video_count: 9 },
              { id: 'p2', name: 'Two', kind: 'area', locality: null, city: null, country: 'AU', video_count: 3 },
            ],
          },
        };
      }
      if (target.query === 'recent') {
        return { status: 202, data: { job_id: 'run-9', status: 'completed', cached: true } };
      }
      return { status: 202, data: { job_id: 'job-1', status: 'processing' } };
    }
    if (line === 'GET /v1/satellite/place/status/job-1') {
      return { status: 200, data: { status: 'completed', finalized: true, result: { run_id: 'job-1' } } };
    }
    if (line === 'GET /v1/satellite/runs/run-9') {
      return { status: 200, data: { run_id: 'run-9', type: 'place_lookup', status: 'completed' } };
    }
    if (line === 'GET /v1/satellite/runs/run-new/compare?previous_run_id=run-old') {
      return { status: 200, data: comparison };
    }
    if (line === 'GET /v1/satellite/runs/run-h') {
      return { status: 200, data: { run_id: 'run-h', type: 'hashtag_lookup', status: 'completed' } };
    }
    if (line === 'POST /v1/satellite/runs/run-h/refresh') {
      return { status: 202, data: { job_id: 'job-2', status: 'processing', refreshed_from: 'run-h' } };
    }
    if (line === 'GET /v1/satellite/hashtags/status/job-2') {
      return { status: 200, data: { status: 'completed', finalized: true, run_id: 'job-2' } };
    }
    return { status: 404, data: { message: `unexpected ${line}` } };
  }

  beforeEach(async () => {
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'virlo-satellite-'));
    seen = [];
    server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => (body += d.toString()));
      req.on('end', () => {
        const line = `${req.method} ${req.url}`;
        seen.push({ line, body });
        const { status, data } = answer(line, body);
        res.statusCode = status;
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(status === 404 ? data : { data }));
      });
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
  const lines = () => seen.map((s) => s.line);

  it('place without --yes stops before any request', async () => {
    const res = await run(['satellite', 'place', '--query', 'many', '--base-url', baseUrl], env());
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('--yes');
    expect(seen).toEqual([]);
  });

  it('place with two references stops before any request', async () => {
    const res = await run(['satellite', 'place', '--query', 'a', '--poi-id', '1', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(2);
    expect(res.stderr).toContain('exactly one');
    expect(seen).toEqual([]);
  });

  it('candidates print a table and never start a poll, even with --watch', async () => {
    const res = await run(['satellite', 'place', '--query', 'many', '--watch', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(lines()).toEqual(['POST /v1/satellite/place']);
    expect(res.stdout).toContain('p1');
    expect(res.stderr).toContain('--place-id');
  });

  it('candidates stay pure JSON on stdout with --json', async () => {
    const res = await run(['satellite', 'place', '--query', 'many', '--json', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(JSON.parse(res.stdout).status).toBe('candidates');
  });

  it('--watch sends the body and polls the place status route', async () => {
    const res = await run(
      ['satellite', 'place', '--poi-id', '225', '--max-videos', '50', '--watch', '--json', '--yes', '--base-url', baseUrl],
      env(),
    );
    expect(res.code).toBe(0);
    expect(JSON.parse(seen[0]!.body)).toEqual({ poi_id: '225', max_videos: 50 });
    expect(lines()).toEqual(['POST /v1/satellite/place', 'GET /v1/satellite/place/status/job-1']);
    expect(JSON.parse(res.stdout).result.run_id).toBe('job-1');
  });

  it('--watch on a cached start reads the earlier run', async () => {
    const res = await run(['satellite', 'place', '--query', 'recent', '--watch', '--json', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(lines()).toEqual(['POST /v1/satellite/place', 'GET /v1/satellite/runs/run-9']);
  });

  it('compare passes previous_run_id and needs no --yes', async () => {
    const res = await run(['satellite', 'compare', 'run-new', '--previous-run-id', 'run-old', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(lines()).toEqual(['GET /v1/satellite/runs/run-new/compare?previous_run_id=run-old']);
    expect(res.stdout).toContain('25.0%');
  });

  it('refresh posts no body and needs --yes', async () => {
    const refused = await run(['satellite', 'refresh', 'run-h', '--base-url', baseUrl], env());
    expect(refused.code).toBe(2);
    expect(seen).toEqual([]);

    const res = await run(['satellite', 'refresh', 'run-h', '--json', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(seen).toEqual([{ line: 'POST /v1/satellite/runs/run-h/refresh', body: '' }]);
    expect(JSON.parse(res.stdout).refreshed_from).toBe('run-h');
  });

  it('refresh --watch polls the status route for the run type', async () => {
    const res = await run(['satellite', 'refresh', 'run-h', '--watch', '--json', '--yes', '--base-url', baseUrl], env());
    expect(res.code).toBe(0);
    expect(lines()).toEqual([
      'GET /v1/satellite/runs/run-h',
      'POST /v1/satellite/runs/run-h/refresh',
      'GET /v1/satellite/hashtags/status/job-2',
    ]);
  });
});
