'use strict';

const express = require('express');
const session = require('express-session');
const path = require('path');
const { SESSION_SECRET } = require('./config');
const { registerAuthRoutes } = require('./auth');
const { registerRoutes } = require('./routes');

const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 },
}));

registerAuthRoutes(app);
registerRoutes(app);

// Must be registered last — catches errors forwarded via next(err) from all routes
app.use((err, req, res, next) => {
  const status = err.response?.status || 500;
  const body = err.response?.data || { error: err.message || 'Internal server error' };
  res.status(status).json(body);
});

module.exports = app;
