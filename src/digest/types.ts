// Contract for the run log reader (plan.md, section 1). Types only: the reader implements
// `ReadNight`; the page, the JSON route and the status board build against these.

// One log line's status. Lines with any other value count as bad lines.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One parsed line of runs/<night>.jsonl. Times stay strings with the log's offset.
export type LogLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job in the night, built from that job's good lines in file order.
export type DigestRow = {
  job: string;
  owner: string | null; // from the job's last line; null is kept, rendered as `—`
  runs: number; // good lines for this job
  retries: number; // lines with status `retry`
  lastStatus: RunStatus; // status of the job's last line
  lastError: string | null; // `error` of the last line that had one, else null
  firstAt: string; // `at` of the job's first line, offset kept
  lastAt: string; // `at` of the job's last line, offset kept
};

// Good lines counted by status (each line once, bad lines excluded). For the status board.
export type StatusCounts = Record<RunStatus, number>;

// One night's log, read. An empty file is a Night with no rows ("nothing ran").
export type Night = {
  night: string; // YYYY-MM-DD, as asked for
  rows: DigestRow[]; // sorted by job
  counts: StatusCounts;
  badLines: number; // lines that don't parse or don't fit LogLine; blank lines are not counted
};

// Reads `<runsDir>/<night>.jsonl`. Returns null when that file does not exist (the page answers
// 404). Never throws on bad lines: they are counted in `badLines`.
export type ReadNight = (runsDir: string, night: string) => Night | null;
