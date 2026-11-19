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
  return {
    state: { ...state, seen, postings: [...newPostings, ...state.postings] },
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
