/**
 * Reference count for async work that is not tracked by TanStack Query mutations
 * (e.g. storage uploads). Pair with {@link GlobalActionProgressBar}.
 */
let depth = 0;
const listeners = new Set();

function emit() {
  for (const fn of listeners) {
    try {
      fn(depth);
    } catch {
      /* ignore listener errors */
    }
  }
}

/** @param {(n: number) => void} listener */
export function subscribeTrackedActionDepth(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function beginTrackedAction() {
  depth += 1;
  emit();
}

export function endTrackedAction() {
  depth = Math.max(0, depth - 1);
  emit();
}

/**
 * Wrap an async function so the global action progress bar includes its duration.
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withTrackedAction(fn) {
  beginTrackedAction();
  try {
    return await fn();
  } finally {
    endTrackedAction();
  }
}
