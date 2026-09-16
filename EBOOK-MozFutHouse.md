# MozFutHouse — Guia Completo do Sistema

**Versão 2.0 · Setembro 2026**

Um documento que explica, do início ao fim, como funciona o **MozFutHouse** — a plataforma de gestão e divulgação de campeonatos de futsal.

---

## Índice

1. [Introdução](#1-introdução)
2. [Arquitetura e como o sistema funciona](#2-arquitetura-e-como-o-sistema-funciona)
3. [Instalação e arranque](#3-instalação-e-arranque)
4. [Contas e perfis de utilizador](#4-contas-e-perfis-de-utilizador)
5. [Primeira configuração (passo a passo)](#5-primeira-configuração-passo-a-passo)
6. [Guia dos ecrãs de administração](#6-guia-dos-ecrãs-de-administração)
7. [Gestão de campeonatos](#7-gestão-de-campeonatos)
8. [Exportar para Excel](#8-exportar-para-excel)
9. [Transmissões de jogos ao vivo](#9-transmissões-de-jogos-ao-vivo)
10. [Recuperação e reset de passwords](#10-recuperação-e-reset-de-passwords)
11. [Sincronização em tempo real](#11-sincronização-em-tempo-real)
12. [Base de dados e estruturas](#12-base-de-dados-e-estruturas)
13. [Cópias de segurança](#13-cópias-de-segurança)
14. [Segurança](#14-segurança)
15. [Personalização (logo e parceiros)](#15-personalização-logo-e-parceiros)
16. [Convocados e escalação por jogo](#16-convocados-e-escalação-por-jogo)
17. [Slideshow de publicidade](#17-slideshow-de-publicidade)
18. [Adiar jogos e falta de comparecência (W.O.)](#18-adiar-jogos-e-falta-de-comparecência-wo)
19. [Restrições por perfil](#19-restrições-por-perfil)
20. [Resolução de problemas](#20-resolução-de-problemas)
21. [Referência técnica rápida](#21-referência-técnica-rápida)

---

## 1. Introdução

O **MozFutHouse** é uma aplicação web para gerir competições de futsal: criar campeonatos, registar equipas e jogadores, agendar jogos, lançar resultados em tempo real, ver classificação, artilharia, estatísticas de jogadores, transmitir jogos e apresentar a informação ao público.

A principal caraterística do sistema é a **sincronização em tempo real**: tudo o que o administrador faz fica imediatamente visível nos dispositivos em que o público está a ver o campeonato, sem refrescar a página.

### O que se pode fazer no MozFutHouse

| Área | Descrição |
|---|---|
| Campeonatos | Criar campeonatos com nome, ano e tipo (Provincial, Cidade, Nacional) |
| Equipas | Registo com nome, cidade, treinador, cor, escudo/foto e campeonatos |
| Jogadores | Atletas com número, posição (Goleiro, Fixo, Ala, Pivô) e foto |
| Calendário | Agendar jogos por rodada com data, hora, local e pares de equipas |
| Adiar jogos | Remarcar jogos para nova data, hora e local (só admin/associação) |
| W.O. | Registar falta de comparecência — a equipa presente vence por 6–0 |
| Convocados | Escalação por jogo: titulares, suplentes, lesionados e suspensos |
| Resultados | Lançar placares, gols, cartões, avaliações, assistências e MVP |
| Transmissões | Colocar links (YouTube, Vimeo, Twitch) e marcar "ao vivo" |
| Classificação | Tabela automática (pontos, golos marcados/sofridos, diferença) |
| Artilharia / Estatísticas | Melhores marcadores e melhor jogador por índice |
| Excel | Exportar cada campeonato para ficheiro `.xlsx` |
| Público | Contas públicas, deAssociação e deClube com permissões configuráveis |
| Backup | Exportar/importar todos os dados em JSON e repor tudo |

---

## 2. Arquitetura e como o sistema funciona

### 2.1 As três peças

```
┌─────────────────────────┐      WebSocket       ┌─────────────────────────────┐
│  Frontend (navegador)    │ ◄─────────────────► │  Servidor de sincronização   │
│  Vite + React + sync.js  │  (ws://localhost:3000) │  Node.js + ws               │
└─────────────────────────┘                      └──────────┬──────────────────┘
                                                           │ guarda (300 ms)
                                                           ▼
                                                  data/store.json
```

1. **Frontend** — A aplicação React (um único ficheiro `src/App.jsx`, mais `src/lib/sync.js`). Corre no navegador e é servido pelo Vite.

2. **Servidor de sincronização** (`server/index.mjs`) — Um servidor Node.js que:
   - serve a aplicação compilada (`dist/`) na porta **3000**;
   - expõe o WebSocket para manter todos os ecrãs iguais em tempo real;
   - guarda os dados em disco no ficheiro `data/store.json`.

3. **Dados** — Tudo é guardado num único ficheiro JSON (`data/store.json`), organizado por "chaves": `teams`, `players`, `matches`, `app_users`, `championships`, `ads` e `config`.

### 2.2 O ciclo de vida de um dado

1. O utilizador preenche o formulário e carrega em "Guardar".
2. O frontend atualiza o estado local e chama `updateMatches(...)`, que:
   - guarda no `localStorage`;
   - envia uma mensagem `write` ao servidor pelo WebSocket.
3. O servidor recebe `{ type: 'write', key, value, removed }`, junta com os dados existentes (`mergeByKey`) e:
   - grava em `data/store.json` (throttled 300 ms);
   - faz `broadcast` do novo estado para **todos os clientes ligados**.
4. Os outros ecrãs recebem `{ type: 'apply', key, value }` e atualizam a interface automaticamente.

### 2.3 Modo tolerante a falhas

O frontend guarda uma cópia local no `localStorage` (prefixo `mozfuthouse.`). Se o servidor se desligar, ninguém perde o trabalho. Quando volta, o servidor reconstrói a partir dos clientes que têm dados.

---

## 3. Instalação e arranque

### 3.1 Pré-requisitos

- Node.js (versão LTS recente).
- npm (vem com o Node.js).

### 3.2 Instalar dependências

```bash
npm install
```

### 3.3 Comandos disponíveis

| Comando | O que faz |
|---|---|
| `npm run dev` | Frontend (Vite) + servidor de sincronização |
| `npm run dev:web` | Só o frontend (http://localhost:5173) |
| `npm run dev:sync` | Só o servidor de sincronização (http://localhost:3000) |
| `npm run build` | Compila para `dist/` |
| `npm run preview` | Serve `dist/` (http://localhost:4173) |
| `npm start` | Só o servidor Node (serve `dist/` na porta 3000) |

### 3.4 Arranque recomendado

```bash
npm run dev
```

Depois abra **http://localhost:5173** e/ou **http://localhost:3000**.

---

## 4. Contas e perfis de utilizador

O sistema tem **cinco perfis**:

| Perfil | O que pode fazer |
|---|---|
| **Administrador** | Tudo: equipas, jogadores, calendário, resultados, transmissões, campeonatos, exportação, publicidade, contas, reset de passwords, definições |
| **Gestor** | Menu reduzido — **lança resultados** de jogos agendados (não pode editar/Cancelar jogos já realizados) |
| **Associação** | Equipes, Calendário (com gestão completa), Resultados, Artilharia, Melhor Jogador. Pode adiar jogos, registar W.O. e gerir contas associadas ao campeonato |
| **Clube** | Equipes (sua equipa), Calendário (só jogos da sua equipa), Jogadores (sua equipa), Classificação, Artilharia, Melhor Jogador |
| **Público** | Consulta: início, equipas, jogadores, calendário, transmissões, classificação, artilharia, melhores. Pode receber permissões de edição |

### 4.1 Primeira conta (setup)

Quando `data/store.json` não tem utilizadores, o ecrã de entrada mostra **"Criar conta de Administrador"**. É o primeiro acesso, que gere toda a plataforma.

### 4.2 Contas públicas

Os visitantes podem criar conta no separador **"Criar conta pública"**, dando nome, email e password. Ficam com o perfil "Público".

### 4.3 Permissões das contas públicas (admin)

Na página **Utilizadores Públicos**, o administrador pode:

- **Bloquear / desbloquear** contas;
- dar/revogar **permissões** individuais:

| Permissão | O que permite ao público |
|---|---|
| `equipas` | Gerir equipas e jogadores |
| `calendario` | Agendar jogos |
| `resultados` | Lançar resultados |
| `transmissoes` | Colocar links de transmissão |

- **Remover** contas públicas;
- Consultar o **registo de atividades**.

### 4.4 Contas de Associação e Clube

Criadas pelo administrador na página **Utilizadores**:

| Perfil | Campos adicionais |
|---|---|
| **Associação** | Campeonato associado — o utilizador fica automaticamente no campeonato escolhido |
| **Clube** | Campeonato associado + Equipa do clube — o utilizador só vê os jogos da sua equipa |

Ao criar uma conta de Associação ou Clube, o admin seleciona o campeonato e (para Clube) a equipa. Estas contas aparecem na secção "Contas registadas" mas **não misturadas** com as contas públicas (que se gerem no separador "Utilizadores Públicos").

### 4.5 Contas internas (admin/gestor)

Criadas pelo administrador na página **Utilizadores**. Aí pode:

- editar nome, email e **password** de qualquer conta (botão lápis → campo "Nova password");
- remover contas (nunca a própria, nunca o último Administrador).

### 4.6 Reset de passwords (admin)

O administrador pode repor a password de qualquer utilizador:

1. Vai a **Utilizadores** → encontra a conta → carrega no botão lápis ✏️.
2. No modal de edição, preenche o campo **"Nova password (opcional — deixe vazio para manter a atual)"**.
3. Clica em **Guardar** — a password antiga é substituída por uma nova (hash PBKDF2).
4. O utilizador pode agora entrar com a nova password.

### 4.7 Sessão e logout

A sessão vive em `sessionStorage` — fechar o browser faz **logout automático**. F5 mantém a sessão.

> Se o `sessionStorage` estiver desativado, existe um fallback com limpeza ao fechar a página.

---

## 5. Primeira configuração (passo a passo)

1. **Criar a conta de Administrador** (primeiro arranque).
2. **Criar campeonato(s)** → menu **Campeonatos** (nome, ano, tipo).
3. **Criar equipas** → menu **Equipes** e associar ao campeonato.
4. **Criar jogadores** → menu **Jogadores**.
5. **Criar contas de Associação/Clube** → menu **Utilizadores** (para cada campeonato/equipa).
6. **Agendar jogos** → menu **Calendário**.
7. **Definir convocados e escalação** — botão «👥» no Calendário ou Início.
8. **(Opcional) Colocar transmissões** → Calendário ou Transmissões.
9. **Lançar resultados** → menu **Resultados**.
10. O público passa a ver tudo em Início, Classificação, Artilharia, etc.

> Regras:
> - Campeonato precisa de **pelo menos 2 equipas**.
> - Mandante ≠ visitante.
> - Para adiar ou registar W.O., apenas **Administrador ou Associação**.

---

## 6. Guia dos ecrãs de administração

### 6.1 Início

Painel de resumo: equipas, jogos realizados, rodada mais recente, destaques (líder, artilheiro, melhor jogador). Lista **"Próximos jogos"** — click num jogo abre os **Convocados**.

### 6.2 Equipes

- Criar equipas (nome, cidade, treinador, cor, foto/escudo e campeonatos).
- Editar e apagar. Apagar uma equipa remove também os seus jogadores e jogos (confirmação).

### 6.3 Jogadores

- Registar: nome, número, posição, equipa e foto.
- Filtrar por posição e equipa. Editar e apagar.

### 6.4 Calendário

- **Agendar jogo** para o campeonato ativo: rodada, data, hora, local, mandante e visitante.
- Lista por rodada com estado (Agendado/Realizado), sinal W.O., transmissão e resumo dos convocados.
- **Definir transmissão** de cada jogo (link + ao vivo).
- **Convocados e escalação** (botão 👥).
- **Adiar jogo** (só admin/associação) — botão «📅 Adiar» → formulário inline com nova data, hora e local.
- **W.O.** (só admin/associação) — botão «⚠ W.O.» → overlay pergunta qual equipa faltou → regista 6–0.
- Remover jogos.

### 6.5 Resultados

- **Jogos por lançar**: o Gestor pode abrir e preencher.
- **Jogos já lançados**:
  - **Administrador/Associação**: badge "Editar" — pode alterar placar, gols, cartões, avaliações, MVP e anular resultado.
  - **Gestor**: badge "Ver" — pode visualizar mas **não pode editar nem anular**. O editor abre em modo leitura (fieldset desativado) com aviso: *"Este resultado já foi lançado e está em modo de leitura."*
- Funções: placar, gols/cartões por jogador, assistência, avaliações (0–10), MVP, "Contar do registo", Guardar, Anular.

### 6.6 Transmissões / Ver jogos

- Lista de jogos por campeonato (seletor de campeonato no topo).
- Filtragem automática: ao selecionar um campeonato, só aparecem os seus jogos.
- O ecrã de jogo incorpora vídeo (YouTube, Vimeo, Twitch ou URL direto) com placar ao vivo.
- Textos contextuais atualizam com o nome do campeonato.

### 6.7 Classificação, Artilharia, Melhor Jogador

- **Classificação**: automática (pontos → diferença → golos → nome).
- **Artilharia**: contagem de gols por jogador.
- **Melhor Jogador** (estatísticas): jogos, gols, assistências, amarelos, vermelhos, MVPs, média e Índice.
  - **Índice = (Golos ×3 + Assistências ×2 + Nota média + MVPs ×6) ÷ 4**

### 6.8 Utilizadores

Página exclusiva do administrador:

1. **Criar conta** (Gestor, Administrador, Associação ou Clube) — com seleção de campeonato e equipa conforme o perfil.
2. **Contas registadas** — só contas internas (admin, gestor, associação, clube). As públicas gerem-se no separador "Utilizadores Públicos".
3. **Editar conta** — nome, email, password, campeonato e equipa (modal com campo de password).
4. **Identidade do sistema** — logo.
5. **Cópia de segurança** — exportar/importar JSON.
6. **Zona de perigo** — "Repor tudo".

### 6.9 Utilizadores Públicos

Pesquisa, bloqueio, permissões, remoção e registo de atividades.

### 6.10 Publicidade / Parceiros

Criar entradas (nome, link, ordem, imagem, vídeo curto e estado). As ativas aparecem em Parceiros e no Início em slideshow automático.

---

## 7. Gestão de campeonatos

### 7.1 Tipos

| Tipo | Significado |
|---|---|
| `provincial` | Equipas da província |
| `cidade` | Equipas da cidade |
| `nacional` | Apurados para o nacional (recebe equipas apuradas) |

### 7.2 Associar equipas

Uma equipa pode pertencer a **um ou mais campeonatos**. Associa em Equipes (seletor) ou no cartão do campeonato.

### 7.3 Apurar para o Nacional

No campeonato de origem, o botão de apuramento pega na classificação e junta as equipas apuradas ao Nacional.

### 7.4 Campeonato ativo

O banner no topo mostra o campeonato selecionado. Calendário, Resultados, Classificação, Artilharia, Estatísticas e **Transmissões** respeitam essa escolha.

---

## 8. Exportar para Excel

Página **Exportar** (só admin): gera `.xlsx` com 4 folhas (Jogos, Classificação, Artilharia, Estatísticas). Filtrável por ano, campeonato e rodada. Usa SheetJS no navegador.

---

## 9. Transmissões de jogos ao vivo

1. No **Calendário** ou **Transmissões**, colocar o link de transmissão.
2. Ligar "AO VIVO" quando o jogo começa.
3. Na página **Ver jogos**, o público vê:
   - Vídeo incorporado (YouTube, Vimeo, Twitch ou URL);
   - Placar em tempo real;
   - Se o link não for reconhecido, aparece como ligação externa.

**Filtro por campeonato**: a secção Ver jogos tem um seletor de campeonato. Ao selecionar um campeonato, só os seus jogos aparecem. O título e subtítulo atualizam automaticamente.

---

## 10. Recuperação e reset de passwords

### 10.1 Recuperação pelo utilizador

1. Ecrã de entrada → **"Esqueci-me da password"**.
2. Introduz email → sistema gera código de 6 dígitos.
3. O código é enviado por email **ou** mostrado no ecrã (modo demonstração).
4. Introduz código e nova password (mín. 4 caracteres).

### 10.2 Reset pelo administrador

1. Vai a **Utilizadores** → carrega no lápis ✏️ da conta.
2. Preenche **"Nova password (opcional — deixe vazio para manter a atual)"**.
3. Clica em **Guardar**.
4. A password antiga é substituída por uma nova (hash PBKDF2).

### 10.3 Configurar email (SMTP)

| Variável | Valor |
|---|---|
| `MAIL_HOST` | Servidor SMTP |
| `MAIL_PORT` | Porta (587 / 465) |
| `MAIL_SECURE` | true / false |
| `MAIL_USER` | Utilizador SMTP |
| `MAIL_PASS` | Password SMTP |
| `MAIL_FROM` | (opcional) Remetente |

Sem `MAIL_HOST`, o código aparece no ecrã (modo demo).

---

## 11. Sincronização em tempo real

O WebSocket em `ws://<host>:3000`:

- **Arranque**: cliente liga, servidor envia estado completo.
- **Alterações**: write → mergeByKey → broadcast a todos (exceto origem).
- **Reconexão**: a cada 5 segundos. Dados offline ficam guardados.
- **Recuperação de password**: mensagens `recovery` com `reqId`.

---

## 12. Base de dados e estruturas

Tudo em `data/store.json`. Cada secção é um array de objetos.

### Equipa (`teams`)

```
id, name, cidade, tecnico, cor, foto, champIds[], criadoEm
```

### Jogador (`players`)

```
id, nome, numero, posicao, teamId, foto, criadoEm
```

### Jogo (`matches`)

```
id, champId, rodada, data, hora, local,
mandante, visitante,
status (agendado|realizado),
golsMandante, golsVisitante,
eventos[{jogadorId, tipo: gol|amarelo|vermelho, assist}],
avaliacoes[{jogadorId, nota}],
mvpId,
convocados{ [teamId]: [{jogadorId, status}] },
streamUrl, streamOn,
wo (booleano — jogo terminou por W.O.),
woFaltante (id da equipa que não compareceu),
criadoEm
```

### Conta (`app_users`)

```
id, nome, email,
hash (mzf:pbkdf2:100000:salthex:keyhex),
role (admin|gestor|associacao|clube|publico),
champId (para associacao e clube),
teamId (para clube),
bloqueado, permissoes{}, criadoEm, ultimoLogin
```

### Campeonato (`championships`)

```
id, nome, ano, nivel (provincial|cidade|nacional), vagas, apuracoes[], criadoEm
```

### Publicidade (`ads`)

```
id, nome, url, imagem, video, ordem, ativo, criadoEm
```

### Configuração (`config`)

```
[{ id: 'app', logo, acoes[{id, tipo, atorNome, info, data}], atualizadoEm }]
```

---

## 13. Cópias de segurança

- **Exportar**: baixa `mozfuthouse-backup-ANO-MES-DIA.json`.
- **Importar**: restaura a partir de backup válido.
- **Repor tudo** (zona de perigo): apaga tudo. **Sempre exportar antes.**

---

## 14. Segurança

- **Passwords**: PBKDF2 com 100 000 iterações (SHA-256), formato `mzf:pbkdf2:100000:...`.
- **Limitação de login**: após 5 tentativas falhadas, bloqueio de 60 segundos.
- **Bloqueio por admin**: contas públicas podem ser bloqueadas.
- **Sessão por janela**: `sessionStorage` — fechar = logout.
- **Recuperação**: códigos de 6 dígitos com validade (15 min) e limite de tentativas (5).
- **Reset pelo admin**: o administrador pode repor passwords de qualquer conta.
- **Remoções com confirmação**: sempre pedido de confirmação.
- **Boundary React**: erro mostra "Tentar novamente" em vez de ecrã branco.

---

## 15. Personalização (logo e parceiros)

### 15.1 Logo

Em **Utilizadores → Identidade do sistema**: escolher imagem, guardar ou remover.

### 15.2 Parceiros / publicidade

Entradas de publicidade (nome, link, imagem, vídeo curto, ordem, estado). Aparecem em Parceiros e no Início em slideshow (4 seg. por imagem, vídeo com mute/autoplay).

---

## 16. Convocados e escalação por jogo

Para cada jogo, lista de convocados por equipa:

| Estado | Significado |
|---|---|
| Não convocado | Não entra na lista |
| **Titular** | Começa na quadra |
| Suplente | Convocado, entra do banco |
| Lesionado | Indisponível por lesão |
| Suspenso (acumulação) | Castigado por cartões |
| Suspenso (vermelho direto) | Expulso/indisponível |

- Acesso: botão «👥 Convocados» no Calendário ou Início.
- Guardado no próprio jogo (`convocados`).
- Resumo visível: `Equipa: X convocados · Y titulares · Z indisponíveis`.

---

## 17. Slideshow de publicidade

Entradas ativas num carrossel automático:

- **Imagens**: alternam a cada 4 segundos.
- **Vídeos curtos** (máx. 90 seg.): autoplay muted, com botão de som. O carrossel avança no fim do vídeo.
- Setas e indicadores para navegação manual.

---

## 18. Adiar jogos e falta de comparecência (W.O.)

### 18.1 Adiar jogo

Quando é necessário remarcar um jogo:

1. No **Calendário**, o Administrador ou a Associação vê o botão **«📅 Adiar»** nos jogos agendados.
2. Ao clicar, abre um formulário inline com **Nova data**, **Hora** e **Local**.
3. Preenche os novos dados e clica em **"Guardar adiamento"**.
4. O jogo é atualizado com a nova data, hora e local. O estado mantém-se "Agendado".

> **Quem pode adiar**: apenas **Administrador** e **Associação**. Gestores, Clubes e Público não veem este botão.

### 18.2 Falta de comparecência (W.O.)

Quando uma equipa não comparece ao jogo:

1. O Administrador ou a Associação clica no botão **«⚠ W.O.»** no Calendário (jogos agendados).
2. Aparece um overlay a perguntar: **"Qual equipa não compareceu?"** — duas opções com os nomes das equipas.
3. Ao escolher, aparece um pedido de confirmação: *"[Equipa] não compareceu. [Equipa presente] vence por 6–0. Registrar?"*
4. Ao confirmar:
   - O jogo passa a estado **"Realizado"** com `wo: true`.
   - O placar é definido automaticamente: **0–6** (se a mandante faltou) ou **6–0** (se a visitante faltou).
   - Aparece a tag **"W.O."** no cabeçalho do jogo (Calendário, Resultados e Transmissões).
   - A linha de estado mostra **"W.O."** em vez de "Realizado".

> **Anular W.O.**: o Administrador/Associação pode anular o resultado no menu Resultados, que repõe o estado a "Agendado" e limpa as flags `wo` e `woFaltante`.

---

## 19. Restrições por perfil

### 19.1 Gestor — Resultados

O Gestor pode **lançar resultados** de jogos agendados (abrir, preencher placar, gols, cartões, avaliações, MVP e guardar). Contudo, **não pode**:

- **Editar** resultados de jogos já realizados — o editor abre em modo leitura (fieldset desativado).
- **Anular** resultados de jogos já realizados — o botão "Anular" não aparece.
- Na lista "Jogos já lançados", o badge mostra **"Ver"** em vez de "Editar".

### 19.2 Clube

O Clube só vê:
- Os jogos da **sua equipa** no Calendário.
- As equipas associadas ao seu campeonato.
- Os jogadores da sua equipa.
- Classificação, Artilharia e Melhor Jogador do campeonato ativo.

**Não vê** os botões de Adiar, W.O., Definir transmissão ou Convocados (gestão do calendário).

### 19.3 Associação

A Associação pode:
- Gerir equipas e jogadores.
- Agendar jogos e defini-los no calendário.
- **Adiar jogos** (botão «📅 Adiar»).
- **Registar W.O.** (botão «⚠ W.O.»).
- Lançar resultados (incluindo edição e anulação de realizados).
- Ver Artilharia e Melhor Jogador.

### 19.4 Público

Pode consultar:
- Início, Equipas, Jogadores, Calendário, Ver jogos (Transmissões), Classificação, Artilharia, Melhor Jogador, Parceiros.

Pode receber permissões adicionais de edição (§4.3).

---

## 20. Resolução de problemas

| Problema | Solução |
|---|---|
| Página em branco | Ctrl+Shift+R. Se persistir, F12 → Console. |
| "Ocorreu um erro" | Clique "Tentar novamente". |
| Dados antigos | Refresh forçado; reinicie `npm run dev:sync`. |
| Portas ocupadas | Mate processos Node existentes. |
| Sincronização não atualiza | Confirme mesma rede e porta 3000 acessível. |
| Exportação vazia | Filtro sem jogos — adicione jogos primeiro. |
| Email não chega | Configure SMTP (§10.3) ou use modo demo. |
| BD apagada | Restaure backup (§13). |

---

## 21. Referência técnica rápida

### 21.1 Ficheiros principais

| Ficheiro | Papel |
|---|---|
| `src/App.jsx` | Toda a interface (auth, ecrãs, componentes) |
| `src/lib/sync.js` | Cliente WebSocket (`connectSync`, `subscribe`, `pushWrite`) |
| `src/styles.css` | Estilo + responsivo |
| `server/index.mjs` | Servidor HTTP + WebSocket + persistência |
| `data/store.json` | Base de dados |
| `dist/` | Build de produção |

### 21.2 API e protocolo

- **HTTP**: `GET /api/state` → JSON completo do store.
- **WebSocket** (`ws://host:3000`):
  - `{ type: 'state', store }` — servidor → cliente (arranque);
  - `{ type: 'write', key, value, removed, origin }` — cliente → servidor;
  - `{ type: 'apply', key, value }` — servidor → todos;
  - `{ type: 'recovery', ... }` — recuperação de password.

### 21.3 Regras de negócio essenciais

- Classificação: **apenas jogos realizados** (vitória 3 pts, empate 1 pt).
- Desempate: pontos → diferença de golos → golos marcados → nome.
- W.O.: a equipa presente vence por **6–0** automaticamente.
- Gestor: **não pode** editar/Cancelar resultados de jogos já realizados.
- Adiar/W.O.: **só** Administrador e Associação.
- Passwords: PBKDF2 (100k iterações, SHA-256). Reset pelo admin disponível.

---

© 2026 MozFutHouse. Documento gerado a partir da implementação real do sistema.
