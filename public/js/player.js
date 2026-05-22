// ── Spotify Web Playback SDK ──────────────────────────────────────────────────
// Assigned before any async SDK callback can fire — the SDK waits for this to be set.
window.onSpotifyWebPlaybackSDKReady = function () { initPlayer(); };

function initPlayer() {
  player = new Spotify.Player({
    name: 'Trim',
    getOAuthToken: async cb => {
      try {
        const r = await fetch('/api/token');
        const d = await r.json();
        cb(d.access_token);
      } catch {}
    },
    volume: lastVolume,
  });

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    // If we're already in review when the player connects, start playing.
    if (!DOM.stepReview.classList.contains('hidden') && currentIndex < tracks.length) {
      playTrack(tracks[currentIndex].uri, tracks[currentIndex].id).catch(() => {});
    }
  });

  player.addListener('not_ready', () => { deviceId = null; });

  // Mirror playing state in the wave indicator, and fire any pending seek
  // once the SDK confirms the target track is actually playing.
  player.addListener('player_state_changed', state => {
    if (!state) return;
    DOM.audioIndicator.classList.toggle('playing', !state.paused);

    if (
      pendingSeek &&
      !state.paused &&
      state.position < 3000 &&
      state.track_window.current_track.uri === pendingSeek.uri
    ) {
      const ms = pendingSeek.ms;
      pendingSeek = null;
      player.seek(ms);
    }
  });

  player.addListener('account_error', () => {
    DOM.trackCounter.textContent = '⚠ Spotify Premium is required for full playback';
  });

  player.addListener('initialization_error', ({ message }) => console.error('Init error:', message));
  player.addListener('authentication_error', ({ message }) => console.error('Auth error:', message));
  player.addListener('playback_error', ({ message }) => console.error('Playback error:', message));

  player.connect();
}

// ── Playback ──────────────────────────────────────────────────────────────────

async function playTrack(uri, id) {
  if (!deviceId) return;
  currentPlayingUri = uri;
  pendingSeek = null;

  // Start playback and fetch audio analysis in parallel.
  // getAnalysis returns a cached Promise on repeat calls (e.g. after undo).
  const [, analysis] = await Promise.all([
    apiFetch('/api/player/play', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, uri }),
    }),
    getAnalysis(id).catch(() => null),
  ]);

  if (!analysis || currentPlayingUri !== uri) return;

  const best = findLoudestSection(analysis.sections, analysis.duration);
  if (!best || best.start <= 3) return;

  const ms = Math.round(best.start * 1000);

  // If the SDK has already started playing this track while we were awaiting,
  // seek immediately. Otherwise store it for player_state_changed.
  const state = await player.getCurrentState();
  if (
    state &&
    !state.paused &&
    state.position < 3000 &&
    state.track_window.current_track.uri === uri
  ) {
    player.seek(ms);
  } else {
    pendingSeek = { uri, ms };
  }
}

// Skips the opening section (intro), filters out short transitions,
// excludes anything that starts with less than 30s left in the track,
// then picks the loudest remaining candidate.
function findLoudestSection(sections, trackDuration) {
  if (!sections || !sections.length) return null;
  const pool = sections.length >= 4 ? sections.slice(1) : sections;
  const candidates = pool.filter(s =>
    s.duration >= 10 &&
    (trackDuration == null || s.start + 30 <= trackDuration)
  );
  const src = candidates.length ? candidates : pool.filter(s => s.duration >= 10);
  const fallback = src.length ? src : pool;
  return fallback.reduce((best, s) => s.loudness > best.loudness ? s : best);
}

async function pausePlayback() {
  if (!deviceId) return;
  await apiFetch('/api/player/pause', { method: 'PUT' }).catch(() => {});
}

// ── Volume ────────────────────────────────────────────────────────────────────

function toggleMute() {
  if (!player) return;
  isMuted = !isMuted;
  player.setVolume(isMuted ? 0 : lastVolume);
  DOM.btnMute.textContent = isMuted ? '🔇' : '🔊';
  DOM.volumeSlider.value = isMuted ? 0 : Math.round(lastVolume * 100);
}

function handleVolumeChange(val) {
  if (!player) return;
  lastVolume = val / 100;
  isMuted = lastVolume === 0;
  player.setVolume(lastVolume);
  DOM.btnMute.textContent = isMuted ? '🔇' : '🔊';
}
