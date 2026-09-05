const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('../config/config');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = (header.startsWith('Bearer ') ? header.slice(7) : null) || req.cookies?.token || req.query?.token;

  if (!token) {
    return res.status(401).json({ status: 'FAILURE', message: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ status: 'FAILURE', message: 'Invalid or expired session' });
  }
}

module.exports = { requireAuth };
