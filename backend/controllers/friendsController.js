const db = require('../database/db');

function normalizePair(a, b) {
  return a < b ? [a, b] : [b, a];
}

function searchUsers(req, res) {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ status: 'SUCCESS', users: [] });
  const rows = db
    .prepare('SELECT username FROM users WHERE username LIKE ? AND id != ? LIMIT 20')
    .all(`%${q}%`, req.user.id);
  return res.json({ status: 'SUCCESS', users: rows.map((r) => r.username) });
}

function listFriends(req, res) {
  const rows = db
    .prepare(
      `SELECT u.username FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_a_id = ? THEN f.user_b_id ELSE f.user_a_id END
       WHERE f.user_a_id = ? OR f.user_b_id = ?`
    )
    .all(req.user.id, req.user.id, req.user.id);
  return res.json({ status: 'SUCCESS', friends: rows.map((r) => r.username) });
}

function listIncomingRequests(req, res) {
  const rows = db
    .prepare(
      `SELECT fr.id, u.username as from_username, fr.created_at FROM friend_requests fr
       JOIN users u ON u.id = fr.from_user_id
       WHERE fr.to_user_id = ? AND fr.status = 'pending'`
    )
    .all(req.user.id);
  return res.json({ status: 'SUCCESS', requests: rows });
}

function sendRequest(req, res) {
  const { username } = req.body || {};
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ status: 'FAILURE', message: 'User not found' });
  if (target.id === req.user.id) {
    return res.status(400).json({ status: 'FAILURE', message: 'Cannot friend yourself' });
  }

  const [a, b] = normalizePair(req.user.id, target.id);
  const alreadyFriends = db
    .prepare('SELECT id FROM friendships WHERE user_a_id = ? AND user_b_id = ?')
    .get(a, b);
  if (alreadyFriends) {
    return res.status(409).json({ status: 'FAILURE', message: 'Already friends' });
  }

  try {
    db.prepare('INSERT INTO friend_requests (from_user_id, to_user_id) VALUES (?, ?)').run(
      req.user.id,
      target.id
    );
  } catch (e) {
    return res.status(409).json({ status: 'FAILURE', message: 'Friend request already sent' });
  }
  return res.status(201).json({ status: 'SUCCESS', message: 'Friend request sent' });
}

function respondToRequest(req, res, accept) {
  const requestId = Number(req.params.id);
  const request = db
    .prepare("SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'")
    .get(requestId, req.user.id);
  if (!request) {
    return res.status(404).json({ status: 'FAILURE', message: 'Friend request not found' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE friend_requests SET status = ? WHERE id = ?').run(
      accept ? 'accepted' : 'rejected',
      requestId
    );
    if (accept) {
      const [a, b] = normalizePair(request.from_user_id, request.to_user_id);
      db.prepare('INSERT OR IGNORE INTO friendships (user_a_id, user_b_id) VALUES (?, ?)').run(a, b);
    }
  });
  tx();

  return res.json({ status: 'SUCCESS', message: accept ? 'Friend request accepted' : 'Friend request rejected' });
}

module.exports = {
  searchUsers,
  listFriends,
  listIncomingRequests,
  sendRequest,
  accept: (req, res) => respondToRequest(req, res, true),
  reject: (req, res) => respondToRequest(req, res, false),
};
