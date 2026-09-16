import { WebSocket } from 'ws';
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';

const c = new WebSocket('ws://localhost:3000');
const value = [{ id: 'app', logo: 'data:image/png;base64,TESTE_LOGO_123', atualizadoEm: new Date().toISOString() }];

c.on('open', () => {
  c.send(JSON.stringify({ type: 'write', key: 'config', value, removed: [] }));
  setTimeout(() => c.send(JSON.stringify({ type: 'write', key: 'config', value, removed: [] })), 350);
});

setTimeout(() => {
  const db = new Database('C:/Users/USER/Documents/Default Project/MozFutHouse/data/mozfuthouse.db');
  const r = db.prepare("SELECT data FROM store WHERE key = 'config' AND id = 'app'").get();
  console.log('BD config:', r ? r.data : 'SEM LINHA');
  db.close();
  const j = JSON.parse(readFileSync('C:/Users/USER/Documents/Default Project/MozFutHouse/data/store.json', 'utf8'));
  console.log('store.json config:', JSON.stringify(j.config));
  c.close();
  process.exit(0);
}, 900);