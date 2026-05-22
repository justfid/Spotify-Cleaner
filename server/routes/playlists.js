'use strict';

const path = require('path');
const ensureToken = require('../middleware/auth');
const spotify = require('../services/spotify');

module.exports = function registerPlaylistsRoutes(app) {
  app.get('/api/token', ensureToken, (req, res) => {
    res.json({ access_token: req.session.accessToken });
  });

  app.get('/api/me', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getMe(req)); } catch (err) { next(err); }
  });

  app.get('/api/playlists', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getPlaylists(req)); } catch (err) { next(err); }
  });

  app.get('/api/liked-songs', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getLikedSongs(req)); } catch (err) { next(err); }
  });

  app.get('/api/playlist/:id/tracks', ensureToken, async (req, res, next) => {
    try { res.json(await spotify.getPlaylistTracks(req, req.params.id)); } catch (err) { next(err); }
  });

  app.post('/api/remove-liked', ensureToken, async (req, res, next) => {
    const { ids } = req.body;
    if (!ids?.length) return res.json({ removed: 0 });
    try {
      res.json({ removed: await spotify.removeLikedSongs(req, ids) });
    } catch (err) { next(err); }
  });

  app.post('/api/remove-playlist-tracks', ensureToken, async (req, res, next) => {
    const { playlistId, uris } = req.body;
    if (!playlistId || !uris?.length) return res.json({ removed: 0 });
    try {
      res.json({ removed: await spotify.removePlaylistTracks(req, playlistId, uris) });
    } catch (err) { next(err); }
  });

  // Page routes
  app.get('/', (req, res) =>
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'))
  );
  app.get('/app', ensureToken, (req, res) =>
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'app.html'))
  );
};
