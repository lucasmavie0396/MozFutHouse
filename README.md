# MozFutHouse

Plataforma de gestão e divulgação de campeonatos de futsal, com sincronização em tempo real.

## Funcionalidades

- Campeonatos (provincial, cidade, nacional) com equipas e jogadores
- Calendário de jogos, adiamentos e registo de W.O. (falta de comparecência → 6–0)
- Resultados, gols, cartões, avaliações, MVP e estatísticas
- Classificação automática, artilharia e melhor jogador
- Transmissões ao vivo (YouTube, Vimeo, Twitch) com placar em tempo real
- Convocados e escalação por jogo (titulares, suplentes, lesionados, suspensos)
- Perfis: Administrador, Gestor, Associação, Clube e Público
- Recuperação de password (email ou modo demonstração)
- Exportação para Excel, cópias de segurança e arquivo de dados em SQLite

## Tecnologias

- **Frontend**: React + Vite (`src/`)
- **Backend**: Node.js + WebSocket (`server/index.mjs`)
- **Dados**: SQLite (`data/mozfuthouse.db`) sincronizado com um espelho JSON (`data/store.json`)

## Instalação

Pré-requisitos: Node.js (LTS) e npm.

```bash
npm install
```

## Arranque

```bash
npm run dev
```

Abre no browser:

- Aplicação (dev): http://localhost:5173
- Aplicação em produção: http://localhost:3000

> No primeiro arranque, a plataforma pede para **criar a conta de Administrador**.

## Comandos

| Comando | Descrição |
|---|---|
| `npm run dev` | Frontend (Vite) + servidor de sincronização |
| `npm run dev:web` | Só frontend (http://localhost:5173) |
| `npm run dev:sync` | Só servidor de sincronização (http://localhost:3000) |
| `npm run build` | Compila para `dist/` |
| `npm run preview` | Servir o build (http://localhost:4173) |
| `npm start` | Serve `dist/` na porta 3000 (produção) |

## Configuração (ficheiro `.env`)

Copie `.env.example` para `.env` e ajuste as variáveis (porta, caminho da base de dados, SMTP para emails de recuperação). Sem `MAIL_HOST`, a recuperação de password funciona em modo demonstração (o código é mostrado no ecrã).

## Dados e persistência

- `data/store.json` — espelho JSON (guardado a cada alteração, 300 ms).
- `data/mozfuthouse.db` — base SQLite, mantida sincronizada com o JSON em cada escrita.
- `data/` está no `.gitignore` (contém passwords com hash) — cria uma cópia de segurança em **Utilizadores → Cópia de segurança** antes de partilhar o projeto.

## Documentação

- `EBOOK-MozFutHouse.md` — guia completo do sistema (gerar HTML/PDF com `scripts/md-to-html.mjs`).

## Estrutura

```
src/                # Aplicação React (App.jsx, lib/sync.js, styles.css)
server/             # Servidor Node (index.mjs, db.mjs, env.mjs)
data/               # Dados locais (JSON + SQLite) — não versionados
scripts/            # Ferramentas (ebook, guia, testes)
dist/               # Build de produção (gerado)
```