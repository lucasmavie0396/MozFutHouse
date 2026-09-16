import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import './env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(here, '..', 'data');
const DB_FILE = process.env.MZF_DB_FILE || join(DATA_DIR, 'mozfuthouse.db');

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_FILE);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS store (
    key  TEXT NOT NULL,
    id   TEXT NOT NULL,
    data TEXT NOT NULL,
    pos  INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, id)
  );
  CREATE INDEX IF NOT EXISTS idx_store_key_pos ON store(key, pos);
`);

const updStmt = db.prepare('UPDATE store SET data = @data WHERE key = @key AND id = @id');
const insStmt = db.prepare('INSERT INTO store (key, id, data, pos) VALUES (@key, @id, @data, @pos)');
const delStmt = db.prepare('DELETE FROM store WHERE key = @key AND id = @id');

function objectId(item, i) {
  return item && item.id != null ? String(item.id) : `__no_id_${i}`;
}

export function dbFilePath() {
  return DB_FILE;
}

export function dbCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM store').get().n;
}

export function dbLoadStore(keys) {
  const store = {};
  for (const k of keys) store[k] = [];
  const rows = db.prepare('SELECT key, data FROM store ORDER BY key, pos, rowid').all();
  for (const row of rows) {
    if (!store[row.key]) continue;
    try {
      store[row.key].push(JSON.parse(row.data));
    } catch (e) {
      console.warn(`SQLite: linha inválida em "${row.key}" — ignorada.`);
    }
  }
  return store;
}

export function dbSaveAll(store) {
  const tx = db.transaction((store) => {
    db.prepare('DELETE FROM store').run();
    for (const [key, arr] of Object.entries(store)) {
      if (!Array.isArray(arr)) continue;
      arr.forEach((item, i) => {
        insStmt.run({ key, id: objectId(item, i), data: JSON.stringify(item), pos: i });
      });
    }
  });
  tx(store);
}

export function dbApplyWrite(key, value, removed) {
  const tx = db.transaction((key, value, removed) => {
    if (Array.isArray(removed)) {
      for (const id of removed) {
        if (id == null) continue;
        delStmt.run({ key, id: String(id) });
      }
    }
    if (!Array.isArray(value)) return;
    const last = db.prepare('SELECT MAX(pos) AS m FROM store WHERE key = ?').get(key).m;
    let next = last == null ? 0 : last + 1;
    value.forEach((item, i) => {
      if (!item) return;
      const id = objectId(item, i);
      const res = updStmt.run({ key, id, data: JSON.stringify(item) });
      if (res.changes === 0) {
        insStmt.run({ key, id, data: JSON.stringify(item), pos: next });
        next += 1;
      }
    });
  });
  tx(key, value, removed);
}

export function dbClose() {
  db.close();
}