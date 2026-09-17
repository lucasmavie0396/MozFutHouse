@echo off
title MozFutHouse - Iniciar sistema
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm nao encontrado. Instala o Node.js e tenta novamente.
  pause
  exit /b 1
)

rem Mata processos node a usar a porta 3000 (EADDRINUSE)
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :3000 ^| findstr LISTENING') do (
  taskkill /F /PID %%a >nul 2>nul
)

echo.
echo A iniciar MozFutHouse...
echo Vite:  http://localhost:5173/  (ou 4173)
echo Sincronizacao: http://localhost:3000
echo.
echo Prima CTRL+C para parar. Feche esta janela para encerrar.
echo.
npm run dev

echo.
echo O servidor terminou.
pause