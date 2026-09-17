import { useState, useEffect, useMemo, useCallback, useRef, Component, createContext, useContext } from 'react';
import * as XLSX from 'xlsx';
import {
  Home, Users, User, CalendarDays, ListOrdered, Target, Star,
  Settings, Plus, Trash2, Pencil, X, Check, ShieldCheck,
  LogIn, LogOut, KeyRound, UserPlus, Mail, Shield,
  AlertTriangle, Upload, FileJson, RefreshCw, Tv, Trophy, Megaphone, Menu, Save, UserCog, Lock, FileSpreadsheet, Volume2, VolumeX, BarChart3, Eye, Clock, Play, Pause, TimerReset, Send, CheckCheck
} from 'lucide-react';
import { connectSync, subscribe, pushWrite, recoveryRequest } from './lib/sync.js';

const POSICOES = ['Goleiro', 'Fixo', 'Ala', 'Pivô'];
const CORES_TIME = ['#F2B807', '#3FA34D', '#4E8FD6', '#D64545', '#B36BD4', '#E8823E', '#3FC1C9', '#EAEAEA', '#7A8699'];
const CHAMP_NIVEIS = [
  { id: 'provincial', label: 'Provincial', desc: 'Equipas da província' },
  { id: 'cidade', label: 'Cidade', desc: 'Equipas da cidade' },
  { id: 'nacional', label: 'Nacional', desc: 'Apurados para o nacional' }
];
const ROLE_LABEL = { admin: 'Administrador', gestor: 'Gestor', associacao: 'Associação', clube: 'Clube', publico: 'Público' };
const PERMS_LABEL = {
  equipas: 'Equipas e jogadores',
  calendario: 'Agendar jogos',
  resultados: 'Lançar resultados',
  transmissoes: 'Transmissões'
};
const MAX_TENTATIVAS_LOGIN = 5;
const BLOQUEO_MS = 60000;

function uid(prefix) {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}

function diaLocal(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function relSeg(match) {
  const r = (match && match.relogio) || {};
  const base = Number(r.acumulado || 0);
  if (r.estado === 'jogo' && r.inicio) {
    return Math.round(base + (Date.now() - new Date(r.inicio).getTime()) / 1000);
  }
  return Math.round(base);
}

function fmtTempo(totalSeg) {
  const s = Math.max(0, Math.floor(totalSeg || 0));
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

const REL_STATES = {
  pre: { l: 'Pré-jogo', cl: '' },
  jogo: { l: '1º tempo', cl: '' },
  intervalo: { l: 'Intervalo', cl: 'inter' },
  pausa: { l: 'Tempo parado', cl: 'r' },
};

class Boundary extends Component {
  constructor(props) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ minHeight: '100vh', background: '#0B1220', color: '#ECEFF4', fontFamily: 'Inter, sans-serif', padding: 40 }}>
          <h1 style={{ color: '#FF6B6B', marginBottom: 8 }}>Ocorreu um erro ao mostrar esta página</h1>
          <pre style={{ whiteSpace: 'pre-wrap', background: '#171F30', color: '#ECEFF4', padding: 16, borderRadius: 8, fontSize: '0.85rem' }}>
            {String((this.state.err && (this.state.err.stack || this.state.err.message)) || this.state.err)}
          </pre>
          <button className="fx-btn fx-btn-primary" onClick={() => this.setState({ err: null })}>Tentar novamente</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

async function hashPassword(pw) {
  try {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, material, 256);
    return 'mzf:pbkdf2:100000:' + toHex(salt) + ':' + toHex(new Uint8Array(bits));
  } catch (e) {
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = (h * 31 + pw.charCodeAt(i)) | 0;
    return 'fb_' + h;
  }
}

async function verifyPassword(pw, storedHash) {
  try {
    if (storedHash && storedHash.startsWith('mzf:pbkdf2:')) {
      const parts = storedHash.split(':');
      const salt = new Uint8Array(parts[3].match(/.{2}/g).map(h => parseInt(h, 16)));
      const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
      const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: Number(parts[2]) || 100000, hash: 'SHA-256' }, material, 256);
      return toHex(new Uint8Array(bits)) === parts[4];
    }
    let h = 0;
    for (let i = 0; i < pw.length; i++) h = (h * 31 + pw.charCodeAt(i)) | 0;
    return 'fb_' + h === storedHash;
  } catch (e) {
    return false;
  }
}

function resizeImageFile(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
        else if (h >= w && h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Falha ao ler o ficheiro'));
    reader.readAsDataURL(file);
  });
}

const LS_PREFIX = 'mozfuthouse.';

async function rawGet(key) {
  if (window.storage && typeof window.storage.get === 'function') {
    try {
      const r = await window.storage.get(key, false);
      if (r && r.value !== undefined) return r.value;
    } catch (e) { /* ignore */ }
  }
  try { return window.localStorage.getItem(LS_PREFIX + key); } catch (e) { return null; }
}

async function rawSet(key, value) {
  if (window.storage && typeof window.storage.set === 'function') {
    try { await window.storage.set(key, value, false); return; } catch (e) { /* ignore */ }
  }
  try { window.localStorage.setItem(LS_PREFIX + key, value); } catch (e) { /* ignore */ }
}

async function safeGet(key, fallback) {
  try {
    const v = await rawGet(key);
    return v == null ? fallback : JSON.parse(v);
  } catch (e) {
    return fallback;
  }
}

async function persist(key, value) {
  try { await rawSet(key, JSON.stringify(value)); }
  catch (e) { console.error('Falha ao guardar', key, e); }
}

const SESSION_KEY = 'mozfuthouse.session';
function sessionStorageOK() {
  try { window.sessionStorage.setItem('__t', '1'); window.sessionStorage.removeItem('__t'); return true; } catch (e) { return false; }
}
function sessionGet() {
  try { return window.sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; }
}
function saveSession(id) {
  try { window.sessionStorage.setItem(SESSION_KEY, id); } catch (e) { /* ignore */ }
  persist('session', id);
}
function clearSession() {
  try { window.sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
  persist('session', '');
}
if (!sessionStorageOK()) {
  window.addEventListener('pagehide', () => { try { rawSet('session', ''); } catch (e) { /* ignore */ } });
}

const ConfirmContext = createContext(async () => false);

function useConfirm() {
  return useContext(ConfirmContext);
}

function ConfirmProvider({ children }) {
  const [q, setQ] = useState(null);
  const ask = useCallback((opts) => new Promise((resolve) => setQ({ ...opts, resolve })), []);
  const answer = (v) => { if (q) q.resolve(v); setQ(null); };
  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {q && (
        <div className="fx-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) answer(false); }}>
          <div className="fx-authbox" role="alertdialog" aria-modal="true">
            <div className="fx-auth-head">
              <AlertTriangle size={20} />
              <div>
                <div className="fx-auth-title">{q.title || 'Confirmação'}</div>
              </div>
            </div>
            <div style={{ fontSize: '0.87rem', lineHeight: 1.6 }}>{q.message}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button type="button" className="fx-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => answer(false)}>Cancelar</button>
              <button type="button" className={q.danger ? 'fx-btn fx-btn-danger' : 'fx-btn fx-btn-primary'} style={{ flex: 1, justifyContent: 'center' }} onClick={() => answer(true)}>{q.confirmLabel || 'Confirmar'}</button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export default function MozFutHouse() {
  const [teams, setTeams] = useState([]);
  const [players, setPlayers] = useState([]);
  const [matches, setMatches] = useState([]);
  const [users, setUsers] = useState([]);
  const [championships, setChampionships] = useState([]);
  const [ads, setAds] = useState([]);
  const [config, setConfig] = useState([]);
  const [selChampId, setSelChampId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState('inicio');
  const [menuOpen, setMenuOpen] = useState(false);

  const [currentUser, setCurrentUser] = useState(null);
  const [authView, setAuthView] = useState('login');
  const [authError, setAuthError] = useState('');
  const [accountModal, setAccountModal] = useState(null);
  const [tentativasFalhadas, setTentativasFalhadas] = useState(0);
  const [bloqueioAte, setBloqueioAte] = useState(0);

  const dataRef = useRef({ teams, players, matches, users, championships, ads, config });
  Object.assign(dataRef.current, { teams, players, matches, users, championships, ads, config });

  useEffect(() => {
    (async () => {
      const [tRaw, p, mRaw, u, cRaw, adRaw, cfgRaw, sid, cs] = await Promise.all([
        safeGet('teams', []), safeGet('players', []), safeGet('matches', []), safeGet('app_users', []), safeGet('championships', []), safeGet('ads', []), safeGet('config', []), sessionStorageOK() ? Promise.resolve(sessionGet()) : safeGet('session', ''), safeGet('champ_sel', '')
      ]);
      const t = tRaw.map(x => ({ ...x, champIds: Array.isArray(x.champIds) ? x.champIds : [] }));
      const c = cRaw.map(x => ({ ...x, apuracoes: Array.isArray(x.apuracoes) ? x.apuracoes : [] }));
      const champDe = (list, id) => (list.find(x => x.id === id) || { champIds: [] }).champIds || [];
      let migrado = false;
      const m = mRaw.map(mx => {
        if (mx.champId) return mx;
        const comum = champDe(t, mx.mandante).filter(id => champDe(t, mx.visitante).includes(id));
        const alvo = c.find(x => x.id === comum[0]) || (t.some(x => x.id === mx.mandante) && t.some(x => x.id === mx.visitante) ? c[0] : null);
        if (alvo) { migrado = true; return { ...mx, champId: alvo.id }; }
        return mx;
      });
      if (migrado) { persist('matches', m); pushWrite('matches', m); }
      setTeams(t); setPlayers(p); setMatches(m); setUsers(u); setChampionships(c); setAds(adRaw); setConfig(Array.isArray(cfgRaw) ? cfgRaw : []);
      setSelChampId(cs && c.some(x => x.id === cs) ? cs : '');
      if (sid) {
        const sessao = u.find(x => x.id === sid);
        if (sessao) setCurrentUser(sessao);
      }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    connectSync();
    const unsubscribe = subscribe((key, value) => {
      if (key === '__state') {
        const locais = dataRef.current;
        Object.keys(locais).forEach(k => {
          if (k === 'session' || k === 'dataRef' || k === 'dataRef.current') return;
          const serverKey = k === 'users' ? 'app_users' : k;
          const remoto = Array.isArray(value[serverKey]) ? value[serverKey] : [];
          const localList = Array.isArray(locais[k]) ? locais[k] : [];
          if (remoto.length === 0) {
            if (localList.length > 0) pushWrite(serverKey, localList, []);
            return;
          }
          let mudou = false;
          const fundido = remoto.map(item => {
            if (!item || item.id == null) return item;
            const l = localList.find(x => x && x.id === item.id);
            if (!l) return item;
            const merged = { ...item };
            for (const campo of Object.keys(l)) {
              const lv = l[campo];
              const rv = merged[campo];
              if (lv !== undefined && (rv === undefined || rv === '' || rv === null)) {
                merged[campo] = lv;
                mudou = true;
              }
            }
            return merged;
          });
          if (mudou) pushWrite(serverKey, fundido, []);
        });
        return;
      }
      persist(key, value);
      if (key === 'teams') setTeams(value);
      else if (key === 'players') setPlayers(value);
      else if (key === 'matches') setMatches(value);
      else if (key === 'app_users') setUsers(value);
      else if (key === 'championships') setChampionships(value);
      else if (key === 'ads') setAds(value);
      else if (key === 'config') setConfig(Array.isArray(value) ? value : []);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const cfg = (config && config[0]) || {};
    const logo = cfg.logo || '';
    const link = document.getElementById('mzf-favicon');
    if (link) {
      if (logo) link.href = logo;
      else link.href = 'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 64 64\'%3E%3Crect width=\'64\' height=\'64\' rx=\'14\' fill=\'%230B1220\'/%3E%3Ctext x=\'32\' y=\'46\' font-family=\'Arial,sans-serif\' font-size=\'36\' font-weight=\'bold\' text-anchor=\'middle\' fill=\'%23F2B807\'%3EM%3C/text%3E%3C/svg%3E';
    }
  }, [config]);

  function updateTeams(next) { const removed = (dataRef.current.teams || []).filter(x => !next.some(y => y.id === x.id)).map(x => x.id); setTeams(next); persist('teams', next); pushWrite('teams', next, removed); }
  function updatePlayers(next) { const removed = (dataRef.current.players || []).filter(x => !next.some(y => y.id === x.id)).map(x => x.id); setPlayers(next); persist('players', next); pushWrite('players', next, removed); }
  function updateMatches(next) { const removed = (dataRef.current.matches || []).filter(x => !next.some(y => y.id === x.id)).map(x => x.id); setMatches(next); persist('matches', next); pushWrite('matches', next, removed); }
  function updateUsers(next) { const removed = (dataRef.current.users || []).filter(x => !next.some(y => y.id === x.id)).map(x => x.id); setUsers(next); persist('app_users', next); pushWrite('app_users', next, removed); }
  function updateChampionships(next) { const removed = (dataRef.current.championships || []).filter(x => !next.some(y => y.id === x.id)).map(x => x.id); setChampionships(next); persist('championships', next); pushWrite('championships', next, removed); }
  function updateAds(next) { const removed = (dataRef.current.ads || []).filter(x => !next.some(y => y.id === x.id)).map(x => x.id); setAds(next); persist('ads', next); pushWrite('ads', next, removed); }
  function updateConfig(next) { setConfig(Array.isArray(next) ? next : []); persist('config', next); pushWrite('config', next); }
  function selectChamp(id) { setSelChampId(id); persist('champ_sel', id); }

  function logAcao(tipo, info, atorOverride) {
    const cfg = (dataRef.current.config && dataRef.current.config[0]) || {};
    const acoes = Array.isArray(cfg.acoes) ? cfg.acoes.slice(0, 150) : [];
    updateConfig([{ ...cfg, id: 'app', acoes: [{ id: uid('log'), tipo, atorNome: atorOverride || currentUser?.nome || 'Sistema', info, data: new Date().toISOString() }, ...acoes] }]);
  }

  function registarAcesso() {
    const cfg = (dataRef.current.config && dataRef.current.config[0]) || {};
    const stats = cfg.stats || {};
    const acessos = stats.acessos || {};
    const dia = diaLocal();
    const val = (acessos[dia] || 0) + 1;
    const chaves = Object.keys(acessos).sort().slice(-120);
    const novoAcessos = { ...acessos, [dia]: val };
    Object.keys(novoAcessos).forEach(k => { if (!chaves.some(c => c === k) && k !== dia) delete novoAcessos[k]; });
    updateConfig([{ ...cfg, id: 'app', stats: { ...stats, acessos: novoAcessos } }]);
  }

  function registarVisualizacao(matchId) {
    const uidAtual = currentUser?.id;
    if (!uidAtual || !matchId) return;
    const cfg = (dataRef.current.config && dataRef.current.config[0]) || {};
    const stats = cfg.stats || {};
    const vis = Array.isArray(stats.visualizacoes) ? stats.visualizacoes : [];
    const dia = diaLocal();
    const alvo = vis.find(v => v.matchId === matchId && v.dia === dia);
    if (alvo) {
      if (alvo.ids && alvo.ids.includes(uidAtual)) return;
      alvo.ids = [...(alvo.ids || []), uidAtual];
    } else {
      vis.unshift({ matchId, dia, ids: [uidAtual] });
    }
    const visCortado = vis.slice(0, 500);
    updateConfig([{ ...cfg, id: 'app', stats: { ...stats, visualizacoes: visCortado } }]);
  }

  function toggleBloqueio(u) {
    const alvo = users.find(x => x.id === u.id);
    if (!alvo) return;
    updateUsers(users.map(x => x.id === u.id ? { ...x, bloqueado: !x.bloqueado } : x));
    logAcao(alvo.bloqueado ? 'desbloqueou' : 'bloqueou', `${alvo.nome} — ${alvo.bloqueado ? 'desbloqueou a conta' : 'bloqueou a conta'}`);
  }

  function setPermissao(u, chave, valor) {
    const alvo = users.find(x => x.id === u.id);
    if (!alvo) return;
    const perms = { ...(alvo.permissoes || {}), [chave]: !!valor };
    updateUsers(users.map(x => x.id === u.id ? { ...x, permissoes: perms } : x));
    logAcao('permissao', `${alvo.nome} — ${valor ? 'ganhou permissão de ' : 'perdeu permissão de '}${PERMS_LABEL[chave]}`);
  }

  function removerPublico(u) {
    const alvo = users.find(x => x.id === u.id);
    updateUsers(users.filter(x => x.id !== u.id));
    if (alvo) logAcao('removeu', `${alvo.nome} — conta pública removida`);
  }

  const teamName = (id) => (teams.find(t => t.id === id) || {}).name || '—';
  const teamColor = (id) => (teams.find(t => t.id === id) || {}).cor || '#8C99B5';
  const teamFoto = (id) => (teams.find(t => t.id === id) || {}).foto || '';
  const playerName = (id) => (players.find(p => p.id === id) || {}).nome || '—';

  const isAdmin = currentUser?.role === 'admin';
  const isGestor = currentUser?.role === 'gestor';
  const isAssociacao = currentUser?.role === 'associacao';
  const isClube = currentUser?.role === 'clube';
  const permG = (k) => !!(currentUser && currentUser.permissoes && currentUser.permissoes[k]);
  const gestaoConteudo = isAdmin || isGestor || isAssociacao || permG('equipas');
  const gestaoCalendario = isAdmin || isGestor || isAssociacao || permG('calendario');
  const gestaoResultados = isAdmin || isGestor || isAssociacao || permG('resultados');
  const gestaoTransmissoes = isAdmin || isGestor || permG('transmissoes');
  const gestaoJogadores = isAdmin || isGestor || isAssociacao || isClube || permG('equipas');
  const gestaoConvocados = isAdmin || isGestor || isAssociacao || isClube || permG('calendario');
  const gestaoOps = isAdmin || isAssociacao;
  const podeEditarResultadosLancados = isAdmin || isAssociacao;

  async function handleSetupAdmin(nome, email, password) {
    if (!nome.trim() || !emailValido(email) || password.length < 4) { setAuthError('Preencha o nome, um email válido e uma password com pelo menos 4 caracteres.'); return; }
    const hash = await hashPassword(password);
    const novo = { id: uid('user'), nome: nome.trim(), email: email.trim().toLowerCase(), hash, role: 'admin', criadoEm: new Date().toISOString() };
    updateUsers([...users, novo]);
    setCurrentUser(novo);
    saveSession(novo.id);
    setAuthError('');
    registarAcesso();
  }

  async function handleLogin(email, password) {
    if (Date.now() < bloqueioAte) {
      setAuthError('Muitas tentativas falhadas. Aguarde um pouco antes de tentar novamente.');
      return;
    }
    const conta = users.find(x => x.email.toLowerCase() === email.trim().toLowerCase());
    if (conta && conta.bloqueado) {
      setAuthError('A sua conta foi bloqueada pelo administrador.');
      return;
    }
    const ok = conta ? await verifyPassword(password, conta.hash) : false;
    if (ok) {
      const agora = new Date().toISOString();
      let sessao = { ...conta, ultimoLogin: agora };
      if (!conta.hash.startsWith('mzf:pbkdf2:')) {
        const novaHash = await hashPassword(password);
        sessao = { ...sessao, hash: novaHash };
      }
      updateUsers(users.map(x => x.id === conta.id ? sessao : x));
      setCurrentUser(sessao);
      saveSession(sessao.id);
      setTentativasFalhadas(0);
      setBloqueioAte(0);
      setAuthError('');
      logAcao('login', `${conta.nome} iniciou sessão`, conta.nome);
      registarAcesso();
    } else {
      const novo = tentativasFalhadas + 1;
      setTentativasFalhadas(novo);
      if (novo >= MAX_TENTATIVAS_LOGIN) {
        setBloqueioAte(Date.now() + BLOQUEO_MS);
        setTentativasFalhadas(0);
        setAuthError('Muitas tentativas falhadas. Acesso bloqueado temporariamente.');
      } else {
        setAuthError('Email ou password incorretos.');
      }
    }
  }

  function emailExiste(email) { return users.some(u => u.email.toLowerCase() === email.trim().toLowerCase()); }

  async function handleRegistoPublico(nome, email, password) {
    if (!nome.trim() || !emailValido(email) || password.length < 4) { setAuthError('Preencha o nome, um email válido e uma password com pelo menos 4 caracteres.'); return; }
    if (emailExiste(email)) { setAuthError('Já existe uma conta registada com este email.'); return; }
    const hash = await hashPassword(password);
    const novo = { id: uid('user'), nome: nome.trim(), email: email.trim().toLowerCase(), hash, role: 'publico', bloqueado: false, permissoes: {}, criadoEm: new Date().toISOString() };
    updateUsers([...users, novo]);
    setCurrentUser(novo);
    saveSession(novo.id);
    setAuthError('');
    logAcao('registo', `${novo.nome} criou conta pública`, novo.nome);
    registarAcesso();
  }

  function handleLogout() {
    clearSession();
    setCurrentUser(null);
    setTab('inicio');
    setAuthView('login');
    setAuthError('');
  }

  async function handleChangeOwnPassword(currentPw, newPw) {
    if (!currentUser || !(await verifyPassword(currentPw, currentUser.hash))) { setAuthError('A password actual está incorreta.'); return; }
    if (newPw.length < 4) { setAuthError('A nova password deve ter pelo menos 4 caracteres.'); return; }
    const novaHash = await hashPassword(newPw);
    const atualizado = { ...currentUser, hash: novaHash };
    updateUsers(users.map(u => u.id === currentUser.id ? atualizado : u));
    setCurrentUser(atualizado);
    setAccountModal(null);
    setAuthError('');
  }

  async function handleRecuperar(email) {
    setAuthError('');
    const r = await recoveryRequest({ action: 'request', email: email.trim().toLowerCase() });
    return r;
  }

  async function handleRecuperarConfirmar(email, code, password) {
    setAuthError('');
    const r = await recoveryRequest({ action: 'confirm', email: email.trim().toLowerCase(), code, password });
    return r;
  }

  async function addUserByAdmin(nome, email, password, role, champId, teamId) {
    if (!nome.trim() || !emailValido(email) || password.length < 4) { setAuthError('Preencha nome, um email válido e uma password com pelo menos 4 caracteres.'); return false; }
    if (emailExiste(email)) { setAuthError('Já existe uma conta registada com este email.'); return false; }
    if (role === 'associacao' && !champId) { setAuthError('Defina o campeonato associado a esta conta.'); return false; }
    if (role === 'clube' && (!champId || !teamId)) { setAuthError('Para o perfil Clube, selecione o campeonato e a equipa.'); return false; }
    const hash = await hashPassword(password);
    const novo = { id: uid('user'), nome: nome.trim(), email: email.trim().toLowerCase(), hash, role,
      champId: (role === 'associacao' || role === 'clube') ? champId : undefined,
      teamId: role === 'clube' ? teamId : undefined,
      criadoEm: new Date().toISOString() };
    updateUsers([...users, novo]);
    setAuthError('');
    return true;
  }

  async function atualizarUtilizador(id, novoNome, novoEmail, novaPassword, champId, teamId) {
    const alvo = users.find(u => u.id === id);
    if (!alvo) { setAuthError('Conta não encontrada.'); return false; }
    const nomeL = novoNome.trim();
    const emailL = novoEmail.trim().toLowerCase();
    if (!nomeL) { setAuthError('O nome não pode ficar vazio.'); return false; }
    if (!emailValido(emailL)) { setAuthError('Introduza um email válido.'); return false; }
    if (users.some(u => u.id !== id && u.email.toLowerCase() === emailL)) { setAuthError('Já existe outra conta com este email.'); return false; }
    if (alvo.role === 'associacao' && !champId) { setAuthError('Defina o campeonato associado a esta conta.'); return false; }
    if (alvo.role === 'clube' && (!champId || !teamId)) { setAuthError('Para o perfil Clube, selecione o campeonato e a equipa.'); return false; }
    if (novaPassword && novaPassword.length < 4) { setAuthError('A nova password deve ter pelo menos 4 caracteres.'); return false; }
    const novaHash = novaPassword ? await hashPassword(novaPassword) : alvo.hash;
    const atualizado = { ...alvo, nome: nomeL, email: emailL, hash: novaHash,
      champId: (alvo.role === 'associacao' || alvo.role === 'clube') ? champId : alvo.champId,
      teamId: alvo.role === 'clube' ? teamId : alvo.teamId };
    updateUsers(users.map(u => u.id === id ? atualizado : u));
    if (currentUser && currentUser.id === id) setCurrentUser(atualizado);
    logAcao('perfil', `${currentUser?.nome || 'Admin'} ${novaPassword ? 'redefiniu a password de' : 'alterou os dados de'} ${alvo.nome}`);
    setAuthError('');
    return true;
  }

  const activeChamp = championships.find(c => c.id === selChampId) || championships[0] || null;
  const champNivel = (c) => CHAMP_NIVEIS.find(n => n.id === c.nivel)?.label || c.nivel;
  const champTeams = (champ) => champ ? teams.filter(t => (t.champIds || []).includes(champ.id)) : teams;
  const matchesVisiveis = useMemo(() => activeChamp ? matches.filter(m => m.champId === activeChamp.id) : matches, [matches, activeChamp]);

  const timesDoChampAtivo = useMemo(() => {
    const set = new Set();
    if (activeChamp) teams.forEach(t => { if ((t.champIds || []).includes(activeChamp.id)) set.add(t.id); });
    return set;
  }, [teams, activeChamp]);

  const standings = useMemo(() => {
    const base = activeChamp ? champTeams(activeChamp) : teams;
    const table = {};
    base.forEach(t => { table[t.id] = { teamId: t.id, nome: t.name, cor: t.cor, foto: t.foto, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, sg: 0, pts: 0 }; });
    matchesVisiveis.filter(m => m.status === 'realizado').forEach(m => {
      const mandante = table[m.mandante], visitante = table[m.visitante];
      if (!mandante || !visitante) return;
      mandante.j++; visitante.j++;
      mandante.gp += m.golsMandante || 0; mandante.gc += m.golsVisitante || 0;
      visitante.gp += m.golsVisitante || 0; visitante.gc += m.golsMandante || 0;
      if ((m.golsMandante || 0) > (m.golsVisitante || 0)) { mandante.v++; mandante.pts += 3; visitante.d++; }
      else if ((m.golsMandante || 0) < (m.golsVisitante || 0)) { visitante.v++; visitante.pts += 3; mandante.d++; }
      else { mandante.e++; visitante.e++; mandante.pts += 1; visitante.pts += 1; }
    });
    return Object.values(table).map(r => ({ ...r, sg: r.gp - r.gc }))
      .sort((a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp || a.nome.localeCompare(b.nome));
  }, [teams, matchesVisiveis, activeChamp]);

  const artilheiros = useMemo(() => {
    const map = {};
    matches.forEach(m => (m.eventos || []).filter(e => e.tipo === 'gol').forEach(e => {
      map[e.jogadorId] = (map[e.jogadorId] || 0) + 1;
    }));
    return Object.entries(map).map(([jogadorId, gols]) => {
      const p = players.find(pl => pl.id === jogadorId);
      if (!p || !timesDoChampAtivo.has(p.teamId)) return null;
      return { jogadorId, nome: p.nome, teamId: p.teamId, foto: p.foto, time: teamName(p.teamId), cor: teamColor(p.teamId), gols };
    }).filter(Boolean).sort((a, b) => b.gols - a.gols || a.nome.localeCompare(b.nome));
  }, [matchesVisiveis, players, teams, timesDoChampAtivo]);

  const statsJogadores = useMemo(() => {
    const map = {};
    players.filter(p => timesDoChampAtivo.has(p.teamId)).forEach(p => { map[p.id] = { jogadorId: p.id, nome: p.nome, foto: p.foto, numero: p.numero, posicao: p.posicao, time: teamName(p.teamId), cor: teamColor(p.teamId), gols: 0, assists: 0, amarelos: 0, vermelhos: 0, notas: [], jogos: 0, mvps: 0 }; });
    matchesVisiveis.filter(m => m.status === 'realizado').forEach(m => {
      const emJogo = new Set();
      (m.eventos || []).forEach(e => {
        const s = map[e.jogadorId]; if (!s) return;
        emJogo.add(e.jogadorId);
        if (e.tipo === 'gol') s.gols++;
        if (e.tipo === 'amarelo') s.amarelos++;
        if (e.tipo === 'vermelho') s.vermelhos++;
        if (e.tipo === 'gol' && e.assist && map[e.assist]) { map[e.assist].assists++; emJogo.add(e.assist); }
      });
      (m.avaliacoes || []).forEach(a => {
        const s = map[a.jogadorId]; if (!s) return;
        s.notas.push(a.nota);
        emJogo.add(a.jogadorId);
      });
      if (m.mvpId && map[m.mvpId]) map[m.mvpId].mvps++;
      emJogo.forEach(id => { if (map[id]) map[id].jogos++; });
    });
    return Object.values(map).map(s => {
      const media = s.notas.length ? s.notas.reduce((a, b) => a + b, 0) / s.notas.length : 0;
      const ptsGols = s.gols * 3;
      const ptsAssist = s.assists * 2;
      const ptsMVP = s.mvps * 6;
      return { ...s, media, ptsGols, ptsAssist, ptsMVP, indice: s.jogos ? (ptsGols + ptsAssist + media + ptsMVP) / 4 : 0 };
    })
      .sort((a, b) => b.indice - a.indice || b.gols - a.gols || a.nome.localeCompare(b.nome));
  }, [players, matchesVisiveis, teams, timesDoChampAtivo]);

  const destaque = statsJogadores.find(s => s.jogos > 0);

  const proximoJogo = useMemo(() => {
    const agendados = matchesVisiveis.filter(m => m.status === 'agendado' && m.data).slice();
    agendados.sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || '')));
    const hoje = new Date().toISOString().slice(0, 10);
    return agendados.find(m => m.data >= hoje) || agendados[0];
  }, [matchesVisiveis]);

  const rodadaAtual = useMemo(() => {
    const comData = matchesVisiveis.filter(m => m.data).slice();
    comData.sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));
    return comData.length ? Number(comData[0].rodada) || 0 : 0;
  }, [matchesVisiveis]);

  const NAV_ADMIN = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'equipes', label: 'Equipes', icon: Users },
    { id: 'jogadores', label: 'Jogadores', icon: User },
    { id: 'calendario', label: 'Calendário', icon: CalendarDays },
    { id: 'resultados', label: 'Resultados', icon: Settings },
    { id: 'transmissoes', label: 'Transmissões', icon: Tv },
    { id: 'classificacao', label: 'Classificação', icon: ListOrdered },
    { id: 'artilharia', label: 'Artilharia', icon: Target },
    { id: 'estatisticas', label: 'Melhor Jogador', icon: Star },
    { id: 'campeonatos', label: 'Campeonatos', icon: Trophy },
    { id: 'exportar', label: 'Exportar', icon: FileSpreadsheet },
    { id: 'acessos', label: 'Acessos', icon: BarChart3 },
    { id: 'publicidade', label: 'Publicidade', icon: Megaphone },
    { id: 'publico', label: 'Utilizadores Públicos', icon: UserCog },
    { id: 'utilizadores', label: 'Utilizadores', icon: Shield },
  ];
  const NAV_GESTOR = [
    { id: 'resultados', label: 'Resultados', icon: Settings },
  ];
  const NAV_ASSOCIACAO = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'equipes', label: 'Equipes', icon: Users },
    { id: 'calendario', label: 'Calendário', icon: CalendarDays },
    { id: 'resultados', label: 'Resultados', icon: Settings },
    { id: 'artilharia', label: 'Artilharia', icon: Target },
    { id: 'classificacao', label: 'Classificação', icon: ListOrdered },
    { id: 'estatisticas', label: 'Melhor Jogador', icon: Star },
    { id: 'campeonatos', label: 'Campeonatos', icon: Trophy },
  ];
  const NAV_CLUBE = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'calendario', label: 'Calendário', icon: CalendarDays },
    { id: 'jogadores', label: 'Jogadores', icon: User },
    { id: 'classificacao', label: 'Classificação', icon: ListOrdered },
    { id: 'artilharia', label: 'Artilharia', icon: Target },
    { id: 'estatisticas', label: 'Melhor Jogador', icon: Star },
  ];
  const NAV_PUBLICO = [
    { id: 'inicio', label: 'Início', icon: Home },
    { id: 'equipes', label: 'Equipes', icon: Users },
    { id: 'jogadores', label: 'Jogadores', icon: User },
    { id: 'calendario', label: 'Calendário', icon: CalendarDays },
    { id: 'transmissoes', label: 'Ver jogos', icon: Tv },
    { id: 'parceiros', label: 'Parceiros', icon: Megaphone },
    { id: 'classificacao', label: 'Classificação', icon: ListOrdered },
    { id: 'artilharia', label: 'Artilharia', icon: Target },
    { id: 'estatisticas', label: 'Melhor Jogador', icon: Star },
  ];
  const nav = isAdmin ? NAV_ADMIN : isGestor ? NAV_GESTOR : isAssociacao ? NAV_ASSOCIACAO : isClube ? NAV_CLUBE : (
    (() => {
      const n = NAV_PUBLICO.slice();
      if (permG('resultados') && !n.some(x => x.id === 'resultados')) n.splice(4, 0, { id: 'resultados', label: 'Resultados', icon: Settings });
      return n;
    })()
  );
  const navKey = currentUser ? currentUser.role + ':' + currentUser.id : 'none';

  useEffect(() => {
    if (!currentUser) return;
    if (!nav.find(n => n.id === tab)) setTab(nav[0].id);
  }, [navKey]);

  useEffect(() => {
    if (!loaded || !currentUser) return;
    const isLocked = currentUser.role === 'associacao' || currentUser.role === 'clube';
    if (isLocked && currentUser.champId && championships.some(c => c.id === currentUser.champId)) {
      setSelChampId(currentUser.champId);
    } else if (isLocked && championships[0]) {
      setSelChampId(championships[0].id);
    }
  }, [loaded, currentUser, championships]);

  if (!loaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#0B1220', color: '#ECEFF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif' }}>
        MozFutHouse · A carregar dados do campeonato…
      </div>
    );
  }

  return (
    <div className={'fx-root' + (menuOpen ? ' menu-open' : '')}>
      <Boundary>
        <ConfirmProvider>
        {!currentUser ? (
          <AuthGate
            hasUsers={users.length > 0}
            view={authView}
            setView={setAuthView}
            error={authError}
            setError={setAuthError}
            onSetupAdmin={handleSetupAdmin}
            onLogin={handleLogin}
            onRegisto={handleRegistoPublico}
            onRecuperar={handleRecuperar}
            onRecuperarConfirmar={handleRecuperarConfirmar}
            config={config}
          />
        ) : (
          <>
            <div className="fx-topbar">
              <button className="fx-topbar-btn" onClick={() => setMenuOpen(o => !o)} title="Menu" aria-label="Menu"><Menu size={18} /></button>
              <Brand config={config} />
            </div>
            <div className="fx-scrim" onClick={() => setMenuOpen(false)} />
            <aside className="fx-side">
              <Brand config={config} />
              <nav className="fx-nav">
                {nav.map(n => (
                  <button key={n.id} className={tab === n.id ? 'active' : ''} onClick={() => { setTab(n.id); setMenuOpen(false); }}>
                    <n.icon size={16} /> {n.label}
                  </button>
                ))}
              </nav>
              <div className="fx-mode">
                <div className="fx-user-card">
                  <div className="fx-user-name">{currentUser.nome}</div>
                  <div className="fx-user-email">{currentUser.email}</div>
                  <span className={'fx-role-badge ' + currentUser.role}>{ROLE_LABEL[currentUser.role]}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button className="fx-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => { setAuthError(''); setAccountModal('change'); }}><KeyRound size={13} /> Password</button>
                  <button className="fx-btn fx-btn-icon" onClick={handleLogout} title="Sair"><LogOut size={14} /></button>
                </div>
              </div>
            </aside>

            <main className="fx-main">
              <ChampBanner championships={championships} activeChamp={activeChamp} selChampId={activeChamp ? activeChamp.id : ''}
                onSelect={selectChamp} champNivel={champNivel} locked={isAssociacao || isClube} />
              {tab === 'inicio' && (
                <Inicio teams={teams} players={players} matches={matchesVisiveis} standings={standings} artilheiros={artilheiros}
                  destaque={destaque} proximoJogo={proximoJogo} rodadaAtual={rodadaAtual} teamName={teamName} teamFoto={teamFoto} ads={ads}
                  updateMatches={updateMatches} gestao={gestaoConvocados}
                  myTeamId={isClube ? (currentUser.teamId || '') : ''}
                  convPapel={isAssociacao ? 'associacao' : isClube ? 'clube' : 'outro'} />
              )}
              {tab === 'equipes' && (
                <Equipes teams={teams} players={players} matches={matches} updateTeams={updateTeams}
                  updatePlayers={updatePlayers} updateMatches={updateMatches} gestao={gestaoConteudo}
                  championships={championships} activeChampId={activeChamp ? activeChamp.id : ''}
                  lockedChamp={isAssociacao ? (currentUser.champId || (activeChamp ? activeChamp.id : '')) : ''} />
              )}
              {tab === 'jogadores' && (
                <Jogadores teams={teams} players={players} updatePlayers={updatePlayers}
                  teamName={teamName} teamColor={teamColor} gestao={gestaoJogadores}
                  myTeamId={isClube ? (currentUser.teamId || '') : ''} />
              )}
              {tab === 'calendario' && (
                <Calendario teams={teams} players={players} matches={matches} updateMatches={updateMatches} teamName={teamName}
                  teamColor={teamColor} teamFoto={teamFoto} gestao={gestaoCalendario}
                  gestaoConvocados2={gestaoConvocados}
                  championships={championships} activeChamp={activeChamp} onSelect={selectChamp} champNivel={champNivel}
                  myTeamId={isClube ? (currentUser.teamId || '') : ''} gestaoOps={gestaoOps}
                  convPapel={isAssociacao ? 'associacao' : isClube ? 'clube' : 'outro'} />
              )}
              {tab === 'resultados' && gestaoResultados && (
                <Resultados teams={teams} players={players} matches={matches} updateMatches={updateMatches}
                  teamName={teamName} playerName={playerName} activeChamp={activeChamp}
                  podeEditarResultadosLancados={podeEditarResultadosLancados} />
              )}
              {tab === 'transmissoes' && (
                <Transmissoes matches={matches} teamName={teamName} teamColor={teamColor} teamFoto={teamFoto}
                  updateMatches={updateMatches} gestao={gestaoTransmissoes}
                  activeChamp={activeChamp} championships={championships} onSelect={selectChamp} champNivel={champNivel}
                  onAssistir={registarVisualizacao} />
              )}
              {tab === 'parceiros' && (
                <Parceiros ads={ads} />
              )}
              {tab === 'publicidade' && isAdmin && (
                <Publicidade ads={ads} updateAds={updateAds} />
              )}
              {tab === 'classificacao' && <Classificacao standings={standings} />}
              {tab === 'artilharia' && <Artilharia artilheiros={artilheiros} activeChamp={activeChamp} />}
              {tab === 'estatisticas' && <Estatisticas stats={statsJogadores} activeChamp={activeChamp} />}
              {tab === 'campeonatos' && (isAdmin || isAssociacao) && (
                <Campeonatos championships={championships} teams={teams} matches={matches} standings={standings} updateChampionships={updateChampionships}
                  updateTeams={updateTeams} activeChampId={activeChamp ? activeChamp.id : ''} onSelect={selectChamp} champNivel={champNivel}
                  currentUser={currentUser} isAdmin={isAdmin} isAssociacao={isAssociacao} />
              )}
              {tab === 'exportar' && isAdmin && (
                <Exportar championships={championships} teams={teams} players={players} matches={matches} teamName={teamName} />
              )}
              {tab === 'acessos' && isAdmin && (
                <Acessos config={config} matches={matches} users={users} teamName={teamName} />
              )}
              {tab === 'publico' && isAdmin && (
                <ControloPublico users={users} config={config} currentUser={currentUser}
                  updateUsers={updateUsers} logAcao={logAcao}
                  toggleBloqueio={toggleBloqueio} setPermissao={setPermissao} removerPublico={removerPublico} />
              )}
              {tab === 'utilizadores' && isAdmin && (
<Utilizadores users={users} teams={teams} players={players} matches={matches} currentUser={currentUser}
                  addUser={addUserByAdmin} error={authError} setError={setAuthError}
                  updateUsers={updateUsers} updateTeams={updateTeams} updatePlayers={updatePlayers} updateMatches={updateMatches}
                  onLogout={handleLogout} config={config} updateConfig={updateConfig}
                  atualizarUtilizador={atualizarUtilizador} championships={championships} />
              )}
            </main>

            {accountModal === 'change' && (
              <ChangePasswordModal error={authError} onClose={() => { setAccountModal(null); setAuthError(''); }} onSubmit={handleChangeOwnPassword} />
            )}
          </>
        )}
      </ConfirmProvider>
      </Boundary>
    </div>
  );
}

function Brand({ config }) {
  const cfg = (config && config[0]) || {};
  return (
    <div className="fx-brand">
      {cfg.logo ? <img className="fx-brand-logo" src={cfg.logo} alt="Logo" /> : <div className="sq" />}
      <div className="tt">MozFutHouse</div>
    </div>
  );
}

function Avatar({ src, size = 28, shape = 'circle', fallbackColor = '#26314A', initials = '' }) {
  const style = {
    width: size, height: size, flexShrink: 0, objectFit: 'cover', border: '1px solid var(--line)',
    borderRadius: shape === 'circle' ? '50%' : 4, verticalAlign: 'middle', display: 'inline-block'
  };
  if (src) return <img src={src} alt="" style={style} />;
  return <span style={{ ...style, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: fallbackColor, color: '#0B1220', fontSize: Math.max(9, size * 0.38), fontWeight: 700 }}>{initials}</span>;
}

function ImageInput({ value, onChange, label, shape = 'square', maxDim = 240, quality = 0.72, fallbackColor = '#26314A', initials = '' }) {
  const [modo, setModo] = useState('device');
  const [urlDraft, setUrlDraft] = useState(value && /^https?:\/\//.test(value) ? value : '');
  const [erro, setErro] = useState('');

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      setErro('');
      const dataUrl = await resizeImageFile(file, maxDim, quality);
      onChange(dataUrl);
    } catch (err) {
      setErro('Não foi possível carregar esta imagem.');
    }
    e.target.value = '';
  }

  return (
    <div className="fx-field">
      {label && <label>{label}</label>}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar src={value} size={48} shape={shape} fallbackColor={fallbackColor} initials={initials} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 210 }}>
          <div className="fx-seg" style={{ width: 190 }}>
            <button type="button" className={modo === 'device' ? 'active' : ''} onClick={() => setModo('device')}>Dispositivo</button>
            <button type="button" className={modo === 'url' ? 'active' : ''} onClick={() => setModo('url')}>Link da web</button>
          </div>
          {modo === 'device' ? (
            <input type="file" accept="image/*" className="fx-input" style={{ padding: 5, maxWidth: 220 }} onChange={handleFile} />
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="fx-input" style={{ maxWidth: 160 }} placeholder="https://…" value={urlDraft} onChange={e => setUrlDraft(e.target.value)} />
              <button type="button" className="fx-btn" onClick={() => onChange(urlDraft.trim())}>Usar</button>
            </div>
          )}
          {erro && <div className="fx-auth-error" style={{ marginBottom: 0 }}>{erro}</div>}
          {value && <button type="button" className="fx-btn fx-btn-danger" style={{ alignSelf: 'flex-start' }} onClick={() => { onChange(''); setUrlDraft(''); }}><Trash2 size={12} /> Remover foto</button>}
        </div>
      </div>
    </div>
  );
}

function AuthGate({ hasUsers, view, setView, error, setError, onSetupAdmin, onLogin, onRegisto, config, onRecuperar, onRecuperarConfirmar }) {
  const cfg = (config && config[0]) || {};
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [recEmail, setRecEmail] = useState('');
  const [recCode, setRecCode] = useState('');
  const [recNovaPw, setRecNovaPw] = useState('');
  const [recStep, setRecStep] = useState('inicio');
  const [recMsg, setRecMsg] = useState('');
  const [codigoDemo, setCodigoDemo] = useState(null);
  const [aEnviar, setAEnviar] = useState(false);
  const [aGuardar, setAGuardar] = useState(false);

  const isSetup = !hasUsers;

  function submit(e) {
    e.preventDefault();
    if (isSetup) {
      if (password !== password2) { setError('As passwords não coincidem.'); return; }
      onSetupAdmin(nome, email, password);
    } else if (view === 'login') {
      onLogin(email, password);
    } else {
      if (password !== password2) { setError('As passwords não coincidem.'); return; }
      onRegisto(nome, email, password);
    }
  }

  function irRecuperar() { setView('recuperar'); setError(''); }
  function voltar() { setView('login'); setRecStep('inicio'); setRecEmail(''); setRecCode(''); setRecNovaPw(''); setRecMsg(''); setCodigoDemo(null); setError(''); }

  async function enviarCodigo(e) {
    e.preventDefault();
    setRecMsg(''); setError('');
    if (!emailValido(recEmail)) { setRecMsg('Introduza um email válido.'); return; }
    setAEnviar(true);
    const r = await onRecuperar(recEmail);
    setAEnviar(false);
    if (!r.ok) { setRecMsg(r.msg || 'Não foi possível pedir o código.'); return; }
    setCodigoDemo(r.mode === 'demo' ? r.code : null);
    setRecMsg(r.msg || '');
    setRecStep('pedido');
  }

  async function confirmarNova(e) {
    e.preventDefault();
    setRecMsg(''); setError('');
    if (!recCode || recCode.trim().length !== 6) { setRecMsg('Introduza o código de 6 dígitos recebido.'); return; }
    if (recNovaPw.length < 4) { setRecMsg('A nova password deve ter pelo menos 4 caracteres.'); return; }
    setAGuardar(true);
    const r = await onRecuperarConfirmar(recEmail, recCode.trim(), recNovaPw);
    setAGuardar(false);
    if (!r.ok) { setRecMsg(r.msg || 'Não foi possível definir a nova password. Peça um novo código.'); return; }
    voltar();
    setError(r.msg || 'Password recuperada. Entre com a nova password.');
  }

  return (
    <div className="fx-gate">
      <div className="fx-gate-panel">
        <div className="fx-gate-brand">
          {cfg.logo ? <img className="fx-gate-logo" src={cfg.logo} alt="Logo" /> : <div className="sq" />}
          <div className="tt">MozFutHouse</div>
        </div>

        <div className="fx-gate-box">
          {!isSetup && view === 'recuperar' ? (
              <div>
                <h2 className="fx-auth-title" style={{ marginBottom: 4 }}>Recuperar password</h2>
                <div className="fx-auth-sub" style={{ marginBottom: 20 }}>Receba um código de 6 dígitos por email para poder definir uma nova password.</div>
                {recStep === 'inicio' ? (
                  <form onSubmit={enviarCodigo}>
                    <div className="fx-field" style={{ marginBottom: 12 }}>
                      <label>Email da conta</label>
                      <input className="fx-input" type="email" autoFocus value={recEmail} onChange={e => setRecEmail(e.target.value)} placeholder="nome@email.com" />
                    </div>
                    {recMsg && <div className="fx-auth-error">{recMsg}</div>}
                    <button type="submit" className="fx-btn fx-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} disabled={aEnviar}>
                      {aEnviar ? 'A enviar…' : 'Enviar código'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={confirmarNova}>
                    {codigoDemo && (
                      <div className="fx-recovery-demo">
                        <div className="fx-recovery-code">{codigoDemo}</div>
                        <div className="fx-auth-sub">Modo demonstração — o servidor de email não está configurado, por isso o código aparece aqui em vez de ser enviado.</div>
                      </div>
                    )}
                    <div className="fx-field" style={{ marginBottom: 12 }}>
                      <label>Código (6 dígitos)</label>
                      <input className="fx-input" inputMode="numeric" maxLength={6} value={recCode} onChange={e => setRecCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" autoFocus />
                    </div>
                    <div className="fx-field" style={{ marginBottom: 12 }}>
                      <label>Nova password</label>
                      <input className="fx-input" type="password" value={recNovaPw} onChange={e => setRecNovaPw(e.target.value)} placeholder="mínimo 4 caracteres" />
                    </div>
                    {recMsg && <div className="fx-auth-error">{recMsg}</div>}
                    <button type="submit" className="fx-btn fx-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }} disabled={aGuardar}>
                      {aGuardar ? 'A guardar…' : 'Definir nova password'}
                    </button>
                  </form>
                )}
                <div className="fx-gate-foot">
                  <button type="button" className="fx-link-btn" onClick={voltar}><LogIn size={13} /> Voltar à entrada</button>
                </div>
              </div>
            ) : (
              <>
            {isSetup ? (
              <>
              <h2 className="fx-auth-title" style={{ marginBottom: 4 }}>Criar conta de Administrador</h2>
              <div className="fx-auth-sub" style={{ marginBottom: 20 }}>É a primeira vez aqui — crie o acesso principal que gere todo o campeonato.</div>
              </>
            ) : (
            <div className="fx-gate-tabs">
              <button type="button" className={view === 'login' ? 'active' : ''} onClick={() => { setView('login'); setError(''); }}><LogIn size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Entrar</button>
              <button type="button" className={view === 'registo' ? 'active' : ''} onClick={() => { setView('registo'); setError(''); }}><UserPlus size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />Criar conta pública</button>
            </div>
            )}

          <form onSubmit={submit}>
            {(isSetup || view === 'registo') && (
              <div className="fx-field" style={{ marginBottom: 12 }}>
                <label>Nome</label>
                <input className="fx-input" autoFocus value={nome} onChange={e => setNome(e.target.value)} placeholder="O seu nome" />
              </div>
            )}
            <div className="fx-field" style={{ marginBottom: 12 }}>
              <label>Email</label>
              <input className="fx-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@email.com" autoFocus={!isSetup && view === 'login'} />
            </div>
            <div className="fx-field" style={{ marginBottom: 12 }}>
              <label>Password</label>
              <input className="fx-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="mínimo 4 caracteres" />
            </div>
            {(isSetup || view === 'registo') && (
              <div className="fx-field" style={{ marginBottom: 12 }}>
                <label>Confirmar password</label>
                <input className="fx-input" type="password" value={password2} onChange={e => setPassword2(e.target.value)} />
              </div>
            )}
            {error && <div className="fx-auth-error">{error}</div>}
            <button type="submit" className="fx-btn fx-btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 6 }}>
              <ShieldCheck size={15} /> {isSetup ? 'Criar acesso de administrador' : view === 'login' ? 'Entrar' : 'Criar conta e entrar'}
            </button>
          </form>
          {!isSetup && view === 'login' && (
            <button type="button" className="fx-link-btn" style={{ marginTop: 10 }} onClick={irRecuperar}><KeyRound size={13} /> Esqueci-me da password</button>
          )}

          <div className="fx-gate-foot">
            {isSetup
              ? 'Depois de criada, esta conta pode registar Gestores (que só lançam resultados) e gerir todas as áreas do campeonato.'
              : view === 'login'
                ? 'Contas de Gestor e Administrador são criadas pela administração do campeonato. Se ainda não tem conta e quer apenas acompanhar os resultados, crie uma conta pública.'
                : 'A conta pública permite acompanhar equipes, calendário, classificação e estatísticas — sem acesso a edição.'}
          </div>
              </>
            )
          }
        </div>
      </div>
    </div>
  );
}

function ChangePasswordModal({ error, onClose, onSubmit }) {
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  function submit(e) { e.preventDefault(); onSubmit(currentPw, newPw); }
  return (
    <div className="fx-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="fx-authbox" onSubmit={submit}>
        <div className="fx-auth-head">
          <KeyRound size={20} />
          <div>
            <div className="fx-auth-title">Alterar password</div>
            <div className="fx-auth-sub">Confirme a password actual e defina uma nova</div>
          </div>
        </div>
        <div className="fx-field" style={{ marginBottom: 12 }}>
          <label>Password actual</label>
          <input className="fx-input" type="password" autoFocus value={currentPw} onChange={e => setCurrentPw(e.target.value)} />
        </div>
        <div className="fx-field" style={{ marginBottom: 12 }}>
          <label>Nova password</label>
          <input className="fx-input" type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="mínimo 4 caracteres" />
        </div>
        {error && <div className="fx-auth-error">{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button type="button" className="fx-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Cancelar</button>
          <button type="submit" className="fx-btn fx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}><Check size={15} /> Guardar</button>
        </div>
      </form>
    </div>
  );
}

function Utilizadores({ users, teams, players, matches, currentUser, addUser, error, setError, updateUsers, updateTeams, updatePlayers, updateMatches, onLogout, config, updateConfig, atualizarUtilizador, championships }) {
  const ask = useConfirm();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('gestor');
  const [champId, setChampId] = useState(championships[0]?.id || '');
  const [teamId, setTeamId] = useState('');
  const [importedMsg, setImportedMsg] = useState('');
  const [logo, setLogo] = useState(((config && config[0]) || {}).logo || '');
  const [editAlvo, setEditAlvo] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editChampId, setEditChampId] = useState('');
  const [editTeamId, setEditTeamId] = useState('');
  const [editPassword, setEditPassword] = useState('');

  function abrirEdicao(u) { setEditNome(u.nome); setEditEmail(u.email); setEditChampId(u.champId || (championships[0]?.id || '')); setEditTeamId(u.teamId || ''); setEditPassword(''); setEditAlvo(u); setError(''); }
  async function salvarEdicao() {
    const ok = await atualizarUtilizador(editAlvo.id, editNome, editEmail, editPassword,
      (editAlvo.role === 'associacao' || editAlvo.role === 'clube') ? editChampId : undefined,
      editAlvo.role === 'clube' ? editTeamId : undefined);
    if (ok) {
      setEditAlvo(null);
      setEditPassword('');
      setImportedMsg(editPassword ? 'Conta e password atualizadas.' : 'Conta atualizada.');
    }
  }

  async function submit() {
    const ok = await addUser(nome, email, password, role,
      (role === 'associacao' || role === 'clube') ? champId : undefined,
      role === 'clube' ? teamId : undefined);
    if (ok) { setEmail(''); setPassword(''); setNome(''); setImportedMsg(''); setChampId(championships[0]?.id || ''); setTeamId(''); }
  }

  async function handleRemove(id) {
    if (id === currentUser.id) { setError('Não pode remover a sua própria conta enquanto tem sessão iniciada.'); return; }
    const alvo = users.find(u => u.id === id);
    if (alvo?.role === 'admin' && users.filter(u => u.role === 'admin').length <= 1) { setError('Tem de existir pelo menos um Administrador.'); return; }
    if (!(await ask({ title: 'Remover acesso', message: `Remover o acesso de ${alvo?.nome || 'este utilizador'}? A conta deixará de poder entrar.`, danger: true, confirmLabel: 'Remover' }))) return;
    updateUsers(users.filter(u => u.id !== id));
    setError('');
  }

  function exportar() {
    const payload = { app: 'MozFutHouse', versao: 1, exportadoEm: new Date().toISOString(), teams, players, matches, users };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mozfuthouse-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setImportedMsg('Cópia de segurança exportada.');
  }

  async function importar(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || !['teams', 'players', 'matches', 'users'].every(k => Array.isArray(data[k]))) throw new Error('estrutura inválida');
      updateTeams(data.teams);
      updatePlayers(data.players);
      updateMatches(data.matches);
      updateUsers(data.users);
      if (!data.users.some(u => u.id === currentUser.id)) onLogout();
      setImportedMsg('Dados importados com sucesso.');
    } catch (e) {
      setImportedMsg('Não foi possível importar — verifique se é um ficheiro de backup válido.');
    }
  }

  function guardarLogo() {
    const cfg = (config && config[0]) || {};
    updateConfig([{ ...cfg, id: 'app', logo, atualizadoEm: new Date().toISOString() }]);
    setImportedMsg('Logo do sistema atualizado.');
  }

  function removerLogo() {
    setLogo('');
    const cfg = (config && config[0]) || {};
    updateConfig([{ ...cfg, id: 'app', logo: '', atualizadoEm: new Date().toISOString() }]);
    setImportedMsg('Logo removido — voltou o quadrado padrão.');
  }

  async function resetar() {
    if (!(await ask({ title: 'Repor todos os dados', message: 'Isto apaga equipes, jogadores, jogos, resultados e todas as contas. Esta ação não pode ser desfeita. Tenha a certeza de ter feito cópia de segurança.', danger: true, confirmLabel: 'Apagar tudo' }))) return;
    updateTeams([]);
    updatePlayers([]);
    updateMatches([]);
    updateUsers([]);
    onLogout();
  }

  const ROLE_RANK = { admin: 0, gestor: 1, associacao: 2, clube: 3, publico: 4 };
  const internos = users.filter(u => u.role !== 'publico');
  const ordenados = [...internos].sort((a, b) => (a.role === b.role ? a.nome.localeCompare(b.nome) : (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9)));
  const nomeChamp = (id) => (championships.find(c => c.id === id) || {}).nome || '—';
  const nomeTeam = (id) => (teams.find(t => t.id === id) || {}).name || '—';

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Utilizadores</h1><div className="fx-sub">Controlo de acessos: Administrador, Associação, Clube, Gestor e Público</div></div>
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Criar Gestor, Associação, Clube ou Administrador</h2>
        <div className="fx-sub" style={{ marginBottom: 14 }}>Contas públicas são criadas pelos próprios visitantes no ecrã de entrada — aqui cria apenas acessos internos. O perfil «Associação» fica ligado a um campeonato; o perfil «Clube» fica ligado a um campeonato e a uma equipa específica.</div>
        <div className="fx-form-row">
          <div className="fx-field"><label>Nome</label><input className="fx-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" /></div>
          <div className="fx-field"><label>Email</label><input className="fx-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" /></div>
          <div className="fx-field"><label>Password inicial</label><input className="fx-input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="mínimo 4 caracteres" /></div>
          <div className="fx-field"><label>Perfil</label>
            <select className="fx-select" value={role} onChange={e => { setRole(e.target.value); if (e.target.value === 'associacao' || e.target.value === 'clube') setChampId(c => c || (championships[0]?.id || '')); if (e.target.value === 'clube') setTeamId(''); }}>
              <option value="gestor">Gestor (só lança resultados)</option>
              <option value="associacao">Associação (campeonato próprio)</option>
              <option value="clube">Clube (campeonato + equipa)</option>
              <option value="admin">Administrador (acesso total)</option>
            </select>
          </div>
          {(role === 'associacao' || role === 'clube') && (
            <div className="fx-field"><label>Campeonato associado</label>
              <select className="fx-select" value={champId} onChange={e => { setChampId(e.target.value); if (role === 'clube') setTeamId(''); }}>
                {championships.length === 0 ? <option value="">— Sem campeonatos —</option> : championships.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.ano})</option>)}
              </select>
            </div>
          )}
          {role === 'clube' && champId && (
            <div className="fx-field"><label>Equipa do clube</label>
              <select className="fx-select" value={teamId} onChange={e => setTeamId(e.target.value)}>
                <option value="">— Selecionar equipa —</option>
                {teams.filter(t => (t.champIds || []).includes(champId)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {teams.filter(t => (t.champIds || []).includes(champId)).length === 0 && <div className="fx-note" style={{ marginTop: 4 }}>Nenhuma equipa inscrita neste campeonato — crie-a primeiro em Equipes.</div>}
            </div>
          )}
          <button className="fx-btn fx-btn-primary" onClick={submit}><UserPlus size={15} /> Criar acesso</button>
        </div>
        {error && <div className="fx-auth-error">{error}</div>}
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Contas registadas ({internos.length})</h2>
        <div className="fx-sub" style={{ marginBottom: 12 }}>Acessos criados pela administração (as contas públicas gerem-se no separador «Utilizadores Públicos»). Pode editar o nome e o email de cada conta. O email da conta de Administrador é também o remetente das mensagens de recuperação de password.</div>
        {ordenados.length === 0 ? <div className="fx-empty">Nenhuma conta encontrada</div> : (
          <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th></th></tr></thead>
            <tbody>
              {ordenados.map(u => (
                <tr key={u.id}>
                  <td>{u.nome}{u.id === currentUser.id && <span style={{ color: 'var(--ink-dim)', fontSize: '0.76rem' }}> (você)</span>}</td>
                  <td><Mail size={12} style={{ marginRight: 5, verticalAlign: 'middle', color: 'var(--ink-dim)' }} />{u.email}</td>
                  <td><span className={'fx-role-badge ' + u.role}>{ROLE_LABEL[u.role]}</span>{u.role === 'associacao' && <div style={{ fontSize: '0.76rem', color: 'var(--ink-dim)', marginTop: 3 }}>Campeonato: {nomeChamp(u.champId)}</div>}{u.role === 'clube' && <div style={{ fontSize: '0.76rem', color: 'var(--ink-dim)', marginTop: 3 }}>Campeonato: {nomeChamp(u.champId)}<br/>Equipa: {nomeTeam(u.teamId)}</div>}</td>
                  <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button className="fx-btn fx-btn-icon" title="Editar nome e email" onClick={() => abrirEdicao(u)}><Pencil size={13} /></button>
                    <button className="fx-btn fx-btn-icon fx-btn-danger" onClick={() => handleRemove(u.id)}><Trash2 size={14} /></button>
</td>
                  </tr>
                ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Identidade do sistema</h2>
        <div className="fx-note" style={{ marginBottom: 12 }}>Escolha uma imagem (logo) para aparecer no lugar do quadrado junto ao título do sistema.</div>
        <div className="fx-field-row" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="fx-logo-prev">
            {logo ? <img src={logo} alt="Logo" /> : <div className="sq" />}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ImageInput value={logo} onChange={setLogo} label="Escolher imagem" />
            {logo ? <button className="fx-btn" onClick={guardarLogo}><Save size={15} /> Guardar logo</button> : null}
            {logo ? <button className="fx-btn fx-btn-danger" onClick={removerLogo}><Trash2 size={15} /> Remover</button> : null}
          </div>
        </div>
        {!logo && <div className="fx-auth-error" style={{ marginTop: 10 }}>Ainda não há logo definido.</div>}
        {logo && <div className="fx-ok">{importedMsg === 'Logo do sistema atualizado.' ? importedMsg : 'Escolha uma imagem e clique em Guardar logo.'}</div>}
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Cópia de segurança</h2>
        <div className="fx-note" style={{ marginBottom: 12 }}>Exporte todos os dados do campeonato para um ficheiro JSON ou restaure a partir de um backup anterior.</div>
        <div className="fx-field-row">
          <button className="fx-btn" onClick={exportar}><FileJson size={15} /> Exportar dados</button>
          <label className="fx-btn" style={{ cursor: 'pointer' }}>
            <Upload size={15} /> Importar backup
            <input type="file" accept="application/json,.json" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files && e.target.files[0]; if (f) { importar(f); } e.target.value = ''; }} />
          </label>
        </div>
        {importedMsg && <div className="fx-ok">{importedMsg}</div>}
      </div>

      <div className="fx-panel fx-danger-zone">
        <h2 className="fx-panel-title">Zona de perigo</h2>
        <div className="fx-note" style={{ marginBottom: 12 }}>Apaga equipes, jogadores, jogos, resultados e contas de utilizador.</div>
        <button className="fx-btn fx-btn-danger" onClick={resetar}><Trash2 size={14} /> Repor tudo</button>
      </div>

      {editAlvo && (
        <form className="fx-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditAlvo(null); }}
          onSubmit={(e) => { e.preventDefault(); salvarEdicao(); }}>
          <div className="fx-authbox">
            <div className="fx-auth-head">
              <Pencil size={18} />
              <div>
                <div className="fx-auth-title">Editar utilizador</div>
                <div className="fx-auth-sub">Altere o nome, o email, a password e os dados associados da conta.</div>
              </div>
            </div>
            <div className="fx-field" style={{ marginBottom: 12 }}>
              <label>Nome</label>
              <input className="fx-input" value={editNome} onChange={e => setEditNome(e.target.value)} autoFocus />
            </div>
            <div className="fx-field" style={{ marginBottom: 12 }}>
              <label>Email</label>
              <input className="fx-input" type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} />
            </div>
            <div className="fx-field" style={{ marginBottom: 12 }}>
              <label><KeyRound size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} /> Nova password (opcional — deixe vazio para manter a atual)</label>
              <input className="fx-input" type="password" value={editPassword} onChange={e => setEditPassword(e.target.value)} placeholder="nova password" />
            </div>
            {(editAlvo.role === 'associacao' || editAlvo.role === 'clube') && (
              <div className="fx-field" style={{ marginBottom: 12 }}>
                <label>Campeonato associado</label>
                <select className="fx-select" value={editChampId} onChange={e => { setEditChampId(e.target.value); if (editAlvo.role === 'clube') setEditTeamId(''); }}>
                  {championships.length === 0 ? <option value="">— Sem campeonatos —</option> : championships.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.ano})</option>)}
                </select>
              </div>
            )}
            {editAlvo.role === 'clube' && editChampId && (
              <div className="fx-field" style={{ marginBottom: 12 }}>
                <label>Equipa do clube</label>
                <select className="fx-select" value={editTeamId} onChange={e => setEditTeamId(e.target.value)}>
                  <option value="">— Selecionar equipa —</option>
                  {teams.filter(t => (t.champIds || []).includes(editChampId)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            )}
            {error && <div className="fx-auth-error">{error}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button type="button" className="fx-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setEditAlvo(null)}>Cancelar</button>
              <button type="submit" className="fx-btn fx-btn-primary" style={{ flex: 1, justifyContent: 'center' }}><Check size={15} /> Guardar</button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function ControloPublico({ users, config, currentUser, updateUsers, logAcao, toggleBloqueio, setPermissao, removerPublico }) {
  const ask = useConfirm();
  const [filtro, setFiltro] = useState('');
  const publicos = users.filter(u => u.role === 'publico')
    .filter(u => !filtro || u.nome.toLowerCase().includes(filtro.toLowerCase()) || u.email.toLowerCase().includes(filtro.toLowerCase()))
    .slice().sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const bloqueadas = publicos.filter(u => u.bloqueado).length;
  const acoes = ((config && config[0] && config[0].acoes) || []).slice();

  async function confirmarRemocao(u) {
    if (u.id === currentUser?.id) return;
    if (!(await ask({ title: 'Remover conta pública', message: `Remover a conta de ${u.nome || u.email}? O utilizador deixará de poder entrar e perde as permissões atribuídas.`, danger: true, confirmLabel: 'Remover' }))) return;
    removerPublico(u);
  }

  const iconeTipo = (t) => {
    if (t === 'login') return <LogIn size={13} style={{ color: 'var(--win)' }} />;
    if (t === 'registo') return <UserPlus size={13} style={{ color: 'var(--accent)' }} />;
    if (t === 'bloqueou' || t === 'desbloqueou') return <Lock size={13} style={{ color: t === 'bloqueou' ? '#E5484D' : 'var(--win)' }} />;
    if (t === 'permissao') return <KeyRound size={13} style={{ color: 'var(--accent)' }} />;
    return <Trash2 size={13} style={{ color: '#E5484D' }} />;
  };

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Utilizadores Públicos</h1><div className="fx-sub">Controlo das contas registadas pelos visitantes, das suas permissões e do registo de atividades.</div></div>
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Contas públicas ({publicos.length}{bloqueadas ? ` · ${bloqueadas} bloqueada(s)` : ''})</h2>
        <div className="fx-field" style={{ maxWidth: 320, marginBottom: 12 }}>
          <input className="fx-input" placeholder="Procurar por nome ou email…" value={filtro} onChange={e => setFiltro(e.target.value)} />
        </div>
        {publicos.length === 0 ? <div className="fx-empty">Ainda não há contas públicas registadas.</div> : (
          <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr><th>Nome</th><th>Email</th><th>Estado</th><th>Último acesso</th><th>Permissões</th><th></th></tr></thead>
            <tbody>
              {publicos.map(u => (
                <tr key={u.id}>
                  <td><span className="fx-user-name-row">{u.nome}</span><div className="fx-clock">{new Date(u.criadoEm).toLocaleDateString('pt-PT')}</div></td>
                  <td>{u.email}</td>
                  <td>
                    <label className="fx-chk" title={u.bloqueado ? 'Desbloquear conta' : 'Bloquear conta'}>
                      <input type="checkbox" checked={!!u.bloqueado} onChange={() => toggleBloqueio(u)} />
                      <span>{u.bloqueado ? 'Bloqueada' : 'Ativa'}</span>
                    </label>
                  </td>
                  <td>{u.ultimoLogin ? <span className="fx-clock">{new Date(u.ultimoLogin).toLocaleString('pt-PT')}</span> : <span className="fx-clock">nunca</span>}</td>
                  <td>
                    <div className="fx-perm-grid">
                      {Object.keys(PERMS_LABEL).map(k => (
                        <label key={k} className="fx-chk" title={PERMS_LABEL[k]}>
                          <input type="checkbox" checked={!!((u.permissoes || {})[k])} onChange={() => setPermissao(u, k, !(u.permissoes || {})[k])} />
                          <span>{PERMS_LABEL[k]}</span>
                        </label>
                      ))}
                    </div>
                  </td>
                  <td>
                    <button className="fx-btn fx-btn-icon fx-btn-danger" title="Remover conta" onClick={() => confirmarRemocao(u)}><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Registo de atividades <span className="fx-chipsub">últimas ações</span></h2>
        {acoes.length === 0 ? <div className="fx-empty">Sem atividades registadas até agora.</div> : (
          <div className="fx-scroll">
          <div className="fx-log-list">
            {acoes.slice(0, 60).map(a => (
              <div key={a.id} className="fx-log-item">
                <span className="fx-log-ic">{iconeTipo(a.tipo)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div>{a.info}</div>
                  <div className="fx-clock">{a.atorNome} · <span style={{ fontSize: '0.72rem' }}>{new Date(a.data).toLocaleString('pt-PT')}</span></div>
                </div>
              </div>
            ))}
          </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdsShow({ ads }) {
  const ativas = (ads || []).filter(a => a.ativo).slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.nome.localeCompare(b.nome));
  const [idx, setIdx] = useState(0);
  const [mutedAll, setMutedAll] = useState(true);
  const currentId = useRef(null);

  const goNext = useCallback(() => {
    setIdx(i => (i + 1) % ativas.length);
  }, [ativas.length]);

  useEffect(() => {
    if (ativas.length <= 1) return;
    const i = idx % ativas.length;
    const a = ativas[i];
    if (a.id !== currentId.current) currentId.current = a.id;
    const isVideo = !!(a.video && a.video.trim());
    const t = setTimeout(goNext, isVideo ? 90000 : 4000);
    return () => clearTimeout(t);
  }, [idx, ativas, goNext]);

  useEffect(() => {
    if (ativas.length > 0 && idx >= ativas.length) setIdx(0);
  }, [ativas.length, idx]);

  if (!ativas.length) return null;
  const a = ativas[idx % ativas.length];
  const isVideo = !!(a.video && a.video.trim());
  const go = (d) => setIdx(i => (i + d + ativas.length) % ativas.length);

  return (
    <div className="fx-ads">
      <div className="fx-ads-head"><Megaphone size={15} /> Parceiros / Publicidade</div>
      <div className="fx-adslider">
        <button className="fx-ads-arrow" type="button" onClick={() => go(-1)} title="Anterior">‹</button>
        <div className="fx-adslider-item">
          {isVideo ? (
            <div className="fx-adv">
              <video
                key={a.id}
                src={a.video}
                className="fx-adimg fx-advideo"
                muted={mutedAll}
                autoPlay
                playsInline
                preload="metadata"
                onEnded={() => { if (currentId.current === a.id) goNext(); }}
              />
              <button
                type="button"
                className="fx-ads-mute"
                title={mutedAll ? 'Ativar som' : 'Silenciar'}
                onClick={() => setMutedAll(m => !m)}
              >
                {mutedAll ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
            </div>
          ) : (
            <a href={a.url} target="_blank" rel="noreferrer" title="Abrir site do parceiro" style={{ display: 'block', textDecoration: 'none' }}>
              {a.imagem ? (
                <img src={a.imagem} alt={a.nome} className="fx-adimg" />
              ) : (
                <div className="fx-adimg fx-adimg-fallback">{a.nome}</div>
              )}
            </a>
          )}
          <div className="fx-ads-name">{a.nome}{isVideo && <span className="fx-ads-videotag">vídeo</span>}</div>
        </div>
        <button className="fx-ads-arrow" type="button" onClick={() => go(1)} title="Seguinte">›</button>
      </div>
      {ativas.length > 1 && (
        <div className="fx-ads-dots">
          {ativas.map((x, i) => (
            <button key={x.id} type="button" className={i === (idx % ativas.length) ? 'fx-ads-dot on' : 'fx-ads-dot'} onClick={() => setIdx(i)} title={x.nome} />
          ))}
        </div>
      )}
    </div>
  );
}

function Inicio({ teams, players, matches, standings, artilheiros, destaque, proximoJogo, rodadaAtual, teamName, teamFoto, ads, updateMatches, gestao, myTeamId, convPapel = 'outro' }) {
  const jogados = matches.filter(m => m.status === 'realizado').length;
  const lider = standings[0];
  const [verConv, setVerConv] = useState(null);
  const proximos = useMemo(() => matches
    .filter(m => m.status === 'agendado' && m.data && (!myTeamId || m.mandante === myTeamId || m.visitante === myTeamId))
    .slice().sort((a, b) => (a.data + (a.hora || '')).localeCompare(b.data + (b.hora || ''))), [matches, myTeamId]);
  return (
    <div>
      <div className="fx-top">
        <div>
          <h1 className="fx-h1">Painel do campeonato</h1>
          <div className="fx-sub">{myTeamId ? `Gestão da equipa ${teamName(myTeamId)} · ${proximos.length} jogos desta equipa` : 'Visão geral de equipes, jogos e desempenho'}</div>
        </div>
      </div>

      <AdsShow ads={ads} />

      <div className="fx-grid3" style={{ marginBottom: 20 }}>
        <div className="fx-stat"><div className="n">{teams.length}</div><div className="l">Equipes inscritas</div></div>
        <div className="fx-stat"><div className="n">{jogados}/{matches.length}</div><div className="l">Jogos realizados</div></div>
        <div className="fx-stat"><div className="n">{rodadaAtual || '—'}</div><div className="l">Rodada mais recente</div></div>
      </div>

      <div className="fx-grid2">
        <div className="fx-panel">
          <h2 className="fx-panel-title">Próximos jogos <span className="fx-chipsub">clique para ver convocados e escalação</span></h2>
          {proximos.length === 0 ? <div className="fx-empty">Nenhum jogo agendado</div> : (
            <div className="fx-scroll">
            <div className="fx-prox-list">
              {proximos.map(m => {
                const temConv = [m.mandante, m.visitante].some(tId => ((m.convocados || {})[tId] || []).length > 0);
                return (
                  <button key={m.id} type="button" className="fx-prox-item" onClick={() => setVerConv(m.id)} title="Ver convocados e escalação">
                    <div className="fx-prox-teams">{teamName(m.mandante)} <span className="fx-prox-vs">×</span> {teamName(m.visitante)}</div>
                    <div className="fx-prox-meta">Rodada {m.rodada} · {m.data} {m.hora || ''} · {m.local || 'local a definir'}</div>
                    {m.relogio && m.relogio.estado && m.relogio.estado !== 'pre' && m.status !== 'realizado' && <div className="fx-prox-relogio"><RelogioJogo match={m} gestao={false} onChange={() => {}} /></div>}
                    <div className="fx-prox-cta"><Users size={13} /> {temConv ? 'convocados e escalação' : 'definir escalação'}</div>
                  </button>
                );
              })}
            </div>
            </div>
          )}
        </div>

        <div className="fx-panel">
          <h2 className="fx-panel-title">Destaques</h2>
          {lider && (
            <div style={{ marginBottom: 12, fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--ink-dim)' }}>Líder da classificação: </span>
              <strong>{lider.nome}</strong> <span style={{ color: 'var(--ink-dim)' }}>({lider.pts} pts)</span>
            </div>
          )}
          {artilheiros[0] && (
            <div style={{ marginBottom: 12, fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--ink-dim)' }}>Artilheiro: </span>
              <strong>{artilheiros[0].nome}</strong> <span style={{ color: 'var(--ink-dim)' }}>({artilheiros[0].gols} gols · {artilheiros[0].time})</span>
            </div>
          )}
          {destaque && destaque.jogos > 0 && (
            <div style={{ fontSize: '0.88rem' }}>
              <span style={{ color: 'var(--ink-dim)' }}>Melhor jogador: </span>
              <strong>{destaque.nome}</strong> <span style={{ color: 'var(--ink-dim)' }}>(índice {destaque.indice.toFixed(1)})</span>
            </div>
          )}
          {!lider && !artilheiros[0] && <div className="fx-empty">Sem dados suficientes ainda</div>}
        </div>
      </div>

      {verConv && (() => {
        const m = matches.find(x => x.id === verConv);
        if (!m) return null;
        return (
          <EscalacaoModal
            key={m.id}
            match={m}
            players={players}
            matches={matches}
            teamName={teamName}
            editable={!!gestao}
            myTeamId={myTeamId}
            convPapel={convPapel}
            onSave={(conv) => { updateMatches(matches.map(x => x.id === m.id ? { ...x, convocados: conv } : x)); setVerConv(null); }}
            onClose={() => setVerConv(null)}
          />
        );
      })()}
    </div>
  );
}

function ColorInput({ value, onChange }) {
  return (
    <div className="fx-color-row">
      {CORES_TIME.map(c => (
        <button key={c} type="button" className={value === c ? 'active' : ''} style={{ background: c }} onClick={() => onChange(c)} aria-label={'Cor ' + c} />
      ))}
      <label className="fx-color-custom" title="Cor personalizada" style={{ background: value }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function ChampPick({ championships, value, onChange }) {
  if (!championships.length) return null;
  const set = new Set(value || []);
  const toggle = (id) => { const s = new Set(set); if (s.has(id)) s.delete(id); else s.add(id); onChange([...s]); };
  const nivel = (c) => CHAMP_NIVEIS.find(n => n.id === c.nivel)?.label || c.nivel;
  return (
    <div style={{ marginTop: 14 }}>
      <div className="fx-field-label" style={{ fontSize: '0.74rem', color: 'var(--ink-dim)', marginBottom: 6 }}>Campeonatos desta equipe</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {championships.map(c => (
          <label key={c.id} className="fx-chk" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--line)', borderRadius: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={set.has(c.id)} onChange={() => toggle(c.id)} />
            {c.nome} <span className="fx-chipsub">· {c.ano} · {nivel(c)}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Equipes({ teams, players, matches, updateTeams, updatePlayers, updateMatches, gestao, championships, activeChampId, lockedChamp }) {
  const ask = useConfirm();
  const [form, setForm] = useState({ name: '', cidade: '', tecnico: '', cor: CORES_TIME[0], foto: '', champIds: [] });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [filterChamp, setFilterChamp] = useState(activeChampId || 'todos');
  const nomeChamp = (id) => (championships.find(c => c.id === id) || {}).nome;

  useEffect(() => { setFilterChamp(lockedChamp || activeChampId || 'todos'); }, [activeChampId, lockedChamp]);

  const lista = teams.filter(t => filterChamp === 'todos' || (t.champIds || []).includes(filterChamp));

  function setChampFilter(v) {
    if (lockedChamp) return;
    setFilterChamp(v);
    if (v && v !== 'todos') setForm(f => ({ ...f, champIds: [...new Set([...(f.champIds || []), v])] }));
  }

  function addTeam() {
    if (!form.name.trim()) return;
    const base = lockedChamp ? [lockedChamp] : (filterChamp && filterChamp !== 'todos' ? [...new Set([filterChamp, ...(form.champIds || [])])] : (form.champIds || []));
    updateTeams([...teams, { id: uid('team'), name: form.name.trim(), cidade: form.cidade.trim(), tecnico: form.tecnico.trim(), cor: form.cor, foto: form.foto || '', champIds: base, criadoEm: new Date().toISOString() }]);
    setForm({ name: '', cidade: '', tecnico: '', cor: CORES_TIME[(teams.length + 1) % CORES_TIME.length], foto: '', champIds: lockedChamp ? [lockedChamp] : (filterChamp && filterChamp !== 'todos' ? [filterChamp] : []) });
  }
  function startEdit(t) { setEditId(t.id); setEditForm({ ...t, champIds: t.champIds || [] }); }
  function saveEdit() {
    updateTeams(teams.map(t => t.id === editId ? { ...editForm, champIds: lockedChamp ? [lockedChamp] : (editForm.champIds || []) } : t));
    setEditId(null);
  }
  async function removeTeam(id) {
    if (!(await ask({ title: 'Remover equipe', message: 'Remover esta equipe também remove os seus jogadores e os jogos associados. Continuar?', danger: true, confirmLabel: 'Remover' }))) return;
    updateTeams(teams.filter(t => t.id !== id));
    updatePlayers(players.filter(p => p.teamId !== id));
    updateMatches(matches.filter(m => m.mandante !== id && m.visitante !== id));
  }

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Equipes</h1><div className="fx-sub">Registo das equipes do campeonato</div></div>
      </div>

      {gestao && (
        <div className="fx-panel">
          <h2 className="fx-panel-title">Nova equipe</h2>
          <div className="fx-form-row">
            <div className="fx-field"><label>Nome</label><input className="fx-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nome da equipe" /></div>
            <div className="fx-field"><label>Cidade</label><input className="fx-input" value={form.cidade} onChange={e => setForm({ ...form, cidade: e.target.value })} placeholder="Cidade" /></div>
            <div className="fx-field"><label>Treinador</label><input className="fx-input" value={form.tecnico} onChange={e => setForm({ ...form, tecnico: e.target.value })} placeholder="Nome do treinador" /></div>
            <div className="fx-field"><label>Cor</label><ColorInput value={form.cor} onChange={cor => setForm({ ...form, cor })} /></div>
          </div>
          <ImageInput value={form.foto} onChange={foto => setForm({ ...form, foto })} label="Foto / escudo da equipe" shape="square" maxDim={260} quality={0.75} fallbackColor={form.cor} initials={(form.name || 'EQ').slice(0, 2).toUpperCase()} />
          {lockedChamp ? <div className="fx-note" style={{ marginBottom: 6 }}>A equipa será registada no campeonato: <strong>{nomeChamp(lockedChamp)}</strong></div> : <ChampPick championships={championships} value={form.champIds} onChange={champIds => setForm({ ...form, champIds })} />}
          <div style={{ marginTop: 14 }}>
            <button className="fx-btn fx-btn-primary" onClick={addTeam}><Plus size={15} /> Adicionar equipe</button>
          </div>
        </div>
      )}

      <div className="fx-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <h2 className="fx-panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>Equipes registadas ({lista.length})</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            {lockedChamp ? <span className="fx-tag">{nomeChamp(lockedChamp)}</span> : (
              <select className="fx-select" value={filterChamp} onChange={e => setChampFilter(e.target.value)}>
                <option value="todos">Todos os campeonatos</option>
                {championships.map(c => <option key={c.id} value={c.id}>{c.nome} ({c.ano})</option>)}
              </select>
            )}
          </div>
        </div>
        {lista.length === 0 ? <div className="fx-empty">{teams.length === 0 ? 'Nenhuma equipe registada ainda' : 'Nenhuma equipe neste campeonato'}</div> : (
          <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr><th>Equipe</th><th>Campeonatos</th><th>Cidade</th><th>Treinador</th><th className="num">Jogadores</th>{gestao && <th></th>}</tr></thead>
            <tbody>
              {lista.map(t => (
                editId === t.id ? (
                  <tr key={t.id}>
                    <td colSpan={gestao ? 6 : 5}>
                      <div className="fx-form-row" style={{ marginBottom: 12 }}>
                        <div className="fx-field"><label>Nome</label><input className="fx-input" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} /></div>
                        <div className="fx-field"><label>Cidade</label><input className="fx-input" value={editForm.cidade} onChange={e => setEditForm({ ...editForm, cidade: e.target.value })} /></div>
                        <div className="fx-field"><label>Treinador</label><input className="fx-input" value={editForm.tecnico} onChange={e => setEditForm({ ...editForm, tecnico: e.target.value })} /></div>
                        <div className="fx-field"><label>Cor</label><ColorInput value={editForm.cor} onChange={cor => setEditForm({ ...editForm, cor })} /></div>
                      </div>
                      <ImageInput value={editForm.foto} onChange={foto => setEditForm({ ...editForm, foto })} label="Foto / escudo" shape="square" maxDim={260} quality={0.75} fallbackColor={editForm.cor} initials={(editForm.name || 'EQ').slice(0, 2).toUpperCase()} />
                      {lockedChamp ? <div className="fx-note" style={{ marginBottom: 6 }}>Campeonato fixo: <strong>{nomeChamp(lockedChamp)}</strong></div> : <ChampPick championships={championships} value={editForm.champIds || []} onChange={champIds => setEditForm({ ...editForm, champIds })} />}
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="fx-btn fx-btn-primary" onClick={saveEdit}><Check size={14} /> Guardar</button>
                        <button className="fx-btn" onClick={() => setEditId(null)}><X size={14} /> Cancelar</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id}>
                    <td><div className="fx-namecell"><Avatar src={t.foto} size={28} shape="square" fallbackColor={t.cor} initials={t.name.slice(0, 2).toUpperCase()} />{t.name}</div></td>
                    <td>{(t.champIds || []).length === 0 ? <span style={{ color: 'var(--ink-dim)' }}>—</span> : <span style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>{(t.champIds || []).map(id => <span key={id} className="fx-tag">{nomeChamp(id)}</span>)}</span>}</td>
                    <td>{t.cidade || '—'}</td>
                    <td>{t.tecnico || '—'}</td>
                    <td className="num">{players.filter(p => p.teamId === t.id).length}</td>
                    {gestao && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="fx-btn fx-btn-icon" onClick={() => startEdit(t)}><Pencil size={14} /></button>
                        <button className="fx-btn fx-btn-icon fx-btn-danger" onClick={() => removeTeam(t.id)}><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Jogadores({ teams, players, updatePlayers, teamName, teamColor, gestao, myTeamId }) {
  const ask = useConfirm();
  const souClube = !!myTeamId;
  const [form, setForm] = useState({ nome: '', numero: '', posicao: POSICOES[0], teamId: souClube ? myTeamId : (teams[0]?.id || ''), foto: '' });
  const [filterTeam, setFilterTeam] = useState(souClube ? myTeamId : 'todas');
  const [filterPos, setFilterPos] = useState('todas');
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  useEffect(() => { if (souClube) setForm(f => ({ ...f, teamId: myTeamId })); else if (!form.teamId && teams[0]) setForm(f => ({ ...f, teamId: teams[0].id })); }, [teams, souClube, myTeamId]);

  function addPlayer() {
    if (!form.nome.trim() || !form.teamId) return;
    updatePlayers([...players, { id: uid('player'), nome: form.nome.trim(), numero: form.numero, posicao: form.posicao, teamId: form.teamId, foto: form.foto || '', criadoEm: new Date().toISOString() }]);
    setForm({ ...form, nome: '', numero: '', foto: '' });
  }
  function startEdit(p) { setEditId(p.id); setEditForm({ ...p }); }
  function saveEdit() { updatePlayers(players.map(p => p.id === editId ? { ...editForm } : p)); setEditId(null); }
  async function removePlayer(id) {
    if (!(await ask({ title: 'Remover jogador', message: 'Remover este jogador? Os seus gols/cartões registados em jogos permanecerão como histórico.', danger: true, confirmLabel: 'Remover' }))) return;
    updatePlayers(players.filter(p => p.id !== id));
  }

  const lista = players.filter(p =>
    (souClube ? p.teamId === myTeamId : (filterTeam === 'todas' || p.teamId === filterTeam)) &&
    (filterPos === 'todas' || p.posicao === filterPos)
  );

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Jogadores</h1><div className="fx-sub">{souClube ? 'Equipa do clube — registar e gerir atletas' : 'Registo de atletas por equipe'}</div></div>
      </div>

      {gestao && (
        <div className="fx-panel">
          <h2 className="fx-panel-title">Novo jogador</h2>
          {teams.length === 0 ? <div className="fx-empty">Registe primeiro uma equipe</div> : (
            <>
              <div className="fx-form-row">
                <div className="fx-field"><label>Nome</label><input className="fx-input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Nome do jogador" /></div>
                <div className="fx-field"><label>Número</label><input className="fx-input" style={{ width: 70 }} value={form.numero} onChange={e => setForm({ ...form, numero: e.target.value })} placeholder="Nº" /></div>
                <div className="fx-field"><label>Posição</label>
                  <select className="fx-select" value={form.posicao} onChange={e => setForm({ ...form, posicao: e.target.value })}>
                    {POSICOES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                {souClube ? (
                  <div className="fx-field"><label>Equipe</label>
                    <input className="fx-input" value={teamName(myTeamId)} disabled />
                  </div>
                ) : (
                  <div className="fx-field"><label>Equipe</label>
                    <select className="fx-select" value={form.teamId} onChange={e => setForm({ ...form, teamId: e.target.value })}>
                      {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <ImageInput value={form.foto} onChange={foto => setForm({ ...form, foto })} label="Foto do jogador" shape="circle" maxDim={180} quality={0.65} fallbackColor={teamColor(form.teamId)} initials={(form.nome || 'J').slice(0, 2).toUpperCase()} />
              <div style={{ marginTop: 14 }}>
                <button className="fx-btn fx-btn-primary" onClick={addPlayer}><Plus size={15} /> Adicionar jogador</button>
              </div>
            </>
          )}
        </div>
      )}

      <div className="fx-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <h2 className="fx-panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>Jogadores ({lista.length}){souClube && <span className="fx-chip" style={{ marginLeft: 8 }}>{teamName(myTeamId)}</span>}</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <select className="fx-select" value={filterPos} onChange={e => setFilterPos(e.target.value)}>
              <option value="todas">Todas as posições</option>
              {POSICOES.map(x => <option key={x} value={x}>{x}</option>)}
            </select>
            {!souClube && (
              <select className="fx-select" value={filterTeam} onChange={e => setFilterTeam(e.target.value)}>
                <option value="todas">Todas as equipes</option>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            )}
          </div>
        </div>
        {lista.length === 0 ? <div className="fx-empty">{souClube ? 'Nenhum jogador registado na sua equipa' : 'Nenhum jogador encontrado'}</div> : (
          <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr><th className="num">Nº</th><th>Nome</th><th>Posição</th>{!souClube && <th>Equipe</th>}{gestao && <th></th>}</tr></thead>
            <tbody>
              {lista.map(p => (
                editId === p.id ? (
                  <tr key={p.id}>
                    <td colSpan={gestao ? (souClube ? 4 : 5) : (souClube ? 3 : 4)}>
                      <div className="fx-form-row" style={{ marginBottom: 12 }}>
                        <div className="fx-field"><label>Número</label><input className="fx-input" style={{ width: 60 }} value={editForm.numero} onChange={e => setEditForm({ ...editForm, numero: e.target.value })} /></div>
                        <div className="fx-field"><label>Nome</label><input className="fx-input" value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} /></div>
                        <div className="fx-field"><label>Posição</label>
                          <select className="fx-select" value={editForm.posicao} onChange={e => setEditForm({ ...editForm, posicao: e.target.value })}>
                            {POSICOES.map(x => <option key={x} value={x}>{x}</option>)}
                          </select>
                        </div>
                        {souClube ? (
                          <div className="fx-field"><label>Equipe</label><input className="fx-input" value={teamName(myTeamId)} disabled /></div>
                        ) : (
                          <div className="fx-field"><label>Equipe</label>
                            <select className="fx-select" value={editForm.teamId} onChange={e => setEditForm({ ...editForm, teamId: e.target.value })}>
                              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                          </div>
                        )}
                      </div>
                      <ImageInput value={editForm.foto} onChange={foto => setEditForm({ ...editForm, foto })} label="Foto" shape="circle" maxDim={180} quality={0.65} fallbackColor={teamColor(editForm.teamId)} initials={(editForm.nome || 'J').slice(0, 2).toUpperCase()} />
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        <button className="fx-btn fx-btn-primary" onClick={saveEdit}><Check size={14} /> Guardar</button>
                        <button className="fx-btn" onClick={() => setEditId(null)}><X size={14} /> Cancelar</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={p.id}>
                    <td className="num">{p.numero || '—'}</td>
                    <td><div className="fx-namecell"><Avatar src={p.foto} size={28} shape="circle" fallbackColor={teamColor(p.teamId)} initials={p.nome.slice(0, 2).toUpperCase()} />{p.nome}</div></td>
                    <td>{p.posicao}</td>
                    {!souClube && <td><span className="fx-chip" style={{ background: teamColor(p.teamId) }} />{teamName(p.teamId)}</td>}
                    {gestao && (
                      <td style={{ display: 'flex', gap: 6 }}>
                        <button className="fx-btn fx-btn-icon" onClick={() => startEdit(p)}><Pencil size={14} /></button>
                        <button className="fx-btn fx-btn-icon fx-btn-danger" onClick={() => removePlayer(p.id)}><Trash2 size={14} /></button>
                      </td>
                    )}
                  </tr>
                )
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

const CONV_STATUS = [
  { v: 'titular', l: 'Titular' },
  { v: 'banco', l: 'Suplente (banco)' },
  { v: 'lesionado', l: 'Lesionado' },
  { v: 'suspA', l: 'Suspenso (acumulação)' },
  { v: 'suspV', l: 'Suspenso (vermelho direto)' },
];

function RelogioJogo({ match, gestao, onChange }) {
  const [agora, setAgora] = useState(Date.now());
  const r = (match && match.relogio) || {};
  const estado = REL_STATES[r.estado] ? r.estado : 'pre';
  const eh2 = (r.parte || 1) === 2;
  const label = estado === 'jogo' ? (eh2 ? '2º tempo' : '1º tempo') : REL_STATES[estado].l;
  useEffect(() => {
    if (estado !== 'jogo') return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [estado]);
  const propsAtual = { ...(match && match.relogio), acumulado: relSeg(match) };
  const setR = (props) => onChange({ ...(match && match.relogio), ...props });
  const comecar = () => setR({ estado: 'jogo', inicio: new Date().toISOString(), acumulado: 0, parte: (r.parte || 1) });
  const continuar = () => setR({ estado: 'jogo', inicio: new Date().toISOString(), acumulado: relSeg(match), parte: (r.parte || 1) });
  const parar = () => setR({ estado: 'pausa', inicio: null, acumulado: relSeg(match) });
  const intervalo = () => setR({ estado: 'intervalo', inicio: null, acumulado: relSeg(match) });

  return (
    <span className="fx-relogio" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span className={'fx-tag ' + (REL_STATES[estado] ? REL_STATES[estado].cl : '')} style={{ ...(estado === 'jogo' ? { color: 'var(--win)', borderColor: 'var(--win)' } : {}) }}>
        <Clock size={12} style={{ verticalAlign: 'middle', marginRight: 4 }} />{label} · <strong>{fmtTempo(relSeg(match))}</strong>
      </span>
      {gestao && estado !== 'realizado' && (
        <span style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          {(estado === 'pre') && <button className="fx-btn fx-btn-primary fx-btn-sm" onClick={comecar}><Play size={12} /> Começar jogo</button>}
          {estado === 'jogo' && <>
            <button className="fx-btn fx-btn-sm" onClick={parar}><Pause size={12} /> Parar tempo</button>
            <button className="fx-btn fx-btn-sm" onClick={intervalo}><TimerReset size={12} /> Intervalo</button>
          </>}
          {estado === 'pausa' && <>
            <button className="fx-btn fx-btn-primary fx-btn-sm" onClick={continuar}><Play size={12} /> Continuar</button>
            <button className="fx-btn fx-btn-sm" onClick={intervalo}><TimerReset size={12} /> Intervalo</button>
          </>}
          {estado === 'intervalo' && <button className="fx-btn fx-btn-primary fx-btn-sm" onClick={() => setR({ estado: 'jogo', inicio: new Date().toISOString(), acumulado: relSeg(match), parte: 2 })}><Play size={12} /> Começar 2º tempo</button>}
        </span>
      )}
    </span>
  );
}

function EscalacaoModal({ match, players, matches, teamName, editable, myTeamId, onSave, onClose, convPapel = 'outro' }) {
  const podeEditar = editable && match.status !== 'realizado';
  const [draft, setDraft] = useState(() => {
    const base = {};
    [match.mandante, match.visitante].forEach(tId => { base[tId] = (match.convocados || {})[tId] || []; });
    return base;
  });
  const canEditTeam = (tId) => (myTeamId ? tId === myTeamId : true) && podeEditar;
  const suspOriginal = (tId, pId) => {
    const e = (match.convocados || {})[tId] || [];
    const st = (e.find(x => x.jogadorId === pId) || {}).status;
    return (st === 'suspA' || st === 'suspV') ? st : null;
  };
  const teveVermelho = (pId) => matches.some(mx => mx.status === 'realizado' && (mx.eventos || []).some(e => e.jogadorId === pId && e.tipo === 'vermelho'));
  function setConv(tId, pId, status) {
    if (!podeEditar || (myTeamId && tId !== myTeamId)) return;
    if (convPapel === 'clube' && suspOriginal(tId, pId)) return;
    setDraft(d => {
      const cur = (d[tId] || []).filter(x => x.jogadorId !== pId);
      const next = status === 'nao' ? cur : [...cur, { jogadorId: pId, status }];
      return { ...d, [tId]: next };
    });
  }
  const stOf = (p, tId) => ((draft[tId] || []).find(x => x.jogadorId === p.id) || {}).status || 'nao';
  const opcoes = convPapel === 'associacao'
    ? [{ v: 'nao', l: 'Sem suspensão' }, { v: 'suspA', l: 'Suspenso (acumulação)' }, { v: 'suspV', l: 'Suspenso (vermelho direto)' }]
    : convPapel === 'clube'
      ? [{ v: 'nao', l: 'Não convocado' }, { v: 'titular', l: 'Titular' }, { v: 'banco', l: 'Suplente (banco)' }, { v: 'lesionado', l: 'Lesionado' }]
      : [{ v: 'nao', l: 'Não convocado' }, ...CONV_STATUS];
  const valorAssoc = (p, tId) => {
    const s = stOf(p, tId);
    return (s === 'suspA' || s === 'suspV') ? s : 'nao';
  };
  return (
    <div className="fx-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="fx-authbox fx-convbox">
        <div className="fx-auth-head">
          <Users size={20} />
          <div>
            <div className="fx-auth-title">Convocados e escalação</div>
            <div className="fx-auth-sub">{teamName(match.mandante)} × {teamName(match.visitante)} · {new Date(match.data + (match.hora ? 'T' + match.hora : '')).toLocaleDateString('pt-PT')} · rodada {match.rodada}</div>
          </div>
        </div>
        {convPapel === 'associacao' && (
          <div className="fx-note" style={{ marginBottom: 12 }}>A Associação apenas declara suspensões (acumulação ou vermelho direto). O clube não pode escalar um atleta declarado suspenso.</div>
        )}
        {[match.mandante, match.visitante].map(tId => {
          const canEdit = canEditTeam(tId);
          const roleEquipa = convPapel === 'clube' && !!myTeamId && tId === myTeamId;
          return (
          <div key={tId} style={{ marginBottom: 14 }}>
            <div className="fx-conv-team">{teamName(tId)}{myTeamId && tId === myTeamId && <span className="fx-tag" style={{ marginLeft: 6 }}>a minha equipa</span>}</div>
            {players.filter(p => p.teamId === tId).length === 0 ? (
              <div className="fx-empty" style={{ padding: '6px 0' }}>Sem jogadores registados nesta equipe.</div>
            ) : players.filter(p => p.teamId === tId).map(p => {
              const st = stOf(p, tId);
              const susp = suspOriginal(tId, p.id);
              const bloqClube = convPapel === 'clube' && susp;
              return (
                <div className="fx-conv-row" key={p.id}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {p.nome}
                    {canEdit && !bloqClube && convPapel !== 'associacao' && teveVermelho(p.id) && <span className="fx-tag r" style={{ marginLeft: 6 }}>vermelho recente</span>}
                    {bloqClube && <span className="fx-tag r" style={{ marginLeft: 6 }}>suspenso pela Associação</span>}
                  </div>
                  {bloqClube ? (
                    <span className="fx-tag" style={{ color: '#E5484D' }}>{CONV_STATUS.find(x => x.v === susp)?.l || susp}</span>
                  ) : canEdit ? (
                    <select className="fx-select" value={convPapel === 'associacao' ? valorAssoc(p, tId) : st} onChange={e => setConv(tId, p.id, e.target.value)}>
                      {opcoes.map(s => <option key={s.v} value={s.v}>{s.l}</option>)}
                    </select>
                  ) : (
                    <span className="fx-tag" style={{ color: st === 'nao' ? 'var(--ink-dim)' : undefined }}>{st === 'nao' ? 'Não convocado' : CONV_STATUS.find(x => x.v === st)?.l || st}</span>
                  )}
                </div>
              );
            })}
          </div>
          );
        })}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button className="fx-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={onClose}>Fechar</button>
          {podeEditar && <button className="fx-btn fx-btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => onSave(draft)}><Check size={15} /> Guardar escalação</button>}
        </div>
      </div>
    </div>
  );
}

function Calendario({ teams, players, matches, updateMatches, teamName, teamColor, teamFoto, gestao, gestaoConvocados2, championships, activeChamp, onSelect, champNivel, myTeamId, gestaoOps, convPapel = 'outro' }) {
  const ask = useConfirm();
  const playerNome = (id) => (players.find(p => p.id === id) || {}).nome || '—';
  const [form, setForm] = useState({ rodada: 1, data: '', hora: '', local: '', mandante: '', visitante: '' });
  const [streamEditId, setStreamEditId] = useState(null);
  const [streamDraft, setStreamDraft] = useState({ streamUrl: '', streamOn: false });
  const [adiarId, setAdiarId] = useState(null);
  const [adiarDraft, setAdiarDraft] = useState({ data: '', hora: '', local: '' });
  const [woId, setWoId] = useState(null);
  const [convId, setConvId] = useState(null);
  const souClube = !!myTeamId;

  const lista = activeChamp ? matches.filter(m => m.champId === activeChamp.id) : matches;
  const listaVisivel = souClube ? lista.filter(m => m.mandante === myTeamId || m.visitante === myTeamId) : lista;
  const timesDoChamp = activeChamp ? teams.filter(t => (t.champIds || []).includes(activeChamp.id)) : teams;

  useEffect(() => {
    if (timesDoChamp.length >= 2 && !form.mandante) setForm(f => ({ ...f, mandante: timesDoChamp[0].id, visitante: timesDoChamp[1].id }));
    else if (timesDoChamp.length < 2 && form.mandante && !timesDoChamp.some(t => t.id === form.mandante)) setForm(f => ({ ...f, mandante: '', visitante: '' }));
  }, [timesDoChamp]);

  function addMatch() {
    if (!form.mandante || !form.visitante || form.mandante === form.visitante || !form.data) return;
    updateMatches([...matches, {
      id: uid('match'), rodada: Number(form.rodada) || 1, data: form.data, hora: form.hora, local: form.local,
      mandante: form.mandante, visitante: form.visitante, status: 'agendado', golsMandante: 0, golsVisitante: 0,
      champId: activeChamp ? activeChamp.id : '', eventos: [], avaliacoes: [], streamUrl: '', streamOn: false, criadoEm: new Date().toISOString()
    }]);
    setForm({ ...form, data: '', hora: '', local: '' });
  }
  async function removeMatch(id) {
    if (!(await ask({ title: 'Remover jogo', message: 'Remover este jogo do calendário?', danger: true, confirmLabel: 'Remover' }))) return;
    updateMatches(matches.filter(m => m.id !== id));
  }
  function guardarAdiar() {
    updateMatches(matches.map(x => x.id === adiarId ? { ...x, data: adiarDraft.data, hora: adiarDraft.hora, local: adiarDraft.local } : x));
    setAdiarId(null);
  }
  async function registrarWO(cm, faltante) {
    const presente = faltante === cm.mandante ? cm.visitante : cm.mandante;
    if (!(await ask({ title: 'Confirmar W.O. (6–0)', message: `${teamName(faltante)} não compareceu. ${teamName(presente)} vence por 6–0 por falta de comparecência. Registrar?`, danger: true, confirmLabel: 'Registar W.O.' }))) return;
    const gols = faltante === cm.mandante ? { golsMandante: 0, golsVisitante: 6 } : { golsMandante: 6, golsVisitante: 0 };
    updateMatches(matches.map(x => x.id === cm.id ? { ...x, status: 'realizado', ...gols, wo: true, woFaltante: faltante, mvpId: '' } : x));
    setWoId(null);
  }

  const porRodada = {};
  listaVisivel.forEach(m => {
    const r = Number(m.rodada);
    const key = Number.isFinite(r) ? r : 0;
    (porRodada[key] = porRodada[key] || []).push(m);
  });
  const rodadas = Object.keys(porRodada).map(Number).filter(r => Array.isArray(porRodada[r])).sort((a, b) => a - b);

  function setRelogio(m, relogio) {
    updateMatches(matches.map(x => x.id === m.id ? { ...x, relogio } : x));
  }

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Calendário</h1>
          <div className="fx-sub">
            {activeChamp ? `Jogos de ${activeChamp.nome} · ${activeChamp.ano} · ${champNivel(activeChamp)} · por rodada` : 'Jogos agendados por rodada'}
          </div>
        </div>
        {championships.length > 1 && !souClube && (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <div className="fx-field"><label>Campeonato</label>
              <select className="fx-select" value={activeChamp ? activeChamp.id : ''} onChange={e => onSelect(e.target.value)}>
                {championships.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.ano}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {gestao && !souClube && (
        <div className="fx-panel">
          <h2 className="fx-panel-title">Agendar jogo{activeChamp ? ` — ${activeChamp.nome} (${activeChamp.ano})` : ''}</h2>
          {championships.length === 0 ? (
            <div className="fx-empty">Crie primeiro um campeonato (menu Campeonatos). O calendário passa a ser gerado dentro de cada campeonato.</div>
          ) : timesDoChamp.length < 2 ? (
            <div className="fx-empty">Este campeonato precisa de pelo menos duas equipas. Associe equipas a «{activeChamp ? activeChamp.nome : ''}» em Equipes ou em Campeonatos.</div>
          ) : (
            <div className="fx-form-row">
              <div className="fx-field"><label>Rodada</label><input type="number" min="1" className="fx-input" style={{ width: 70 }} value={form.rodada} onChange={e => setForm({ ...form, rodada: e.target.value })} /></div>
              <div className="fx-field"><label>Data</label><input type="date" className="fx-input" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
              <div className="fx-field"><label>Hora</label><input type="time" className="fx-input" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} /></div>
              <div className="fx-field"><label>Local</label><input className="fx-input" value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} placeholder="Pavilhão / quadra" /></div>
              <div className="fx-field"><label>Mandante</label>
                <select className="fx-select" value={form.mandante} onChange={e => setForm({ ...form, mandante: e.target.value })}>
                  <option value="">—</option>
                  {timesDoChamp.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <div className="fx-field"><label>Visitante</label>
                <select className="fx-select" value={form.visitante} onChange={e => setForm({ ...form, visitante: e.target.value })}>
                  <option value="">—</option>
                  {timesDoChamp.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button className="fx-btn fx-btn-primary" onClick={addMatch}><Plus size={15} /> Agendar</button>
            </div>
          )}
          {form.mandante && form.visitante && form.mandante === form.visitante && <div style={{ color: 'var(--loss)', fontSize: '0.8rem', marginTop: -8 }}>Escolha equipes diferentes</div>}
        </div>
      )}

      {rodadas.length === 0 ? <div className="fx-panel"><div className="fx-empty">Nenhum jogo agendado</div></div> : rodadas.map(r => (
        <div className="fx-panel" key={r}>
          <h2 className="fx-panel-title">Rodada {r}</h2>
          <div className="fx-scroll">
          {porRodada[r].map(m => (
            <div className="fx-match" key={m.id}>
              <div className="fx-match-head">
                <span>{m.data} {m.hora || ''} · {m.local || 'local a definir'} {m.status === 'realizado' && m.mvpId && <span className="fx-tag mvp" style={{ marginLeft: 8 }}>★ MVP: {playerNome(m.mvpId)}</span>}{m.wo && m.woFaltante && <span className="fx-tag r" style={{ marginLeft: 8 }}>W.O. — {teamName(m.woFaltante)} não compareceu</span>}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className={'fx-status ' + m.status}>{m.wo ? 'W.O.' : (m.status === 'realizado' ? 'Realizado' : 'Agendado')}</span>
                  {m.streamUrl && (m.streamOn && m.status !== 'realizado' ? <span className="fx-live"><span className="fx-live-dot" /> AO VIVO</span> : <span className="fx-tag">Transmissão</span>)}
                  {!gestaoOps && m.relogio && m.relogio.estado && m.relogio.estado !== 'pre' && m.status !== 'realizado' && <RelogioJogo match={m} gestao={false} onChange={() => {}} />}
                  {gestaoOps && m.status !== 'realizado' && <RelogioJogo match={m} gestao onChange={(relogio) => setRelogio(m, relogio)} />}
                  {gestaoOps && m.status === 'agendado' && <button className="fx-btn" title="Adiar jogo (nova data e local)" onClick={() => { setAdiarId(m.id); setAdiarDraft({ data: m.data || '', hora: m.hora || '', local: m.local || '' }); }}><CalendarDays size={13} /> Adiar</button>}
                  {gestaoOps && m.status === 'agendado' && <button className="fx-btn" title="Falta de comparecência — a equipa presente vence por 6–0" onClick={() => setWoId(m.id)}><AlertTriangle size={13} /> W.O.</button>}
{gestao && <button className="fx-btn fx-btn-icon" title="Definir transmissão" onClick={() => { setStreamEditId(m.id); setStreamDraft({ streamUrl: m.streamUrl || '', streamOn: !!m.streamOn }); }}><Pencil size={13} /></button>}
                   {gestaoConvocados2 && m.status === 'agendado' && <button className="fx-btn fx-btn-icon" title="Convocados e escalação" onClick={() => setConvId(m.id)}><Users size={13} /></button>}
                   {gestao && <button className="fx-btn fx-btn-icon fx-btn-danger" onClick={() => removeMatch(m.id)}><Trash2 size={13} /></button>}
                </span>
              </div>
              <div className="fx-match-body">
                <div className="fx-team-name right">{teamName(m.mandante)}<Avatar src={teamFoto(m.mandante)} size={24} shape="square" fallbackColor={teamColor(m.mandante)} /></div>
                <div className="fx-score">{m.status === 'realizado' ? `${m.golsMandante} – ${m.golsVisitante}` : 'x'}</div>
                <div className="fx-team-name"><Avatar src={teamFoto(m.visitante)} size={24} shape="square" fallbackColor={teamColor(m.visitante)} />{teamName(m.visitante)}</div>
              </div>
              {m.convocados && [m.mandante, m.visitante].some(tId => ((m.convocados || {})[tId] || []).length > 0) && (
                <div className="fx-conv-resumo">
                  {[m.mandante, m.visitante].map(tId => {
                    const list = (m.convocados || {})[tId] || [];
                    if (!list.length) return null;
                    const tit = list.filter(x => x.status === 'titular').length;
                    const out = list.filter(x => x.status === 'lesionado' || x.status === 'suspA' || x.status === 'suspV').length;
                    return <span key={tId} className="fx-tag">{teamName(tId)}: {list.length} convocados · {tit} titulares{out ? ` · ${out} indisponíveis` : ''}</span>;
                  })}
                </div>
              )}
              {gestaoOps && adiarId === m.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div className="fx-form-row" style={{ marginBottom: 6 }}>
                    <div className="fx-field"><label>Nova data *</label><input type="date" className="fx-input" value={adiarDraft.data} onChange={e => setAdiarDraft({ ...adiarDraft, data: e.target.value })} /></div>
                    <div className="fx-field"><label>Hora</label><input type="time" className="fx-input" value={adiarDraft.hora} onChange={e => setAdiarDraft({ ...adiarDraft, hora: e.target.value })} /></div>
                    <div className="fx-field" style={{ flex: 2, minWidth: 200 }}><label>Local</label><input className="fx-input" value={adiarDraft.local} onChange={e => setAdiarDraft({ ...adiarDraft, local: e.target.value })} placeholder="Pavilhão / quadra" /></div>
                    <button className="fx-btn fx-btn-primary" disabled={!adiarDraft.data || adiarDraft.data === m.data} onClick={guardarAdiar}><Check size={14} /> Guardar adiamento</button>
                    <button className="fx-btn" onClick={() => { setAdiarId(null); }}><X size={14} /> Cancelar</button>
                  </div>
                  {!adiarDraft.data && <div style={{ color: 'var(--loss)', fontSize: '0.8rem' }}>Escolha a nova data do jogo.</div>}
                  {adiarDraft.data && adiarDraft.data === m.data && <div className="fx-note">A data é igual à atual — mude a data ou cancele o adiamento.</div>}
                </div>
              )}
              {gestao && streamEditId === m.id && (
                <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                  <div className="fx-form-row" style={{ marginBottom: 8 }}>
                    <div className="fx-field" style={{ flex: 2, minWidth: 280 }}>
                      <label>Link da transmissão (YouTube, Vimeo, Twitch ou URL direto)</label>
                      <input className="fx-input" value={streamDraft.streamUrl} onChange={e => setStreamDraft({ ...streamDraft, streamUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
                    </div>
                    <div className="fx-field">
                      <label>Estado</label>
                      <label className="fx-switch">
                        <input type="checkbox" checked={streamDraft.streamOn} onChange={e => setStreamDraft({ ...streamDraft, streamOn: e.target.checked })} />
                        <span>{streamDraft.streamOn ? 'Sinal ao vivo' : 'Fora do ar'}</span>
                      </label>
                    </div>
                    <button className="fx-btn fx-btn-primary" onClick={() => { updateMatches(matches.map(x => x.id === streamEditId ? { ...x, streamUrl: streamDraft.streamUrl.trim(), streamOn: !!streamDraft.streamOn } : x)); setStreamEditId(null); }}><Check size={14} /> Guardar</button>
                    <button className="fx-btn" onClick={() => setStreamEditId(null)}><X size={14} /> Cancelar</button>
                  </div>
                  {streamDraft.streamUrl.trim() && <div className="fx-note">{embedUrl(streamDraft.streamUrl) ? 'Compatível com reprodução incorporada na página pública.' : 'Link não reconhecido para incorporar — será apresentado como ligação para abrir em nova aba.'}</div>}
                </div>
              )}
            </div>
          ))}
          </div>
        </div>
      ))}

      {woId && (() => {
        const cm = matches.find(x => x.id === woId);
        if (!cm) return null;
        return (
          <div className="fx-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setWoId(null); }}>
            <div className="fx-authbox" style={{ maxWidth: 440 }}>
              <div className="fx-auth-head">
                <AlertTriangle size={18} />
                <div>
                  <div className="fx-auth-title">Falta de comparecência</div>
                  <div className="fx-auth-sub">{teamName(cm.mandante)} × {teamName(cm.visitante)} · rodada {cm.rodada}</div>
                </div>
              </div>
              <div className="fx-note" style={{ lineHeight: 1.6 }}>Qual equipe <strong>não compareceu</strong> ao jogo? A equipe presente vence por <strong>W.O. (6–0)</strong>.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
                <button className="fx-btn" style={{ justifyContent: 'center' }} onClick={() => registrarWO(cm, cm.mandante)}><AlertTriangle size={14} /> {teamName(cm.mandante)} não compareceu</button>
                <button className="fx-btn" style={{ justifyContent: 'center' }} onClick={() => registrarWO(cm, cm.visitante)}><AlertTriangle size={14} /> {teamName(cm.visitante)} não compareceu</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="fx-btn" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setWoId(null)}>Cancelar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {convId && (() => {
        const cm = matches.find(x => x.id === convId);
        if (!cm) return null;
        return (
          <EscalacaoModal
            key={cm.id}
            match={cm}
            players={players}
            matches={matches}
            teamName={teamName}
            editable={!!gestaoConvocados2 && cm.status !== 'realizado'}
            myTeamId={myTeamId}
            convPapel={convPapel}
            onSave={(conv) => { updateMatches(matches.map(x => x.id === cm.id ? { ...x, convocados: conv } : x)); setConvId(null); }}
            onClose={() => setConvId(null)}
          />
        );
      })()}
    </div>
  );
}

function Resultados({ teams, players, matches, updateMatches, teamName, playerName, activeChamp, podeEditarResultadosLancados }) {
  const ask = useConfirm();
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [evJogador, setEvJogador] = useState('');
  const [evTipo, setEvTipo] = useState('gol');
  const [evAssist, setEvAssist] = useState('');
  const [avJogador, setAvJogador] = useState('');
  const [avNota, setAvNota] = useState(7);
  const lista = activeChamp ? matches.filter(m => m.champId === activeChamp.id) : matches;
  const { nome: champNome = '', ano: champAno = '' } = activeChamp || {};

  function openMatch(m) {
    setSelected(m.id);
    setDraft({ golsMandante: m.golsMandante || 0, golsVisitante: m.golsVisitante || 0, eventos: [...(m.eventos || [])], avaliacoes: [...(m.avaliacoes || [])], mvpId: m.mvpId || '' });
  }
  const match = matches.find(m => m.id === selected);
  const isReadOnly = !!(match && match.status === 'realizado' && !podeEditarResultadosLancados);
  const elenco = match ? players.filter(p => p.teamId === match.mandante || p.teamId === match.visitante || !teams.some(t => t.id === p.teamId)) : [];
  const elencoLabel = (p) => teams.some(t => t.id === p.teamId) ? teamName(p.teamId) : 'Equipa removida';

  function addEvento() {
    if (!evJogador) return;
    const assist = evTipo === 'gol' ? (evAssist || '') : '';
    setDraft({ ...draft, eventos: [...draft.eventos, { jogadorId: evJogador, tipo: evTipo, assist }] });
    setEvAssist('');
  }
  function removeEvento(idx) {
    setDraft({ ...draft, eventos: draft.eventos.filter((_, i) => i !== idx) });
  }
  function addAvaliacao() {
    if (!avJogador) return;
    const outros = draft.avaliacoes.filter(a => a.jogadorId !== avJogador);
    setDraft({ ...draft, avaliacoes: [...outros, { jogadorId: avJogador, nota: Number(avNota) }] });
  }
  function contarGolsDoRegisto() {
    const golDe = (timeId) => draft.eventos.filter(e => e.tipo === 'gol' && players.some(p => p.id === e.jogadorId && p.teamId === timeId)).length;
    setDraft({ ...draft, golsMandante: golDe(match.mandante), golsVisitante: golDe(match.visitante) });
  }
  function salvarResultado() {
    updateMatches(matches.map(m => m.id === selected ? { ...m, ...draft, golsMandante: Number(draft.golsMandante) || 0, golsVisitante: Number(draft.golsVisitante) || 0, status: 'realizado' } : m));
    setSelected(null); setDraft(null);
  }
  async function anularResultado() {
    if (!(await ask({ title: 'Anular lançamento', message: 'O jogo volta a "agendado" e o placar, os eventos, as avaliações e o MVP são apagados. Continuar?', danger: true, confirmLabel: 'Anular' }))) return;
    updateMatches(matches.map(m => m.id === selected ? { ...m, status: 'agendado', golsMandante: 0, golsVisitante: 0, eventos: [], avaliacoes: [], mvpId: '', wo: undefined, woFaltante: undefined } : m));
    setSelected(null); setDraft(null);
  }

  const agendados = lista.filter(m => m.status === 'agendado');
  const realizados = lista.filter(m => m.status === 'realizado');

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Resultados</h1><div className="fx-sub">{activeChamp ? `Placares, gols, cartões e avaliações — ${champNome} · ${champAno}` : 'Lance placares, gols, cartões e avaliação dos jogadores'}</div></div>
      </div>

      {!selected && (
        <>
          <div className="fx-panel">
            <h2 className="fx-panel-title">Jogos por lançar ({agendados.length})</h2>
            {agendados.length === 0 ? <div className="fx-empty">Todos os jogos agendados já foram lançados</div> : (
            <div className="fx-scroll">
            {agendados.map(m => (
              <div key={m.id} className="fx-match" style={{ cursor: 'pointer' }} onClick={() => openMatch(m)}>
                <div className="fx-match-head"><span>Rodada {m.rodada} · {m.data} {m.hora || ''}</span><span className="fx-status">Lançar resultado →</span></div>
                <div className="fx-match-body">
                  <div className="fx-team-name right">{teamName(m.mandante)}</div>
                  <div className="fx-score" style={{ color: 'var(--ink-dim)' }}>vs</div>
                  <div className="fx-team-name">{teamName(m.visitante)}</div>
                </div>
              </div>
            ))}
            </div>
            )}
          </div>
          <div className="fx-panel">
            <h2 className="fx-panel-title">Jogos já lançados ({realizados.length})</h2>
            {realizados.length === 0 ? <div className="fx-empty">Nenhum resultado lançado ainda</div> : (
            <div className="fx-scroll">
            {realizados.map(m => (
              <div key={m.id} className="fx-match" style={{ cursor: 'pointer' }} onClick={() => openMatch(m)}>
                <div className="fx-match-head"><span>Rodada {m.rodada} · {m.data} {m.hora || ''} {m.mvpId && <span className="fx-tag mvp" style={{ marginLeft: 8 }}>★ MVP: {playerName(m.mvpId)}</span>}{m.wo && <span className="fx-tag r" style={{ marginLeft: 8 }}>W.O.</span>}</span><span className="fx-status realizado">{podeEditarResultadosLancados ? 'Editar' : 'Ver'}</span></div>
                <div className="fx-match-body">
                  <div className="fx-team-name right">{teamName(m.mandante)}</div>
                  <div className="fx-score">{m.golsMandante} – {m.golsVisitante}</div>
                  <div className="fx-team-name">{teamName(m.visitante)}</div>
                </div>
              </div>
            ))}
            </div>
            )}
          </div>
        </>
      )}

      {selected && draft && (
        <div className="fx-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 className="fx-panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>{teamName(match.mandante)} vs {teamName(match.visitante)}</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {podeEditarResultadosLancados && match.status === 'realizado' && <button className="fx-btn fx-btn-danger" onClick={anularResultado}><X size={14} /> Anular</button>}
              <button className="fx-btn" onClick={() => { setSelected(null); setDraft(null); }}><X size={14} /> Fechar</button>
            </div>
          </div>

          {isReadOnly && <div className="fx-note" style={{ marginBottom: 14 }}>Este resultado já foi lançado e está em modo de leitura. Só o Administrador (ou a Associação) pode alterar ou anular resultados já lançados.</div>}
          <fieldset disabled={isReadOnly} style={{ border: 'none', padding: 0, margin: 0 }}>

          <div className="fx-form-row">
            <div className="fx-field"><label>Placar {teamName(match.mandante)}</label>
              <input type="number" min="0" className="fx-input" style={{ width: 70 }} value={draft.golsMandante} onChange={e => setDraft({ ...draft, golsMandante: Number(e.target.value) })} />
            </div>
            <div className="fx-field"><label>Placar {teamName(match.visitante)}</label>
              <input type="number" min="0" className="fx-input" style={{ width: 70 }} value={draft.golsVisitante} onChange={e => setDraft({ ...draft, golsVisitante: Number(e.target.value) })} />
            </div>
            <button className="fx-btn" onClick={contarGolsDoRegisto} title="Substitui o placar pela contagem dos gols registados abaixo"><RefreshCw size={14} /> Contar do registo</button>
          </div>

          <h3 style={{ fontFamily: 'Oswald', fontSize: '0.95rem', margin: '18px 0 10px' }}>Gols e cartões</h3>
          <div className="fx-form-row">
            <div className="fx-field"><label>Jogador</label>
              <select className="fx-select" value={evJogador} onChange={e => setEvJogador(e.target.value)}>
                <option value="">Selecione</option>
                {elenco.map(p => <option key={p.id} value={p.id}>{p.nome} · {elencoLabel(p)}</option>)}
              </select>
            </div>
            <div className="fx-field"><label>Evento</label>
              <select className="fx-select" value={evTipo} onChange={e => { setEvTipo(e.target.value); setEvAssist(''); }}>
                <option value="gol">Gol</option>
                <option value="amarelo">Cartão amarelo</option>
                <option value="vermelho">Cartão vermelho</option>
              </select>
            </div>
            {evTipo === 'gol' && (
              <div className="fx-field"><label>Assistência (opcional)</label>
                <select className="fx-select" value={evAssist} onChange={e => setEvAssist(e.target.value)}>
                  <option value="">Sem assistência</option>
                  {elenco.filter(p => p.id !== evJogador).map(p => <option key={p.id} value={p.id}>{p.nome} · {elencoLabel(p)}</option>)}
                </select>
              </div>
            )}
            <button className="fx-btn" onClick={addEvento}><Plus size={15} /> Registar</button>
          </div>
          {draft.eventos.length > 0 && (
            <table className="fx-table" style={{ marginBottom: 18 }}>
              <thead><tr><th>Jogador</th><th>Equipe</th><th>Evento</th><th>Assistência</th><th></th></tr></thead>
              <tbody>
                {draft.eventos.map((e, i) => {
                  const p = players.find(pl => pl.id === e.jogadorId);
                  return (
                    <tr key={i}>
                      <td>{playerName(e.jogadorId)}</td>
                      <td>{p ? elencoLabel(p) : '—'}</td>
                      <td>{e.tipo === 'gol' ? <span className="fx-tag">Gol</span> : e.tipo === 'amarelo' ? <span className="fx-tag y">Amarelo</span> : <span className="fx-tag r">Vermelho</span>}</td>
                      <td>{e.tipo === 'gol' && e.assist ? playerName(e.assist) : '—'}</td>
                      <td><button className="fx-btn fx-btn-icon fx-btn-danger" onClick={() => removeEvento(i)}><Trash2 size={13} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <h3 style={{ fontFamily: 'Oswald', fontSize: '0.95rem', margin: '18px 0 10px' }}>Avaliação dos jogadores (0–10)</h3>
          <div className="fx-form-row">
            <div className="fx-field"><label>Jogador</label>
              <select className="fx-select" value={avJogador} onChange={e => setAvJogador(e.target.value)}>
                <option value="">Selecione</option>
                {elenco.map(p => <option key={p.id} value={p.id}>{p.nome} · {elencoLabel(p)}</option>)}
              </select>
            </div>
            <div className="fx-field"><label>Nota</label>
              <input type="number" min="0" max="10" step="0.5" className="fx-input" style={{ width: 70 }} value={avNota} onChange={e => setAvNota(e.target.value)} />
            </div>
            <button className="fx-btn" onClick={addAvaliacao}><Plus size={15} /> Registar nota</button>
          </div>
          {draft.avaliacoes.length > 0 && (
            <table className="fx-table" style={{ marginBottom: 18 }}>
              <thead><tr><th>Jogador</th><th className="num">Nota</th></tr></thead>
              <tbody>{draft.avaliacoes.map((a, i) => <tr key={i}><td>{playerName(a.jogadorId)}</td><td className="num">{a.nota}</td></tr>)}</tbody>
            </table>
          )}

          <h3 style={{ fontFamily: 'Oswald', fontSize: '0.95rem', margin: '18px 0 10px' }}>MVP do jogo</h3>
          <div className="fx-form-row">
            <div className="fx-field" style={{ flex: 2 }}>
              <select className="fx-select" value={draft.mvpId} onChange={e => setDraft({ ...draft, mvpId: e.target.value })}>
                <option value="">Selecione o melhor jogador (opcional)</option>
                {elenco.map(p => <option key={p.id} value={p.id}>{p.nome} · {elencoLabel(p)}</option>)}
              </select>
            </div>
            {draft.mvpId && <div className="fx-ok" style={{ alignSelf: 'center' }}>★ MVP escolhido: {playerName(draft.mvpId)}</div>}
          </div>

          <button className="fx-btn fx-btn-primary" onClick={salvarResultado}><Check size={15} /> Guardar resultado</button>
          </fieldset>
        </div>
      )}
    </div>
  );
}

function embedUrl(url) {
  if (!url) return '';
  const u = url.trim();
  if (!/^https?:\/\//.test(u)) return '';
  let m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (m) return 'https://www.youtube.com/embed/' + m[1];
  m = u.match(/vimeo\.com\/(\d+)/);
  if (m) return 'https://player.vimeo.com/video/' + m[1];
  m = u.match(/twitch\.tv\/([a-z0-9_]+)/i);
  if (m) return 'https://player.twitch.tv/?channel=' + m[1] + '&parent=' + window.location.hostname;
  return u;
}

function Transmissoes({ matches, teamName, teamColor, teamFoto, updateMatches, gestao, activeChamp, championships, onSelect, champNivel, onAssistir }) {
  const [watchId, setWatchId] = useState(null);
  const [linkEditId, setLinkEditId] = useState(null);
  const [linkDraft, setLinkDraft] = useState({ streamUrl: '', streamOn: false });
  const filtered = activeChamp ? matches.filter(m => m.champId === activeChamp.id) : matches;
  const ordenados = filtered
    .slice()
    .sort((a, b) => (b.data + (b.hora || '')).localeCompare(a.data + (a.hora || '')));
  const watch = watchId ? filtered.find(m => m.id === watchId) || null : null;

  if (watch) {
    const src = embedUrl(watch.streamUrl);
    return (
      <div>
        <div className="fx-top">
          <div><h1 className="fx-h1">Ver jogo</h1>
            <div className="fx-sub">{activeChamp ? `${activeChamp.nome} · ${activeChamp.ano} · ` : ''}Rodada {watch.rodada} · {watch.data} {watch.hora || ''} · {watch.local || 'local a definir'}</div>
          </div>
        </div>
        <div className="fx-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
            <h2 className="fx-panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>
              <span className="fx-livebar-score">{teamName(watch.mandante)} <strong>{watch.status === 'realizado' ? `${watch.golsMandante} – ${watch.golsVisitante}` : 'vs'}</strong> {teamName(watch.visitante)}</span>
            </h2>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {watch.relogio && watch.status !== 'realizado' && <RelogioJogo match={watch} gestao={false} onChange={() => {}} />}
              {watch.streamOn && watch.status !== 'realizado' && <span className="fx-live"><span className="fx-live-dot" /> AO VIVO</span>}
              <button className="fx-btn" onClick={() => setWatchId(null)}><X size={14} /> Voltar à lista</button>
            </div>
          </div>

          {src ? (
            <div className="fx-player">
              <iframe src={src} title="Transmissão do jogo" allowFullScreen frameBorder="0"
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen" />
            </div>
          ) : (
            <div className="fx-empty">Não foi possível incorporar este link.</div>
          )}

          <div className="fx-livebar">
            <div className="fx-team-name right">{teamName(watch.mandante)}<Avatar src={teamFoto(watch.mandante)} size={28} shape="square" fallbackColor={teamColor(watch.mandante)} /></div>
            <div className="fx-score">
              {watch.status === 'realizado' ? `${watch.golsMandante} – ${watch.golsVisitante}` : (watch.streamOn ? 'AO VIVO' : 'vs')}
            </div>
            <div className="fx-team-name"><Avatar src={teamFoto(watch.visitante)} size={28} shape="square" fallbackColor={teamColor(watch.visitante)} />{teamName(watch.visitante)}</div>
          </div>

          <div className="fx-note" style={{ marginTop: 12 }}>Os resultados atualizam-se automaticamente quando são lançados. Se o vídeo não aparecer, abra diretamente: <a href={watch.streamUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{watch.streamUrl}</a></div>
        </div>
      </div>
    );
  }

  const comLink = ordenados.filter(m => m.streamUrl && m.streamUrl.trim());

  return (
    <div>
      <div className="fx-top">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, width: '100%' }}>
          <div>
            <h1 className="fx-h1">Ver jogos</h1>
            <div className="fx-sub">{activeChamp ? `Transmissões de ${activeChamp.nome} · ${activeChamp.ano} · ${champNivel(activeChamp)}` : 'Transmissões dos jogos e resultados em tempo real'}</div>
          </div>
          {championships.length > 0 && (
            <select className="fx-select" style={{ width: 'auto', flexShrink: 0 }}
              value={activeChamp ? activeChamp.id : ''} onChange={e => onSelect(e.target.value)}>
              <option value="">Todos os campeonatos</option>
              {championships.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.ano}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="fx-panel">
        {ordenados.length === 0 ? (
          <div className="fx-empty">{activeChamp ? `Nenhum jogo com transmissão em ${activeChamp.nome}.` : 'Nenhum jogo no calendário ainda.'}</div>
        ) : (
          <div>
            <div className="fx-sub" style={{ marginBottom: 14 }}>{activeChamp ? `Jogos de ${activeChamp.nome} · escolha um jogo para acompanhar a transmissão.` : 'Escolha um jogo para acompanhar a transmissão. O placar é atualizado em tempo real.'}</div>
            {comLink.length === 0 && !gestao && <div className="fx-note" style={{ marginBottom: 12 }}>{activeChamp ? `Ainda não há links de transmissão para ${activeChamp.nome}.` : 'O administrador vai colocar aqui os links dos jogos.'}</div>}
            <div className="fx-scroll">
            {ordenados.map(m => {
              const temLink = m.streamUrl && m.streamUrl.trim();
              return (
                <div key={m.id} className="fx-livecard">
                  <div className="fx-livebody">
                    <div className="fx-team-name right">{teamName(m.mandante)}<Avatar src={teamFoto(m.mandante)} size={24} shape="square" fallbackColor={teamColor(m.mandante)} /></div>
                    <div className="fx-score">
                      {m.status === 'realizado' ? `${m.golsMandante} – ${m.golsVisitante}` : (m.streamOn ? <span className="fx-live"><span className="fx-live-dot" /> AO VIVO</span> : 'vs')}
                    </div>
                    <div className="fx-team-name"><Avatar src={teamFoto(m.visitante)} size={24} shape="square" fallbackColor={teamColor(m.visitante)} />{teamName(m.visitante)}</div>
                  </div>
                  <div className="fx-livefoot">
                    <span>{m.wo ? 'W.O.' : (m.status === 'realizado' ? 'Realizado' : 'Agendado')} · Rodada {m.rodada} · {m.data} {m.hora || ''}</span>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {m.relogio && m.status !== 'realizado' && <RelogioJogo match={m} gestao={false} onChange={() => {}} />}
                      {temLink && <span className="fx-tag">Transmissão</span>}
                      {temLink && <button className="fx-btn fx-btn-primary" onClick={() => { setWatchId(m.id); if (onAssistir) onAssistir(m.id); }}><Tv size={15} /> Ver transmissão</button>}
                      {gestao && <button className="fx-btn" onClick={() => { setLinkEditId(m.id); setLinkDraft({ streamUrl: m.streamUrl || '', streamOn: !!m.streamOn }); }}><Pencil size={13} /> {temLink ? 'Editar link' : 'Colocar link'}</button>}
                    </span>
                  </div>
                  {gestao && linkEditId === m.id && (
                    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                      <div className="fx-form-row" style={{ marginBottom: 8 }}>
                        <div className="fx-field" style={{ flex: 2, minWidth: 280 }}>
                          <label>Link da transmissão (YouTube, Vimeo, Twitch ou URL direto)</label>
                          <input className="fx-input" value={linkDraft.streamUrl} onChange={e => setLinkDraft({ ...linkDraft, streamUrl: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" />
                        </div>
                        <div className="fx-field">
                          <label>Estado</label>
                          <label className="fx-switch">
                            <input type="checkbox" checked={linkDraft.streamOn} onChange={e => setLinkDraft({ ...linkDraft, streamOn: e.target.checked })} />
                            <span>{linkDraft.streamOn ? 'Sinal ao vivo' : 'Fora do ar'}</span>
                          </label>
                        </div>
                        <button className="fx-btn fx-btn-primary" onClick={() => { updateMatches(matches.map(x => x.id === linkEditId ? { ...x, streamUrl: linkDraft.streamUrl.trim(), streamOn: !!linkDraft.streamOn } : x)); setLinkEditId(null); }}><Check size={14} /> Guardar</button>
                        <button className="fx-btn" onClick={() => setLinkEditId(null)}><X size={14} /> Cancelar</button>
                      </div>
                      {linkDraft.streamUrl.trim() && <div className="fx-note">{embedUrl(linkDraft.streamUrl) ? 'Compatível com reprodução incorporada na página pública.' : 'Link não reconhecido para incorporar — será apresentado como ligação para abrir em nova aba.'}</div>}
                    </div>
                  )}
                </div>
              );
            })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Classificacao({ standings }) {
  return (
    <div>
      <div className="fx-top"><div><h1 className="fx-h1">Classificação</h1><div className="fx-sub">Tabela geral do campeonato</div></div></div>
      <div className="fx-panel">
        {standings.length === 0 ? <div className="fx-empty">Sem equipes registadas</div> : (
          <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr>
              <th className="num">#</th><th>Equipe</th><th className="num">J</th><th className="num">V</th><th className="num">E</th>
              <th className="num">D</th><th className="num">GP</th><th className="num">GC</th><th className="num">SG</th><th className="num">Pts</th>
            </tr></thead>
            <tbody>
              {standings.map((r, i) => (
                <tr key={r.teamId}>
                  <td className="num">{i + 1}</td>
                  <td><div className="fx-namecell"><Avatar src={r.foto} size={24} shape="square" fallbackColor={r.cor} initials={r.nome.slice(0, 2).toUpperCase()} />{r.nome}</div></td>
                  <td className="num">{r.j}</td><td className="num">{r.v}</td><td className="num">{r.e}</td><td className="num">{r.d}</td>
                  <td className="num">{r.gp}</td><td className="num">{r.gc}</td><td className="num">{r.sg}</td>
                  <td className="num" style={{ color: 'var(--accent)', fontWeight: 600 }}>{r.pts}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Artilharia({ artilheiros, activeChamp }) {
  return (
    <div>
      <div className="fx-top"><div><h1 className="fx-h1">Artilharia</h1><div className="fx-sub">Melhores marcadores{activeChamp ? ` do campeonato «${activeChamp.nome}»` : ''}</div></div></div>
      <div className="fx-panel">
        {artilheiros.length === 0 ? <div className="fx-empty">Nenhum gol registado ainda</div> : (
        <div className="fx-scroll">
        {artilheiros.map((a, i) => (
          <div className="fx-podium" key={a.jogadorId}>
            <div className="fx-rank">{i + 1}</div>
            <Avatar src={a.foto} size={32} shape="circle" fallbackColor={a.cor} initials={a.nome.slice(0, 2).toUpperCase()} />
            <div style={{ flex: 1 }}>{a.nome} <span style={{ color: 'var(--ink-dim)', fontSize: '0.82rem' }}>· {a.time}</span></div>
            <div style={{ fontFamily: 'Oswald', fontSize: '1.2rem', color: 'var(--accent)' }}>{a.gols}</div>
          </div>
        ))}
        </div>
        )}
      </div>
    </div>
  );
}

function Estatisticas({ stats, activeChamp }) {
  const comJogos = stats.filter(s => s.jogos > 0);
  return (
    <div>
      <div className="fx-top"><div><h1 className="fx-h1">Estatísticas e melhor jogador</h1><div className="fx-sub">Índice do melhor jogador = média de (Golos ×3, Assistências ×2, Nota 0-10, MVP ×6) — só jogadores com jogos realizados{activeChamp ? ` no campeonato «${activeChamp.nome}»` : ''}</div></div></div>
      <div className="fx-panel">
        {comJogos.length === 0 ? <div className="fx-empty">Sem estatísticas disponíveis ainda</div> : (
          <div className="fx-scroll">
          <table className="fx-table">
            <thead><tr>
              <th>Jogador</th><th>Equipe</th><th className="num">Jogos</th><th className="num">Gols</th><th className="num">Assist.</th>
              <th className="num">Amarelos</th><th className="num">Vermelhos</th><th className="num">MVP</th><th className="num">Média avaliação</th><th className="num">Índice</th>
            </tr></thead>
            <tbody>
              {comJogos.map((s, i) => (
                <tr key={s.jogadorId}>
                  <td><div className="fx-namecell">
                    <Avatar src={s.foto} size={26} shape="circle" fallbackColor={s.cor} initials={s.nome.slice(0, 2).toUpperCase()} />
                    {i === 0 && <Star size={13} style={{ color: 'var(--accent)' }} />}{s.nome}
                  </div></td>
                  <td><span className="fx-chip" style={{ background: s.cor }} />{s.time}</td>
                  <td className="num">{s.jogos}</td>
                  <td className="num">{s.gols}</td>
                  <td className="num">{s.assists}</td>
                  <td className="num">{s.amarelos}</td>
                  <td className="num">{s.vermelhos}</td>
                  <td className="num" style={{ fontWeight: 600 }}>{s.mvps}</td>
                  <td className="num">{s.media.toFixed(1)}</td>
                  <td className="num" style={{ color: 'var(--accent)', fontWeight: 700 }}>{s.indice.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ChampBanner({ championships, activeChamp, selChampId, onSelect, champNivel, locked }) {
  if (championships.length === 0) return null;
  return (
    <div className="fx-champbar">
      {!locked && championships.length > 1 && (
        <select className="fx-select" style={{ width: 'auto', flexShrink: 0 }} value={selChampId}
          onChange={e => onSelect(e.target.value)} title="Escolher campeonato">
          {championships.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.ano}</option>)}
        </select>
      )}
      {activeChamp && (
        <span className="fx-champmeta">
          <Trophy size={14} />
          <span className="fx-champname">{activeChamp.nome}</span>
          <span className="fx-tag">{activeChamp.ano}</span>
          <span className={'fx-role-badge ' + activeChamp.nivel}>{champNivel(activeChamp)}</span>
        </span>
      )}
    </div>
  );
}

function Campeonatos({ championships, teams, matches, standings, updateChampionships, updateTeams, activeChampId, onSelect, champNivel, currentUser = {}, isAdmin = false, isAssociacao = false }) {
  const ask = useConfirm();
  const [nome, setNome] = useState('');
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [nivel, setNivel] = useState('provincial');
  const [mensagem, setMensagem] = useState('');
  const [editId, setEditId] = useState(null);
  const [editVagas, setEditVagas] = useState('2');
  const [addPick, setAddPick] = useState({});
  const [apurarPick, setApurarPick] = useState({});

  const champsVisiveis = isAssociacao ? championships.filter(c => c.id === currentUser.champId) : championships;

  const rankingDo = (c) => {
    const table = {};
    teams.filter(t => (t.champIds || []).includes(c.id)).forEach(t => {
      table[t.id] = { teamId: t.id, nome: t.name, pts: 0, j: 0 };
    });
    matches.filter(m => m.champId === c.id && m.status === 'realizado').forEach(m => {
      const a = table[m.mandante], b = table[m.visitante];
      if (!a || !b) return;
      a.j++; b.j++;
      const ga = m.golsMandante || 0, gb = m.golsVisitante || 0;
      if (ga > gb) { a.pts += 3; } else if (ga < gb) { b.pts += 3; } else { a.pts += 1; b.pts += 1; }
    });
    return Object.values(table).sort((x, y) => y.pts - x.pts || x.nome.localeCompare(y.nome));
  };

  const timesDoChamp = (c) => {
    const ranked = rankingDo(c).map(r => r.teamId);
    return teams
      .filter(t => (t.champIds || []).includes(c.id))
      .map(t => { const p = ranked.indexOf(t.id); return { ...t, clPos: p === -1 ? 999 : p + 1 }; })
      .sort((a, b) => a.clPos - b.clPos || a.name.localeCompare(b.name));
  };
  const nomeChamp = (id) => (championships.find(x => x.id === id) || {}).nome || 'Campeonato apagado';

  function criar() {
    const n = nome.trim() || (nivel === 'nacional' ? 'Campeonato Nacional' : 'Campeonato ' + champNivel({ nivel }) + ' de ' + (teams[0]?.cidade || 'Maputo'));
    const novo = { id: uid('champ'), nome: n, ano, nivel, vagas: 2, apuracoes: [], criadoEm: new Date().toISOString() };
    updateChampionships([...championships, novo]);
    onSelect(novo.id);
    setNome(''); setAno(String(new Date().getFullYear())); setNivel('provincial');
    setMensagem('Campeonato criado.');
  }

  async function apagar(c) {
    if (!(await ask({ title: 'Apagar campeonato', message: `Apagar "${c.nome}" (${c.ano})? As equipas em si não são apagadas, mas deixam de estar associadas.`, danger: true, confirmLabel: 'Apagar' }))) return;
    updateChampionships(championships.filter(x => x.id !== c.id));
    updateTeams(teams.map(t => (t.champIds || []).includes(c.id) ? { ...t, champIds: t.champIds.filter(x => x !== c.id) } : t));
  }

  function associarTime(c, teamId, on) {
    updateTeams(teams.map(t => {
      if (t.id !== teamId) return t;
      const set = new Set(t.champIds || []);
      if (on) set.add(c.id); else set.delete(c.id);
      return { ...t, champIds: [...set] };
    }));
  }

  function associarCidade(c, cidade) {
    updateTeams(teams.map(t => {
      if ((t.cidade || '').trim().toLowerCase() !== cidade.trim().toLowerCase()) return t;
      const set = new Set([...(t.champIds || []), c.id]);
      return { ...t, champIds: [...set] };
    }));
  }

  const nacional = championships.find(x => x.nivel === 'nacional');

  async function propor(c) {
    const escolhidas = apurarPick[c.id] || [];
    const novas = escolhidas.filter(id => !(c.apuradas || []).some(a => a.teamId === id));
    if (!novas.length && !(c.apuradas || []).some(a => !a.confirmado)) { setMensagem('Assinale pelo menos uma equipe para apurar.'); return; }
    const nomes = timesDoChamp(c).filter(t => escolhidas.includes(t.id)).map(t => t.name).join(', ');
    if (!(await ask({ title: 'Proposta de apuramento', message: `Propor ${escolhidas.length} equipe(s) de "${c.nome}" para o Nacional: ${nomes}. A proposta aguarda confirmação do Administrador.`, confirmLabel: 'Propor' }))) return;
    updateChampionships(championships.map(x => x.id === c.id ? {
      ...x,
      apuradas: (x.apuradas || [])
        .filter(a => a.confirmado || escolhidas.includes(a.teamId))
        .map(a => escolhidas.includes(a.teamId) ? (a.confirmado ? a : { ...a, confirmado: false }) : a)
        .concat(novas.map(teamId => ({ teamId, por: currentUser.nome || currentUser.role || '—', data: new Date().toISOString(), confirmado: false })))
    } : x));
    setApurarPick(p => ({ ...p, [c.id]: [] }));
    setMensagem(`Proposta de ${escolhidas.length} equipe(s) registada. O Administrador confirmará o apuramento.`);
  }

  async function confirmar(c) {
    if (!nacional) {
      if (!(await ask({ title: 'Criar campeonato Nacional', message: `Para confirmar o apuramento de "${c.nome}" é necessário o campeonato Nacional. Criar automaticamente o "Campeonato Nacional"?`, confirmLabel: 'Criar e confirmar' }))) return;
      const apuracoes = (c.apuradas || []).filter(a => a.confirmado === false || a.confirmado === undefined).map(a => ({ teamId: a.teamId, champId: c.id, por: a.por, confirmadoPor: currentUser.nome || 'Administrador', data: new Date().toISOString() }));
      const novo = { id: uid('champ'), nome: 'Campeonato Nacional', ano: c.ano, nivel: 'nacional', vagas: 2, apuracoes, criadoEm: new Date().toISOString(), geradoAuto: true };
      updateChampionships([...championships.map(x => x.id === c.id ? { ...x, apuradas: (x.apuradas || []).map(a => ({ ...a, confirmado: true })) } : x), novo]);
      updateTeams(teams.map(t => apuracoes.some(a => a.teamId === t.id) ? { ...t, champIds: [...new Set([...(t.champIds || []), novo.id])] } : t));
      onSelect(novo.id);
      setMensagem(`Campeonato Nacional criado automaticamente com ${apuracoes.length} equipe(s) apurada(s).`);
      return;
    }
    const apuracoes = (c.apuradas || []).filter(a => a.confirmado === false || a.confirmado === undefined).map(a => ({ teamId: a.teamId, champId: c.id, por: a.por, confirmadoPor: currentUser.nome || 'Administrador', data: new Date().toISOString() }));
    if (!apuracoes.length) { setMensagem('Este campeonato já tem as apuradas confirmadas.'); return; }
    if (!(await ask({ title: 'Confirmar apuramento', message: `Confirmar ${apuracoes.length} equipe(s) de "${c.nome}" para "${nacional.nome}": ${apuracoes.map(a => (teams.find(t => t.id === a.teamId) || {}).name || 'Equipa').join(', ')}?`, confirmLabel: 'Confirmar apuramento' }))) return;
    const novas = apuracoes.filter(a => !(nacional.apuracoes || []).some(e => e.teamId === a.teamId));
    updateChampionships(championships.map(x => {
      if (x.id === c.id) return { ...x, apuradas: x.apuradas.map(a => ({ ...a, confirmado: true })) };
      if (x.id === nacional.id) return { ...x, apuracoes: [...(x.apuracoes || []), ...novas] };
      return x;
    }));
    updateTeams(teams.map(t => novas.some(a => a.teamId === t.id) ? { ...t, champIds: [...new Set([...(t.champIds || []), nacional.id])] } : t));
    setMensagem(`${novas.length} equipe(s) confirmada(s) no "${nacional.nome}".`);
  }

  function removerConfirmada(c, teamId) {
    updateChampionships(championships.map(x => {
      if (x.id === c.id) return { ...x, apuracoes: (x.apuracoes || []).filter(a => a.teamId !== teamId), apuradas: (x.apuradas || []).map(a => a.teamId === teamId ? { ...a, confirmado: false } : a) };
      return x;
    }));
  }

  const cidades = [...new Set(teams.map(t => t.cidade || '').filter(Boolean))];

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Campeonatos</h1><div className="fx-sub">A Associação propõe as equipes apuradas de cada campeonato para o Nacional; o Administrador confirma e o sistema gera automaticamente o campeonato Nacional.</div></div>
      </div>

      {mensagem && <div className="fx-ok" style={{ marginBottom: 12 }}>{mensagem}</div>}

      {isAdmin && (
        <div className="fx-panel">
          <h2 className="fx-panel-title">Criar campeonato</h2>
          <div className="fx-form-row">
            <div className="fx-field" style={{ flex: 2 }}><label>Nome</label><input className="fx-input" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Campeonato Provincial de Maputo" /></div>
            <div className="fx-field"><label>Ano</label><input type="number" min="2000" max="2100" className="fx-input" style={{ width: 90 }} value={ano} onChange={e => setAno(e.target.value)} /></div>
            <div className="fx-field"><label>Tipo</label>
              <select className="fx-select" value={nivel} onChange={e => setNivel(e.target.value)}>
                {CHAMP_NIVEIS.map(n => <option key={n.id} value={n.id}>{n.label} — {n.desc}</option>)}
              </select>
            </div>
            <button className="fx-btn fx-btn-primary" onClick={criar}><Plus size={15} /> Criar</button>
          </div>
        </div>
      )}

      {champsVisiveis.length === 0 ? <div className="fx-panel"><div className="fx-empty">{isAssociacao ? 'A sua conta não tem um campeonato associado.' : 'Nenhum campeonato criado. Crie o primeiro acima.'}</div></div> : champsVisiveis.map(c => {
        const times = timesDoChamp(c);
        const restantes = teams.filter(t => !(t.champIds || []).includes(c.id));
        const ehNacional = c.nivel === 'nacional';
        const apuracoes = c.apuracoes || [];
        const propostas = c.apuradas || [];
        const confirmados = apuracoes.filter(a => a.champId === c.id);
        const pendentes = propostas.filter(a => a.confirmado === false || a.confirmado === undefined);
        const selecionadas = apurarPick[c.id] || propostas.map(a => a.teamId);
        return (
          <div className={'fx-champcard' + (ehNacional ? ' fx-champcard-isol' : '')} key={c.id}>
            <div className="fx-champhead">
              <div style={{ minWidth: 0 }}>
                {editId === c.id ? (
                  <div className="fx-form-row" style={{ marginBottom: 4 }}>
                    <div className="fx-field"><label>Nome</label>
                      <input className="fx-input" value={nome} onChange={e => setNome(e.target.value)} placeholder={c.nome} />
                    </div>
                    <div className="fx-field"><label>Ano</label>
                      <input type="number" className="fx-input" style={{ width: 90 }} value={ano} onChange={e => setAno(e.target.value)} />
                    </div>
                    <button className="fx-btn fx-btn-primary" onClick={() => { updateChampionships(championships.map(x => x.id === c.id ? { ...x, nome: (nome.trim() || c.nome), ano, vagas: Number(editVagas) || 2 } : x)); setEditId(null); setMensagem('Campeonato atualizado.'); }}><Check size={14} /> Guardar</button>
                    <button className="fx-btn" onClick={() => setEditId(null)}><X size={14} /> Cancelar</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span className="fx-champname" style={{ fontSize: '1.02rem' }}>{c.nome}</span>
                    <span className="fx-tag">{c.ano}</span>
                  </div>
                )}
                <div style={{ fontSize: '0.8rem', color: 'var(--ink-dim)', marginTop: 4 }}>
                  {times.length === 0 ? 'Ainda sem equipas associadas' : times.map(t => t.name).join(', ')}
                </div>
              </div>
              {isAdmin && (
                  <div className="fx-champactions">
                    <button className="fx-btn fx-btn-icon" title="Editar" onClick={() => { setEditId(c.id); setNome(c.nome); setAno(c.ano); setEditVagas(String(c.vagas || 2)); }}><Pencil size={14} /></button>
                    <button className="fx-btn fx-btn-icon fx-btn-danger" title="Apagar" onClick={() => apagar(c)}><Trash2 size={14} /></button>
                  </div>
                )}
            </div>

            {editId === c.id && (
              <div className="fx-field" style={{ marginTop: 10 }}>
                <label>Vagas para apurar ao Nacional</label>
                <input type="number" min="1" className="fx-input" style={{ width: 80 }} value={editVagas} onChange={e => setEditVagas(e.target.value)} />
              </div>
            )}

            <div className="fx-champbody">
              <div>
                <div className="fx-sub" style={{ marginBottom: 8 }}>Equipas do campeonato ({times.length}) — por classificação</div>
                {times.length === 0 ? (
                  <div className="fx-empty">Ainda sem equipas associadas</div>
                ) : (
                  <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>
                    {times.map(t => (
                      <div key={t.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '4px 6px', borderRadius: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span className="fx-tag" style={{ minWidth: 26, textAlign: 'center' }}>{t.clPos >= 999 ? '—' : t.clPos}º</span>
                          <Avatar src={t.foto} size={24} shape="square" fallbackColor={t.cor} initials={t.name.slice(0, 2).toUpperCase()} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                          <span style={{ color: 'var(--ink-dim)', fontSize: '0.78rem' }}>({t.cidade || 'sem cidade'})</span>
                        </div>
                        {isAdmin && <button className="fx-btn fx-btn-icon fx-btn-danger" title="Remover do campeonato" onClick={() => associarTime(c, t.id, false)}><X size={13} /></button>}
                      </div>
                    ))}
                  </div>
                )}
                {isAdmin && (<div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {restantes.length > 0 && (
                    <>
                      <select className="fx-select" style={{ flex: 1, minWidth: 160 }} value={addPick[c.id] || ''} onChange={e => setAddPick(p => ({ ...p, [c.id]: e.target.value }))}>
                        <option value="">— Escolher equipe para adicionar —</option>
                        {restantes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.cidade || 'sem cidade'})</option>)}
                      </select>
                      <button className="fx-btn" style={{ padding: '6px 12px' }} onClick={() => { if (addPick[c.id]) { associarTime(c, addPick[c.id], true); setAddPick(p => ({ ...p, [c.id]: '' })); } }}><Plus size={13} /> Adicionar</button>
                    </>
                  )}
                  {cidades.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {cidades.map(cidade => (
                        <button key={cidade} className="fx-btn" style={{ padding: '4px 10px', fontSize: '0.78rem' }} onClick={() => associarCidade(c, cidade)}>
                          + Equipas de {cidade}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>

              <div className="fx-champqa" style={{ minWidth: 200 }}>
                {ehNacional ? (
                  <>
                    <div className="fx-sub" style={{ marginBottom: 8 }}>Equipas apuradas para o Nacional</div>
                    {apuracoes.length === 0 ? (
                      <div className="fx-note">Ainda não há apuradas confirmadas. A Associação propõe e o Administrador confirma em cada campeonato; o Nacional é gerado automaticamente.</div>
                    ) : (
                      <ul className="fx-qa-list" style={{ listStyle: 'none', paddingLeft: 0 }}>
                        {apuracoes.map((a, i) => (
                          <li key={a.teamId + '_' + i} style={{ borderBottom: '1px solid var(--line)', padding: '4px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <div style={{ minWidth: 0 }}>
                                <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{(teams.find(t => t.id === a.teamId) || {}).name || 'Equipa removida'}</span>
                                <div className="fx-chipsub">apurada de {nomeChamp(a.champId)}</div>
                              </div>
                              {isAdmin && (
                                <button className="fx-btn fx-btn-icon fx-btn-danger" title="Remover apuração" onClick={async () => {
                                  if (await ask({ title: 'Remover apuração', message: `Remover "${(teams.find(t => t.id === a.teamId) || {}).name || 'equipa'}" do ${c.nome}? A equipe deixa de estar apurada e poderá ser republicada.`, danger: true, confirmLabel: 'Remover' })) removerConfirmada(c, a.teamId);
                                }}><X size={13} /></button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : (
                  <>
                    <div className="fx-sub" style={{ marginBottom: 8 }}>Apuramento para o Nacional</div>
                    {nacional ? (
                      <div className="fx-note" style={{ marginBottom: 8 }}>Selecione as equipes deste campeonato que a Associação propõe apurar para <strong>{nacional.nome}</strong>.</div>
                    ) : (
                      <div className="fx-note" style={{ marginBottom: 8 }}>Use as vagas do Nacional em "Equipes do campeonato" — ainda não foi criado um campeonato Nacional; será gerado automaticamente na confirmação.</div>
                    )}
                    {times.length === 0 ? (
                      <div className="fx-note">Associe equipes a este campeonato para poder apurá-las.</div>
                    ) : (
                      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 6 }}>
                        {times.map(t => {
                          const marcada = selecionadas.includes(t.id);
                          const confirmada = confirmados.some(a => a.teamId === t.id);
                          return (
                            <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', borderRadius: 6, cursor: 'pointer', background: confirmada ? 'rgba(63,163,77,0.08)' : 'transparent' }}>
                              <input type="checkbox" checked={marcada} onChange={e => setApurarPick(p => ({ ...p, [c.id]: e.target.checked ? [...new Set([...(p[c.id] || propostas.map(x => x.teamId)), t.id])] : (p[c.id] || propostas.map(x => x.teamId)).filter(id => id !== t.id) }))} disabled={confirmada} />
                              <span className="fx-tag" style={{ minWidth: 22, textAlign: 'center' }}>{t.clPos >= 999 ? '—' : t.clPos}º</span>
                              <Avatar src={t.foto} size={22} shape="square" fallbackColor={t.cor} initials={t.name.slice(0, 2).toUpperCase()} />
                              <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                              {confirmada ? <span className="fx-tag" style={{ background: 'rgba(63,163,77,0.15)', color: '#2e7d32', fontWeight: 600 }}>Confirmada</span> : null}
                            </label>
                          );
                        })}
                      </div>
                    )}
                    {(isAdmin || isAssociacao) && (
                      <button className="fx-btn" style={{ marginTop: 10 }} onClick={() => propor(c)}><Send size={14} /> Propor apuramento</button>
                    )}
                    {isAdmin && pendentes.length > 0 && (
                      <button className="fx-btn fx-btn-primary" style={{ marginTop: 6 }} onClick={() => confirmar(c)}><CheckCheck size={14} /> Confirmar {pendentes.length} apurada(s)</button>
                    )}
                    {confirmados.length > 0 && (
                      <div className="fx-note" style={{ marginTop: 8, fontSize: '0.76rem' }}>
                        <strong>{confirmados.length}</strong> já confirmadas no Nacional.
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {championships.length > 1 && (
        <div className="fx-note" style={{ marginTop: 12 }}>O campeonato ativo aparece no topo da página e é usado no Calendário, Resultados, Classificação e Início. Mude-o pelo seletor no topo.</div>
      )}
    </div>
  );
}

function Publicidade({ ads, updateAds }) {
  const ask = useConfirm();
  const [form, setForm] = useState({ nome: '', url: '', ordem: ads.length + 1, imagem: '', video: '', ativo: true });
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});

  function normalizarUrl(url) {
    let u = (url || '').trim();
    if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
    return u;
  }

  function adicionar() {
    const nome = form.nome.trim();
    if (!nome) return;
    const url = normalizarUrl(form.url);
    if (!url) return;
    updateAds([...ads, { id: uid('ad'), nome, url, imagem: form.imagem || '', video: (form.video || '').trim(), ordem: Number(form.ordem) || ads.length + 1, ativo: !!form.ativo, criadoEm: new Date().toISOString() }]);
    setForm({ nome: '', url: '', ordem: ads.length + 2, imagem: '', video: '', ativo: true });
  }
  function startEdit(a) { setEditId(a.id); setEditForm({ ...a }); }
  function saveEdit() {
    updateAds(ads.map(a => a.id === editId ? { ...editForm, url: normalizarUrl(editForm.url), ordem: Number(editForm.ordem) || 1 } : a));
    setEditId(null);
  }
  async function remover(a) {
    if (!(await ask({ title: 'Remover publicidade', message: `Remover "${a.nome}"?`, danger: true, confirmLabel: 'Remover' }))) return;
    updateAds(ads.filter(x => x.id !== a.id));
  }
  const ordenadas = ads.slice().sort((a, b) => (Number(a.ordem) || 0) - (Number(b.ordem) || 0) || a.nome.localeCompare(b.nome));

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Publicidade e parceiros</h1><div className="fx-sub">Adicione os banners e links dos parceiros que aparecem na página pública «Parceiros»</div></div>
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Adicionar publicidade / parceiro</h2>
        <div className="fx-form-row">
          <div className="fx-field"><label>Nome / marca</label><input className="fx-input" value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} placeholder="Ex.: Coca-Cola" /></div>
          <div className="fx-field" style={{ flex: 2 }}><label>Link do parceiro</label><input className="fx-input" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://www.marca.com" /></div>
          <div className="fx-field"><label>Ordem</label><input type="number" min="1" className="fx-input" style={{ width: 70 }} value={form.ordem} onChange={e => setForm({ ...form, ordem: e.target.value })} /></div>
        </div>
        <ImageInput value={form.imagem} onChange={imagem => setForm({ ...form, imagem })} label="Imagem / banner do parceiro" shape="square" maxDim={360} quality={0.8} fallbackColor="#26314A" initials={(form.nome || 'AD').slice(0, 2).toUpperCase()} />
        <div className="fx-field"><label>Vídeo curto (opcional — um clique nas obras muda para vídeo; máximo 1 minuto e 30 segundos; pode ser upload ou link .mp4/.webm)</label><input className="fx-input" value={form.video} onChange={e => setForm({ ...form, video: e.target.value })} placeholder="https://.../video.mp4" /></div>
        <label className="fx-switch" style={{ marginTop: 12 }}>
          <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} />
          <span>Ativa (visível para o público)</span>
        </label>
        <div style={{ marginTop: 14 }}>
          <button className="fx-btn fx-btn-primary" onClick={adicionar}><Plus size={15} /> Adicionar</button>
        </div>
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Publicidades registadas ({ads.length})</h2>
        {ordenadas.length === 0 ? <div className="fx-empty">Nenhuma publicidade registada ainda</div> : (
        <div className="fx-scroll">
        {ordenadas.map(a => (
          <div className="fx-match" key={a.id}>
            <div className="fx-match-head">
              <span>{a.nome} · <a href={a.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>{a.url}</a></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label className="fx-switch" style={{ fontSize: '0.75rem' }}>
                  <input type="checkbox" checked={!!a.ativo} onChange={e => updateAds(ads.map(x => x.id === a.id ? { ...x, ativo: e.target.checked } : x))} />
                  <span>{a.ativo ? 'Ativa' : 'Inativa'}</span>
                </label>
                <button className="fx-btn fx-btn-icon" title="Editar" onClick={() => startEdit(a)}><Pencil size={13} /></button>
                <button className="fx-btn fx-btn-icon fx-btn-danger" title="Remover" onClick={() => remover(a)}><Trash2 size={13} /></button>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <Avatar src={a.imagem} size={42} shape="square" fallbackColor="#26314A" initials={(a.nome || 'AD').slice(0, 2).toUpperCase()} />
              <div style={{ fontSize: '0.82rem', color: 'var(--ink-dim)' }}>Ordem {a.ordem || 1}</div>
              {a.video && <div className="fx-tag mvp">vídeo</div>}
            </div>
            {editId === a.id && (
              <div className="fx-form-row" style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
                <div className="fx-field"><label>Nome</label><input className="fx-input" value={editForm.nome} onChange={e => setEditForm({ ...editForm, nome: e.target.value })} /></div>
                <div className="fx-field" style={{ flex: 2 }}><label>Link</label><input className="fx-input" value={editForm.url} onChange={e => setEditForm({ ...editForm, url: e.target.value })} /></div>
                <div className="fx-field"><label>Ordem</label><input type="number" className="fx-input" style={{ width: 70 }} value={editForm.ordem} onChange={e => setEditForm({ ...editForm, ordem: e.target.value })} /></div>
              </div>
            )}
            {editId === a.id && (
              <div className="fx-field" style={{ marginTop: 10 }}>
                <label>Vídeo curto (máx. 1min30; deixe vazio para imagem)</label>
                <input className="fx-input" value={editForm.video || ''} onChange={e => setEditForm({ ...editForm, video: e.target.value })} placeholder="https://.../video.mp4" style={{ marginBottom: 10 }} />
                <button className="fx-btn fx-btn-primary" onClick={saveEdit}><Check size={14} /> Guardar</button>
                <button className="fx-btn" onClick={() => setEditId(null)}><X size={14} /> Cancelar</button>
              </div>
            )}
          </div>
        ))}
        </div>
      )}
      </div>
    </div>
  );
}

function Acessos({ config, matches, users, teamName }) {
  const cfg = (config && config[0]) || {};
  const stats = cfg.stats || {};
  const acessos = stats.acessos || {};
  const vis = Array.isArray(stats.visualizacoes) ? stats.visualizacoes : [];
  const hoje = diaLocal();
  const dias = Object.keys(acessos).sort().slice(-14);
  const totalHoje = acessos[hoje] || 0;
  const totalSemana = dias.slice(-7).reduce((s, d) => s + (acessos[d] || 0), 0);
  const totalMes = Object.keys(acessos).sort().slice(-30).reduce((s, d) => s + (acessos[d] || 0), 0);
  const maxDia = Math.max(1, ...dias.map(d => acessos[d] || 0));

  const visPorJogo = {};
  vis.forEach(v => {
    const k = v.matchId;
    visPorJogo[k] = visPorJogo[k] || { ids: new Set(), dias: {} };
    (v.ids || []).forEach(id => visPorJogo[k].ids.add(id));
    visPorJogo[k].dias[v.dia] = true;
  });

  const linhasJogos = matches
    .filter(m => visPorJogo[m.id])
    .map(m => ({ match: m, espectadores: visPorJogo[m.id].ids.size, dias: Object.keys(visPorJogo[m.id].dias).length }))
    .sort((a, b) => b.espectadores - a.espectadores || (b.match.data + b.match.hora || '').localeCompare(a.match.data + a.match.hora || ''));

  const labelDia = (d) => {
    if (d === hoje) return `${d} · hoje`;
    const date = new Date(d + 'T12:00:00');
    return `${d} · ${date.toLocaleDateString('pt-PT', { weekday: 'short' })}`;
  };

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Acessos e audiência</h1>
          <div className="fx-sub">Número de acessos diários na plataforma e utilizadores que assistiram cada jogo pela transmissão.</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
        <div className="fx-stat"><div className="n">{totalHoje}</div><div className="l">Acessos hoje</div></div>
        <div className="fx-stat"><div className="n">{totalSemana}</div><div className="l">Últimos 7 dias</div></div>
        <div className="fx-stat"><div className="n">{totalMes}</div><div className="l">Últimos 30 dias</div></div>
        <div className="fx-stat"><div className="n">{users.length}</div><div className="l">Contas registadas</div></div>
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Acessos diários <span className="fx-chipsub">últimos 14 dias</span></h2>
        {dias.length === 0 ? <div className="fx-empty">Ainda sem acessos registados.</div> : (
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, minHeight: 150, overflowX: 'auto', paddingBottom: 4 }}>
            {dias.map(d => (
              <div key={d} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, minWidth: 34 }}>
                <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 600 }}>{acessos[d] || 0}</span>
                <div style={{ width: 26, height: Math.max(4, Math.round((acessos[d] || 0) / maxDia * 110)), background: 'var(--accent)', borderRadius: 4 }} />
                <span style={{ fontSize: '0.6rem', color: 'var(--ink-dim)', textAlign: 'center', whiteSpace: 'nowrap' }}>{d.slice(5)}</span>
              </div>
            ))}
          </div>
        )}
        {dias.length > 0 && (
          <div className="fx-scroll" style={{ marginTop: 10 }}>
            <table className="fx-table">
              <thead><tr><th>Dia</th><th className="num">Acessos</th></tr></thead>
              <tbody>
                {dias.slice().reverse().map(d => (
                  <tr key={d}><td>{labelDia(d)}</td><td className="num">{acessos[d] || 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="fx-panel">
        <h2 className="fx-panel-title">Jogos assistidos <span className="fx-chipsub">utilizadores logados que abriram a transmissão</span></h2>
        {linhasJogos.length === 0 ? <div className="fx-empty">Ninguém assistiu ainda a transmissões. Quando um utilizador abre «Ver transmissão», fica aqui registado.</div> : (
          <div className="fx-scroll">
            <table className="fx-table">
              <thead><tr><th>Jogo</th><th className="num">Espectadores únicos</th><th className="num">Dias de visualização</th></tr></thead>
              <tbody>
                {linhasJogos.map(({ match: m, espectadores, dias }) => (
                  <tr key={m.id}>
                    <td><span style={{ fontWeight: 600 }}>{teamName(m.mandante)}</span> vs <span style={{ fontWeight: 600 }}>{teamName(m.visitante)}</span><div className="fx-clock">{m.data} {m.hora || ''} · Rodada {m.rodada}</div></td>
                    <td className="num">{espectadores}</td>
                    <td className="num">{dias}</td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--accent)' }}>
                  <td><span style={{ fontWeight: 600 }}>Total</span></td>
                  <td className="num">{linhasJogos.reduce((s, x) => s + x.espectadores, 0)}</td>
                  <td className="num">—</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
        <div className="fx-note" style={{ marginTop: 10 }}>Cada utilizador conta uma vez por jogo e por dia na audiência. Os acessos diários contam os inícios de sessão (admin, associação, clube, gestor e públicos).</div>
      </div>
    </div>
  );
}

function Parceiros({ ads }) {
  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Parceiros</h1><div className="fx-sub">Apoiantes e parceiros do evento</div></div>
      </div>
      {ads.some(a => a.ativo) ? (
        <AdsShow ads={ads} />
      ) : (
        <div className="fx-panel">
          <div className="fx-empty">Em breve, os parceiros deste evento.</div>
        </div>
      )}
    </div>
  );
}

function calculaClassificacao(jogos, times) {
  const table = {};
  times.forEach(t => { table[t.id] = { teamId: t.id, nome: t.name, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 }; });
  jogos.filter(m => m.status === 'realizado').forEach(m => {
    const mandante = table[m.mandante], visitante = table[m.visitante];
    if (!mandante || !visitante) return;
    const g1 = m.golsMandante || 0, g2 = m.golsVisitante || 0;
    mandante.j++; visitante.j++;
    mandante.gp += g1; mandante.gc += g2; visitante.gp += g2; visitante.gc += g1;
    if (g1 > g2) { mandante.v++; mandante.pts += 3; visitante.d++; }
    else if (g1 < g2) { visitante.v++; visitante.pts += 3; mandante.d++; }
    else { mandante.e++; visitante.e++; mandante.pts += 1; visitante.pts += 1; }
  });
  return Object.values(table).map(r => ({ ...r, sg: r.gp - r.gc }))
    .sort((a, b) => b.pts - a.pts || b.sg - a.sg || b.gp - a.gp || a.nome.localeCompare(b.nome));
}

function Exportar({ championships, teams, players, matches, teamName }) {
  const [ano, setAno] = useState('all');
  const [champId, setChampId] = useState('');
  const [rodada, setRodada] = useState('all');
  const [msg, setMsg] = useState('');

  const anos = useMemo(() => {
    const set = new Set(championships.map(c => String(c.ano).trim()).filter(Boolean));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [championships]);
  const champsDoAno = useMemo(() => {
    return ano === 'all' ? championships : championships.filter(c => String(c.ano).trim() === ano);
  }, [championships, ano]);
  const champ = championships.find(c => c.id === champId) || null;
  const champsEscopo = champ ? [champ] : champsDoAno;
  const escopo = useMemo(() => matches.filter(m => champsEscopo.some(c => c.id === m.champId)), [matches, champsEscopo]);

  const rodadas = useMemo(() => {
    const set = new Set(escopo.map(m => Number(m.rodada)).filter(n => Number.isFinite(n) && n > 0));
    return [...set].sort((a, b) => a - b);
  }, [escopo]);

  const jogos = useMemo(() => {
    const list = escopo.slice();
    if (rodada !== 'all') return list.filter(m => Number(m.rodada) === Number(rodada));
    return list;
  }, [escopo, rodada]);

  const timesEscopo = champ ? teams.filter(t => (t.champIds || []).includes(champ.id)) : teams;

  function mudarAno(v) { setAno(v); setChampId(''); setRodada('all'); }
  function mudarChamp(v) { setChampId(v); setRodada('all'); }

  function exportar() {
    if (jogos.length === 0) { setMsg('Não há jogos para exportar com os filtros selecionados.'); return; }
    const wb = XLSX.utils.book_new();
    const titulo = champ ? `${champ.nome} ${champ.ano || ''}`.trim() : (ano !== 'all' ? `Campeonato ${ano}` : 'Todos os campeonatos');
    const rotulo = rodada !== 'all' ? ` · Rodada ${rodada}` : ' · Todas as rodadas';

    const linhasJogos = jogos.slice().sort((a, b) => (Number(a.rodada) - Number(b.rodada)) || (a.data || '').localeCompare(b.data || '')).map(m => {
      const mvp = m.mvpId ? ((players.find(p => p.id === m.mvpId) || {}).nome || '—') : '';
      return {
        'Rodada': m.rodada || '',
        'Data': m.data || '',
        'Hora': m.hora || '',
        'Equipa Casa': teamName(m.mandante),
        'Golos Casa': m.status === 'realizado' ? (m.golsMandante ?? '') : '',
        'Golos Fora': m.status === 'realizado' ? (m.golsVisitante ?? '') : '',
        'Equipa Fora': teamName(m.visitante),
        'MVP': m.status === 'realizado' ? mvp : '',
        'Estado': m.status === 'realizado' ? 'Realizado' : m.status === 'ao_vivo' ? 'Ao vivo' : 'Agendado',
        'Transmissão': m.streamUrl || '',
      };
    });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhasJogos), 'Jogos');

    const cls = calculaClassificacao(jogos, timesEscopo);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cls.map((r, i) => ({
      'Pos': i + 1, 'Equipa': r.nome, 'J': r.j, 'V': r.v, 'E': r.e, 'D': r.d, 'GP': r.gp, 'GC': r.gc, 'SG': r.sg, 'Pts': r.pts,
    }))), 'Classificação');

    const gols = {};
    jogos.forEach(m => (m.eventos || []).filter(e => e.tipo === 'gol').forEach(e => { gols[e.jogadorId] = (gols[e.jogadorId] || 0) + 1; }));
    const at = Object.entries(gols).map(([id, q]) => {
      const p = players.find(x => x.id === id);
      return { 'Jogador': p ? p.nome : 'Jogador removido', 'Equipa': p ? teamName(p.teamId) : '—', 'Golos': q };
    }).sort((a, b) => b['Golos'] - a['Golos'] || a['Jogador'].localeCompare(b['Jogador']));
    at.forEach((r, i) => { r['Pos'] = i + 1; });
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(at), 'Artilharia');

    const stats = {};
    players.forEach(p => { stats[p.id] = { jogador: p.nome, equipa: teamName(p.teamId), jogos: 0, gols: 0, assists: 0, amarelos: 0, vermelhos: 0, mvps: 0, notas: [], media: 0 }; });
    jogos.filter(m => m.status === 'realizado').forEach(m => {
      const emJogo = new Set();
      (m.eventos || []).forEach(e => {
        const s = stats[e.jogadorId]; if (!s) return;
        emJogo.add(e.jogadorId);
        if (e.tipo === 'gol') s.gols++;
        if (e.tipo === 'amarelo') s.amarelos++;
        if (e.tipo === 'vermelho') s.vermelhos++;
        if (e.tipo === 'gol' && e.assist && stats[e.assist]) { stats[e.assist].assists++; emJogo.add(e.assist); }
      });
      (m.avaliacoes || []).forEach(a => { const s = stats[a.jogadorId]; if (!s) return; s.notas.push(a.nota); emJogo.add(a.jogadorId); });
      if (m.mvpId && stats[m.mvpId]) stats[m.mvpId].mvps++;
      emJogo.forEach(id => { if (stats[id]) stats[id].jogos++; });
    });
    const stRows = Object.values(stats).map(s => {
      const media = s.notas.length ? s.notas.reduce((a, b) => a + b, 0) / s.notas.length : 0;
      const indice = s.jogos ? (s.gols * 3 + s.assists * 2 + media + s.mvps * 6) / 4 : 0;
      return {
        'Jogador': s.jogador, 'Equipa': s.equipa, 'Jogos': s.jogos, 'Golos': s.gols, 'Assistências': s.assists,
        'Amarelos': s.amarelos, 'Vermelhos': s.vermelhos, 'MVP': s.mvps, 'Média': Number(media.toFixed(2)), 'Índice': Number(indice.toFixed(2)),
      };
    }).sort((a, b) => b['Índice'] - a['Índice'] || b['Golos'] - a['Golos'] || a['Jogador'].localeCompare(b['Jogador']));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(stRows), 'Estatísticas');

    const slug = titulo.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'campeonato';
    XLSX.writeFile(wb, `mozfuthouse_${slug}_rodada${rodada === 'all' ? 'todas' : rodada}.xlsx`);
    setMsg(`Ficheiro Excel exportado: ${titulo}${rotulo}`);
  }

  return (
    <div>
      <div className="fx-top">
        <div><h1 className="fx-h1">Exportar para Excel</h1><div className="fx-sub">Extração de jogos, classificação, artilharia e estatísticas de cada campeonato — filtrado por Ano, Campeonato e Rodada.</div></div>
      </div>

      <div className="fx-panel">
        <div className="fx-form-row">
          <div className="fx-field"><label>Ano</label>
            <select className="fx-select" value={ano} onChange={e => mudarAno(e.target.value)}>
              <option value="all">Todos os anos</option>
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="fx-field"><label>Campeonato</label>
            <select className="fx-select" value={champId} onChange={e => mudarChamp(e.target.value)}>
              <option value="">Todos os campeonatos</option>
              {champsDoAno.map(c => <option key={c.id} value={c.id}>{c.nome} {c.ano}</option>)}
            </select>
          </div>
          <div className="fx-field"><label>Rodada</label>
            <select className="fx-select" value={rodada} onChange={e => setRodada(e.target.value)}>
              <option value="all">Todas as rodadas</option>
              {rodadas.map(r => <option key={r} value={String(r)}>Rodada {r}</option>)}
            </select>
          </div>
          <button className="fx-btn fx-btn-primary" onClick={exportar} style={{ alignSelf: 'flex-end' }}><FileSpreadsheet size={15} /> Exportar para Excel</button>
        </div>
        <div className="fx-note" style={{ marginTop: 12 }}>Vai exportar <strong>{jogos.length} jogo(s)</strong> · {champ ? `${champ.nome} ${champ.ano}`.trim() : (ano !== 'all' ? `Ano ${ano}` : 'Todos os campeonatos')} · {rodada === 'all' ? 'todas as rodadas' : `rodada ${rodada}`} — com as folhas: Jogos, Classificação, Artilharia e Estatísticas.</div>
        {msg && <div className="fx-ok" style={{ marginTop: 8 }}>{msg}</div>}
        {championships.length === 0 && <div className="fx-empty" style={{ marginTop: 12 }}>Ainda não há campeonatos criados — crie-os primeiro em Campeonatos.</div>}
      </div>
    </div>
  );
}