import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SHOTS = join(process.env.TEMP, 'mozfuthouse_ebook_codigo');
const OUT = join(ROOT, 'EBOOK-CODIGO.md');

function img(name) {
  const f = name.endsWith('.png') ? name : name + '.png';
  const b = readFileSync(join(SHOTS, f));
  return 'data:image/png;base64,' + b.toString('base64');
}
function fig(name, cap) {
  return '\n![' + cap + '](' + img(name) + ')\n\n*' + cap + '*\n';
}
function code(rel, from, to) {
  const src = readFileSync(join(ROOT, rel), 'utf8').split('\n');
  const lines = src.slice(from - 1, to).map((l) => l.replace(/ $/, ''));
  const ext = rel.split('.').pop().toLowerCase();
  const langMap = { json: 'json', jsx: 'jsx', tsx: 'tsx', ts: 'ts', mjs: 'js', js: 'js', css: 'css' };
  const lang = langMap[ext] || 'js';
  let out = '\n```' + lang + '\n';
  out += lines.join('\n');
  out += '\n```\n';
  return out;
}
function ic(text) {
  // inline code com crases escapadas
  return '`' + text + '`';
}

const parts = [];
const P = (s) => parts.push(s);
const H1 = (s) => P('\n# ' + s + '\n');
const H2 = (s) => P('\n## ' + s + '\n');
const H3 = (s) => P('\n### ' + s + '\n');

// ============================================================
H1('MozFutHouse — O Código do Sistema Explicado Passo a Passo');
P('\n**Versão 1.0 · Setembro 2026**\n');
P('\nEste ebook explica o código real do **MozFutHouse** do início ao fim: a arquitectura, o servidor, a base de dados, a sincronização em tempo real, o frontend React e cada ecrã com a respectiva captura. Todos os excertos de código foram lidos diretamente dos ficheiros do projeto.\n');
P('\n> As capturas usam **dados de demonstração** (um campeonato provincial e um nacional, 4 equipes, 12 jogadores, 5 jogos com resultado e W.O., 5 perfis de utilizador). Os perfis e os nomes das janelas são os mesmos do código real.\n');

// ------------------------------------------------------------------
H1('1. Visão geral da arquitetura');
P('\nO MozFutHouse é uma aplicação **web de gestão de campeonatos de futsal** com três camadas bem definidas:\n');
P('\n1. **Frontend** — React + Vite (`src/`). Corre no navegador, mostra as telas e guarda cópia local em `localStorage`.\n');
P('\n2. **Servidor** — Node.js (`server/index.mjs`). Serve a aplicação compilada (`dist/`) e mantém o estado central em memória.\n');
P('\n3. **Base de dados** — SQLite (`server/db.mjs`, ficheiro `data/mozfuthouse.db`) com um espelho JSON (`data/store.json`) para inspeção manual.\n');
P('\nEntre o navegador e o servidor há **WebSocket** (`ws`) para sincronização em tempo real: quando um utilizador altera algo, todos os outros dispositivos ligados recebem a atualização imediatamente.\n');
P('\n```\n┌───────────────┐   WebSocket     ┌──────────────────────┐   SQLite   ┌───────────────┐\n│   Em Navegador │ ───────────────► │      Servidor Node   │ ─────────► │ data/db       │\n│  React / Vite  │   {type:"write"} │  HTTP + WS + estado  │  dbApply   │ store(id,data)│\n│  localStorage  │ ◄─────────────── │  em memória (store)  │ ◄───────── │ data/store.json│\n└───────────────┘   {type:"apply"}  └──────────────────────┘   espelho  └───────────────┘\n```\n');
P('\nO ciclo de vida de um dado (ex.: registrar um gol) é sempre o mesmo:\n');
P('\n1. O utilizador age numa tela (React).\n');
P('\n2. A função de atualização (`updateMatches`, etc.) guarda no `localStorage` e envia `{type:"write", key, value, removed}` pelo WebSocket.\n');
P('\n3. O servidor recebe, **funde** a nova lista com a atual (por `id`) e aplica a escrita na SQLite.\n');
P('\n4. O servidor reenvia a lista completa a **todos** os outros clientes como `{type:"apply", key, value}`.\n');
P('\n5. Cada cliente atualiza a React state e o `localStorage` — os ecrãs recalculam (classificação, artilharia, estatísticas) automaticamente.\n');

// ------------------------------------------------------------------
H1('2. Estrutura do projeto');
P('\n```\nMozFutHouse/\n├─ data/                  # base de dados (não versionada)\n│  ├─ mozfuthouse.db      # SQLite (WAL)\n│  ├─ store.json          # espelho JSON legível\n│  └─ .gitkeep\n├─ scripts/               # ferramentas de desenvolvimento\n│  ├─ gen-ebook-store.mjs # gera os dados demo deste ebook\n│  ├─ screens-ebook.mjs   # captura automática de ecrãs\n│  ├─ screens.mjs         # capturas (guia antigo)\n│  ├─ md-to-html.mjs      # Markdown → HTML (capa, estilos)\n│  └─ build-guia.mjs      # gerador do guia passo a passo\n├─ server/\n│  ├─ env.mjs             # carrega .env (0 dependências)\n│  ├─ db.mjs              # SQLite (better-sqlite3)\n│  └─ index.mjs           # servidor HTTP + WebSocket\n├─ src/\n│  ├─ lib/sync.js         # cliente WebSocket\n│  ├─ App.jsx             # toda a aplicação React (3072 linhas)\n│  ├─ main.jsx            # ponto de entrada\n│  └─ styles.css          # estilos\n├─ dist/                  # build de produção (gerado)\n├─ .env.example           # modelo das variáveis de ambiente\n├─ .npmrc                 # ignore-scripts (binários NAPI)\n├─ .gitignore             # protege dados e .env\n├─ package.json\n└─ vite.config.js\n```\n');

H2('2.1. package.json — scripts e dependências');
P(code('package.json', 6, 29));
P('\n- ' + ic('npm run dev') + ' — arranca o Vite (porta 5173) e o servidor de sincronização (porta 3000) em paralelo com `concurrently`.\n');
P('\n- ' + ic('npm run build') + ' — compila o React para `dist/`.\n');
P('\n- ' + ic('npm start') + ' — corre apenas o servidor Node, que serve `dist/` e o WebSocket.\n');
P('\n- `better-sqlite3` é a única dependência nativa; como usa binários NAPI pré-compilados, o `.npmrc` mantém `ignore-scripts=true` para não compilar nada com `node-gyp`.\n');

// ------------------------------------------------------------------
H1('3. O servidor — `server/index.mjs`');
P('\nÉ o coração do sistema. Cria um servidor HTTP (que também serve `dist/`) e um `WebSocketServer` na mesma porta (`3000` por omissão). Mantém o estado completo em memória na variável `store` e persiste na SQLite.\n');

H2('3.1. Arranque e escolha da fonte de dados');
P('\nAo iniciar, o servidor decide de onde carregar os dados — da SQLite (se tiver registos) ou do `store.json` (se a base estiver vazia, faz a migração).\n');
P(code('server/index.mjs', 10, 16));
P(code('server/index.mjs', 87, 115));
P('\nEste bloco é a ponte entre os dois mundos: `dbLoadStore(KEYS)` lê a SQLite para um objeto `{ teams: [], players: [], ... }`; se a base está vazia mas existe `store.json`, lê o JSON e chama `dbSaveAll(store)` para **migrar** para SQLite.\n');
P('\nDepois do arranque, **cada** alteração escrita pelo WebSocket é aplicada imediatamente na SQLite e também gravada em `store.json` (espelho), por segurança.\n');

H2('3.2. Endpoint HTTP `/api/state`');
P('\nO endpoint mais simples: devolve o estado completo em JSON. Usado por ferramentas externas e para depuração.\n');
P(code('server/index.mjs', 130, 153));
P('\nO resto do manipulador HTTP serve ficheiros estáticos de `dist/` com o tipo MIME correto (`MIME` define as extensões, linhas 70–85). Protege contra \"path traversal\" com `normalize` + `startsWith` (linha 146).\n');

H2('3.3. Hashes de password (PBKDF2) e recuperação');
P('\nO servidor tem a sua própria função de hash — igual à do navegador — para que a recuperação de password possa re-hash no lado do servidor.\n');
P(code('server/index.mjs', 18, 44));
P('\nA recuperação funciona em dois passos (mensagens WebSocket com prefixo `recovery`):\n');
P('\n1. **`request`** — com o email, gera um código de 6 dígitos, guarda o hash SHA-256 do código com expiração de 15 minutos (`RECOVERY_TTL_MS`) e limita a 5 tentativas. Se não há servidor de email configurado, devolve o código em modo demonstração (`mode: "demo"`).\n');
P('\n2. **`confirm`** — valida o código com `timingSafeEqual` (comparação segura contra timing attacks) e reescreve a password com PBKDF2.\n');
P(code('server/index.mjs', 168, 232));

H2('3.4. Fusão por chave — `mergeByKey`');
P('\nQuando um cliente envia uma escrita, o servidor não substitui a lista toda: **funde por `id`** respeitando a lista de ids removidos.\n');
P(code('server/index.mjs', 46, 68));
P('\nÉ este algoritmo que permite que dois dispositivos editem listas diferentes sem perder entradas: cada item novo ou alterado é colocado na posição certa, e os removidos (passados em `removed`) são eliminados.\n');

H2('3.5. Recepção de escritas e broadcast');
P('\nNo clique do WebSocket, o fluxo completo a seguir a uma mensagem `{type: "write"}` é:\n');
P(code('server/index.mjs', 234, 260));
P('\nPassos em detalhe:\n');
P('\n1. **`store[msg.key] = mergeByKey(...)`** — atualiza a memória (é esta a fonte da verdade em runtime).\n');
P('\n2. **`dbApplyWrite(msg.key, msg.value, msg.removed)`** — persiste na SQLite de forma incremental.\n');
P('\n3. **`scheduleSave()`** — escreve o espelho JSON após 300 ms de calmaria (debounce).\n');
P('\n4. **`broadcast(msg.key, store[msg.key])`** — reenvia a lista completa a todos os outros clientes como `{type: "apply"}`.\n');
P('\nO `broadcast` envia **sempre** a lista completa da chave (não só o delta), o que simplifica muito o cliente: basta substituir a lista local pela recebida.\n');

// ------------------------------------------------------------------
H1('4. A base de dados — `server/db.mjs`');
P('\nA persistência usa **SQLite** com uma única tabela genérica: cada "linha" é um registo JSON de uma das chaves do sistema. Isto dá flexibilidade total (o esquema evolui sem migrações) mantendo uma base de dados relacional real em ficheiro, com transações.\n');

H2('4.1. Esquema');
P(code('server/db.mjs', 1, 26));
P('\nA tabela `store(key, id, data, pos)` guarda:\n');
P('\n- `key` — a "tabela lógica" (`teams`, `players`, `matches`, `app_users`, `championships`, `ads`, `config`).\n');
P('\n- `id` — o id do registo; a chave primária composta `(key, id)` impede duplicados.\n');
P('\n- `data` — o objeto completo do registo em JSON.\n');
P('\n- `pos` — a posição de ordem original, para preservar a ordenação dentro da chave.\n');
P('\nO modo **WAL** (`journal_mode = WAL`) permite leituras durante escritas e melhora a robustez.\n');

H2('4.2. Carregar tudo — `dbLoadStore`');
P(code('server/db.mjs', 36, 57));
P('\nLê todas as linhas por chave, na ordem `key, pos, rowid`, e faz `JSON.parse` de cada `data`. Linhas corrompidas são ignoradas com um aviso.\n');

H2('4.3. Migração total — `dbSaveAll`');
P(code('server/db.mjs', 59, 70));
P('\nUsada na migração `store.json → SQLite`: numa **transação única**, apaga tudo e insere todos os registos com a posição original.\n');

H2('4.4. Escrita incremental — `dbApplyWrite`');
P(code('server/db.mjs', 72, 94));
P('\nÉ chamada a **cada** mensagem `write` do WebSocket. Dentro de uma transação:\n');
P('\n1. Apaga (`DELETE`) cada id presente em `removed`.\n');
P('\n2. Faz `UPDATE` para cada item — se `changes === 0` (não existia), faz `INSERT` com a nova posição (`pos` automática).\n');
P('\nAssim, um único jogo lançado ou uma equipa nova é persistido com apenas uma linha afetada, não um re-gravar completo.\n');

H2('4.5. Variáveis de ambiente');
P('\nO caminho da base pode ser alterado por `MZF_DB_FILE` (útil para testes). O `.env` é carregado por `env.mjs` **antes** de abrir a base.\n');
P(code('server/env.mjs', 8, 29));
P('\nNota: não substitui variáveis já existentes (`if (!(key in process.env))`) para não conflitar com o ambiente da máquina.\n');

// ------------------------------------------------------------------
H1('5. Sincronização no navegador — `src/lib/sync.js`');
P('\nEste módulo é o cliente WebSocket. Manter uma única ligação, reconectar automaticamente e reagir a eventos é a base de toda a "tempo real" do sistema.\n');
P(code('src/lib/sync.js', 1, 30));
P('\n- `resolveSyncUrl()`: usa `wss` em HTTPS, e aponta para a porta 3000 quando a app está no Vite (portas 5173/4173).\n');
P('\n- `KEYS`: a lista fechada de chaves sincronizadas — qualquer mensagem com outra chave é ignorada.\n');
P('\n- `subscribe(fn)` / `emit`: padrão mínimo de observador; os componentes registam-se para receber atualizações.\n');

H2('5.1. Ligação e mensagens');
P(code('src/lib/sync.js', 33, 61));
P('\nAo ligar, o servidor envia `{type: "state", store}` — o cliente distribui **todas** as chaves de uma vez (linhas 46–49). Depois, cada `{type: "write"}` com `origin` igual ao deste cliente é ignorado (linha 55: já sabemos — foi o nosso próprio envio); os restantes atualizam a chave com o valor recebido.\n');

H2('5.2. Enviar escritas e pedir recuperação');
P(code('src/lib/sync.js', 63, 101));
P('\n- `pushWrite(key, value, removedIds)` é o canal de ida: o React envia por aqui todas as alterações.\n');
P('\n- `scheduleReconnect()` fecha a porta da "morte" da ligação e tenta de novo a cada 5 segundos.\n');
P('\n- `recoveryRequest(payload)` é uma promessa com **timeout de 15 s**: usada pelo ecrã de recuperação de password; o servidor responde com `recovery-reply`.\n');

// ------------------------------------------------------------------
H1('6. O frontend — `src/App.jsx`');
P('\nTodo o frontend (todos os ecrãs, autenticação, permissões e cálculos) vive num único ficheiro de 3072 linhas. Esta secção explica as peças estruturais antes de passarmos aos ecrãs.\n');

H2('6.1. Entrada e ponto de montagem');
P(code('src/main.jsx', 1, 5));

H2('6.2. Autenticação — hashing no navegador');
P('\nA password **nunca** trafega em claro nem é guardada: é transformada localmente com PBKDF2 (100 000 iterações, SHA-256, salt aleatório de 16 bytes). O formato guardado é `mzf:pbkdf2:100000:<salt hex>:<hash hex>`.\n');
P(code('src/App.jsx', 56, 93));
P('\nA mesma função `hashPassword` usada no registo é usada no login (via `verifyPassword`) — e é compatível com o hash do servidor, pois são a mesma spec PBKDF2.\n');

H2('6.3. Persistência local e sessão');
P('\nO `localStorage` guarda uma cópia de cada chave (prefixo `mozfuthouse.`), o que faz a app abrir **instantaneamente** com dados locais enquanto o WebSocket não chega. A sessão ativa vive no `sessionStorage` (morre ao fechar o separador), com `pagehide` como segurança para browsers sem `sessionStorage`.\n');
P(code('src/App.jsx', 118, 168));

H2('6.4. Estado global, load inicial e subscrição');
P('\nO estado é declarado com `useState` por chave (linhas 205–215). Um `dataRef` espelha sempre o estado mais recente para evitar closures desatualizadas (linhas 224–225). No arranque, lê tudo do `localStorage` e, se a sessão existir, autentica o utilizador (linhas 227–252).\n');
P('\nDepois liga o WebSocket e subscreve: cada chave recebida atualiza o estado e o `localStorage` (linhas 254–276). Há ainda uma migração automática de jogos antigos sem `champId` (linhas 236–243) — um detecta o campeonato comum entre as duas equipes.\n');
P(code('src/App.jsx', 254, 291));
P('\nAs funções `updateXXX` (linhas 278–284) são o **único** ponto de escrita do frontend: fazem `setState`, `persist` e `pushWrite` — tudo em três linhas. Qualquer tela que altere dados passa por aqui, garantindo consistência.\n');

H2('6.5. Perfis e permissões');
P('\nA autorização é por **perfil** (`role`) mais **permissões granulares** para contas públicas elevadas.\n');
P(code('src/App.jsx', 319, 331));
P('\n- `isAdmin` / `isGestor` / `isAssociacao` / `isClube` — papéis rígidos.\n');
P('\n- `permG(k)` — permissão granular (`equipas`, `calendario`, `resultados`, `transmissoes`) que o admin pode dar a contas públicas.\n');
P('\n- As gates `gestaoConteudo`, `gestaoCalendario`, `gestaoResultados`, `gestaoConvocados`, `gestaoOps` e `podeEditarResultadosLancados` definem o que cada perfil vê e edita em cada tela.\n');

H2('6.6. Navegação por perfil');
P('\nCada perfil tem a sua barra de navegação — o **menu muda** consoante a função do utilizador:\n');
P(code('src/App.jsx', 550, 602));
P('\n- **ADMIN** — tudo: Início, Equipes, Jogadores, Calendário, Resultados, Transmissões, Classificação, Artilharia, Melhor Jogador, Campeonatos, Exportar, Publicidade, Utilizadores Públicos, Utilizadores.\n');
P('\n- **GESTOR** — apenas Resultados.\n');
P('\n- **ASSOCIAÇÃO** — Início, Equipes, Calendário, Resultados, Artilharia, Melhor Jogador (ligada ao campeonato).\n');
P('\n- **CLUBE** — Início, Calendário, Jogadores, Classificação, Artilharia, Melhor Jogador (voltado à sua equipa).\n');
P('\n- **PÚBLICO** — Início, Equipes, Jogadores, Calendário, Ver jogos, Parceiros, Classificação, Artilharia, Melhor Jogador (sem edição).\n');

H2('6.7. Cálculos derivados (standings, artilharia, índice)');
P('\nClassificação, artilharia e estatísticas são **`useMemo`** — recalculadas automaticamente quando os dados mudam, sem servidor. O ranking usa os critérios oficiais: pontos, saldo de gols, gols pró e nome.\n');
P(code('src/App.jsx', 474, 533));
P('\nO índice do melhor jogador é: média de (Golos ×3, Assistências ×2, Nota 0–10, MVP ×6), só para quem já jogou (`jogos > 0`).\n');

// ============================================================
H1('7. Os ecrãs, passo a passo (com capturas)');
P('\nEsta secção percorre cada tela real do sistema. Em cada uma apresentamos a imagem e o componente do `App.jsx` responsável.\n');

// ---- ENTREGA ----
H2('7.1. Portão de entrada (login, registo e recuperação)');
P('\nA tela inicial depende do estado da base:\n');
P('\n- **Sem nenhum utilizador** → formulário "Criar conta de Administrador" (`isSetup = !hasUsers`). O primeiro acesso torna-se o admin.\n');
P('\n- **Com utilizadores** → separadores **Entrar** e **Criar conta pública**, e o link **Esqueci-me da password**.\n');
P(fig('01_login_gate', 'Figura 1 — Portão de entrada: entrar com a conta do campeonato.'));
P(fig('01b_registo_publico', 'Figura 2 — Criar conta pública (sem acesso de edição).'));
P('\nA lógica está no componente `AuthGate` (linhas 816–982) e nos handlers `handleLogin`, `handleRegistoPublico`, `handleSetupAdmin`, `handleRecuperar` do componente principal.\n');
P('\nO login tem **bloqueio anti-força-bruta**: após 5 tentativas falhadas (`MAX_TENTATIVAS_LOGIN`), o acesso fica congelado por 60 s (`BLOQUEO_MS`).\n');
P(code('src/App.jsx', 343, 379));

// ---- ADMIN ----
H2('7.2. Início (painel do campeonato)');
P(fig('02_admin_inicio', 'Figura 3 — Painel Início do administrador.'));
P('\nO componente `Inicio` (linhas 1446–1534) mostra: números rápidos (equipes, jogos realizados, rodada), os **próximos jogos** (cada um abre a escalação) e os destaques (líder, artilheiro, melhor jogador). Os anúncios (`AdsShow`) aparecem no topo.\n');
P(code('src/App.jsx', 1446, 1468));

H2('7.3. Equipes');
P(fig('03_admin_equipes', 'Figura 4 — Equipes: registo e listagem por campeonato.'));
P('\nO componente `Equipes` (linhas 1569–1686) permite criar equipas com **nome, cidade, treinador, cor e escudo**, e associá-las a um ou mais campeonatos (`ChampPick`, linhas 1549–1567). Remover uma equipa remove também os seus jogadores e jogos (linhas 1598–1603).\n');
P(code('src/App.jsx', 1587, 1603));

H2('7.4. Jogadores');
P(fig('04_admin_jogadores', 'Figura 5 — Jogadores por equipe, posição e número.'));
P('\nO componente `Jogadores` (linhas 1688–1828) regista atletas com número, posição (Goleiro/Fixo/Ala/Pivô), equipa e foto. Um perfil **Clube** só vê e edita a sua própria equipa (`souClube = !!myTeamId`).\n');
P(code('src/App.jsx', 1699, 1714));

H2('7.5. Calendário');
P(fig('05_admin_calendario', 'Figura 6 — Calendário por rodada, com W.O. e transmissões.'));
P('\nO componente `Calendario` (linhas 1903–2126) agrupa jogos por rodada. Cada jogo suporta **Adiar** (nova data/hora/local — reservado a Admin/Associação), **W.O.** (a equipa presente vence por 6–0), **Transmissão** e **Convocados**. A lista é filtrada pelo campeonato ativo e, para um perfil Clube, restrita aos seus jogos.\n');
P(code('src/App.jsx', 1924, 1947));
P('\nO registo de W.O. marca `wo: true` e `woFaltante`, com placar fixo 6–0 para a equipa presente (linhas 1941–1947).\n');

H2('7.6. Convocados e escalação');
P(fig('06_admin_escalacao', 'Figura 7 — Modal de convocados e escalação do jogo.'));
P('\nO modal `EscalacaoModal` (linhas 1838–1901) atribui a cada jogador um estado: Titular, Suplente (banco), Lesionado, Suspenso (acumulação) ou Suspenso (vermelho direto). Jogadores com **vermelho recente** recebem o selo correspondente (linha 1845) para ajudar na decisão.\n');
P(code('src/App.jsx', 1838, 1853));

H2('7.7. Resultados');
P(fig('07_admin_resultados', 'Figura 8 — Resultados: jogos por lançar e já lançados.'));
P('\nO componente `Resultados` (linhas 2128–2330) abre um jogo e permite colocar placar, **gols com assistência**, cartões, avaliações (0–10) e o **MVP**. O botão "Contar do registo" recalcula o placar pelos eventos (linhas 2163–2166).\n');
P(code('src/App.jsx', 2140, 2175));
P('\nA regra de negócio central está em `isReadOnly`: um resultado já lançado fica em **modo leitura** a não ser para Admin/Associação (`podeEditarResultadosLancados`). O Gestor vê mas não altera.\n');
P(fig('18_gestor_resultado_leitura', 'Figura 9 — Resultado já lançado visto por um Gestor (modo leitura).'));

H2('7.8. Classificação');
P(fig('08_admin_classificacao', 'Figura 10 — Classificação automática.'));
P('\nO componente `Classificacao` (linhas 2475–2504) apenas renderiza a tabela derivada em `standings` (ver secção 6.7). Nenhum cálculo aqui — tudo vem do `useMemo` do pai.\n');
P(code('src/App.jsx', 2920, 2935));

H2('7.9. Artilharia');
P(fig('09_admin_artilharia', 'Figura 11 — Melhores marcadores do campeonato.'));
P('\n`Artilharia` (linhas 2506–2526) apresenta um pódio ordenado por gols. A contagem vem de `artilheiros` (useMemo no pai, linhas 492–502), que percorre os `eventos` com `tipo === "gol"` dos jogos.\n');

H2('7.10. Melhor Jogador (Estatísticas)');
P(fig('10_admin_estatisticas', 'Figura 12 — Estatísticas e índice do melhor jogador.'));
P('\n`Estatisticas` (linhas 2528–2566) mostra jogos, gols, assistências, cartões, MVPs, média de avaliação e o **índice**. A fórmula do índice combina gols, assistências, nota e MVPs (secção 6.7).\n');

H2('7.11. Campeonatos');
P(fig('11_admin_campeonatos', 'Figura 13 — Campeonatos: criação, equipas e apuramento para o Nacional.'));
P('\n`Campeonatos` (linhas 2590–2800) permite: criar campeonatos (Provincial/Cidade/Nacional), associar equipas (uma a uma ou por cidade), definir **vagas** para o Nacional e **apurar** as primeiras da classificação (linhas 2635–2647).\n');
P(code('src/App.jsx', 2635, 2647));

H2('7.12. Transmissões / Ver jogos');
P(fig('12_admin_transmissoes', 'Figura 14 — Gestão de transmissões.'));
P('\n`Transmissoes` (linhas 2345–2473) lista os jogos com link. `embedUrl` (linhas 2332–2343) converte links de YouTube/Vimeo/Twitch para iframe incorporável. Ao escolher um jogo, um reprodutor incorporado mostra a transmissão com o placar a atualizar-se em tempo real.\n');
P(fig('31_publico_ao_vivo', 'Figura 15 — Reproductor incorporado (jogo ao vivo, vista pública).'));

H2('7.13. Publicidade e Parceiros');
P(fig('13_admin_publicidade', 'Figura 16 — Gestão de publicidade (admin).'));
P('\n`Publicidade` (linhas 2802–2901) cria banners com imagem/vídeo, ordem e estado ativo. `Parceiros` (linhas 2903–2918) é a versão pública — um **slideshow automático** (`AdsShow`, linhas 1366–1444).\n');
P(fig('30_publico_parceiros', 'Figura 17 — Parceiros vistos pelo público (slideshow).'));

H2('7.14. Exportar para Excel');
P(fig('14_admin_exportar', 'Figura 18 — Exportação Excel com filtros de ano, campeonato e rodada.'));
P('\n`Exportar` (linhas 2937–3072) gera um `.xlsx` com as folhas **Jogos**, **Classificação**, **Artilharia** e **Estatísticas**, tudo com a biblioteca `xlsx`. A classificação reutiliza `calculaClassificacao` (a mesma função que o ecrã).\n');
P(code('src/App.jsx', 2970, 2996));

H2('7.15. Utilizadores Públicos');
P(fig('15_admin_publico', 'Figura 19 — Contas públicas: bloquear, permissões granulares e remover.'));
P('\n`ControloPublico` (linhas 1273–1365) gerencia as contas criadas pelos visitantes: bloquear/desbloquear (`toggleBloqueio`) e dar permissões granulares (`setPermissao`).\n');

H2('7.16. Utilizadores (controlo de acessos)');
P(fig('16_admin_utilizadores', 'Figura 20 — Gestão de utilizadores internos: criar Gestor, Associação, Clube ou Admin.'));
P('\n`Utilizadores` (linhas 1016–1271) cria contas internas. O perfil **Associação** fica ligado a um campeonato (`champId`); o perfil **Clube** a um campeonato e a uma equipa (`teamId`). Inclui backup/restauro JSON, logo do sistema e a zona de perigo (reset total).\n');
P(code('src/App.jsx', 426, 439));

// ---- OUTROS PERFIS ----
H2('7.17. Perfil Gestor');
P('\nO menu do Gestor tem **apenas** "Resultados". Pode lançar resultados mas, depois de lançados, abre-os em **modo leitura** (Figura 9 acima).\n');
P(fig('17_gestor_inicio', 'Figura 21 — Ecrã de um Gestor (apenas Resultados).'));

H2('7.18. Perfil Associação');
P(fig('19_assoc_inicio', 'Figura 22 — Início visto por uma Associação (ligada ao seu campeonato).'));
P('\nA Associação abrange Início, Equipes, Calendário, Resultados, Artilharia e Melhor Jogador, sempre **fechada no campeonato associado** (o seletor de campeonato fica bloqueado — `locked`). Pode ainda **editar/anular resultados lançados** (`podeEditarResultadosLancados`), Adiar jogos e registar W.O.\n');
P(fig('20_assoc_equipes', 'Figura 23 — Equipes vistas pela Associação (campeonato fixo).'));
P(fig('22_assoc_resultados', 'Figura 24 — Resultados pela Associação (pode lançar e editar).'));

H2('7.19. Perfil Clube');
P(fig('23_clube_inicio', 'Figura 25 — Início visto por um Clube: só jogos da sua equipa.'));
P('\nO Clube gere a **sua equipa**: no Início, só aparecem os jogos em que a equipa participa (`myTeamId`); pode registar jogadores, definir convocados/escalação e ver classificação/artilharia.\n');
P(fig('24_clube_jogadores', 'Figura 26 — Jogadores vistos pelo Clube (só a sua equipa).'));
P(fig('25_clube_calendario', 'Figura 27 — Calendário visto pelo Clube (só os seus jogos).'));

H2('7.20. Perfil Público');
P(fig('26_publico_inicio', 'Figura 28 — Início público (próximos jogos clicáveis).'));
P(fig('27_publico_calendario', 'Figura 29 — Calendário público, com resumo de convocados.'));
P(fig('28_publico_classificacao', 'Figura 30 — Classificação pública.'));
P(fig('29_publico_transmissoes', 'Figura 31 — "Ver jogos" público: escolha de transmissão.'));
P('\nO público vê tudo (excepto gestão) **sem botões de edição** (`gestao=false` em todas as telas), e ainda os **Parceiros** com slideshow (Figura 17).\n');

// ------------------------------------------------------------------
H1('8. Fluxo de um dado, de ponta a ponta');
P('\nPara fechar, vamos seguir uma **alteração real** do início ao fim — por exemplo, lançar um resultado ou escalar um jogador. Cada passo corresponde a código já visto:\n');
P('\n**1. Ação na tela** — o utilizador carrega em "Guardar" num ecrã React; o componente chama `updateMatches([...])`.\n');
P('\n**2. Frontend** — `updateMatches` faz `setMatches(next)` + `persist("matches", next)` + `pushWrite("matches", next, removed)` (linhas 278–284 do `App.jsx`).\n');
P('\n**3. WebSocket** — `pushWrite` envia `{type:"write", key:"matches", value:[...], removed:[...], origin:clientId}`.\n');
P('\n**4. Servidor** — `socket.on("message")` valida `type` e `key`, depois `store.matches = mergeByKey(...)` (memória), `dbApplyWrite(...)` (SQLite), `scheduleSave()` (JSON espelho) e `broadcast("matches", store.matches)` (linhas 240–256 do `server/index.mjs`).\n');
P('\n**5. SQLite** — `dbApplyWrite` faz UPDATE/INSERT de cada linha, em transação;\n');
P('\n**6. Outros clientes** — recebem `{type:"apply", key:"matches", value:[...]}`; `onmessage` em `sync.js` emite a chave; o `subscribe` no `App.jsx` faz `setMatches(value)` + `persist`.\n');
P('\n**7. Recalculo** — os `useMemo` (standings, artilheiros, stats) reexecutam, e cada tela baseada neles atualiza na hora.\n');
P('\n```\nEcrã React → updateMatches → pushWrite(WS) → server: mergeByKey + dbApplyWrite + broadcast\n     ▲                                                                │\n     └──────────── subscribe(WS) ← apply ← broadcast ←──────────────┘\n      │                                                               │\n      └─── localStorage ← persist  →  SQLite (write-through)  ◄──────┘\n```\n');

// ------------------------------------------------------------------
H1('9. Regras de negócio importantes');
P('\n- **Perfis**: 5 papéis (Admin, Gestor, Associação, Clube, Público). Admins e Associação podem editar/anular resultados lançados; Gestor não.\n');
P('\n- **Associação/Clube** ficam "presos" a um campeonato (e a uma equipa, no caso do Clube) — o seletor de campeonato fica bloqueado.\n');
P('\n- **W.O.**: falta de comparecência → 6–0 para a equipa presente, com `wo` e `woFaltante`.\n');
P('\n- **Adiar jogo**: só Admin/Associação, muda data/hora/local de um jogo agendado.\n');
P('\n- **Bloqueio de login**: 5 tentativas → 60 s de espera.\n');
P('\n- **Recuperação**: código de 6 dígitos com 15 min de validade, 5 tentativas, comparação segura.\n');
P('\n- **Sessão**: `sessionStorage` apaga ao fechar o separador; `localStorage` mantém os dados para arranque rápido.\n');
P('\n- **Primeiro arranque**: sem utilizadores → cria o Administrador, que depois cria os restantes acessos.\n');

// ------------------------------------------------------------------
H1('10. Ficheiros-chave e onde encontrar cada coisa');
P('\n| Ficheiro | Responsabilidade |\n|---|---|\n');
P('| `server/index.mjs` | HTTP + WebSocket, estado, fusão, broadcast, recuperação |\n');
P('| `server/db.mjs` | SQLite: esquema, carga, migração, escrita incremental |\n');
P('| `server/env.mjs` | Carregamento do `.env` |\n');
P('| `src/lib/sync.js` | Cliente WebSocket (ligação, reconexão, push, recovery) |\n');
P('| `src/App.jsx` | Todos os ecrãs, autenticação, permissões, cálculos |\n');
P('| `src/main.jsx` | Ponto de entrada React |\n');

// ------------------------------------------------------------------
H1('11. Conclusão');
P('\nO MozFutHouse é um sistema completo de gestão de campeonatos com **uma escolha técnica simples e consistente**: um único servidor que serve a app, mantém o estado em memória, persiste em SQLite (com espelho JSON) e sincroniza todos os dispositivos por WebSocket. O frontend mantém uma cópia local, o que o torna rápido e tolerante a falhas de rede, e os cálculos (classificação, artilharia, estatísticas) são feitos no navegador a partir de uma fonte de verdade única.\n');
P('\nCom 5 perfis de acesso, blocos de negócio como W.O., adiamento, transmissões e exportação Excel, o sistema cobre o ciclo completo de um campeonato — desde a criação das equipes até ao apuramento para o Nacional — sempre com atualização em tempo real para todos os espetadores.\n');
P('\n© 2026 MozFutHouse.\n');

writeFileSync(OUT, parts.join('\n'), 'utf8');
console.log('Ebook de código escrito:', OUT, '— tamanho aproximado:', Math.round(parts.join('').length / 1024), 'KB');