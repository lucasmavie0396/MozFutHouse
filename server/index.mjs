import { createServer } from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, pbkdf2Sync, createHash, timingSafeEqual } from 'node:crypto';
import { WebSocketServer } from 'ws';
import './env.mjs';
import { dbFilePath, dbCount, dbLoadStore, dbSaveAll, dbApplyWrite } from './db.mjs';

const curDir = fileURLToPath(new URL('.', import.meta.url));
const DIST = join(curDir, '..', 'dist');
const DATA_DIR = join(curDir, '..', 'data');
const DATA_FILE = join(DATA_DIR, 'store.json');
const HTTP_PORT = Number(process.env.PORT) || 3000;
const RECOVERY_TTL_MS = 15 * 60 * 1000;
const recovery = new Map();

function hashPasswordServer(pw) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(String(pw), salt, 100000, 32, 'sha256');
  return 'mzf:pbkdf2:100000:' + salt.toString('hex') + ':' + key.toString('hex');
}

async function enviarEmailRecuperacao(to, code) {
  if (!process.env.MAIL_HOST) return false;
  let nodemailer;
  try { nodemailer = (await import('nodemailer')).default; } catch (e) { console.warn('nodemailer não instalado — a usar modo demonstração.'); return false; }
  const port = Number(process.env.MAIL_PORT) || 587;
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port,
    secure: process.env.MAIL_SECURE === 'true' || port === 465,
    auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS || '' } : undefined,
  });
  const admin = (store.app_users || []).find((u) => u.role === 'admin');
  await transporter.sendMail({
    from: process.env.MAIL_FROM || (admin && admin.email) || process.env.MAIL_USER,
    to,
    subject: 'MozFutHouse · Recuperação de password',
    text: `O seu código de recuperação é: ${code}`,
    html: `<p>Olá,</p><p>Use o código abaixo para definir uma nova password na sua conta MozFutHouse:</p><p style="font-size:26px;font-weight:700;letter-spacing:4px">${code}</p><p>O código é válido por 15 minutos. Se não pediu esta recuperação, ignore este email.</p>`,
  });
  return true;
}

const KEYS = ['teams', 'players', 'matches', 'app_users', 'championships', 'ads', 'config'];
const WS_OPEN = 1;

function mergeByKey(base, incoming, removed) {
  if (!Array.isArray(base)) return Array.isArray(incoming) ? incoming : [];
  if (!Array.isArray(incoming)) return base;
  const remove = new Set(Array.isArray(removed) ? removed.filter((x) => x != null) : []);
  const out = base.filter((item) => !(item && item.id != null && remove.has(item.id)));
  const idx = new Map();
  out.forEach((item, i) => { if (item && item.id != null) idx.set(item.id, i); });
  for (const item of incoming) {
    if (!item) continue;
    if (item.id != null) {
      if (remove.has(item.id)) continue;
      const i = idx.get(item.id);
      if (i != null) out[i] = item;
      else { out.push(item); idx.set(item.id, out.length - 1); }
    } else {
      out.push(item);
    }
  }
  return out;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

let store = {};
for (const k of KEYS) store[k] = [];

const dbHasData = dbCount() > 0;

if (dbHasData) {
  store = dbLoadStore(KEYS);
  console.log(`SQLite: base de dados carregada — ${dbCount()} registos`);
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (e) { /* JSON mirror updated */ }
  console.log(`SQLite: espelho JSON atualizado em ${DATA_FILE}`);
} else {
  try {
    if (existsSync(DATA_FILE)) {
      store = { ...store, ...JSON.parse(readFileSync(DATA_FILE, 'utf8')) };
      console.log('SQLite: carregou store.json como fonte de dados (base de dados vazia)');
    }
  } catch (e) {
    console.warn('Não foi possível ler data/store.json:', e.message);
  }
  const hasData = KEYS.some((k) => Array.isArray(store[k]) && store[k].length > 0);
  if (hasData) {
    dbSaveAll(store);
    console.log(`SQLite: migrate store.json → base de dados — ${dbCount()} registos`);
  }
}
console.log(`SQLite: ${dbFilePath()}`);

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
    } catch (e) {
      console.error('Falha ao guardar dados:', e);
    }
  }, 300);
}

const server = createServer((req, res) => {
  if (req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(store));
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://mzf.local').pathname);
  } catch (e) {
    res.writeHead(400);
    res.end();
    return;
  }
  if (pathname === '/') pathname = '/index.html';
  const filePath = normalize(join(DIST, pathname));
  if (!filePath.startsWith(DIST) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});

function replyTo(socket, payload) {
  try { socket.send(JSON.stringify(payload)); } catch (e) { /* ignore */ }
}

function broadcast(key, value) {
  const out = JSON.stringify({ type: 'apply', key, value, origin: '' });
  wss.clients.forEach((client) => {
    if (client.readyState === WS_OPEN) {
      try { client.send(out); } catch (e) { /* ignore */ }
    }
  });
}

async function handleRecovery(msg, socket) {
  const { reqId, action } = msg;
  if (!reqId) return;
  if (action === 'request') {
    const email = String(msg.email || '').trim().toLowerCase();
    const usuario = store.app_users.find((u) => u.email === email);
    if (!usuario) {
      replyTo(socket, { type: 'recovery-reply', reqId, ok: false, msg: 'Não existe uma conta com este email.' });
      return;
    }
    const code = String(Math.floor(100000 + Math.random() * 900000));
    recovery.set(email, { hash: createHash('sha256').update(code).digest('hex'), expiresAt: Date.now() + RECOVERY_TTL_MS, tentativas: 0 });
    let mode = 'demo';
    try {
      if (await enviarEmailRecuperacao(email, code)) mode = 'email';
    } catch (e) {
      console.warn('Falha ao enviar email:', e.message);
    }
    replyTo(socket, {
      type: 'recovery-reply', reqId, ok: true, mode,
      code: mode === 'demo' ? code : null,
      msg: mode === 'email' ? 'Enviamos um código de 6 dígitos para o seu email. Verifique a caixa de entrada (e o spam).' : 'Código gerado (servidor de email não configurado — funciona em modo demonstração).',
    });
    return;
  }
  if (action === 'confirm') {
    const email = String(msg.email || '').trim().toLowerCase();
    const code = String(msg.code || '').trim();
    const password = String(msg.password || '');
    const rec = recovery.get(email);
    if (!rec || Date.now() > rec.expiresAt) {
      recovery.delete(email);
      replyTo(socket, { type: 'recovery-reply', reqId, ok: false, msg: 'Código expirado. Peça um novo código de recuperação.' });
      return;
    }
    if (rec.tentativas >= 5) {
      recovery.delete(email);
      replyTo(socket, { type: 'recovery-reply', reqId, ok: false, msg: 'Muitas tentativas incorretas. Peça um novo código.' });
      return;
    }
    const hash = createHash('sha256').update(code).digest('hex');
    const ok = Buffer.from(hash, 'hex').length === Buffer.from(rec.hash, 'hex').length && timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(rec.hash, 'hex'));
    if (!ok) {
      rec.tentativas += 1;
      replyTo(socket, { type: 'recovery-reply', reqId, ok: false, msg: 'Código incorreto. Verifique o código recebido.' });
      return;
    }
    if (password.length < 4) {
      replyTo(socket, { type: 'recovery-reply', reqId, ok: false, msg: 'A nova password deve ter pelo menos 4 caracteres.' });
      return;
    }
    recovery.delete(email);
    store.app_users = store.app_users.map((u) => (u.email === email ? { ...u, hash: hashPasswordServer(password) } : u));
    try {
      dbApplyWrite('app_users', store.app_users, []);
    } catch (e) {
      console.error('SQLite: falha ao aplicar recuperação de password -', e.message);
    }
    scheduleSave();
    broadcast('app_users', store.app_users);
    replyTo(socket, { type: 'recovery-reply', reqId, ok: true, msg: 'Password recuperada com sucesso. Já pode entrar com a nova password.' });
    return;
  }
  replyTo(socket, { type: 'recovery-reply', reqId, ok: false, msg: 'Pedido inválido.' });
}

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  try {
    socket.send(JSON.stringify({ type: 'state', store }));
  } catch (e) { /* ignore */ }
  socket.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (!msg || msg.type !== 'write' || !KEYS.includes(msg.key)) {
      if (msg && msg.type === 'recovery') { handleRecovery(msg, socket); }
      return;
    }
    store[msg.key] = mergeByKey(store[msg.key], msg.value, msg.removed);
    try {
      dbApplyWrite(msg.key, msg.value, msg.removed);
    } catch (e) {
      console.error('SQLite: falha ao aplicar escrita em', msg.key, '-', e.message);
    }
    scheduleSave();
    broadcast(msg.key, store[msg.key]);
  });
});

server.listen(HTTP_PORT, () => {
  console.log(`MozFutHouse · sincronização em tempo real: http://localhost:${HTTP_PORT}`);
});