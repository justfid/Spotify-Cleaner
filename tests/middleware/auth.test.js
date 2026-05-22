'use strict';

jest.mock('axios');

const axios = require('axios');
const ensureToken = require('../../server/middleware/auth');

afterEach(() => jest.clearAllMocks());

describe('ensureToken', () => {
  const makeRes = () => ({
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  });

  it('returns 401 when session has no access token', async () => {
    const req = { session: {} };
    const res = makeRes();
    const next = jest.fn();

    await ensureToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Not authenticated' });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next when token is present and not near expiry', async () => {
    const req = { session: { accessToken: 'valid-token', tokenExpiry: Date.now() + 120_000 } };
    const next = jest.fn();

    await ensureToken(req, makeRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refreshes the token when it is within 60s of expiry', async () => {
    const req = {
      session: {
        accessToken: 'old-token',
        refreshToken: 'refresh-tok',
        tokenExpiry: Date.now() - 1000,
      },
    };
    const next = jest.fn();
    axios.post.mockResolvedValue({ data: { access_token: 'new-token', expires_in: 3600 } });

    await ensureToken(req, makeRes(), next);

    expect(req.session.accessToken).toBe('new-token');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('returns 401 and destroys the session when refresh fails', async () => {
    const destroy = jest.fn();
    const req = {
      session: {
        accessToken: 'old-token',
        refreshToken: 'bad-tok',
        tokenExpiry: Date.now() - 1000,
        destroy,
      },
    };
    const res = makeRes();
    const next = jest.fn();
    axios.post.mockRejectedValue(new Error('Refresh failed'));

    await ensureToken(req, res, next);

    expect(destroy).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token refresh failed' });
    expect(next).not.toHaveBeenCalled();
  });
});
