'use strict';

const axios = require('axios');
const { CLIENT_ID, CLIENT_SECRET } = require('../config');

const authHeader = () =>
  'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');

async function doRefresh(refreshToken) {
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: authHeader() } }
  );
  return res.data;
}

async function ensureToken(req, res, next) {
  if (!req.session.accessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  if (Date.now() > req.session.tokenExpiry - 60000) {
    try {
      const data = await doRefresh(req.session.refreshToken);
      req.session.accessToken = data.access_token;
      req.session.tokenExpiry = Date.now() + data.expires_in * 1000;
    } catch {
      req.session.destroy();
      return res.status(401).json({ error: 'Token refresh failed' });
    }
  }
  next();
}

module.exports = ensureToken;
