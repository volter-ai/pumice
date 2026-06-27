// Phase 9 — git storage adapter. A VaultAdapter whose backing is a git repository:
// reads the working tree, and stage→commit snapshots it into an in-memory object store
// with full history (log), checkout of past commits, and a typed conflict error on
// divergent merge. Modeled after isomorphic-git's content-addressed store, but self-
// contained (no network/disk) so the commit/history contract is testable in CI. The
// production adapter swaps the in-memory store for isomorphic-git over the desktop fs.

// content-addressed blob id (small FNV-1a hash — deterministic, no Math.random/Date)
function hashContent(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('00000000' + h.toString(16)).slice(-8);
}
function treeId(files) {
  const keys = Object.keys(files).sort();
  return hashContent(keys.map((k) => k + ':' + hashContent(files[k])).join('\n'));
}

export class GitConflictError extends Error { constructor(paths) { super('merge conflict in: ' + paths.join(', ')); this.name = 'GitConflictError'; this.conflicts = paths; } }

/**
 * Create a git-backed adapter. `seed` is the initial working tree { path -> content }.
 * Commits are stored in an in-memory DAG; counters are deterministic for reproducibility.
 */
export function gitAdapter(seed = {}, opts = {}) {
  const work = { ...seed };                 // working tree
  const commits = [];                       // [{ id, parent, message, tree(files snapshot), n }]
  let head = null;                          // current commit id
  let seq = 0;

  function commit(message) {
    const tree = { ...work };
    const id = hashContent((head || 'root') + ':' + treeId(tree) + ':' + (seq++));
    commits.push({ id, parent: head, message, tree, n: seq });
    head = id;
    return id;
  }
  function getCommit(id) { return commits.find((c) => c.id === id) || null; }
  function log() { const out = []; let id = head; while (id) { const c = getCommit(id); if (!c) break; out.push({ id: c.id, message: c.message, parent: c.parent }); id = c.parent; } return out; }

  return {
    name: opts.name || 'git',
    capabilities: { write: true, watch: false, sync: false, versioned: true },
    // --- VaultAdapter surface (operates on the working tree) ---
    async list() { return Object.keys(work).sort(); },
    async read(p) { if (!(p in work)) throw new Error('ENOENT ' + p); return work[p]; },
    async write(p, content) { work[p] = content; },
    async remove(p) { delete work[p]; },
    async snapshot() { return { ...work }; },
    // --- git surface ---
    stage() { return Object.keys(work); },               // working tree is the index in this model
    commit,
    head: () => head,
    log,
    /** Restore the working tree to a past commit (checkout). */
    checkout(id) { const c = getCommit(id); if (!c) throw new Error('unknown commit ' + id); for (const k of Object.keys(work)) delete work[k]; Object.assign(work, c.tree); head = id; },
    /**
     * Merge another adapter's commit history (pull). Three-way merge: non-overlapping
     * changes auto-merge; a path changed differently on both sides → GitConflictError.
     */
    pull(theirs, baseTree) {
      // merge base = common ancestor. `theirs` is an external snapshot with no shared
      // commits here, so default the ancestor to the root commit's tree.
      const base = baseTree || (commits[0] ? commits[0].tree : {});
      const ours = work;
      const them = theirs.snapshotTree ? theirs.snapshotTree() : theirs;
      const conflicts = [];
      const merged = { ...ours };
      for (const k of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(them)])) {
        const b = base[k], o = ours[k], t = them[k];
        if (o === t) continue;                                   // same (or both absent)
        if (o === b) merged[k] = t;                              // only they changed → take theirs
        else if (t === b) merged[k] = o;                         // only we changed → keep ours
        else conflicts.push(k);                                  // both changed differently
        if (t === undefined && o === b) delete merged[k];        // they deleted, we untouched
      }
      if (conflicts.length) throw new GitConflictError(conflicts);
      for (const k of Object.keys(work)) delete work[k];
      Object.assign(work, merged);
      return commit('merge');
    },
    snapshotTree() { return { ...work }; },
  };
}
