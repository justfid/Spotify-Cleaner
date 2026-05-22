// ── Analysis prefetch & cache ─────────────────────────────────────────────────
// Stores Promises keyed by track id. Caching the Promise (not the resolved value)
// means concurrent calls for the same id share a single in-flight request.

const analysisCache = new Map();

function getAnalysis(id) {
  if (!analysisCache.has(id)) {
    analysisCache.set(id, apiFetch(`/api/track-analysis/${id}`));
  }
  return analysisCache.get(id);
}

// Pre-warms the analysis for the next track while the current one is playing.
function prefetchAnalysis(trackList, index) {
  const next = trackList[index + 1];
  if (next) getAnalysis(next.id);
}
