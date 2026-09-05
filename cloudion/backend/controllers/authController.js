const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/db');
const { runScript } = require('../services/scriptRunner');
const { JWT_SECRET, JWT_EXPIRY } = require('../config/config');

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,32}$/;

async function register(req, res) {
  const { username, password, confirmPassword } = req.body || {};

  if (!username || !password || !confirmPassword) {
    return res.status(400).json({ status: 'FAILURE', message: 'username, password and confirmPassword are required' });
  }
  if (!USERNAME_RE.test(username)) {
    return res.status(400).json({ status: 'FAILURE', message: 'Username must be 3-32 characters: letters, numbers, - or _' });
  }
  if (password.length < 8) {
    return res.status(400).json({ status: 'FAILURE', message: 'Password must be at least 8 characters' });
  }
  if (password !== confirmPassword) {
    return res.status(400).json({ status: 'FAILURE', message: 'Passwords do not match' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(409).json({ status: 'FAILURE', message: 'Username is already taken' });
  }

  // Password hashing is application logic -> backend, not Bash.
  const passwordHash = await bcrypt.hash(password, 12);
  const info = db
    .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
    .run(username, passwordHash);

  // Filesystem provisioning -> Bash.
  const result = await runScript('CREATE_USER_STORAGE', [username]);
  if (result.exitCode !== 0) {
    // Roll back the DB row so we don't have a user with no storage.
    db.prepare('DELETE FROM users WHERE id = ?').run(info.lastInsertRowid);
    return res.status(500).json({ status: 'FAILURE', message: 'Failed to provision user storage', details: result.data });
  }

  return res.status(201).json({ status: 'SUCCESS', message: 'Registration successful', username });
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ status: 'FAILURE', message: 'username and password are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ status: 'FAILURE', message: 'Invalid username or password' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ status: 'FAILURE', message: 'Invalid username or password' });
  }

  const token = jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRY });

  res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
  return res.json({ status: 'SUCCESS', token, username: user.username });
}

function logout(req, res) {
  res.clearCookie('token');
  return res.json({ status: 'SUCCESS', message: 'Logged out' });
}

function me(req, res) {
  return res.json({ status: 'SUCCESS', username: req.user.username });
}

module.exports = { register, login, logout, me };
