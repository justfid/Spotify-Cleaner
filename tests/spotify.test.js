'use strict';

jest.mock('axios');

const axios = require('axios');
const spotify = require('../spotify');

// Fake req — spotify.js only reads req.session.accessToken
const req = { session: { accessToken: 'test-token' } };

// Fresh mock axios instance for each test
let api;

beforeEach(() => {
  api = { get: jest.fn(), put: jest.fn(), delete: jest.fn() };
  axios.create.mockReturnValue(api);
});

afterEach(() => jest.clearAllMocks());

// ── Fixtures ──────────────────────────────────────────────────────────────────

const makeItem = (overrides = {}) => ({
  track: {
    id: 'track1',
    name: 'Test Song',
    artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
    album: { name: 'Test Album', images: [{ url: 'http://img.example.com/art.jpg' }] },
    preview_url: 'http://example.com/preview.mp3',
    uri: 'spotify:track:track1',
    ...overrides,
  },
});

const expectedTrack = {
  id: 'track1',
  name: 'Test Song',
  artists: 'Artist A, Artist B',
  album: 'Test Album',
  albumArt: 'http://img.example.com/art.jpg',
  preview_url: 'http://example.com/preview.mp3',
  uri: 'spotify:track:track1',
};

// ── getMe ─────────────────────────────────────────────────────────────────────

describe('getMe', () => {
  it('returns user profile data', async () => {
    const user = { id: 'user1', display_name: 'Test User' };
    api.get.mockResolvedValue({ data: user });

    await expect(spotify.getMe(req)).resolves.toEqual(user);
    expect(api.get).toHaveBeenCalledWith('/me');
  });

  it('sets the Bearer token on the axios instance', async () => {
    api.get.mockResolvedValue({ data: {} });
    await spotify.getMe(req);
    expect(axios.create).toHaveBeenCalledWith(
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } })
    );
  });

  it('propagates errors', async () => {
    api.get.mockRejectedValue(new Error('Network error'));
    await expect(spotify.getMe(req)).rejects.toThrow('Network error');
  });
});

// ── getPlaylists ──────────────────────────────────────────────────────────────

describe('getPlaylists', () => {
  it('returns single-page results', async () => {
    const playlists = [{ id: 'pl1', name: 'Mix' }];
    api.get.mockResolvedValue({ data: { items: playlists, next: null } });

    await expect(spotify.getPlaylists(req)).resolves.toEqual(playlists);
    expect(api.get).toHaveBeenCalledWith('/me/playlists?limit=50');
  });

  it('paginates and strips the base URL from next', async () => {
    api.get
      .mockResolvedValueOnce({ data: { items: [{ id: 'pl1' }], next: 'https://api.spotify.com/v1/me/playlists?limit=50&offset=50' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'pl2' }], next: null } });

    const result = await spotify.getPlaylists(req);

    expect(result).toEqual([{ id: 'pl1' }, { id: 'pl2' }]);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(api.get).toHaveBeenNthCalledWith(2, '/me/playlists?limit=50&offset=50');
  });
});

// ── getLikedSongs ─────────────────────────────────────────────────────────────

describe('getLikedSongs', () => {
  it('maps Spotify items to the internal track shape', async () => {
    api.get.mockResolvedValue({ data: { items: [makeItem()], next: null } });

    const result = await spotify.getLikedSongs(req);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expectedTrack);
  });

  it('joins multiple artists with a comma', async () => {
    api.get.mockResolvedValue({ data: { items: [makeItem()], next: null } });
    const [track] = await spotify.getLikedSongs(req);
    expect(track.artists).toBe('Artist A, Artist B');
  });

  it('sets albumArt to null when the images array is empty', async () => {
    const item = { track: { ...makeItem().track, album: { name: 'Album', images: [] } } };
    api.get.mockResolvedValue({ data: { items: [item], next: null } });
    const [track] = await spotify.getLikedSongs(req);
    expect(track.albumArt).toBeNull();
  });

  it('paginates correctly', async () => {
    api.get
      .mockResolvedValueOnce({ data: { items: [makeItem()], next: 'https://api.spotify.com/v1/me/tracks?limit=50&offset=50' } })
      .mockResolvedValueOnce({ data: { items: [makeItem()], next: null } });

    const result = await spotify.getLikedSongs(req);
    expect(result).toHaveLength(2);
  });
});

// ── getPlaylistTracks ─────────────────────────────────────────────────────────

describe('getPlaylistTracks', () => {
  it('uses the playlistId in the request URL', async () => {
    api.get.mockResolvedValue({ data: { items: [], next: null } });
    await spotify.getPlaylistTracks(req, 'abc123');
    expect(api.get).toHaveBeenCalledWith('/playlists/abc123/tracks?limit=50');
  });

  it('maps valid items to the internal track shape', async () => {
    api.get.mockResolvedValue({ data: { items: [makeItem()], next: null } });
    const result = await spotify.getPlaylistTracks(req, 'pl1');
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(expectedTrack);
  });

  it('filters out items with a null track', async () => {
    api.get.mockResolvedValue({ data: { items: [makeItem(), { track: null }, { track: { id: null } }], next: null } });
    const result = await spotify.getPlaylistTracks(req, 'pl1');
    expect(result).toHaveLength(1);
  });
});

// ── removeLikedSongs ──────────────────────────────────────────────────────────

describe('removeLikedSongs', () => {
  it('returns the count of ids passed in', async () => {
    api.delete.mockResolvedValue({});
    await expect(spotify.removeLikedSongs(req, ['id1', 'id2'])).resolves.toBe(2);
  });

  it('sends a single batch when ids ≤ 50', async () => {
    api.delete.mockResolvedValue({});
    await spotify.removeLikedSongs(req, ['id1', 'id2']);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete).toHaveBeenCalledWith('/me/tracks', { data: { ids: ['id1', 'id2'] } });
  });

  it('splits into two batches when ids > 50', async () => {
    api.delete.mockResolvedValue({});
    const ids = Array.from({ length: 75 }, (_, i) => `id${i}`);
    await spotify.removeLikedSongs(req, ids);
    expect(api.delete).toHaveBeenCalledTimes(2);
    expect(api.delete).toHaveBeenNthCalledWith(1, '/me/tracks', { data: { ids: ids.slice(0, 50) } });
    expect(api.delete).toHaveBeenNthCalledWith(2, '/me/tracks', { data: { ids: ids.slice(50) } });
  });

  it('propagates Spotify errors', async () => {
    api.delete.mockRejectedValue(new Error('Forbidden'));
    await expect(spotify.removeLikedSongs(req, ['id1'])).rejects.toThrow('Forbidden');
  });
});

// ── removePlaylistTracks ──────────────────────────────────────────────────────

describe('removePlaylistTracks', () => {
  it('returns the count of uris passed in', async () => {
    api.delete.mockResolvedValue({});
    await expect(spotify.removePlaylistTracks(req, 'pl1', ['uri1', 'uri2'])).resolves.toBe(2);
  });

  it('sends uris wrapped in the correct body shape', async () => {
    api.delete.mockResolvedValue({});
    await spotify.removePlaylistTracks(req, 'pl1', ['spotify:track:abc']);
    expect(api.delete).toHaveBeenCalledWith('/playlists/pl1/tracks', {
      data: { tracks: [{ uri: 'spotify:track:abc' }] },
    });
  });

  it('splits into two batches when uris > 100', async () => {
    api.delete.mockResolvedValue({});
    const uris = Array.from({ length: 150 }, (_, i) => `spotify:track:t${i}`);
    await spotify.removePlaylistTracks(req, 'pl1', uris);
    expect(api.delete).toHaveBeenCalledTimes(2);
  });

  it('propagates Spotify errors', async () => {
    api.delete.mockRejectedValue(new Error('Forbidden'));
    await expect(spotify.removePlaylistTracks(req, 'pl1', ['uri1'])).rejects.toThrow('Forbidden');
  });
});

// ── getTrackAnalysis ──────────────────────────────────────────────────────────

describe('getTrackAnalysis', () => {
  it('returns sections and duration, stripping extra fields', async () => {
    api.get.mockResolvedValue({
      data: {
        sections: [{ start: 10, duration: 30, loudness: -8, confidence: 0.9 }],
        track: { duration: 210, extra: 'ignored' },
      },
    });

    await expect(spotify.getTrackAnalysis(req, 'track1')).resolves.toEqual({
      sections: [{ start: 10, duration: 30, loudness: -8 }],
      duration: 210,
    });
    expect(api.get).toHaveBeenCalledWith('/audio-analysis/track1');
  });

  it('propagates errors', async () => {
    api.get.mockRejectedValue(new Error('Analysis unavailable'));
    await expect(spotify.getTrackAnalysis(req, 'track1')).rejects.toThrow('Analysis unavailable');
  });
});

// ── play ─────────────────────────────────────────────────────────────────────

describe('play', () => {
  it('sends the correct play request', async () => {
    api.put.mockResolvedValue({});
    await spotify.play(req, 'device-abc', 'spotify:track:xyz');
    expect(api.put).toHaveBeenCalledWith(
      '/me/player/play?device_id=device-abc',
      { uris: ['spotify:track:xyz'] }
    );
  });

  it('URL-encodes the device_id', async () => {
    api.put.mockResolvedValue({});
    await spotify.play(req, 'device with spaces', 'uri');
    expect(api.put).toHaveBeenCalledWith(
      '/me/player/play?device_id=device%20with%20spaces',
      expect.anything()
    );
  });

  it('propagates errors', async () => {
    api.put.mockRejectedValue(new Error('Playback error'));
    await expect(spotify.play(req, 'dev', 'uri')).rejects.toThrow('Playback error');
  });
});

// ── pause ─────────────────────────────────────────────────────────────────────

describe('pause', () => {
  it('sends a PUT to /me/player/pause', async () => {
    api.put.mockResolvedValue({});
    await spotify.pause(req);
    expect(api.put).toHaveBeenCalledWith('/me/player/pause');
  });

  it('silently swallows errors (no active device, 403, etc.)', async () => {
    api.put.mockRejectedValue(new Error('No active device'));
    await expect(spotify.pause(req)).resolves.toBeUndefined();
  });
});
