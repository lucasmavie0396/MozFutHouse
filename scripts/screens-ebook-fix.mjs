import puppeteer from 'puppeteer-core';
import { join } from 'node:path';

const OUT = join(process.env.TEMP, 'mozfuthouse_ebook_codigo');
const BASE = 'http://localhost:3000';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
});

async function novaPagina(userId) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate((uid) => {
    try { window.localStorage.setItem('mozfuthouse.champ_sel', 'champ_demo'); } catch (e) {}
    try { window.sessionStorage.setItem('mozfuthouse.session', uid); } catch (e) {}
  }, userId);
  await page.reload({ waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 1500));
  for (let i = 0; i < 150; i++) {
    const ready = await page.evaluate(() => document.querySelectorAll('.fx-nav button').length > 0);
    if (ready) break;
    await new Promise(r => setTimeout(r, 300));
  }
  await new Promise(r => setTimeout(r, 800));
  return { ctx, page };
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name + '.png') });
  console.log('OK', name);
}

// ADMIN — abrir a página "Utilizadores" (não "Utilizadores Públicos")
{
  const { ctx, page } = await novaPagina('adm_demo');
  const done = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('.fx-nav button'));
    const navs = btns.map(b => b.textContent.trim());
    const idx = navs.findIndex(t => t === 'Utilizadores');
    if (idx < 0) return false;
    btns[idx].click();
    return true;
  });
  await new Promise(r => setTimeout(r, 1400));
  if (done) await shot(page, '16_admin_utilizadores');
  else console.log('Nav "Utilizadores" não encontrado (sem tab)');
  await ctx.close();
}

// GESTOR — abrir o primeiro jogo já lançado (leitura)
{
  const { ctx, page } = await novaPagina('ges_demo');
  await new Promise(r => setTimeout(r, 1000));
  const abriu = await page.evaluate(() => {
    // "Jogos já lançados (N)" → o primeiro cartão .fx-match desse painel
    const paineis = Array.from(document.querySelectorAll('.fx-panel'));
    for (const p of paineis) {
      if (p.textContent.includes('Jogos já lançados')) {
        const card = p.querySelector('.fx-match');
        if (card) { card.click(); return true; }
      }
    }
    return false;
  });
  await new Promise(r => setTimeout(r, 1400));
  if (abriu) await shot(page, '18_gestor_resultado_leitura');
  else console.log('Não encontrou jogo lançado para o gestor');
  await ctx.close();
}

await browser.close();
console.log('Correções terminadas');