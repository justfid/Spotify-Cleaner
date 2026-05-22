'use strict';

jest.mock('../../server/services/spotify');
jest.mock('../../server/middleware/auth', () => (req, res, next) => {
  req.session.accessToken = 'mock-token';
  next();
});
jest.mock('../../server/routes/auth', () => () => {});

const request = require('supertest');
const spotify = require('../../server/services/spotify');
const app = require('../../server/index');

afterEach(() => jest.clearAllMocks());

// ── GET /api/token ────────────────────────────────────────────────────────────

describe('GET /api/token', () => {
  it('returns the session access token', async () => {
    const res = await request(app).get('/api/token');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ access_token: 'mock-token' });
  });
});

// ── GET /api/me ───────────────────────────────────────────────────────────────

describe('GET /api/me', () => {
  it('returns user profile from spotify.getMe', async () => {
    spotify.getMe.mockResolvedValue({ id: 'user1', display_name: 'Test' });

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 'user1', display_name: 'Test' });
  });

  it('forwards Spotify errors to the error handler', async () => {
    const err = Object.assign(new Error('Spotify down'), {
      response: { status: 503, data: { error: { message: 'Service Unavailable' } } },
    });
    spotify.getMe.mockRejectedValue(err);

    const res = await request(app).get('/api/me');

    expect(res.status).toBe(503);
  });
});

// ── GET /api/playlists ────────────────────────────────────────────────────────

describe('GET /api/playlists', () => {
  it('returns the playlists array', async () => {
    spotify.getPlaylists.mockResolvedValue([{ id: 'pl1', name: 'Chill' }]);

    const res = await request(app).get('/api/playlists');

    expect(res.status).toBe(200);
    expect(res.body).toEqual([{ id: 'pl1', name: 'Chill' }]);
  });
});

// ── GET /api/liked-songs ──────────────────────────────────────────────────────

describe('GET /api/liked-songs', () => {
  it('returns the track array', async () => {
    spotify.getLikedSongs.mockResolvedValue([{ id: 't1', name: 'Song' }]);

    const res = await request(app).get('/api/liked-songs');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toHaveProperty('id', 't1');
  });
});

// ── GET /api/playlist/:id/tracks ──────────────────────────────────────────────

describe('GET /api/playlist/:id/tracks', () => {
  it('passes the playlist id to spotify.getPlaylistTracks', async () => {
    spotify.getPlaylistTracks.mockResolvedValue([{ id: 't1' }]);

    const res = await request(app).get('/api/playlist/pl999/tracks');

    expect(res.status).toBe(200);
    expect(spotify.getPlaylistTracks).toHaveBeenCalledWith(
      expect.objectContaining({ session: expect.any(Object) }),
      'pl999'
    );
  });
});

// ── POST /api/remove-liked ────────────────────────────────────────────────────

describe('POST /api/remove-liked', () => {
  it('returns { removed: n } on success', async () => {
    spotify.removeLikedSongs.mockResolvedValue(2);

    const res = await request(app)
      .post('/api/remove-liked')
      .send({ ids: ['id1', 'id2'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: 2 });
    expect(spotify.removeLikedSongs).toHaveBeenCalledWith(expect.anything(), ['id1', 'id2']);
  });

  it('returns { removed: 0 } and skips Spotify when ids is empty', async () => {
    const res = await request(app).post('/api/remove-liked').send({ ids: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: 0 });
    expect(spotify.removeLikedSongs).not.toHaveBeenCalled();
  });

  it('returns { removed: 0 } when the ids field is missing', async () => {
    const res = await request(app).post('/api/remove-liked').send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: 0 });
  });
});

// ── POST /api/remove-playlist-tracks ──────────────────────────────────────────

describe('POST /api/remove-playlist-tracks', () => {
  it('returns { removed: n } on success', async () => {
    spotify.removePlaylistTracks.mockResolvedValue(3);

    const res = await request(app)
      .post('/api/remove-playlist-tracks')
      .send({ playlistId: 'pl1', uris: ['u1', 'u2', 'u3'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: 3 });
    expect(spotify.removePlaylistTracks).toHaveBeenCalledWith(expect.anything(), 'pl1', ['u1', 'u2', 'u3']);
  });

  it('returns { removed: 0 } when uris is empty', async () => {
    const res = await request(app)
      .post('/api/remove-playlist-tracks')
      .send({ playlistId: 'pl1', uris: [] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: 0 });
    expect(spotify.removePlaylistTracks).not.toHaveBeenCalled();
  });

  it('returns { removed: 0 } when playlistId is missing', async () => {
    const res = await request(app)
      .post('/api/remove-playlist-tracks')
      .send({ uris: ['u1'] });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: 0 });
  });
});
