// File recovery / snapshots (Phase 4-rest). Obsidian keeps periodic snapshots of each
// note so you can restore an earlier version. This is the isomorphic data model + a
// line diff; persistence is the caller's (IndexedDB in-browser, fs on desktop).

/** Create an empty snapshot store: { path -> [{ ts, content }] (newest last) }. */
export function createSnapshotStore() { return { byPath: {} }; }

/**
 * Record a snapshot for `path`. Coalesces no-op writes (identical to the latest), caps
 * history at `keep` (default 25). `ts` is a caller-supplied timestamp (ms).
 */
export function addSnapshot(store, path, content, ts, keep = 25) {
  const list = store.byPath[path] || (store.byPath[path] = []);
  if (list.length && list[list.length - 1].content === content) return store;
  list.push({ ts, content });
  if (list.length > keep) list.splice(0, list.length - keep);
  return store;
}

/** Snapshots for a path, newest first: [{ ts, content }]. */
export function listSnapshots(store, path) {
  return [...(store.byPath[path] || [])].reverse();
}

/** Nearest snapshot at or before `ts` (for "restore as of"). */
export function snapshotAt(store, path, ts) {
  const list = store.byPath[path] || [];
  let best = null;
  for (const s of list) if (s.ts <= ts) best = s;
  return best;
}

/**
 * Line-level diff between two strings (LCS). Returns [{ op, line }] where op is
 * ' ' (unchanged), '-' (removed from a), '+' (added in b).
 */
export function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ op: ' ', line: A[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ op: '-', line: A[i] }); i++; }
    else { out.push({ op: '+', line: B[j] }); j++; }
  }
  while (i < n) out.push({ op: '-', line: A[i++] });
  while (j < m) out.push({ op: '+', line: B[j++] });
  return out;
}

/** Compact change summary between two versions: { added, removed }. */
export function diffStat(a, b) {
  const d = diffLines(a, b);
  return { added: d.filter((x) => x.op === '+').length, removed: d.filter((x) => x.op === '-').length };
}
