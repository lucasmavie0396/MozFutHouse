import WebSocket from 'ws';

const ws = new WebSocket('ws://localhost:3000');
const etapas = {};

function esperar(m) { return new Promise((res) => setTimeout(res, m)); }

function enviar(key, value, removed) {
  ws.send(JSON.stringify({ type: 'write', key, value, removed: removed || [] }));
}

function aguardarConfig() {
  return new Promise((res, rej) => {
    const timer = setTimeout(() => rej(new Error('timeout')), 8000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if ((msg.type === 'state' || msg.type === 'apply' || msg.type === 'write') && msg.store && msg.store.config) {
        const cfg = msg.store.config[0] || {};
        clearTimeout(timer);
        res({ logoLen: cfg.logo ? cfg.logo.length : 0, acoes: cfg.acoes ? cfg.acoes.length : 0, atualizadoEm: cfg.atualizadoEm });
      }
    });
  });
}

await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });

etapas.antes = await aguardarConfig();
console.log('estado inicial (servidor):', JSON.stringify(etapas.antes));

const cfgBase = { id: 'app', atualizadoEm: new Date().toISOString() };
enviar('config', [{ ...cfgBase, acoes: [{ tipo: 'teste', atorNome: 'teste', info: 'teste', data: new Date().toISOString() }] }]);
await esperar(800);

enviar('config', [{ ...cfgBase, logo: 'data:image/png;base64,LOGO_DE_TESTE_PERSISTE' }]);
await esperar(800);

const estado = await fetch('http://localhost:3000/api/state').then(r => r.json());
const cfg = estado.config[0];
etapas.apos = { logoLen: cfg.logo ? cfg.logo.length : 0, acoes: cfg.acoes ? cfg.acoes.length : 0 };
console.log('apos write parcial (simula guardarLogo):', JSON.stringify(etapas.apos));

const logoOk = etapas.apos.logoLen > 0;
const acoesOk = etapas.apos.acoes >= 1;
console.log(`RESULTADO: logo preservado=${logoOk} | acoes preservado=${acoesOk} | ${logoOk && acoesOk ? 'PASS' : 'FAIL'}`);
ws.close();
process.exit(logoOk && acoesOk ? 0 : 1);