'use strict';

module.exports = function errorHandler(err, req, res, next) {
  const status = err.response?.status || 500;
  const body = err.response?.data || { error: err.message || 'Internal server error' };
  res.status(status).json(body);
};
