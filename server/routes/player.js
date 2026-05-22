'use strict';

const ensureToken = require('../middleware/auth');
const spotify = require('../services/spotify');
const cache = require('../services/cache');

module.exports = function registerPlayerRoutes(app) {
  app.get('/api/track-analysis/:id', ensureToken, async (req, res, next) => {
    const { id } = req.params;
    if (cache.has(id)) return res.json(cache.get(id));
    try {
      const data = await spotify.getTrackAnalysis(req, id);
      cache.set(id, data);
      res.json(data);
    } catch (err) { next(err); }
  });

  app.put('/api/player/play', ensureToken, async (req, res, next) => {
    const { device_id, uri } = req.body;
    if (!device_id || !uri) return res.status(400).json({ error: 'device_id and uri required' });
    try {
      await spotify.play(req, device_id, uri);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });

  app.put('/api/player/pause', ensureToken, async (req, res, next) => {
    try {
      await spotify.pause(req);
      res.json({ ok: true });
    } catch (err) { next(err); }
  });
};
