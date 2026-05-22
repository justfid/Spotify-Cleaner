'use strict';

jest.mock('../../server/services/spotify');
jest.mock('../../server/middleware/auth', () => (req, res, next) => {
  req.session.accessToken = 'mock-token';
  next();
});
jest.mock('../../server/routes/auth', () => () => {});

const request = require('supertest');
const spotify = require('../../server/services/spotify');
const cache = require('../../server/services/cache');
const app = require('../../server/index');

afterEach(() => {
  jest.clearAllMocks();
  cache.clear();
});

// ── GET /api/track-analysis/:id ───────────────────────────────────────────────

describe('GET /api/track-analysis/:id', () => {
  it('returns analysis data and passes the id to spotify', async () => {
    const analysis = { sections: [{ start: 30, duration: 60, loudness: -6 }], duration: 210 };
    spotify.getTrackAnalysis.mockResolvedValue(analysis);

    const res = await request(app).get('/api/track-analysis/track42');

    expect(res.status).toBe(200);
    expect(res.body).toEqual(analysis);
    expect(spotify.getTrackAnalysis).toHaveBeenCalledWith(expect.anything(), 'track42');
  });

  it('caches the result so a second request does not call spotify again', async () => {
    const analysis = { sections: [], duration: 200 };
    spotify.getTrackAnalysis.mockResolvedValue(analysis);

    await request(app).get('/api/track-analysis/cached-id');
    await request(app).get('/api/track-analysis/cached-id');

    expect(spotify.getTrackAnalysis).toHaveBeenCalledTimes(1);
  });

  it('forwards Spotify errors to the error handler', async () => {
    const err = Object.assign(new Error('Analysis unavailable'), {
      response: { status: 404, data: { error: { message: 'Not Found' } } },
    });
    spotify.getTrackAnalysis.mockRejectedValue(err);

    const res = await request(app).get('/api/track-analysis/bad-id');

    expect(res.status).toBe(404);
  });
});

// ── PUT /api/player/play ──────────────────────────────────────────────────────

describe('PUT /api/player/play', () => {
  it('returns { ok: true } and calls spotify.play', async () => {
    spotify.play.mockResolvedValue();

    const res = await request(app)
      .put('/api/player/play')
      .send({ device_id: 'dev1', uri: 'spotify:track:xyz' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(spotify.play).toHaveBeenCalledWith(expect.anything(), 'dev1', 'spotify:track:xyz');
  });

  it('returns 400 when device_id is missing', async () => {
    const res = await request(app)
      .put('/api/player/play')
      .send({ uri: 'spotify:track:xyz' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
    expect(spotify.play).not.toHaveBeenCalled();
  });

  it('returns 400 when uri is missing', async () => {
    const res = await request(app)
      .put('/api/player/play')
      .send({ device_id: 'dev1' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });
});

// ── PUT /api/player/pause ─────────────────────────────────────────────────────

describe('PUT /api/player/pause', () => {
  it('returns { ok: true }', async () => {
    spotify.pause.mockResolvedValue();
    const res = await request(app).put('/api/player/pause');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });
});

// ── Global error handler ──────────────────────────────────────────────────────

describe('global error handler', () => {
  it('uses the Spotify error status and body when present', async () => {
    const err = Object.assign(new Error('Rate limited'), {
      response: { status: 429, data: { error: { status: 429, message: 'Too Many Requests' } } },
    });
    spotify.play.mockRejectedValue(err);

    const res = await request(app)
      .put('/api/player/play')
      .send({ device_id: 'dev1', uri: 'spotify:track:xyz' });

    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: { status: 429, message: 'Too Many Requests' } });
  });

  it('falls back to 500 and err.message when no Spotify response', async () => {
    spotify.pause.mockRejectedValue(new Error('Something broke'));

    const res = await request(app).put('/api/player/pause');

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Something broke');
  });
});
