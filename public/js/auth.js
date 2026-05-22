// ── User profile & playlist init ──────────────────────────────────────────────
// Fetches /api/me and /api/playlists in parallel (was sequential, now concurrent).

async function initUser() {
  try {
    const [me, pl] = await Promise.all([
      apiFetch('/api/me'),
      apiFetch('/api/playlists'),
    ]);

    currentUserId = me.id;
    DOM.userName.textContent = me.display_name || me.id;

    if (me.images?.[0]?.url) {
      DOM.userAvatar.src = me.images[0].url;
    } else {
      DOM.userAvatar.style.display = 'none';
    }

    playlists = pl.filter(p => p.owner.id === currentUserId);
    renderPlaylistList();
  } catch (e) {
    if (e.status === 401) location.href = '/';
  }
}
