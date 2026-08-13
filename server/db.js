// SQLite ulanishi — Node.js ichiga o'rnatilgan `node:sqlite` moduli asosida.
// Hech qanday native paket (better-sqlite3 va h.k.) talab qilinmaydi.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = process.env.GSM_DB || path.join(dataDir, 'gsm.db');

export const db = new DatabaseSync(dbFile);
export const dbPath = dbFile;

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA busy_timeout = 5000');
db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));

// ------------------------- Qulay yordamchilar -------------------------
export const all = (sql, params = []) => db.prepare(sql).all(...params);
export const get = (sql, params = []) => db.prepare(sql).get(...params);
export const run = (sql, params = []) => db.prepare(sql).run(...params);

/** Bir nechta amalni bitta tranzaksiyada bajaradi. */
export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { /* allaqachon bekor qilingan */ }
    throw err;
  }
}

export function audit(userId, action, entity, entityId, details = '') {
  run(
    'INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
    [userId ?? null, action, entity, entityId ?? null, typeof details === 'string' ? details : JSON.stringify(details)]
  );
}
