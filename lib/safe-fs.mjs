/**
 * File operations that survive Windows' transient refusals.
 *
 * Windows answers EPERM, EACCES or EBUSY for conditions that clear within
 * milliseconds: a directory another process just removed while a third still
 * had a handle on it stays "delete pending" until that handle closes, and an
 * antivirus scan, the search indexer or a OneDrive sync can hold a file open
 * for a moment. npm's graceful-fs retries the same codes for the same reason.
 * On other platforms those codes are real permission errors and are thrown at
 * once.
 *
 * Zero dependencies; shared by lib/engine.mjs and lib/secrets.mjs.
 */

import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

const TRANSIENT_CODES = process.platform === 'win32' ? new Set(['EPERM', 'EACCES', 'EBUSY']) : new Set();

// How long a transient refusal is retried before it is reported.
const RETRY_WINDOW_MS = 2000;

// Escalating backoff. A state write is ~1 ms, so the first retries are
// sub-millisecond; 20 ms is reserved for a holder that is genuinely slow.
const BACKOFF_MS = [0.25, 0.5, 1, 2, 4, 8, 16, 20];

// Allocating a SharedArrayBuffer per wait showed up under lock contention, and
// the wait is the one place we are deliberately doing nothing — so it is hoisted.
const SLEEP_VIEW = new Int32Array(new SharedArrayBuffer(4));

/** Sleep for the backoff step of the given attempt (0-based). */
export function backoff(attempt) {
  Atomics.wait(SLEEP_VIEW, 0, 0, BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]);
}

export function isTransientFsError(e) {
  return TRANSIENT_CODES.has(e?.code);
}

/** Run a synchronous fs call, retrying transient Windows refusals for up to 2 s. */
export function retryTransient(fn) {
  const deadline = Date.now() + RETRY_WINDOW_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return fn();
    } catch (e) {
      if (!isTransientFsError(e) || Date.now() >= deadline) throw e;
      backoff(attempt);
    }
  }
}

/**
 * Write via a temp file and a rename, so a reader never sees a half-written
 * file. The rename is what Windows refuses while another program has the
 * target open, so it is retried; if the write still fails, the temp file is
 * removed rather than left beside the target.
 */
export function writeFileAtomic(file, data, options) {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, data, options);
    retryTransient(() => renameSync(tmp, file));
  } catch (e) {
    try { unlinkSync(tmp); } catch { /* never created */ }
    throw e;
  }
}
