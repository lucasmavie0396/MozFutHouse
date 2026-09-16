import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const curDir = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(curDir, '..', 'data', 'store.json');

function hashPw(pw) {
  const salt = randomBytes(16);
  const key = pbkdf2Sync(String(pw), salt, 100000, 32, 'sha256');
  return 'mzf:pbkdf2:100000:' + salt.toString('hex') + ':' + key.toString('hex');
}

function svg(color, txt, bg) {
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="220"><rect width="640" height="220" fill="${bg}"/><text x="50%" y="50%" font-family="Arial Black, Arial" font-size="46" fill="${color}" text-anchor="middle" dominant-baseline="middle">${txt}</text></svg>`
  );
}

const now = new Date().toISOString();

const champProvincial = { id: 'champ_demo', nome: 'Campeonato Provincial de Maputo', ano: 2026, nivel: 'provincial', vagas: 2, apuracoes: [], criadoEm: now };
const champNacional = { id: 'champ_nac', nome: 'Campeonato Nacional', ano: 2026, nivel: 'nacional', vagas: 0, apuracoes: [], criadoEm: now };

const teams = [
  { id: 'team_demo1', name: 'Ferroviário de Maputo', cidade: 'Maputo', tecnico: 'Nuno Machel', cor: '#e11d48', foto: '', champIds: ['champ_demo'], criadoEm: now },
  { id: 'team_demo2', name: 'Desportivo Topos', cidade: 'Matola', tecnico: 'Ivan Chissano', cor: '#2563eb', foto: '', champIds: ['champ_demo'], criadoEm: now },
  { id: 'team_demo3', name: 'ADM de Gaza', cidade: 'Xai-Xai', tecnico: 'Salomão Cossa', cor: '#16a34a', foto: '', champIds: ['champ_demo', 'champ_nac'], criadoEm: now },
  { id: 'team_demo4', name: 'Académica de Inhambane', cidade: 'Inhambane', tecnico: 'Celso Macuácua', cor: '#ea580c', foto: '', champIds: ['champ_nac'], criadoEm: now },
];

const players = [
  { id: 'pl1', nome: 'José Macamo', numero: 1, posicao: 'Goleiro', teamId: 'team_demo1', foto: '', criadoEm: now },
  { id: 'pl2', nome: 'Carlos Tembe', numero: 7, posicao: 'Ala', teamId: 'team_demo1', foto: '', criadoEm: now },
  { id: 'pl3', nome: 'Nelson Sitoe', numero: 4, posicao: 'Fixo', teamId: 'team_demo1', foto: '', criadoEm: now },
  { id: 'pl4', nome: 'Amílcar Uane', numero: 9, posicao: 'Pivô', teamId: 'team_demo1', foto: '', criadoEm: now },
  { id: 'pl5', nome: 'Manuel Matsinhe', numero: 1, posicao: 'Goleiro', teamId: 'team_demo2', foto: '', criadoEm: now },
  { id: 'pl6', nome: 'Edson Nhaca', numero: 10, posicao: 'Ala', teamId: 'team_demo2', foto: '', criadoEm: now },
  { id: 'pl7', nome: 'Fernando Sambo', numero: 3, posicao: 'Fixo', teamId: 'team_demo2', foto: '', criadoEm: now },
  { id: 'pl8', nome: 'David Candieiro', numero: 11, posicao: 'Pivô', teamId: 'team_demo2', foto: '', criadoEm: now },
  { id: 'pl9', nome: 'Venâncio Mabjaia', numero: 8, posicao: 'Ala', teamId: 'team_demo3', foto: '', criadoEm: now },
  { id: 'pl10', nome: 'Jorge Mavie', numero: 5, posicao: 'Fixo', teamId: 'team_demo3', foto: '', criadoEm: now },
  { id: 'pl11', nome: 'Rui Daura', numero: 2, posicao: 'Goleiro', teamId: 'team_demo4', foto: '', criadoEm: now },
  { id: 'pl12', nome: 'Tomás Mondlane', numero: 6, posicao: 'Pivô', teamId: 'team_demo4', foto: '', criadoEm: now },
];

const matches = [
  {
    id: 'mt1', champId: 'champ_demo', rodada: 1, data: '2026-09-12', hora: '18:30', local: 'Pavilhão do Ferroviário',
    mandante: 'team_demo1', visitante: 'team_demo2', status: 'realizado', golsMandante: 4, golsVisitante: 2,
    eventos: [
      { jogadorId: 'pl2', tipo: 'gol', assist: 'pl3' },
      { jogadorId: 'pl4', tipo: 'gol', assist: 'pl2' },
      { jogadorId: 'pl6', tipo: 'gol', assist: 'pl7' },
      { jogadorId: 'pl2', tipo: 'gol', assist: 'pl3' },
      { jogadorId: 'pl6', tipo: 'amarelo', assist: '' },
      { jogadorId: 'pl8', tipo: 'vermelho', assist: '' },
      { jogadorId: 'pl4', tipo: 'gol', assist: 'pl2' },
    ],
    avaliacoes: [
      { jogadorId: 'pl1', nota: 8 }, { jogadorId: 'pl2', nota: 10 }, { jogadorId: 'pl3', nota: 7 },
      { jogadorId: 'pl4', nota: 9 }, { jogadorId: 'pl5', nota: 6 }, { jogadorId: 'pl6', nota: 8 }, { jogadorId: 'pl7', nota: 7 },
    ],
    mvpId: 'pl2', streamUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4', streamOn: false, criadoEm: now,
  },
  {
    id: 'mt_wo', champId: 'champ_demo', rodada: 1, data: '2026-09-13', hora: '16:00', local: 'Pavilhão Municipal de Xai-Xai',
    mandante: 'team_demo2', visitante: 'team_demo3', status: 'realizado', golsMandante: 6, golsVisitante: 0,
    eventos: [], avaliacoes: [], mvpId: '', wo: true, woFaltante: 'team_demo3', streamUrl: '', streamOn: false, criadoEm: now,
  },
  {
    id: 'mt2', champId: 'champ_demo', rodada: 2, data: '2026-09-18', hora: '19:00', local: 'Pavilhão do Ferroviário',
    mandante: 'team_demo1', visitante: 'team_demo3', status: 'agendado', golsMandante: 0, golsVisitante: 0,
    eventos: [], avaliacoes: [], mvpId: '',
    convocados: {
      team_demo1: [{ jogadorId: 'pl1', status: 'titular' }, { jogadorId: 'pl2', status: 'titular' }, { jogadorId: 'pl3', status: 'banco' }, { jogadorId: 'pl4', status: 'lesionado' }],
      team_demo3: [{ jogadorId: 'pl9', status: 'titular' }, { jogadorId: 'pl10', status: 'titular' }],
    },
    streamUrl: 'https://www.youtube.com/watch?v=ScMzIvxBSi4', streamOn: true, criadoEm: now,
  },
  {
    id: 'mt3', champId: 'champ_demo', rodada: 2, data: '2026-09-20', hora: '17:00', local: 'Pavilhão do Desportivo',
    mandante: 'team_demo2', visitante: 'team_demo1', status: 'agendado', golsMandante: 0, golsVisitante: 0,
    eventos: [], avaliacoes: [], mvpId: '', streamUrl: '', streamOn: false, criadoEm: now,
  },
  {
    id: 'mt4', champId: 'champ_nac', rodada: 1, data: '2026-10-02', hora: '18:00', local: 'Estádio Nacional',
    mandante: 'team_demo3', visitante: 'team_demo4', status: 'agendado', golsMandante: 0, golsVisitante: 0,
    eventos: [], avaliacoes: [], mvpId: '', streamUrl: '', streamOn: false, criadoEm: now,
  },
];

const ads = [
  { id: 'ad_demo1', nome: 'BrewMoz Cervejas', url: 'https://brewmoz.co.mz', imagem: svg('#7c2d12', 'BrewMoz', '#fdba74'), video: '', ordem: 1, ativo: true, criadoEm: now },
  { id: 'ad_demo2', nome: 'Emag Logística', url: 'https://emag.co.mz', imagem: svg('#1e3a8a', 'Emag', '#93c5fd'), video: '', ordem: 2, ativo: true, criadoEm: now },
  { id: 'ad_demo3', nome: 'Vacance Viagens', url: 'https://vacance.co.mz', imagem: svg('#14532d', 'Vacance', '#86efac'), video: '', ordem: 3, ativo: true, criadoEm: now },
];

const store = {
  teams,
  players,
  matches,
  app_users: [
    { id: 'adm_demo', nome: 'Sistema / Admin', email: 'admin@mozfuthouse.mz', hash: hashPw('admin123'), role: 'admin', bloqueado: false, permissoes: {}, criadoEm: now, ultimoLogin: now },
    { id: 'ges_demo', nome: 'Gestor de Jogos', email: 'gestor@mozfuthouse.mz', hash: hashPw('gestor123'), role: 'gestor', bloqueado: false, permissoes: {}, criadoEm: now, ultimoLogin: now },
    { id: 'ass_demo', nome: 'Associação de Maputo', email: 'associacao@mozfuthouse.mz', hash: hashPw('assoc123'), role: 'associacao', champId: 'champ_demo', bloqueado: false, permissoes: {}, criadoEm: now, ultimoLogin: now },
    { id: 'clu_demo', nome: 'Ferroviário de Maputo (Administrador do Clube)', email: 'clube@mozfuthouse.mz', hash: hashPw('clube123'), role: 'clube', champId: 'champ_demo', teamId: 'team_demo1', bloqueado: false, permissoes: {}, criadoEm: now, ultimoLogin: now },
    { id: 'pub_demo', nome: 'Visitante Público', email: 'publico@example.com', hash: hashPw('publico123'), role: 'publico', bloqueado: false, permissoes: {}, criadoEm: now, ultimoLogin: now },
  ],
  championships: [champProvincial, champNacional],
  ads,
  config: [{ id: 'app', logo: '', acoes: [], atualizadoEm: now }],
};

writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
console.log('Ebook demo store escrito em', DATA_FILE);
console.log('Admin      : admin@mozfuthouse.mz / admin123    (adm_demo)');
console.log('Gestor     : gestor@mozfuthouse.mz / gestor123  (ges_demo)');
console.log('Associação : associacao@mozfuthouse.mz / assoc123 (ass_demo)');
console.log('Clube      : clube@mozfuthouse.mz / clube123     (clu_demo)');
console.log('Público    : publico@example.com / publico123    (pub_demo)');