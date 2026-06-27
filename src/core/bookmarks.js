// Bookmarks (Phase 4-rest). Data model matching Obsidian's `.obsidian/bookmarks.json`:
// an ordered tree of bookmark items + groups. Item types: file, folder, search,
// heading, block, graph, url. Isomorphic CRUD; persistence is the caller's job.

/** Empty bookmarks doc, matching the on-disk shape. */
export function createBookmarks() { return { items: [] }; }

const sameTarget = (a, b) => a.type === b.type && (a.path || '') === (b.path || '') && (a.subpath || '') === (b.subpath || '') && (a.query || '') === (b.query || '') && (a.url || '') === (b.url || '');

function findContainer(doc, groupPath) {
  if (!groupPath || !groupPath.length) return doc;
  let cur = doc;
  for (const title of groupPath) {
    let g = (cur.items || []).find((x) => x.type === 'group' && x.title === title);
    if (!g) { g = { type: 'group', title, items: [] }; (cur.items || (cur.items = [])).push(g); }
    cur = g;
  }
  return cur;
}

/** Add a bookmark (deduped within its group). `item` e.g. { type:'file', path:'A.md', title }. */
export function addBookmark(doc, item, groupPath = []) {
  const container = findContainer(doc, groupPath);
  if (!container.items.some((x) => sameTarget(x, item))) container.items.push({ ...item });
  return doc;
}

/** Remove the first bookmark matching `item` (by target) within a group. */
export function removeBookmark(doc, item, groupPath = []) {
  const container = findContainer(doc, groupPath);
  const i = container.items.findIndex((x) => sameTarget(x, item));
  if (i !== -1) container.items.splice(i, 1);
  return doc;
}

export function isBookmarked(doc, item) {
  const walk = (items) => items.some((x) => (x.type === 'group' ? walk(x.items || []) : sameTarget(x, item)));
  return walk(doc.items);
}

/** Flatten all leaf bookmarks (depth-first), each with its group path. */
export function allBookmarks(doc) {
  const out = [];
  const walk = (items, path) => { for (const x of items) { if (x.type === 'group') walk(x.items || [], [...path, x.title]); else out.push({ ...x, group: path }); } };
  walk(doc.items, []);
  return out;
}

/** Reorder an item within its group from index `from` to `to`. */
export function moveBookmark(doc, groupPath, from, to) {
  const container = findContainer(doc, groupPath);
  const [it] = container.items.splice(from, 1);
  if (it) container.items.splice(to, 0, it);
  return doc;
}
