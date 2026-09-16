# MozFutHouse - Agent Quickstart

## Project Overview
React/Vite + Node.js app for managing futsal/football championships with real-time WebSocket sync. Features: teams, players, matches, championships, results, classification, artilharia, player stats, Excel export, role-based access (admin/gestor/publico).

## Key Commands
- `npm run dev` — Starts Vite (port 5173/4173) + Node sync server (port 3000). **Port 3000 may already be in use** — kill existing process if EADDRINUSE error.
- `npm run build` — Build for production (output to `dist/`)
- `npm run start` — Run only the Node server (`node server/index.mjs`)
- `npm run preview` — Preview the production build

## Architecture
- **Frontend**: `src/` — React, `src/App.jsx` (localStorage/sessionStorage), `src/lib/sync.js` (WebSocket client), `src/styles.css`
- **Backend**: `server/index.mjs` — HTTP + WebSocket server, PBKDF2 password hashing, JSON sync via `data/store.json`
- **Data**: `data/store.json` — 7 keys: teams, players, matches, app_users, championships, ads, config. Persisted every 300ms on changes. WebSocket broadcasts `apply` events on write.
- **Roles**: admin, gestor, publico — permissions gate in App.jsx (equipes, calendario, resultados, transmissoes)

## Authentication
- **Demo credentials**: Admin `admin@mozfuthouse.mz`/`admin123`, Public `publico@example.com`/`publico123`
- PBKDF2 password hashing (100k iterations). Recovery: email or demo mode; blocked after 5 failed attempts (60s cooldown).
- `localStorage` prefix `mozfuthouse.` for persistent data; `sessionStorage` for active session (clears on tab close or `pagehide` fallback).

## Common Gotchas
- **Port 3000 EADDRINUSE**: Kill any process on port 3000 before running `npm run dev`.
- **No test framework** — No jest/vitest config exists.
- **Excel export** uses `xlsx` library — verify `node_modules/sheetjs` is installed.
- **WebSocket sync** — Changes: frontend write → `mergeByKey` in server → `scheduleSave` → `broadcast` to all clients. Server state at `/api/state` endpoint.

## Data Structure (store.json keys)
`teams`, `players`, `matches`, `app_users`, `championships`, `ads`, `config`

Each item typically has `id`, `criadoEm` (ISO timestamp). Teams have `champIds` linking to championships.

## Editing Flow
1. Frontend sends write action via WebSocket `{type: 'write', key, value, removed}`
2. Server `mergeByKey()` merges by `id`, applies removals, schedules save, broadcasts
3. Client receives `type: 'apply'` and updates local store

## Important Files
- `server/index.mjs` — Server entrypoint, WebSocket logic, data merge/save
- `src/App.jsx` — Auth, routing, localStorage persistence, role gating
- `src/lib/sync.js` — WebSocket client sync
- `data/store.json` — JSON data file (backup/inspect manually)