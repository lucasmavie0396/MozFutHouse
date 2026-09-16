const SYNC_PORT = '3000';

function isLocalDev() {
  return ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname);
}

function resolveSyncUrl() {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
  if (isLocalDev()) {
    return proto + '://' + window.location.hostname + ':' + SYNC_PORT;
  }
  return proto + '://' + window.location.host;
}

const KEYS = ['teams', 'players', 'matches', 'app_users', 'championships', 'ads', 'config'];
const clientId = 'c_' + Math.random().toString(36).slice(2, 9);
const listeners = new Set();

let ws = null;
let connected = false;
let reconnectTimer = null;
let recoverySeq = 0;
const recoveryWaiters = new Map();
const pendingKey = 'mozfuthouse.pendingWrites';

function loadPending() {
  try {
    const raw = localStorage.getItem(pendingKey);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function savePending(arr) {
  try { localStorage.setItem(pendingKey, JSON.stringify(arr.slice(-50))); } catch (e) { /* ignore */ }
}

function flushPending() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const pending = loadPending();
  if (pending.length === 0) return;
  savePending([]);
  pending.forEach((p) => {
    try {
      ws.send(JSON.stringify({ type: 'write', key: p.key, value: p.value, removed: p.removed || [], origin: clientId }));
    } catch (e) { savePending(loadPending().concat([p])); }
  });
}

export function isSynced() {
  return connected;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(key, value) {
  listeners.forEach((fn) => { try { fn(key, value); } catch (e) { /* ignore */ } });
}

export function connectSync() {
  if (ws) return;
  try {
    ws = new WebSocket(resolveSyncUrl());
  } catch (e) {
    scheduleReconnect();
    return;
  }
  ws.onopen = () => { connected = true; flushPending(); };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (!msg || !msg.type) return;
    if (msg.type === 'state' && msg.store) {
      KEYS.forEach((k) => { if (Object.prototype.hasOwnProperty.call(msg.store, k)) emit(k, msg.store[k]); });
      emit('__state', msg.store);
    } else if (msg.type === 'recovery-reply' && recoveryWaiters.has(msg.reqId)) {
      const waiter = recoveryWaiters.get(msg.reqId);
      recoveryWaiters.delete(msg.reqId);
      clearTimeout(waiter.timer);
      waiter.resolve(msg);
    } else if ((msg.type === 'write' || msg.type === 'apply') && KEYS.includes(msg.key)) {
      if (msg.type === 'write' && msg.origin === clientId) return;
      emit(msg.key, msg.value);
    }
  };
  ws.onclose = () => { connected = false; scheduleReconnect(); };
  ws.onerror = () => { try { ws.close(); } catch (e) { /* ignore */ } };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    ws = null;
    connectSync();
  }, 5000);
}

export function pushWrite(key, value, removedIds) {
  const p = { key, value, removed: removedIds || [], at: Date.now() };
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'write', key, value, removed: p.removed, origin: clientId }));
      return;
    } catch (e) { /* fallthrough to pending queue */ }
  }
  const pending = loadPending();
  pending.push(p);
  savePending(pending);
}

export function recoveryRequest(payload) {
  return new Promise((resolve) => {
    const reqId = 'r_' + (++recoverySeq) + '_' + Math.random().toString(36).slice(2, 7);
    const timer = setTimeout(() => {
      recoveryWaiters.delete(reqId);
      resolve({ ok: false, msg: 'Sem resposta do servidor. Tente novamente.' });
    }, 15000);
    if (ws && ws.readyState === WebSocket.OPEN) {
      recoveryWaiters.set(reqId, { resolve, timer });
      try {
        ws.send(JSON.stringify({ type: 'recovery', ...payload, reqId }));
      } catch (e) {
        recoveryWaiters.delete(reqId);
        clearTimeout(timer);
        resolve({ ok: false, msg: 'Não foi possível contactar o servidor.' });
      }
    } else {
      clearTimeout(timer);
      resolve({ ok: false, msg: 'Sem ligação ao servidor de sincronização.' });
    }
  });
}