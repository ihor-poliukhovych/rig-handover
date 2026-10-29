import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('reads 5 jobs and 1 bad line (the truncated last line)', () => {
    expect(night).not.toBeNull();
    expect(night?.night).toBe('2026-10-28');
    expect(night?.rows).toHaveLength(5);
    expect(night?.badLines).toBe(1);
  });

  it('builds one row per job, sorted by job, offsets kept', () => {
    expect(night?.rows).toEqual([
      {
        job: 'digest/render', owner: null, runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-29T05:41:09+01:00', lastAt: '2026-10-29T05:41:09+01:00',
      },
      {
        job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok',
        lastError: 'upstream 503',
        firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
      },
      {
        job: 'lane/sync', owner: 'rook', runs: 8, retries: 1, lastStatus: 'ok', lastError: 'lock held',
        firstAt: '2026-10-28T23:00:06+01:00', lastAt: '2026-10-29T05:00:04+01:00',
      },
      {
        job: 'notes/backup', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'fail',
        lastError: 'quota exceeded',
        firstAt: '2026-10-29T04:00:01+01:00', lastAt: '2026-10-29T04:00:01+01:00',
      },
      {
        job: 'rig/rotate-logs', owner: 'lane-07', runs: 1, retries: 0, lastStatus: 'ok', lastError: null,
        firstAt: '2026-10-28T23:00:02+01:00', lastAt: '2026-10-28T23:00:02+01:00',
      },
    ]);
  });

  it('counts good lines by status', () => {
    expect(night?.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
});

describe('readNight edge cases', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const write = (night: string, text: string): void =>
    writeFileSync(join(dir, `${night}.jsonl`), text);

  it('returns null for a missing file', () => {
    expect(readNight(dir, '2026-01-01')).toBeNull();
  });

  it('reads an empty file as a night with no rows', () => {
    write('2026-01-02', '');
    expect(readNight(dir, '2026-01-02')).toEqual({
      night: '2026-01-02', rows: [], counts: { ok: 0, retry: 0, fail: 0 }, badLines: 0,
    });
  });

  it('skips blank lines without counting them, CRLF included', () => {
    const line = '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"ok","owner":"x"}';
    write('2026-01-03', `\n${line}\r\n   \r\n\n${line}\n`);
    const n = readNight(dir, '2026-01-03');
    expect(n?.badLines).toBe(0);
    expect(n?.rows).toHaveLength(1);
    expect(n?.rows[0]?.runs).toBe(2);
    expect(n?.rows[0]?.firstAt).toBe('2026-01-03T01:00:00+02:00');
  });

  it('counts lines that parse but do not fit LogLine as bad', () => {
    write('2026-01-04', [
      '{"at":"t","job":"a","status":"done","owner":"x"}',
      '{"at":"t","job":"a","status":"ok"}',
      '{"at":1,"job":"a","status":"ok","owner":"x"}',
      '{"at":"t","job":"a","status":"ok","owner":"x","error":5}',
      '[1,2]',
      'null',
      'not json',
      '{"at":"t","job":"a","status":"ok","owner":"x"}',
    ].join('\n'));
    const n = readNight(dir, '2026-01-04');
    expect(n?.badLines).toBe(7);
    expect(n?.counts).toEqual({ ok: 1, retry: 0, fail: 0 });
    expect(n?.rows).toHaveLength(1);
  });

  it('takes the owner from the last line and keeps the last error seen', () => {
    write('2026-01-05', [
      '{"at":"1","job":"a","status":"fail","owner":"x","error":"boom"}',
      '{"at":"2","job":"a","status":"ok","owner":null}',
    ].join('\n'));
    expect(readNight(dir, '2026-01-05')?.rows[0]).toMatchObject({
      owner: null, lastStatus: 'ok', lastError: 'boom', firstAt: '1', lastAt: '2',
    });
  });
});
