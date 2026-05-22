'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const { SESSION_SECRET } = require('./config');
const errorHandler = require('./middleware/errorHandler');
const registerAuthRoutes = require('./routes/auth');
const registerPlayerRoutes = require('./routes/player');
const registerPlaylistsRoutes = require('./routes/playlists');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 },
}));

registerAuthRoutes(app);
registerPlayerRoutes(app);
registerPlaylistsRoutes(app);

// Must be registered last — catches errors forwarded via next(err) from all routes
app.use(errorHandler);

module.exports = app;
