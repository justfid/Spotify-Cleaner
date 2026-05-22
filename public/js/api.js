// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Deletes tracks from Spotify based on the active source (liked songs or playlist).
// source and selectedPlaylist are globals defined in app.js.
function apiDeleteTracks(tracksToDelete) {
  if (source === 'liked') {
    return apiFetch('/api/remove-liked', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: tracksToDelete.map(t => t.id) }),
    });
  }
  return apiFetch('/api/remove-playlist-tracks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playlistId: selectedPlaylist.id, uris: tracksToDelete.map(t => t.uri) }),
  });
}
