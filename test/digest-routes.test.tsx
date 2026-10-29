import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Night fixtures: jobs are written out of order on purpose, so the sort is visible.
const GOOD = [
  '{"at":"2026-10-28T10:00:00+01:00","job":"zeta/job","status":"ok","owner":"rook"}',
  '{"at":"2026-10-28T09:00:00+01:00","job":"alpha/job","status":"retry","owner":null,"error":"upstream 503"}',
  '{"at":"2026-10-28T11:00:00+01:00","job":"alpha/job","status":"ok","owner":"rook"}',
];
const NIGHTS = {
  good: GOOD.join('\n'),
  empty: '',
  bad: [GOOD[0], 'not json', GOOD[1], GOOD[2]].join('\n'),
};

describe('digest routes', () => {
  let runsDir: string;
  const config = {
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: '',
  };

  beforeAll(() => {
    runsDir = mkdtempSync(join(tmpdir(), 'rig-'));
    writeFileSync(join(runsDir, '2026-10-28.jsonl'), NIGHTS.good);
    writeFileSync(join(runsDir, '2026-10-27.jsonl'), NIGHTS.empty);
    writeFileSync(join(runsDir, '2026-10-26.jsonl'), NIGHTS.bad);
    config.runsDir = runsDir;
  });

  afterAll(() => {
    rmSync(runsDir, { recursive: true, force: true });
  });

  it('GET /digest/:night answers 200 with the job names', async () => {
    const res = await createApp(config).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('alpha/job');
    expect(html).toContain('zeta/job');
  });

  it('GET /api/digest/:night answers 200 with rows sorted by job', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-28');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string; runs: number }[] };
    expect(body.night).toBe('2026-10-28');
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'zeta/job']);
    expect(body.rows[0]).toMatchObject({ job: 'alpha/job', runs: 2, retries: 1, lastError: 'upstream 503' });
  });

  it('GET /digest/:night returns 404 when the night has no file', async () => {
    const res = await createApp(config).request('/digest/2026-01-01');
    expect(res.status).toBe(404);
  });

  it('GET /api/digest/:night returns 404 when the night has no file', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('GET /digest/:night says "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request('/digest/2026-10-27');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('GET /api/digest/:night returns rows: [] for an empty night', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-27');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; badLines: number };
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('GET /digest/:night shows the bad-line note and still lists the good rows', async () => {
    const res = await createApp(config).request('/digest/2026-10-26');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('could not be read');
    expect(html).toContain('alpha/job');
    expect(html).toContain('zeta/job');
  });

  it('GET /api/digest/:night counts the bad line and keeps the good rows', async () => {
    const res = await createApp(config).request('/api/digest/2026-10-26');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: { job: string }[]; badLines: number };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'zeta/job']);
  });

  it('page and JSON list the same jobs in the same order for one night', async () => {
    const app = createApp(config);
    const html = await (await app.request('/digest/2026-10-28')).text();
    const body = (await (await app.request('/api/digest/2026-10-28')).json()) as { rows: { job: string }[] };
    const jobs = body.rows.map((r) => r.job);
    const positions = jobs.map((job) => html.indexOf(job));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
