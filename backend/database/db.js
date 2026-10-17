// =============================================================================
// db.js — SQLite schema + connection.
//
// Per the project's separation of concerns, everything relational (users,
// passwords, friendships, group membership, messages, file ownership
// records) lives here in the database. Bash never touches this file or its
// contents; it only knows about the filesystem.
// =============================================================================
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { DB_PATH } = require('../config/config');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user_id INTEGER NOT NULL REFERENCES users(id),
  to_user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending', -- pending | accepted | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_user_id, to_user_id)
);

CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id INTEGER NOT NULL REFERENCES users(id),
  user_b_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_a_id INTEGER NOT NULL REFERENCES users(id),
  user_b_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id INTEGER REFERENCES conversations(id),
  group_id INTEGER REFERENCES groups(id),
  sender_id INTEGER NOT NULL REFERENCES users(id),
  message_type TEXT NOT NULL DEFAULT 'text', -- text | file
  content TEXT,
  file_name TEXT,
  relative_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  admin_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  role TEXT NOT NULL DEFAULT 'member', -- admin | member
  joined_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(group_id, user_id)
);

-- Tracks who uploaded what in the Global Cloud, since Bash has no concept
-- of "ownership" — the backend needs this to decide whether a delete
-- request is authorized before ever invoking global_delete.sh.
CREATE TABLE IF NOT EXISTS global_file_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_name TEXT NOT NULL,
  uploaded_by INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

module.exports = db;
