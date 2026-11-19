// Pure diff logic for the LinkedIn watcher: baseline first, then only unseen ids are new.
export function emptyState() {
  return { baselineAt: null, seen: {}, postings: [] };
}

// `keep` is the user's filter: every valid card counts as seen (so loosening a filter later does not
// flood the list), but only kept cards are listed and reported as new.
export function applyPoll(state, cards, nowIso, keep = () => true) {
  const valid = (Array.isArray(cards) ? cards : []).filter((c) => c && c.id && c.link);
  if (valid.length === 0) return { state, newPostings: [], baselineSaved: false, failed: true };

  const seen = { ...state.seen };
  if (!state.baselineAt) {
    for (const c of valid) seen[c.id] = nowIso;
    // The first scan lists everything it read as new (no notification: newPostings stays empty).
    const listed = valid.filter(keep).map((c) => ({ ...c, firstSeen: nowIso, baseline: true }));
    return { state: { ...state, baselineAt: nowIso, seen, postings: listed }, newPostings: [], baselineSaved: true, failed: false };
  }

  const fresh = valid.filter((c) => !(c.id in state.seen));
  for (const c of fresh) seen[c.id] = nowIso;
  const newPostings = fresh.filter(keep).map((c) => ({ ...c, firstSeen: nowIso }));
  // A posting saved without its LinkedIn age (an unreadable card back then) gets it from a later read; a saved age is never rewritten.
  const ageOf = new Map(valid.filter((c) => c.postedText).map((c) => [c.id, c.postedText]));
  const listed = state.postings.map((p) => (!p.postedText && ageOf.has(p.id) ? { ...p, postedText: ageOf.get(p.id) } : p));
  return {
    state: { ...state, seen, postings: [...newPostings, ...listed] },
    newPostings,
    baselineSaved: false,
    failed: false,
  };
}

export function prune(state, nowIso, days = 30) {
  const cutoff = Date.parse(nowIso) - days * 86_400_000;
  const seen = Object.fromEntries(Object.entries(state.seen).filter(([, t]) => Date.parse(t) >= cutoff));
  const postings = state.postings.filter((p) => Date.parse(p.firstSeen) >= cutoff);
  return { ...state, seen, postings };
}

const FLAGS = ["applied", "addedToPipeline", "acknowledged", "notified"];
const earlier = (a, b) => (!a ? b : !b ? a : Date.parse(a) <= Date.parse(b) ? a : b);

/**
 * Joins two lists of the same search into one: every posting once (what she did with it is kept, whichever list
 * had it), every seen id with the earliest time, and the earlier baseline. Neither input is changed.
 */
export function mergeStates(a, b) {
  const seen = { ...a.seen };
  for (const [id, at] of Object.entries(b.seen ?? {})) seen[id] = earlier(seen[id], at);
  const byId = new Map();
  for (const p of [...(a.postings ?? []), ...(b.postings ?? [])]) {
    const have = byId.get(p.id);
    if (!have) { byId.set(p.id, p); continue; }
    const [base, other] = Date.parse(have.firstSeen) <= Date.parse(p.firstSeen) ? [have, p] : [p, have];
    const merged = { ...other, ...base };
    for (const flag of FLAGS) if (have[flag] || p[flag]) merged[flag] = true;
    merged.scanId = base.scanId ?? other.scanId;
    if (merged.scanId === undefined) delete merged.scanId;
    byId.set(p.id, merged);
  }
  const postings = [...byId.values()].sort((x, y) => Date.parse(y.firstSeen) - Date.parse(x.firstSeen));
  return { ...a, baselineAt: earlier(a.baselineAt, b.baselineAt), seen, postings };
}
