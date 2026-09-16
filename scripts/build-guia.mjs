import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SHOTS = join(process.env.TEMP, 'mozfuthouse_ebook');
const OUT = join(here, '..', 'EBOOK-GUIA-PASSO-A-PASSO.md');

function img(name) {
  const f = name.endsWith('.png') ? name : name + '.png';
  const b = readFileSync(join(SHOTS, f));
  return `data:image/png;base64,${b.toString('base64')}`;
}
function fig(name, cap) {
  return `\n![${cap}](${img(name)})\n\n*${cap}*\n`;
}

const md = `# MozFutHouse — Guia Passo a Passo (com imagens)

**Versão 1.0 · Setembro 2026**

Este guia mostra, com **capturas de ecrã reais do sistema**, todo o caminho para deixar o **MozFutHouse** preparado e **disponível para o público** — desde a instalação até ao acesso por qualquer pessoa na internet.

> As capturas usam **dados de exemplo**. As credenciais de demonstração são:
> **Administrador** — \`admin@mozfuthouse.mz\` / \`admin123\`
> **Público** — \`publico@example.com\` / \`publico123\`

---

## Índice

- [1. Pré-requisitos](#1-pré-requisitos)
- [2. Instalar as dependências](#2-instalar-as-dependências)
- [3. Primeiro arranque e criar a conta de Administrador](#3-primeiro-arranque-e-criar-a-conta-de-administrador)
- [4. Painel principal](#4-painel-principal)
- [5. Criar o campeonato](#5-criar-o-campeonato)
- [6. Criar e associar equipas](#6-criar-e-associar-equipas)
- [7. Registar jogadores](#7-registar-jogadores)
- [8. Agendar jogos (Calendário)](#8-agendar-jogos-calendário)
- [9. Convocados e escalação por jogo](#9-convocados-e-escalação-por-jogo)
- [10. Lançar resultados (gols, assistências, MVP)](#10-lançar-resultados-gols-assistências-mvp)
- [11. Classificação e Melhor Jogador](#11-classificação-e-melhor-jogador)
- [12. Publicidade e parceiros](#12-publicidade-e-parceiros)
- [13. Exportar o campeonato para Excel](#13-exportar-o-campeonato-para-excel)
- [14. Modo produção](#14-modo-produção)
- [15. Como o público vê o sistema](#15-como-o-público-vê-o-sistema)
- [16. Disponibilizar ao público (internet)](#16-disponibilizar-ao-público-internet)

---

## 1. Pré-requisitos

- **Node.js** (LTS mais recente) — descarregue em https://nodejs.org.
- **npm** (vem com o Node.js).
- **Chrome ou Edge** (para ver o sistema; também útil para as partes de captura).
- Uma **rede/telemóvel** se quiser testar com vários aparelhos ao mesmo tempo.

Abra um terminal na pasta do projeto MozFutHouse para os comandos abaixo.

## 2. Instalar as dependências

Na pasta do projeto:

\`\`\`bash
npm install
\`\`\`

Este comando instala tudo o que o sistema precisa (React, Vite, WebSocket, exportação Excel, etc.).

## 3. Primeiro arranque e criar a conta de Administrador

Inicie o sistema em modo de desenvolvimento:

\`\`\`bash
npm run dev
\`\`\`

Abra **http://localhost:5173** (ou **http://localhost:3000**).

Na primeira vez, a base de dados não tem nenhuma conta, e o sistema mostra o ecrã **"Criar conta de Administrador"**:
${fig('setup', 'Figura 1 — Ecrã inicial: criar a conta de Administrador.')}

Preencha **nome, email e password** e carregue em **Criar conta**. Esta conta gere tudo.

## 4. Painel principal

Depois de entrar, o painel **Início** resume o campeonato (equipas, jogos, rodada) e mostra os **Próximos jogos** — cada jogo é clicável e abre a **escalação**:
${fig('01_inicio_admin', 'Figura 2 — Painel Início do Administrador, com a lista de próximos jogos.')}

## 5. Criar o campeonato

No menu **Campeonatos**, carregue em **Criar campeonato** e defina **nome, ano e tipo** (Provincial, Cidade ou Nacional):
${fig('02_campeonatos', 'Figura 3 — Página Campeonatos com o campeonato criado.')}

## 6. Criar e associar equipas

No menu **Equipes**, registe cada equipa (nome, cidade, treinador, **cor**, escudo e **campeonato**). Use o seletor **"Campeonatos desta equipe"** para ligar a equipa ao campeonato:
${fig('03_equipes', 'Figura 4 — Página Equipes: duas equipas associadas ao campeonato.')}

## 7. Registar jogadores

No menu **Jogadores**, adicione os atletas (nome, número, posição — Goleiro/Fixo/Ala/Pivô — e equipa). É com estes jogadores que se fazem as escalações por jogo:
${fig('04_jogadores', 'Figura 5 — Página Jogadores: elencos das duas equipas.')}

## 8. Agendar jogos (Calendário)

No menu **Calendário**, escolha o campeonato e agende os jogos por **rodada**, com data, hora, local, mandante e visitante:
${fig('05_calendario', 'Figura 6 — Calendário com jogos por rodada e resumo dos convocados.')}

## 9. Convocados e escalação por jogo

Em cada jogo, abra o **👥 Convocados e escalação** (no Calendário ou ao clicar no jogo no Início). Marque cada jogador como **Titular**, **Suplente**, **Lesionado**, **Suspenso (acumulação)** ou **Suspenso (vermelho direto)**:
${fig('06_escalacao', 'Figura 7 — Painel de escalação do jogo: titulares, lesionados e suspensos.')}

> Quem já teve **vermelho recente** aparece com o selo correspondente, para facilitar a decisão de suspensão.

## 10. Lançar resultados (gols, assistências, MVP)

No menu **Resultados**, abra o jogo e registe placar, **gols com assistência**, cartões, avaliações e o **MVP** (estrela) do jogo:
${fig('09_resultados', 'Figura 8 — Página Resultados com os jogos lançados.')}

## 11. Classificação e Melhor Jogador

A **Classificação** calcula-se sozinha a partir dos jogos realizados. O **Melhor Jogador** usa o índice (Golos×3, Assistências×2, Nota, MVP×6):
${fig('07_classificacao', 'Figura 9 — Classificação automática do campeonato.')}
${fig('08_melhor_jogador', 'Figura 10 — Estatísticas e Melhor Jogador por índice.')}

## 12. Publicidade e parceiros

No menu **Publicidade**, registe os parceiros (nome, link, imagem, **vídeo curto** opcional e estado). Os ativos aparecem no slideshow automático:
${fig('10_publicidade', 'Figura 11 — Publicidade/parceiros do evento.')}

## 13. Exportar o campeonato para Excel

No menu **Exportar** (apenas admin), filtre por **ano, campeonato e rodada** e descarregue o ficheiro Excel (.xlsx) com jogos, classificação, artilharia e estatísticas:
${fig('11_exportar', 'Figura 12 — Tela Exportar com os filtros.')}

## 14. Modo produção

Para servir a versão final (mais rápida) usando apenas o servidor Node empacotado:

\`\`\`bash
npm run build
npm start
\`\`\`

- \`npm run build\` gera a aplicação otimizada em \`dist/\`.
- \`npm start\` serve tudo (aplicação + dados + WebSocket) em **http://localhost:3000**.

> No Windows, para manter o servidor a correr em segundo plano, use um processo destacado (ex.: \`Start-Process\`) ou mantenha a janela do terminal aberta.

## 15. Como o público vê o sistema

Entre com uma **conta pública** (criada no ecrã de entrada ou pelo administrador). O público vê Início, Calendário (com escalações), Classificação e Parceiros, sem botões de edição:
${fig('12_publico_inicio', 'Figura 13 — Início visto por uma conta pública (próximos jogos clicáveis).')}
${fig('13_publico_calendario', 'Figura 14 — Calendário público, com resumo dos convocados por jogo.')}
${fig('14_publico_parceiros', 'Figura 15 — Parceiros: slideshow automático de publicidade.')}
${fig('15_publico_classificacao', 'Figura 16 — Classificação visível ao público.')}

## 16. Disponibilizar ao público (internet)

O servidor está na porta **3000**; só falta expor essa porta para a internet. Opções simples e gratuitas:

\`\`\`bash
# Opção 1 — cloudflared (túnel seguro, sem conta)
cloudflared tunnel --url http://localhost:3000

# Opção 2 — ngrok
ngrok http 3000

# Opção 3 — localtunnel
npx localtunnel --port 3000
\`\`\`

Qualquer uma delas devolve um endereço público (ex.: \`https://xxxx.trycloudflare.com\`) para partilhar com o público. Para uso permanente, alugue uma **VPS** e execute \`npm run build\` + \`npm start\` nela, apontando o domínio para a porta 3000.

### Avisos importantes

- A **porta 3000** já serve a aplicação **e** a sincronização em tempo real (WebSocket) — os visitantes só precisam desse endereço.
- Se a base de dados **não tiver nenhum administrador**, o **primeiro visitante cria a conta de Administrador** — crie as contas antes de divulgar o link público.
- Contas públicas são criadas por qualquer visitante no ecrã de entrada; o administrador pode depois bloquear/remover na página **Utilizadores Públicos**.

---

## Ficheiros gerados neste guia

| Ficheiro | O que é |
|---|---|
| \`data/store.json\` | Base de dados (foi usado um set de demonstração) |
| \`data/store_backup_20260916_antes_demo.json\` | Cópia da BD vazia — pode restaurar para recomeçar |
| \`scripts/gen-demo-store.mjs\` | Gerador dos dados de demonstração |
| \`scripts/screens.mjs\` e \`scripts/screens-public.mjs\` | Capturas de ecrã (automatizadas) |
| \`EBOOK-GUIA-PASSO-A-PASSO.md/.html/.pdf\` | Este guia |

© 2026 MozFutHouse.
`;

writeFileSync(OUT, md, 'utf8');
console.log('Guia escrito:', OUT, '— tamanho:', Math.round(md.length / 1024), 'KB');