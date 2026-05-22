// ── DOM cache ─────────────────────────────────────────────────────────────────
// Populated once at boot. Avoids repeated getElementById calls in hot paths.

let DOM = {};

function initDOM() {
  DOM = {
    stepSelect:     document.getElementById('step-select'),
    stepLoading:    document.getElementById('step-loading'),
    stepReview:     document.getElementById('step-review'),
    stepSummary:    document.getElementById('step-summary'),
    stepDone:       document.getElementById('step-done'),
    progressFill:   document.getElementById('progress-fill'),
    trackCounter:   document.getElementById('track-counter'),
    removalsBtn:    document.getElementById('removals-btn'),
    removalsBadge:  document.getElementById('removals-badge'),
    albumArt:       document.getElementById('album-art'),
    noArt:          document.getElementById('no-art'),
    audioIndicator: document.getElementById('audio-indicator'),
    trackName:      document.getElementById('track-name'),
    trackArtist:    document.getElementById('track-artist'),
    trackAlbum:     document.getElementById('track-album'),
    btnUndo:        document.getElementById('btn-undo'),
    btnMute:        document.getElementById('btn-mute'),
    volumeSlider:   document.getElementById('volume-slider'),
    playlistList:   document.getElementById('playlist-list'),
    startBtn:       document.getElementById('start-btn'),
    playlistPicker: document.getElementById('playlist-picker'),
    cardLiked:      document.getElementById('card-liked'),
    cardPlaylist:   document.getElementById('card-playlist'),
    removalsModal:  document.getElementById('removals-modal'),
    modalTrackList: document.getElementById('modal-track-list'),
    btnDeleteAll:   document.getElementById('btn-delete-all'),
    btnRecoverAll:  document.getElementById('btn-recover-all'),
    swipeOverlay:   document.getElementById('swipe-overlay'),
    removeCount:    document.getElementById('remove-count'),
    summarySubtitle:document.getElementById('summary-subtitle'),
    summaryListWrap:document.getElementById('summary-list-wrap'),
    confirmBtn:     document.getElementById('confirm-btn'),
    doneTitle:      document.getElementById('done-title'),
    doneSub:        document.getElementById('done-sub'),
    loadingText:    document.getElementById('loading-text'),
    userName:       document.getElementById('user-name'),
    userAvatar:     document.getElementById('user-avatar'),
  };
}

// ── Step navigation ───────────────────────────────────────────────────────────

function showStep(name) {
  DOM.stepSelect.classList.toggle('hidden',  name !== 'select');
  DOM.stepLoading.classList.toggle('hidden', name !== 'loading');
  DOM.stepReview.classList.toggle('hidden',  name !== 'review');
  DOM.stepSummary.classList.toggle('hidden', name !== 'summary');
  DOM.stepDone.classList.toggle('hidden',    name !== 'done');
}

// ── Playlist list ─────────────────────────────────────────────────────────────
// Build on first call, then only toggle the selected class on subsequent calls —
// avoids destroying and rebuilding all items just to change one item's style.

function renderPlaylistList() {
  const container = DOM.playlistList;

  if (!playlists.length) {
    container.innerHTML = '<div style="padding:1rem;text-align:center;color:var(--muted);font-size:0.85rem;">No playlists you own found</div>';
    return;
  }

  if (container.childElementCount === 0) {
    playlists.forEach(pl => {
      const div = document.createElement('div');
      div.className = 'playlist-item';
      div.dataset.id = pl.id;
      div.innerHTML = `
        <img class="playlist-thumb" src="${pl.images?.[0]?.url || ''}" onerror="this.style.display='none'" />
        <div>
          <div class="playlist-name">${escHtml(pl.name)}</div>
          <div class="playlist-count">${pl.tracks.total} tracks</div>
        </div>
        <span class="playlist-check">✓</span>
      `;
      div.onclick = () => {
        container.querySelectorAll('.playlist-item').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        selectedPlaylist = pl;
        DOM.startBtn.disabled = false;
      };
      container.appendChild(div);
    });
  }

  // Sync selected state with current selectedPlaylist
  container.querySelectorAll('.playlist-item').forEach(el => {
    el.classList.toggle('selected', el.dataset.id === selectedPlaylist?.id);
  });
}

// ── Track card ────────────────────────────────────────────────────────────────

function renderTrack() {
  if (currentIndex >= tracks.length) {
    showSummary();
    return;
  }

  const t = tracks[currentIndex];
  const total = tracks.length;

  DOM.progressFill.style.width = (currentIndex / total * 100) + '%';
  DOM.trackCounter.textContent = `Track ${currentIndex + 1} of ${total}`;

  if (t.albumArt) {
    DOM.albumArt.src = t.albumArt;
    DOM.albumArt.classList.remove('hidden');
    DOM.noArt.classList.add('hidden');
  } else {
    DOM.albumArt.classList.add('hidden');
    DOM.noArt.classList.remove('hidden');
  }

  DOM.trackName.textContent = t.name;
  DOM.trackArtist.textContent = t.artists;
  DOM.trackAlbum.textContent = t.album;

  prefetchAnalysis(tracks, currentIndex);
  playTrack(t.uri, t.id).catch(() => {});
}

// ── Removals panel ────────────────────────────────────────────────────────────

function renderModalList() {
  const deleteAllBtn = DOM.btnDeleteAll;
  const recoverAllBtn = DOM.btnRecoverAll;

  if (!toRemove.length) {
    DOM.modalTrackList.innerHTML = '<div class="modal-empty">Nothing marked for removal.</div>';
    deleteAllBtn.disabled = true;
    recoverAllBtn.disabled = true;
    return;
  }

  deleteAllBtn.disabled = false;
  recoverAllBtn.disabled = false;
  DOM.modalTrackList.innerHTML = '';
  toRemove.forEach((t, i) => {
    const row = document.createElement('div');
    row.className = 'modal-track-row';
    row.innerHTML = `
      <img class="modal-thumb" src="${t.albumArt || ''}" onerror="this.style.display='none'" />
      <div class="modal-track-info">
        <div class="modal-track-name">${escHtml(t.name)}</div>
        <div class="modal-track-artist">${escHtml(t.artists)}</div>
      </div>
      <div class="modal-track-actions">
        <button class="btn-panel-undo" onclick="undoFromPanel(${i})">↩ Undo</button>
        <button class="btn-delete-now" onclick="deleteNowFromPanel(${i}, this)">Delete now</button>
      </div>
    `;
    DOM.modalTrackList.appendChild(row);
  });
}

// ── Summary ───────────────────────────────────────────────────────────────────

function showSummary() {
  pausePlayback().catch(() => {});
  showStep('summary');

  const count = toRemove.length;
  DOM.removeCount.textContent = count;
  DOM.removeCount.style.color = count > 0 ? 'var(--red)' : 'var(--green)';
  DOM.summarySubtitle.textContent = count === 0
    ? 'Nothing to remove — your library is clean!'
    : `track${count === 1 ? '' : 's'} marked for removal`;

  if (count === 0) {
    DOM.summaryListWrap.innerHTML = '<div class="empty-summary">🎉 All done — nothing to delete.</div>';
    DOM.confirmBtn.disabled = true;
    DOM.confirmBtn.textContent = 'Nothing to delete';
  } else {
    const list = document.createElement('div');
    list.className = 'summary-list';
    toRemove.forEach(t => {
      const row = document.createElement('div');
      row.className = 'summary-track';
      row.innerHTML = `
        <img class="summary-thumb" src="${t.albumArt || ''}" onerror="this.style.display='none'" />
        <div>
          <div class="summary-track-name">${escHtml(t.name)}</div>
          <div class="summary-track-artist">${escHtml(t.artists)}</div>
        </div>
      `;
      list.appendChild(row);
    });
    DOM.summaryListWrap.innerHTML = '';
    DOM.summaryListWrap.appendChild(list);
    DOM.confirmBtn.disabled = false;
    DOM.confirmBtn.textContent = `Delete ${count} track${count === 1 ? '' : 's'} from Spotify`;
  }
}

// ── Button state ──────────────────────────────────────────────────────────────

function updateUndoBtn() {
  DOM.btnUndo.disabled = history.length === 0;
}

function updateRemovalsBtn() {
  const n = toRemove.length;
  DOM.removalsBadge.textContent = n;
  DOM.removalsBtn.classList.toggle('hidden', n === 0);
}

// ── Visual feedback ───────────────────────────────────────────────────────────

function flashOverlay(type) {
  DOM.swipeOverlay.textContent = type === 'remove' ? '✕' : '✓';
  DOM.swipeOverlay.className = 'swipe-overlay show-' + type;
  setTimeout(() => { DOM.swipeOverlay.className = 'swipe-overlay'; }, 300);
}

function animateBtn(id) {
  const btn = document.getElementById(id);
  btn.classList.add('pressed');
  setTimeout(() => btn.classList.remove('pressed'), 200);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
