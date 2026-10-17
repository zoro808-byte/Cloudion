const fs = require('fs');
const db = require('../database/db');
const { runScript } = require('../services/scriptRunner');
const { httpStatusForExitCode } = require('../services/scriptRunner/exitCodes');
const { sanitizeFilename } = require('../middleware/upload');
const { sendInline } = require('../services/fileStream');

// Any authenticated user may upload, download, search, and list the Global
// Cloud. Deletion is restricted to whoever uploaded the file (README.md
// section 9: "Do not allow users to delete files they are not authorized
// to manage") — that ownership fact lives in the database, since Bash has
// no notion of who a file "belongs" to.

async function upload(req, res) {
  if (!req.file) return res.status(400).json({ status: 'FAILURE', message: 'No file uploaded' });
  const destFilename = sanitizeFilename(req.body.filename || req.file.originalname);

  const result = await runScript('GLOBAL_UPLOAD', [req.file.path, destFilename, req.user.username]);
  if (result.exitCode !== 0) {
    if (fs.existsSync(req.file.path)) fs.unlink(req.file.path, () => {});
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }

  db.prepare('INSERT INTO global_file_metadata (file_name, uploaded_by) VALUES (?, ?)').run(
    result.data.FILE_NAME,
    req.user.id
  );

  return res.status(201).json(result.data);
}

async function list(req, res) {
  const result = await runScript('GLOBAL_LIST', []);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function search(req, res) {
  const { term = '', extension = '' } = req.query;
  const result = await runScript('GLOBAL_SEARCH', [term, extension]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function info(req, res) {
  const result = await runScript('GLOBAL_FILE_INFO', [req.params.filename]);
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

async function download(req, res) {
  const result = await runScript('GLOBAL_DOWNLOAD', [req.params.filename, req.user.username]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  return res.download(result.data.PATH, result.data.FILE_NAME);
}

async function view(req, res) {
  const result = await runScript('GLOBAL_DOWNLOAD', [req.params.filename, req.user.username]);
  if (result.exitCode !== 0) {
    return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
  }
  return sendInline(res, result);
}

async function del(req, res) {
  const filename = req.params.filename;
  const record = db
    .prepare('SELECT * FROM global_file_metadata WHERE file_name = ? ORDER BY id DESC LIMIT 1')
    .get(filename);

  if (!record || record.uploaded_by !== req.user.id) {
    return res.status(403).json({ status: 'FAILURE', message: 'Only the uploader may delete this file' });
  }

  const result = await runScript('GLOBAL_DELETE', [filename, req.user.username]);
  if (result.exitCode === 0) {
    db.prepare('DELETE FROM global_file_metadata WHERE id = ?').run(record.id);
  }
  return res.status(httpStatusForExitCode(result.exitCode)).json(result.data);
}

module.exports = { upload, list, search, info, download, view, del };
