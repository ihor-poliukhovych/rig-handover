import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, LogLine, ReadNight, RunStatus, StatusCounts } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

const isStatus = (value: unknown): value is RunStatus =>
  typeof value === 'string' && (STATUSES as readonly string[]).includes(value);

// Parses one non-blank line. Returns null when it isn't JSON or doesn't fit LogLine.
const parseLine = (line: string): LogLine | null => {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || o.job === '') return null;
  if (!isStatus(o.status)) return null;
  if (!('owner' in o) || (o.owner !== null && typeof o.owner !== 'string')) return null;
  if (o.error !== undefined && typeof o.error !== 'string') return null;
  const parsed: LogLine = { at: o.at, job: o.job, status: o.status, owner: o.owner };
  if (o.error !== undefined) parsed.error = o.error;
  return parsed;
};

const readFileOrNull = (path: string): string | null => {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return null;
    throw err;
  }
};

export const readNight: ReadNight = (runsDir, night) => {
  const text = readFileOrNull(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const counts: StatusCounts = { ok: 0, retry: 0, fail: 0 };
  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line === null) {
      badLines += 1;
      continue;
    }
    counts[line.status] += 1;
    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    row.owner = line.owner;
    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, counts, badLines };
};
