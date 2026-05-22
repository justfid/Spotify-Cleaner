# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start        # run the server (http://127.0.0.1:8888 by default)
npm test         # run all tests with Jest (--runInBand)
```

Run a single test file:
```bash
npx jest tests/spotify.test.js
```

## Project structure

```
app.js          — Express app factory (no listen); imported by tests and server.js
server.js       — entry point: loads .env, imports app.js, calls listen()
config.js       — all config from process.env (PORT, CLIENT_ID, REDIRECT_URI, SCOPES, …)
auth.js         — ensureToken middleware + registerAuthRoutes (/login /callback /logout /api/auth-status)
spotify.js      — all Spotify API calls (axios, batching, pagination, mapTrack)
routes.js       — thin Express route handlers; calls spotify.js, forwards errors via next(err)
public/         — static files served by Express
  index.html    — landing / login page
  app.html      — the full single-page cleaner app (inline CSS + JS)
tests/
  spotify.test.js  — unit tests for every spotify.js function (mocks axios)
  auth.test.js     — unit tests for ensureToken + integration tests for OAuth routes
  routes.test.js   — integration tests for all /api/* routes (mocks spotify.js and auth.js)
jest.setup.js   — loads .env.test before any module is required
.env.test       — fake test credentials (SPOTIFY_CLIENT_ID=test-client-id, PORT=3001, …)
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

Token refresh happens in `ensureToken` when `tokenExpiry` is within 60 seconds. On refresh failure the session is destroyed and a 401 is returned.

## Web Playback SDK integration

The SDK runs in-browser (`public/app.html`). The flow:

1. SDK calls `getOAuthToken(callback)` → frontend hits `/api/token` → passes `accessToken` to the callback
2. SDK fires `ready` event with a `device_id` → stored in JS state
3. To play: `PUT /api/player/play` with `{ device_id, uri }` → server calls `PUT /v1/me/player/play?device_id=…`
4. After play starts, a seek is scheduled based on `findLoudestSection` (see below)

**Pending seek pattern:** The SDK's `player_state_changed` event fires on track start. If `pendingSeek` is set (ms offset), the handler calls `player.seek()` on the first `PLAYING` state for that track, then clears `pendingSeek` to prevent repeated seeks on pause/resume.

## Performance approach

**`findLoudestSection` heuristic** (skips intros, picks the main hook):
1. Skip section 0 if there are ≥ 4 sections (usually a silent intro)
2. Filter out sections shorter than 10 s
3. Exclude sections that start within 30 s of the end
4. Pick the loudest remaining section by `loudness` field from `/audio-analysis/:id`

**Parallel fetch:** On source selection, liked songs / playlist tracks and track analysis for the first track are fetched concurrently with `Promise.all`.

**Pagination:** `paginate()` in `spotify.js` loops `api.get(url)` while `data.next` is set, stripping the Spotify base URL to get a relative path for the axios instance.

**Batching:** `removeLikedSongs` chunks at 50 IDs per DELETE. `removePlaylistTracks` chunks at 100 URIs per DELETE.

## Test architecture

- **`tests/spotify.test.js`** — mocks axios at the module level. `axios.create` returns a controlled `{ get, put, delete }` mock object. Tests verify correct URLs, request bodies, batching, pagination, and error propagation.
- **`tests/auth.test.js`** — mocks axios (for token exchange), uses the real `ensureToken` and `registerAuthRoutes`. Uses `request.agent(app)` to preserve session cookies across the `/login` → `/callback` flow.
- **`tests/routes.test.js`** — mocks both `../spotify` (all functions become jest.fn()) and `../auth` (ensureToken is a passthrough that injects `req.session.accessToken = 'mock-token'`; `registerAuthRoutes` is a no-op). Tests focus on route logic, not Spotify or auth internals.

**Key gotchas:**
- `jest.mock()` calls are hoisted before `require()`, so `app.js` gets the mocked modules even though the mock calls appear after the imports in source order.
- `setupFiles` (not `setupFilesAfterFramework`) loads `.env.test` before any module is evaluated — critical because `config.js` reads `process.env` at require time.
- `--runInBand` is required: parallel test workers share a module registry, causing mock bleed between test files.
- `app.js` must not call `listen()` — Supertest binds its own ephemeral port by importing the app directly.
- `pause()` in `spotify.js` swallows all errors (`.catch(() => {})`) because a 403 from Spotify just means no active device — not worth surfacing.
- The `/app` route is protected by `ensureToken`. The `/` and static files are public.

## Update instruction

Every future change must update this file if it affects: module responsibilities, environment variables, OAuth behavior, SDK integration, test patterns, or gotchas.
