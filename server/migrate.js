// Yetishmayotgan ustunlarni qo'shadi (migrations.json asosida).
// schema.sql dan OLDIN chaqiriladi — yangi ko'rinish (v_waybill_calc) yangi ustunlarga tayanadi.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(fs.readFileSync(path.join(here, 'migrations.json'), 'utf8'));

/**
 * @param db  { all(sql), exec(sql) } interfeysiga ega baza
 * @returns qo'shilgan ustunlar ro'yxati
 */
export function migrate(db) {
  const added = [];
  const tables = new Set(
    db.all("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name)
  );

  for (const col of spec.columns) {
    if (!tables.has(col.table)) continue;               // jadval hali yaratilmagan — schema.sql yaratadi
    const existing = new Set(db.all(`PRAGMA table_info(${col.table})`).map((r) => r.name));
    if (existing.has(col.column)) continue;

    const def = col.default !== undefined ? ` NOT NULL DEFAULT ${col.default}` : '';
    db.exec(`ALTER TABLE ${col.table} ADD COLUMN ${col.column} ${col.type}${def}`);
    added.push(`${col.table}.${col.column}`);
  }
  return added;
}

export { spec as migrationSpec };
