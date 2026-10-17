const fs = require('fs');
const db = require('../database/db');
const { runScript } = require('../services/scriptRunner');
const { httpStatusForExitCode } = require('../services/scriptRunner/exitCodes');
const { sanitizeFilename } = require('../middleware/upload');
const { sendInline } = require('../services/fileStream');

function areFriends(userAId, userBId) {
  const [a, b] = userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  return Boolean(db.prepare('SELECT id FROM friendships WHERE user_a_id = ? AND user_b_id = ?').get(a, b));
}

// Confirms the requesting user is one of the two participants BEFORE any
// script or message lookup runs. This is the application-level
// authorization layer that must exist alongside Linux filesystem
// permissions (README.md section 17).
function getAuthorizedConversation(req, res) {
  const conversationId = Number(req.params.id);
  const conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(conversationId);
  if (!conversation) {
    res.status(404).json({ status: 'FAILURE', message: 'Conversation not found' });
    return null;
  }
  if (conversation.user_a_id !== req.user.id && conversation.user_b_id !== req.user.id) {
    res.status(403).json({ status: 'FAILURE', message: 'You are not a participant in this conversation' });
    return null;
  }
  return conversation;
}

async function listConversations(req, res) {
  const rows = db
    .prepare(
      `SELECT c.id, u.username AS with_username, c.created_at FROM conversations c
       JOIN users u ON u.id = CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END
       WHERE c.user_a_id = ? OR c.user_b_id = ?`
    )
    .all(req.user.id, req.user.id, req.user.id);
  return res.json({ status: 'SUCCESS', conversations: rows });
}

async function createConversation(req, res) {
  const { username } = req.body || {};
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ status: 'FAILURE', message: 'User not found' });
  if (!areFriends(req.user.id, target.id)) {
    return res.status(403).json({ status: 'FAILURE', message: 'You can only message accepted friends' });
  }

  const [a, b] = req.user.id < target.id ? [req.user.id, target.id] : [target.id, req.user.id];
  let conversation = db
    .prepare('SELECT * FROM conversations WHERE user_a_id = ? AND user_b_id = ?')
    .get(a, b);

  if (!conversation) {
    const info = db
      .prepare('INSERT INTO conversations (user_a_id, user_b_id) VALUES (?, ?)')
      .run(a, b);
    const result = await runScript('CONVERSATION_CREATE', [info.lastInsertRowid]);
    if (result.exitCode !== 0) {
      db.prepare('DELETE FROM conversations WHERE id = ?').run(info.lastInsertRowid);
      return res.status(500).json({ status: 'FAILURE', message: 'Failed to provision conversation storage' });
    }
    conversation = db.prepare('SELECT * FROM conversations WHERE id = ?').get(info.lastInsertRowid);
  }

  return res.status(201).json({ status: 'SUCCESS', conversationId: conversation.id });
}

async function listMessages(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const rows = db
    .prepare(
      `SELECT m.id, u.username AS sender, m.message_type, m.content, m.file_name, m.relative_path, m.created_at
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.conversation_id = ? ORDER BY m.created_at ASC`
    )
    .all(conversation.id);
  return res.json({ status: 'SUCCESS', messages: rows });
}

async function sendMessage(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ status: 'FAILURE', message: 'Message content is required' });
  }
  db.prepare(
    'INSERT INTO messages (conversation_id, sender_id, message_type, content) VALUES (?, ?, ?, ?)'
  ).run(conversation.id, req.user.id, 'text', content.trim());
  return res.status(201).json({ status: 'SUCCESS' });
}

async function uploadFile(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  if (!req.file) return res.status(400).json({ status: 'FAILURE', message: 'No file uploaded' });

  const destFilename = sanitizeFilename(req.body.filename || req.file.originalname);
  const result = await runScript('ONE_TO_ONE_UPLOAD', [
    conversation.id,
    req.file.path,
    destFilename,
    req.user.username,
  ]);
  if (result.exitCode !== 0) {
    if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }

  db.prepare(
    'INSERT INTO messages (conversation_id, sender_id, message_type, file_name, relative_path) VALUES (?, ?, ?, ?, ?)'
  ).run(conversation.id, req.user.id, 'file', result.data.FILE_NAME, result.data.RELATIVE_PATH);

  return res.status(201).json(result.data);
}

async function listFiles(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const result = await runScript('ONE_TO_ONE_LIST', [conversation.id]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function searchFiles(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const { term = '', extension = '' } = req.query;
  const result = await runScript('ONE_TO_ONE_SEARCH', [conversation.id, term, extension]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function downloadFile(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const result = await runScript('ONE_TO_ONE_DOWNLOAD', [
    conversation.id,
    req.params.filename,
    req.user.username,
  ]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  return res.download(result.data.PATH, result.data.FILE_NAME);
}

async function viewFile(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const result = await runScript('ONE_TO_ONE_DOWNLOAD', [
    conversation.id,
    req.params.filename,
    req.user.username,
  ]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  return sendInline(res, result);
}

async function deleteFile(req, res) {
  const conversation = getAuthorizedConversation(req, res);
  if (!conversation) return;
  const result = await runScript('ONE_TO_ONE_DELETE', [
    conversation.id,
    req.params.filename,
    req.user.username,
  ]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

module.exports = {
  listConversations,
  createConversation,
  listMessages,
  sendMessage,
  uploadFile,
  listFiles,
  searchFiles,
  downloadFile,
  viewFile,
  deleteFile,
};
