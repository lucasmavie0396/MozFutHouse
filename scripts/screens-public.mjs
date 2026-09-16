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
  await new Promise(r => setTimeout(r, 1500));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    ready = await page.evaluate(() => document.querySelectorAll('.fx-nav button').length > 0);
    if (ready) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) { await ctx.close(); return null; }
  await new Promise(r => setTimeout(r, 800));
  return { ctx, page };
}

async function clickNav(page, label) {
  const done = await page.evaluate((l) => {
    const b = Array.from(document.querySelectorAll('.fx-nav button')).find(x => x.textContent.trim().startsWith(l));
    if (b) { b.click(); return true; }
    return false;
  }, label);
  if (!done) throw new Error('Nav não encontrado: ' + label);
  await new Promise(r => setTimeout(r, 1200));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('OK', name);
}

for (let tentativa = 1; tentativa <= 3; tentativa++) {
  const sess = await novaPagina('pub_demo');
  if (!sess) { console.log('pub_demo tentativa', tentativa, 'falhou — a tentar de novo'); continue; }
  const { ctx, page } = sess;
  await shot(page, '12_publico_inicio');
  await clickNav(page, 'Calendário'); await shot(page, '13_publico_calendario');
  await clickNav(page, 'Parceiros'); await new Promise(r => setTimeout(r, 2500)); await shot(page, '14_publico_parceiros');
  await clickNav(page, 'Classificação'); await shot(page, '15_publico_classificacao');
  await ctx.close();
  console.log('Capturas públicas terminadas');
  await browser.close();
  process.exit(0);
}

console.log('Falhou nas 3 tentativas');
process.exit(1);