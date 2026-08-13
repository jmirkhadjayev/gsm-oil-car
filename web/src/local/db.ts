// Brauzer ichidagi SQLite (sql.js / WebAssembly).
// Server tomonidagi server/db.js bilan bir xil interfeys: all / get / run / tx.
// Baza IndexedDB da bitta blob sifatida saqlanadi.
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import schemaSql from './schema.generated.sql?raw';
import migrations from './migrations.generated.json';

const DB_NAME = 'gsm-hisobi';
const STORE = 'files';
const KEY = 'gsm.db';

let db: Database;
let SQL: SqlJsStatic;

// ------------------------------ IndexedDB ------------------------------
function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<Uint8Array | null> {
  const conn = await idb();
  return new Promise((resolve) => {
    const req = conn.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as Uint8Array) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbPut(data: Uint8Array) {
  const conn = await idb();
  return new Promise<void>((resolve) => {
    const tr = conn.transaction(STORE, 'readwrite');
    tr.objectStore(STORE).put(data, KEY);
    tr.oncomplete = () => resolve();
    tr.onerror = () => resolve();
  });
}

export async function wipeDatabase() {
  const conn = await idb();
  await new Promise<void>((resolve) => {
    const tr = conn.transaction(STORE, 'readwrite');
    tr.objectStore(STORE).delete(KEY);
    tr.oncomplete = () => resolve();
    tr.onerror = () => resolve();
  });
}

// Yozuvlar to'planib, 400 ms dan keyin bir marta saqlanadi
let saveTimer: number | undefined;
let saving = false;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(async () => {
    if (saving) { scheduleSave(); return; }
    saving = true;
    try { await idbPut(db.export()); } finally { saving = false; }
  }, 400);
}

/** Sahifa yopilishidan oldin saqlanmagan o'zgarishlarni yozib qo'yadi. */
export async function flush() {
  clearTimeout(saveTimer);
  if (db) await idbPut(db.export());
}

// -------------------------------- Ochish --------------------------------
let ready: Promise<void> | null = null;

export function openDatabase(seedFn?: () => void): Promise<void> {
  if (ready) return ready;
  ready = (async () => {
    SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const saved = await idbGet();
    db = saved ? new SQL.Database(saved) : new SQL.Database();

    db.run('PRAGMA foreign_keys = ON');
    applyMigrations();           // eski bazaga yetishmayotgan ustunlarni qo'shadi
    db.run(schemaSql);           // CREATE TABLE IF NOT EXISTS … — qayta ochishda xavfsiz

    if (seedFn) seedFn();
    await flush();
  })();
  return ready;
}

/**
 * server/migrations.json asosida yetishmayotgan ustunlarni qo'shadi.
 * schema.sql dan OLDIN chaqiriladi — v_waybill_calc yangi ustunlarga tayanadi.
 */
function applyMigrations() {
  const tables = new Set(
    all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name)
  );
  for (const col of (migrations as any).columns as any[]) {
    if (!tables.has(col.table)) continue;
    const existing = new Set(all<{ name: string }>(`PRAGMA table_info(${col.table})`).map((r) => r.name));
    if (existing.has(col.column)) continue;
    const def = col.default !== undefined ? ` NOT NULL DEFAULT ${col.default}` : '';
    db.run(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}${def}`);
  }
}

/** Bazani butunlay tozalab, qaytadan yaratadi (demo ma'lumotni tiklash uchun). */
export async function resetDatabase(seedFn?: () => void) {
  await wipeDatabase();
  db = new SQL.Database();
  db.run('PRAGMA foreign_keys = ON');
  db.run(schemaSql);
  if (seedFn) seedFn();
  await flush();
}

/** Sxema versiyasi mos kelmasa (yangi modul qo'shilganda) bazani qayta yaratish uchun. */
export function tableExists(name: string) {
  return all("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [name]).length > 0;
}

// ------------------------------ So'rovlar ------------------------------
type Params = ReadonlyArray<string | number | null>;

export function all<T = any>(sql: string, params: Params = []): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params as any);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

export function get<T = any>(sql: string, params: Params = []): T | undefined {
  return all<T>(sql, params)[0];
}

export function run(sql: string, params: Params = []) {
  db.run(sql, params as any);
  scheduleSave();
  const res = db.exec('SELECT last_insert_rowid() AS id, changes() AS n');
  const [id, n] = res[0]?.values[0] ?? [0, 0];
  return { lastInsertRowid: Number(id), changes: Number(n) };
}

export function exec(sql: string) {
  db.run(sql);
  scheduleSave();
}

export function tx<T>(fn: () => T): T {
  db.run('BEGIN');
  try {
    const out = fn();
    db.run('COMMIT');
    scheduleSave();
    return out;
  } catch (err) {
    try { db.run('ROLLBACK'); } catch { /* allaqachon bekor qilingan */ }
    throw err;
  }
}

export function audit(userId: number | null, action: string, entity: string, entityId?: number | null, details = '') {
  run('INSERT INTO audit_log (user_id, action, entity, entity_id, details) VALUES (?,?,?,?,?)',
      [userId, action, entity, entityId ?? null, details]);
}

/** Bazani fayl sifatida yuklab olish (zaxira nusxa). */
export function exportDatabase(): Uint8Array {
  return db.export();
}

/** Zaxira nusxadan tiklash. */
export async function importDatabase(bytes: Uint8Array) {
  db = new SQL.Database(bytes);
  db.run('PRAGMA foreign_keys = ON');
  db.run(schemaSql);
  await flush();
}
