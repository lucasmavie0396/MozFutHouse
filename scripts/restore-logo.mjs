import Database from 'better-sqlite3';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');
const storePath = join(dataDir, 'store.json');
const dbPath = join(dataDir, 'mozfuthouse.db');

const backup = JSON.parse(readFileSync(join(dataDir, 'store_backup_20260916_antes_demo.json'), 'utf8'));
const realLogo = backup.config && backup.config[0] && backup.config[0].logo;
const realAcoes = backup.config && backup.config[0] && backup.config[0].acoes;
if (!realLogo) {
  console.error('Backup sem logo. Abortar.');
  process.exit(1);
}

const store = JSON.parse(readFileSync(storePath, 'utf8'));
const cfg = (store.config && store.config[0]) || { id: 'app' };
const novoConfig = {
  ...cfg,
  id: 'app',
  logo: realLogo,
  acoes: Array.isArray(realAcoes) ? realAcoes : [],
  atualizadoEm: new Date().toISOString(),
};
store.config = [novoConfig];

writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log('store.json:', 'logo len =', realLogo.length, '| acoes =', novoConfig.acoes.length);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.prepare('DELETE FROM store WHERE key = ? AND id = ?').run('config', 'app');
db.prepare('INSERT INTO store (key, id, data, pos) VALUES (?, ?, ?, ?)').run('config', 'app', JSON.stringify(novoConfig), 0);
const row = db.prepare('SELECT data FROM store WHERE key = ? AND id = ?').get('config', 'app');
const dbCfg = JSON.parse(row.data);
console.log('SQLite config:', 'logo len =', dbCfg.logo.length, '| acoes =', dbCfg.acoes.length);
db.close();
console.log('Restaurado com sucesso.');