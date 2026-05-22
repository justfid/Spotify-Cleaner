# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run the server (http://127.0.0.1:8888 by default)
npm test         # run all 79 tests with Jest (--runInBand)
npx jest tests/services/spotify.test.js   # run a single test file
```

## Project structure

```
server.js                  — process entry point: loads .env, imports server/index, calls listen()
server/
  config.js                — all config from process.env (PORT, CLIENT_ID, REDIRECT_URI, SCOPES, …)
  index.js                 — Express app factory (no listen); imported by tests and server.js
  middleware/
    auth.js                — ensureToken: checks session token, refreshes if near expiry
    errorHandler.js        — global Express error handler (4-arg middleware, registered last)
  routes/
    auth.js                — registerAuthRoutes: /login /callback /logout /api/auth-status
    player.js              — registerPlayerRoutes: /api/track-analysis/:id /api/player/play|pause
    playlists.js           — registerPlaylistsRoutes: /api/token /api/me /api/playlists
                             /api/liked-songs /api/playlist/:id/tracks
                             /api/remove-liked /api/remove-playlist-tracks / /app
  services/
    spotify.js             — all Spotify API calls (axios, batching, pagination, mapTrack)
    cache.js               — in-memory Map: get/set/has/clear (used for analysis caching)
public/
  css/
    app.css                — styles for app.html
    index.css              — styles for index.html
  js/
    api.js                 — apiFetch, apiDeleteTracks (loaded first; all others depend on it)
    app.js                 — state vars, all decision/nav/panel functions, keyboard handler, boot
    ui.js                  — DOM cache (initDOM), all rendering functions, helpers (escHtml)
    prefetch.js            — getAnalysis (Promise cache), prefetchAnalysis (next-track pre-warm)
    player.js              — initPlayer (SDK), playTrack, pausePlayback, findLoudestSection, volume
    auth.js                — initUser: fetches /api/me + /api/playlists in parallel, populates UI
  index.html               — landing / login page
  app.html                 — single-page app shell; links css/app.css + js/*.js scripts
tests/
  middleware/
    auth.test.js           — ensureToken unit tests (4 cases, no app)
  routes/
    auth.test.js           — OAuth route integration tests + protected-routes 401 (real app)
    player.test.js         — player route tests + cache-hit test (mocks spotify + middleware/auth)
    playlists.test.js      — playlists/library route tests (mocks spotify + middleware/auth)
  services/
    spotify.test.js        — unit tests for all 9 spotify.js functions (mocks axios)
    cache.test.js          — unit tests for all 4 cache methods
jest.setup.js              — loads .env.test before any module is required
.env.test                  — fake test credentials (SPOTIFY_CLIENT_ID=test-client-id, PORT=3001, …)
```

## Environment variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `SPOTIFY_CLIENT_ID` | yes | — | from Spotify dashboard |
| `SPOTIFY_CLIENT_SECRET` | yes | — | from Spotify dashboard |
| `SESSION_SECRET` | no | `dev-secret` | use a long random string in production |
| `PORT` | no | `8888` | server listen port |

`REDIRECT_URI` is derived automatically: `http://127.0.0.1:${PORT}/callback`. Add exactly this URI to your Spotify app's allowed redirect URIs.

## OAuth flow

```
Browser → GET /login
  → generates random state, stores in session, calls session.save() explicitly
  → redirects to accounts.spotify.com/authorize

Spotify → GET /callback?code=…&state=…
  → validates state matches session.oauthState
  → deletes oauthState and calls session.save() before async exchange (prevents duplicate exchange)
  → POSTs to accounts.spotify.com/api/token
  → stores accessToken, refreshToken, tokenExpiry in session
  → redirects to /app
```

**Why `session.save()` before redirect:** Express-session writes on `res.end()`, but a redirect can complete before the store write finishes. Without explicit save, `oauthState` is missing when Spotify returns to `/callback`, causing `invalid_callback`.

**Why `127.0.0.1` not `localhost`:** Spotify's dashboard accepts `127.0.0.1` as a redirect URI without a security warning. The server binds to `127.0.0.1` consistently. Do not change this to `localhost` — sessions break because browsers treat them as different origins for cookie scoping.

Token refresh happens in `ensureToken` (`server/middleware/auth.js`) when `tokenExpiry` is within 60 seconds. On refresh failure the session is destroyed and 401 is returned.

## Web Playback SDK integration

The SDK runs in-browser (`public/app.html`). The flow:

1. `player.js` assigns `window.onSpotifyWebPlaybackSDKReady = function() { initPlayer(); }` at parse time — SDK fires this async once ready
2. SDK fires `ready` event with a `device_id` → stored in global `deviceId`
3. To play: `PUT /api/player/play` with `{ device_id, uri }` → server calls `PUT /v1/me/player/play?device_id=…`
4. `playTrack` calls `getAnalysis(id)` (from `prefetch.js`) in parallel with the play request; analysis drives seek offset

**Pending seek pattern:** The SDK's `player_state_changed` event fires on track start. If `pendingSeek` is set `{ uri, ms }`, the handler calls `player.seek(ms)` on the first `PLAYING` state for that track, then clears `pendingSeek` to prevent repeated seeks on pause/resume.

**Frontend script load order** (declared in `app.html`):
`api.js` → `app.js` (state vars) → `ui.js` (DOM + render) → `prefetch.js` → `player.js` (SDK) → `auth.js` (initUser + boot)

All scripts run in global scope — functions reference globals at call time, not at parse time, so forward references work safely.

## Performance and efficiency

### `findLoudestSection` heuristic (picks the main hook, skips intro)
1. Skip section 0 if there are ≥ 4 sections (usually a silent intro)
2. Filter out sections shorter than 10 s
3. Exclude sections that start within 30 s of the end
4. Pick the loudest remaining section by `loudness` field from `/audio-analysis/:id`

### Analysis caching (two layers)

**Server-side** (`server/services/cache.js`): the `/api/track-analysis/:id` route handler checks `cache.has(id)` before calling `spotify.getTrackAnalysis`. Eliminates redundant Spotify API calls when the same track is encountered after undo.

**Client-side** (`public/js/prefetch.js`): `getAnalysis(id)` stores the fetch Promise in a Map. Concurrent or repeated calls for the same id share a single in-flight request. `prefetchAnalysis(tracks, index)` pre-warms the next track's analysis while the current one plays.

### Other efficiency fixes applied
- **Parallel init**: `initUser()` fetches `/api/me` and `/api/playlists` with `Promise.all` (was sequential)
- **DOM cache**: `initDOM()` in `ui.js` runs once at boot and stores all element references in a `DOM` object — no repeated `getElementById` in hot paths
- **Playlist selection**: `renderPlaylistList()` builds list items once; subsequent clicks only toggle the `selected` class instead of destroying and rebuilding the entire list
- **Playback + analysis parallel**: `playTrack()` uses `Promise.all` to start playback and fetch analysis simultaneously

## Test architecture

| File | What it tests | Key mocks |
|---|---|---|
| `tests/services/spotify.test.js` | All 9 spotify.js functions | `axios` (axios.create returns controlled mock) |
| `tests/services/cache.test.js` | get/set/has/clear | none |
| `tests/middleware/auth.test.js` | `ensureToken` middleware | `axios` (for token refresh) |
| `tests/routes/auth.test.js` | OAuth routes + protected-route 401s | `axios` (for token exchange); real `ensureToken` |
| `tests/routes/player.test.js` | Player routes + analysis cache hit | `spotify`, `middleware/auth` (passthrough), `routes/auth` (no-op) |
| `tests/routes/playlists.test.js` | Playlist/library routes | `spotify`, `middleware/auth` (passthrough), `routes/auth` (no-op) |

**Mock shapes after restructure:**
- `server/middleware/auth.js` exports `module.exports = ensureToken` (plain function, not object). Mock: `jest.mock('../../server/middleware/auth', () => (req, res, next) => { ... })`
- `server/routes/auth.js` exports `module.exports = function registerAuthRoutes(app) {}`. Mock: `jest.mock('../../server/routes/auth', () => () => {})`

**Cache in player.test.js:** real `cache` module is imported and `cache.clear()` is called in `afterEach` to prevent state leaking between tests. The caching test deliberately makes two requests within a single test to verify `getTrackAnalysis` is only called once.

## Key gotchas

- **`require('./server')` from root is circular.** `server.js` uses `require('./server/index')` explicitly — Node would otherwise resolve `./server` to the root `server.js` itself.
- **`setupFiles` (not `setupFilesAfterFramework`) loads `.env.test`** before any module is evaluated — critical because `server/config.js` reads `process.env` at require time.
- **`--runInBand` is required**: parallel workers share the module registry, causing mock bleed between test files.
- **`server/index.js` must not call `listen()`** — Supertest binds its own ephemeral port by importing the app directly.
- **`pause()` in `spotify.js` swallows all errors** (`.catch(() => {})`): a 403 just means no active device, not an error worth surfacing.
- **The `selected` playlist class is toggled in `ui.js` click handlers** — `renderPlaylistList()` only builds the DOM once. Calling it again re-syncs selected state but does not re-create items.
- **Analysis Promise cache stores rejected Promises.** If the server returns an error, subsequent `getAnalysis` calls for the same id will get the same rejected Promise. Callers use `.catch(() => null)` to handle this gracefully.
- **`authHeader()` is duplicated** between `server/middleware/auth.js` and `server/routes/auth.js`. This is intentional — the two modules are independent and a shared utility would add unnecessary coupling.

## Update instruction

Every future change must update this file if it affects: module responsibilities, file locations, environment variables, OAuth behavior, SDK integration, test patterns, efficiency decisions, or gotchas.
