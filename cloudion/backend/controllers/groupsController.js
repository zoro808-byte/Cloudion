const fs = require('fs');
const db = require('../database/db');
const { runScript } = require('../services/scriptRunner');
const { httpStatusForExitCode } = require('../services/scriptRunner/exitCodes');
const { sanitizeFilename } = require('../middleware/upload');
const { sendInline } = require('../services/fileStream');

function getMembership(groupId, userId) {
  return db
    .prepare('SELECT * FROM group_members WHERE group_id = ? AND user_id = ?')
    .get(groupId, userId);
}

// Every group route needs to know: does this group exist, and is the
// requester a member (or the admin)? This centralizes that check.
function getAuthorizedGroup(req, res, { requireAdmin = false } = {}) {
  const groupId = Number(req.params.id);
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId);
  if (!group) {
    res.status(404).json({ status: 'FAILURE', message: 'Group not found' });
    return null;
  }
  const membership = getMembership(groupId, req.user.id);
  if (!membership) {
    res.status(403).json({ status: 'FAILURE', message: 'You are not a member of this group' });
    return null;
  }
  if (requireAdmin && membership.role !== 'admin') {
    res.status(403).json({ status: 'FAILURE', message: 'Only the group admin can perform this action' });
    return null;
  }
  return group;
}

async function listGroups(req, res) {
  const rows = db
    .prepare(
      `SELECT g.id, g.name, g.admin_id, gm.role FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
       WHERE gm.user_id = ?`
    )
    .all(req.user.id);
  return res.json({ status: 'SUCCESS', groups: rows });
}

async function createGroup(req, res) {
  const { name } = req.body || {};
  if (!name || !name.trim()) {
    return res.status(400).json({ status: 'FAILURE', message: 'Group name is required' });
  }

  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO groups (name, admin_id) VALUES (?, ?)').run(name.trim(), req.user.id);
    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(
      info.lastInsertRowid,
      req.user.id,
      'admin'
    );
    return info.lastInsertRowid;
  });
  const groupId = tx();

  const result = await runScript('CREATE_GROUP_STORAGE', [groupId]);
  if (result.exitCode !== 0) {
    db.prepare('DELETE FROM group_members WHERE group_id = ?').run(groupId);
    db.prepare('DELETE FROM groups WHERE id = ?').run(groupId);
    return res.status(500).json({ status: 'FAILURE', message: 'Failed to provision group storage' });
  }

  return res.status(201).json({ status: 'SUCCESS', groupId });
}

async function deleteGroup(req, res) {
  const group = getAuthorizedGroup(req, res, { requireAdmin: true });
  if (!group) return;
  const result = await runScript('DELETE_GROUP_STORAGE', [group.id]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  db.prepare('DELETE FROM group_members WHERE group_id = ?').run(group.id);
  db.prepare('DELETE FROM messages WHERE group_id = ?').run(group.id);
  db.prepare('DELETE FROM groups WHERE id = ?').run(group.id);
  return res.json({ status: 'SUCCESS', message: 'Group deleted' });
}

async function addMember(req, res) {
  const group = getAuthorizedGroup(req, res, { requireAdmin: true });
  if (!group) return;
  const { username } = req.body || {};
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!target) return res.status(404).json({ status: 'FAILURE', message: 'User not found' });

  try {
    db.prepare('INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)').run(
      group.id,
      target.id,
      'member'
    );
  } catch (e) {
    return res.status(409).json({ status: 'FAILURE', message: 'User is already a member' });
  }
  return res.status(201).json({ status: 'SUCCESS', message: 'Member added' });
}

async function removeMember(req, res) {
  const group = getAuthorizedGroup(req, res, { requireAdmin: true });
  if (!group) return;
  const target = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  if (!target) return res.status(404).json({ status: 'FAILURE', message: 'User not found' });
  if (target.id === group.admin_id) {
    return res.status(400).json({ status: 'FAILURE', message: 'Cannot remove the group admin' });
  }
  db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(group.id, target.id);
  return res.json({ status: 'SUCCESS', message: 'Member removed' });
}

async function listMembers(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const rows = db
    .prepare(
      `SELECT u.username, gm.role FROM group_members gm JOIN users u ON u.id = gm.user_id WHERE gm.group_id = ?`
    )
    .all(group.id);
  return res.json({ status: 'SUCCESS', members: rows });
}

async function listGroupMessages(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const rows = db
    .prepare(
      `SELECT m.id, u.username AS sender, m.message_type, m.content, m.file_name, m.relative_path, m.created_at
       FROM messages m JOIN users u ON u.id = m.sender_id
       WHERE m.group_id = ? ORDER BY m.created_at ASC`
    )
    .all(group.id);
  return res.json({ status: 'SUCCESS', messages: rows });
}

async function sendGroupMessage(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ status: 'FAILURE', message: 'Message content is required' });
  }
  db.prepare('INSERT INTO messages (group_id, sender_id, message_type, content) VALUES (?, ?, ?, ?)').run(
    group.id,
    req.user.id,
    'text',
    content.trim()
  );
  return res.status(201).json({ status: 'SUCCESS' });
}

async function uploadFile(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  if (!req.file) return res.status(400).json({ status: 'FAILURE', message: 'No file uploaded' });

  const destFilename = sanitizeFilename(req.body.filename || req.file.originalname);
  const result = await runScript('GROUP_UPLOAD', [group.id, req.file.path, destFilename, req.user.username]);
  if (result.exitCode !== 0) {
    if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  db.prepare(
    'INSERT INTO messages (group_id, sender_id, message_type, file_name, relative_path) VALUES (?, ?, ?, ?, ?)'
  ).run(group.id, req.user.id, 'file', result.data.FILE_NAME, result.data.RELATIVE_PATH);
  return res.status(201).json(result.data);
}

async function listFiles(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const result = await runScript('GROUP_LIST_FILES', [group.id]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function searchFiles(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const { term = '', extension = '' } = req.query;
  const result = await runScript('GROUP_SEARCH', [group.id, term, extension]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function fileInfo(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const result = await runScript('GROUP_FILE_INFO', [group.id, req.params.filename]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function downloadFile(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const result = await runScript('GROUP_DOWNLOAD', [group.id, req.params.filename, req.user.username]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  return res.download(result.data.PATH, result.data.FILE_NAME);
}

async function viewFile(req, res) {
  const group = getAuthorizedGroup(req, res);
  if (!group) return;
  const result = await runScript('GROUP_DOWNLOAD', [group.id, req.params.filename, req.user.username]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  return sendInline(res, result);
}

async function deleteFile(req, res) {
  // Only the group admin may delete files (README.md section 8: admin
  // "manages group files"). Regular members may upload/download but not
  // remove shared files, which avoids one member accidentally wiping
  // material other members are relying on.
  const group = getAuthorizedGroup(req, res, { requireAdmin: true });
  if (!group) return;
  const result = await runScript('GROUP_DELETE_FILE', [group.id, req.params.filename, req.user.username]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

module.exports = {
  listGroups,
  createGroup,
  deleteGroup,
  addMember,
  removeMember,
  listMembers,
  listGroupMessages,
  sendGroupMessage,
  uploadFile,
  listFiles,
  searchFiles,
  fileInfo,
  downloadFile,
  viewFile,
  deleteFile,
};
