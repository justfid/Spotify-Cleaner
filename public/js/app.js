// ── State ─────────────────────────────────────────────────────────────────────
let source = null;
let selectedPlaylist = null;
let playlists = [];
let tracks = [];
let currentIndex = 0;
let toRemove = [];
let history = [];
let player = null;
let deviceId = null;
let isMuted = false;
let lastVolume = 0.5;
let currentPlayingUri = null;
let pendingSeek = null;   // { uri, ms } — seek fires once SDK confirms track is playing
let currentUserId = null;

// ── Source selection ──────────────────────────────────────────────────────────

function selectSource(s) {
  source = s;
  DOM.cardLiked.classList.toggle('active', s === 'liked');
  DOM.cardPlaylist.classList.toggle('active', s === 'playlist');
  if (s === 'playlist') {
    DOM.playlistPicker.classList.remove('hidden');
    DOM.startBtn.disabled = !selectedPlaylist;
  } else {
    DOM.playlistPicker.classList.add('hidden');
    DOM.startBtn.disabled = false;
  }
}

// ── Review ────────────────────────────────────────────────────────────────────

async function startReview() {
  showStep('loading');
  try {
    const endpoint = source === 'liked'
      ? '/api/liked-songs'
      : `/api/playlist/${selectedPlaylist.id}/tracks`;
    DOM.loadingText.textContent = source === 'liked'
      ? 'Loading liked songs…'
      : `Loading "${selectedPlaylist.name}"…`;

    tracks = await apiFetch(endpoint);
    currentIndex = 0;
    toRemove = [];
    history = [];

    if (!tracks.length) {
      alert('No tracks found.');
      showStep('select');
      return;
    }
    showStep('review');
    updateUndoBtn();
    updateRemovalsBtn();
    renderTrack();
  } catch (e) {
    alert('Failed to load tracks: ' + (e.message || 'unknown error'));
    showStep('select');
  }
}

// ── Decision ──────────────────────────────────────────────────────────────────

function decide(action) {
  if (currentIndex >= tracks.length) return;

  history.push({ action, track: tracks[currentIndex] });

  if (action === 'remove') {
    toRemove.push(tracks[currentIndex]);
    flashOverlay('remove');
    animateBtn('btn-remove');
  } else if (action === 'keep') {
    flashOverlay('keep');
    animateBtn('btn-keep');
  }

  currentIndex++;
  updateUndoBtn();
  updateRemovalsBtn();
  pausePlayback().finally(() => renderTrack());
}

// ── Undo ──────────────────────────────────────────────────────────────────────

function undoLast() {
  if (!history.length) return;
  const last = history.pop();
  if (last.action === 'remove') {
    const idx = toRemove.findLastIndex(t => t.id === last.track.id);
    if (idx !== -1) toRemove.splice(idx, 1);
  }
  currentIndex--;
  updateUndoBtn();
  updateRemovalsBtn();
  pausePlayback().finally(() => renderTrack());
}

// ── Removals panel ────────────────────────────────────────────────────────────

function openRemovalsPanel() {
  renderModalList();
  DOM.removalsModal.classList.remove('hidden');
}

function closeRemovalsPanel() {
  DOM.removalsModal.classList.add('hidden');
}

function undoFromPanel(idx) {
  if (idx < 0 || idx >= toRemove.length) return;
  const track = toRemove.splice(idx, 1)[0];
  tracks.splice(currentIndex, 0, track);
  const hi = history.findLastIndex(h => h.action === 'remove' && h.track.id === track.id);
  if (hi !== -1) history.splice(hi, 1);
  updateUndoBtn();
  updateRemovalsBtn();
  renderModalList();
}

async function deleteNowFromPanel(idx, btn) {
  if (idx < 0 || idx >= toRemove.length) return;
  btn.disabled = true;
  btn.textContent = '…';
  const track = toRemove[idx];
  try {
    await apiDeleteTracks([track]);
    toRemove.splice(idx, 1);
    updateRemovalsBtn();
    renderModalList();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Delete now';
    alert('Delete failed: ' + (e.message || 'unknown error'));
  }
}

function recoverAllFromPanel() {
  if (!toRemove.length) return;
  toRemove.forEach(track => {
    const hi = history.findLastIndex(h => h.action === 'remove' && h.track.id === track.id);
    if (hi !== -1) history.splice(hi, 1);
  });
  toRemove = [];
  updateUndoBtn();
  updateRemovalsBtn();
  closeRemovalsPanel();
}

async function deleteAllFromPanel() {
  if (!toRemove.length) return;
  const btn = DOM.btnDeleteAll;
  btn.disabled = true;
  btn.textContent = 'Deleting…';
  try {
    await apiDeleteTracks(toRemove);
    toRemove = [];
    updateRemovalsBtn();
    closeRemovalsPanel();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Delete all now';
    alert('Delete failed: ' + (e.message || 'unknown error'));
  }
}

// ── Summary & commit ──────────────────────────────────────────────────────────

async function commitDeletions() {
  if (!toRemove.length) return;
  DOM.confirmBtn.disabled = true;
  DOM.confirmBtn.textContent = 'Deleting…';
  try {
    const result = await apiDeleteTracks(toRemove);
    showStep('done');
    DOM.doneTitle.textContent = `Removed ${result.removed} track${result.removed === 1 ? '' : 's'}`;
    DOM.doneSub.textContent = source === 'liked'
      ? 'Tracks removed from your Liked Songs.'
      : `Tracks removed from "${selectedPlaylist.name}".`;
  } catch (e) {
    DOM.confirmBtn.disabled = false;
    DOM.confirmBtn.textContent = 'Retry deletion';
    alert('Deletion failed: ' + (e.message || 'unknown error'));
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────

function goToSelect() {
  pausePlayback().catch(() => {});
  closeRemovalsPanel();
  source = null;
  selectedPlaylist = null;
  tracks = [];
  toRemove = [];
  history = [];
  currentIndex = 0;
  DOM.cardLiked.classList.remove('active');
  DOM.cardPlaylist.classList.remove('active');
  DOM.playlistPicker.classList.add('hidden');
  DOM.startBtn.disabled = true;
  DOM.audioIndicator.classList.remove('playing');
  showStep('select');
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeRemovalsPanel(); return; }
  if (DOM.stepReview.classList.contains('hidden')) return;
  if (!DOM.removalsModal.classList.contains('hidden')) return;

  if (e.key === 'ArrowLeft')                   { e.preventDefault(); decide('remove'); }
  if (e.key === 'ArrowRight')                  { e.preventDefault(); decide('keep'); }
  if (e.key === 'ArrowDown' || e.key === ' ')  { e.preventDefault(); decide('skip'); }
  if (e.key === 'z' || e.key === 'Z')          { e.preventDefault(); undoLast(); }
});

// ── Boot ──────────────────────────────────────────────────────────────────────
initDOM();
initUser();
