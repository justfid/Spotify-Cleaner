'use strict';

jest.mock('axios');

const axios = require('axios');
const request = require('supertest');
const app = require('../../server/index');

afterEach(() => jest.clearAllMocks());

// ── Protected routes return 401 without a session ─────────────────────────────

describe('auth guard — unauthenticated requests', () => {
  const protectedRoutes = [
    { method: 'get',  path: '/api/token' },
    { method: 'get',  path: '/api/me' },
    { method: 'get',  path: '/api/playlists' },
    { method: 'get',  path: '/api/liked-songs' },
    { method: 'get',  path: '/api/playlist/x/tracks' },
    { method: 'get',  path: '/api/track-analysis/x' },
    { method: 'post', path: '/api/remove-liked' },
    { method: 'post', path: '/api/remove-playlist-tracks' },
    { method: 'put',  path: '/api/player/play' },
    { method: 'put',  path: '/api/player/pause' },
  ];

  protectedRoutes.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path} returns 401`, async () => {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    });
  });
});

// ── GET /login ─────────────────────────────────────────────────────────────────

describe('GET /login', () => {
  it('redirects to Spotify authorization URL', async () => {
    const res = await request(app).get('/login').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('accounts.spotify.com/authorize');
  });

  it('includes client_id, response_type, redirect_uri, scope, and state', async () => {
    const res = await request(app).get('/login').redirects(0);
    const url = new URL(res.headers.location);
    expect(url.searchParams.get('client_id')).toBe('test-client-id');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toContain('/callback');
    expect(url.searchParams.get('state')).toBeTruthy();
    expect(url.searchParams.get('scope')).toContain('streaming');
  });

  it('includes all required scopes', async () => {
    const res = await request(app).get('/login').redirects(0);
    const scope = new URL(res.headers.location).searchParams.get('scope');
    const required = [
      'user-library-read', 'user-library-modify',
      'playlist-read-private', 'playlist-modify-private',
      'streaming', 'user-read-playback-state', 'user-modify-playback-state',
    ];
    required.forEach(s => expect(scope).toContain(s));
  });
});

// ── GET /callback ─────────────────────────────────────────────────────────────

describe('GET /callback', () => {
  it('redirects to /?error=<value> when Spotify returns an error param', async () => {
    const res = await request(app).get('/callback?error=access_denied').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=access_denied');
  });

  it('redirects to /?error=invalid_callback with no session state', async () => {
    const res = await request(app).get('/callback?code=test&state=randomstate').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=invalid_callback');
  });

  it('redirects to /?error=state_mismatch when state does not match', async () => {
    const agent = request.agent(app);
    await agent.get('/login').redirects(0);
    const res = await agent.get('/callback?code=x&state=wrong-state').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('error=state_mismatch');
  });

  it('exchanges the code, stores tokens, and redirects to /app on success', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.get('/login').redirects(0);
    const state = new URL(loginRes.headers.location).searchParams.get('state');

    axios.post.mockResolvedValue({
      data: { access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 },
    });

    const callbackRes = await agent.get(`/callback?code=auth-code&state=${state}`).redirects(0);
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toBe('/app');
  });

  it('redirects to /?error=token_exchange_failed when the exchange throws', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.get('/login').redirects(0);
    const state = new URL(loginRes.headers.location).searchParams.get('state');

    axios.post.mockRejectedValue(new Error('Spotify token error'));

    const callbackRes = await agent.get(`/callback?code=bad-code&state=${state}`).redirects(0);
    expect(callbackRes.status).toBe(302);
    expect(callbackRes.headers.location).toContain('error=token_exchange_failed');
  });

  it('redirects already-authenticated users to /app when oauthState is missing', async () => {
    const agent = request.agent(app);
    const loginRes = await agent.get('/login').redirects(0);
    const state = new URL(loginRes.headers.location).searchParams.get('state');

    axios.post.mockResolvedValue({
      data: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 },
    });
    await agent.get(`/callback?code=c&state=${state}`).redirects(0);

    // Second hit — oauthState is gone, but accessToken is set
    const dupRes = await agent.get(`/callback?code=c&state=${state}`).redirects(0);
    expect(dupRes.headers.location).toBe('/app');
  });
});

// ── GET /logout ───────────────────────────────────────────────────────────────

describe('GET /logout', () => {
  it('redirects to /', async () => {
    const res = await request(app).get('/logout').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });
});

// ── GET /api/auth-status ──────────────────────────────────────────────────────

describe('GET /api/auth-status', () => {
  it('returns { loggedIn: false } with no session', async () => {
    const res = await request(app).get('/api/auth-status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ loggedIn: false });
  });
});
