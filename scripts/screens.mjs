import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.env.TEMP, 'mozfuthouse_ebook');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

async function novaPagina(userId) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1366, height: 900 });
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 40000 });
  await page.evaluate((uid) => {
    try { window.sessionStorage.setItem('mozfuthouse.session', uid); } catch (e) {}
    try { window.localStorage.setItem('mozfuthouse.champ_sel', 'champ_demo'); } catch (e) {}
  }, userId);
  await page.reload({ waitUntil: 'load', timeout: 40000 });
  // aguarda a app autenticada: é suficiente que o menu lateral esteja presente
  await new Promise(r => setTimeout(r, 1200));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    ready = await page.evaluate(() => document.querySelectorAll('.fx-nav button').length > 0);
    if (ready) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) throw new Error('App não autenticou para o utilizador ' + userId);
  await new Promise(r => setTimeout(r, 800));
  return { ctx, page };
}

async function clickNav(page, label) {
  const done = await page.evaluate((l) => {
    const b = Array.from(document.querySelectorAll('.fx-nav button')).find(x => x.textContent.trim().startsWith(l));
    if (b) { b.click(); return true; }
    return false;
  }, label);
  if (!done) {
    const dbg = await page.evaluate(() => ({
      navBtns: Array.from(document.querySelectorAll('.fx-nav button')).map(x => x.textContent.trim()),
      main: !!document.querySelector('.fx-main'),
      auth: !!document.querySelector('.fx-authbox'),
    }));
    throw new Error('Nav não encontrado: ' + label + ' → ' + JSON.stringify(dbg));
  }
  await new Promise(r => setTimeout(r, 1000));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('OK', name);
}

// ---------- ADMIN ----------
{
  const { ctx, page } = await novaPagina('adm_demo');
  await shot(page, '01_inicio_admin');
  await clickNav(page, 'Campeonatos'); await shot(page, '02_campeonatos');
  await clickNav(page, 'Equipes'); await shot(page, '03_equipes');
  await clickNav(page, 'Jogadores'); await shot(page, '04_jogadores');
  await clickNav(page, 'Calendário'); await shot(page, '05_calendario');
  // escalação: abrir o 1º jogo agendado a partir do Início
  await clickNav(page, 'Início');
  const temProx = await page.evaluate(() => document.querySelector('.fx-prox-item') !== null);
  if (temProx) {
    await page.evaluate(() => document.querySelector('.fx-prox-item').click());
    await new Promise(r => setTimeout(r, 700));
    await shot(page, '06_escalacao');
    // fechar modal clicando no fundo escuro
    await page.evaluate(() => { const o = document.querySelector('.fx-overlay'); if (o) o.click(); });
    await new Promise(r => setTimeout(r, 500));
  }
  await clickNav(page, 'Classificação'); await shot(page, '07_classificacao');
  await clickNav(page, 'Melhor Jogador'); await shot(page, '08_melhor_jogador');
  await clickNav(page, 'Resultados'); await shot(page, '09_resultados');
  await clickNav(page, 'Publicidade'); await shot(page, '10_publicidade');
  await clickNav(page, 'Exportar'); await shot(page, '11_exportar');
  await ctx.close();
}

// ---------- PÚBLICO ----------
{
  const { ctx, page } = await novaPagina('pub_demo');
  await shot(page, '12_publico_inicio');
  await clickNav(page, 'Calendário'); await shot(page, '13_publico_calendario');
  await clickNav(page, 'Parceiros'); await new Promise(r => setTimeout(r, 2500)); await shot(page, '14_publico_parceiros');
  await clickNav(page, 'Classificação'); await shot(page, '15_publico_classificacao');
  await ctx.close();
}

await browser.close();
console.log('Capturas terminadas em', OUT);