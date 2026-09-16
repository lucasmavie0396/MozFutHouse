import puppeteer from 'puppeteer-core';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT = join(process.env.TEMP, 'mozfuthouse_ebook_codigo');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';
const CHAMP = 'champ_demo';

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
});

async function novaPagina(userId, champ = CHAMP) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  // 1ª carga: apenas para o WS entregar os dados ao localStorage
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 40000 });
  // espera até o WS entregar o estado (app carrega users no localStorage)
  await new Promise(r => setTimeout(r, 3000));
  await page.evaluate((uid) => {
    try { window.localStorage.setItem('mozfuthouse.champ_sel', 'champ_demo'); } catch (e) {}
    try { window.sessionStorage.setItem('mozfuthouse.session', uid); } catch (e) {}
  }, userId);
  await page.reload({ waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 1500));
  let ready = false;
  for (let i = 0; i < 150; i++) {
    ready = await page.evaluate(() => {
      return document.querySelectorAll('.fx-nav button').length > 0 ||
             document.querySelector('.fx-gate') !== null;
    });
    if (ready) break;
    await new Promise(r => setTimeout(r, 300));
  }
  if (!ready) { await ctx.close(); throw new Error('App não autenticou para ' + userId); }
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
  await new Promise(r => setTimeout(r, 1300));
}

async function shot(page, name) {
  await page.screenshot({ path: join(OUT, name + '.png'), fullPage: false });
  console.log('OK', name);
}

// ---------- PORTÃO DE ENTRADA (sem sessão) ----------
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 40000 });
  await page.evaluate(() => {
    try { window.localStorage.removeItem('mozfuthouse.champ_sel'); } catch (e) {}
  });
  await page.reload({ waitUntil: 'networkidle2', timeout: 40000 });
  await new Promise(r => setTimeout(r, 1500));
  await shot(page, '01_login_gate');
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.fx-gate-tabs button')).find(x => x.textContent.includes('Criar conta pública'));
    if (b) b.click();
  });
  await new Promise(r => setTimeout(r, 700));
  await shot(page, '01b_registo_publico');
  await ctx.close();
}

// ---------- ADMIN ----------
{
  const { ctx, page } = await novaPagina('adm_demo');
  await shot(page, '02_admin_inicio');
  await clickNav(page, 'Equipes'); await shot(page, '03_admin_equipes');
  await clickNav(page, 'Jogadores'); await shot(page, '04_admin_jogadores');
  await clickNav(page, 'Calendário'); await shot(page, '05_admin_calendario');
  await clickNav(page, 'Início');
  const temProx = await page.evaluate(() => document.querySelector('.fx-prox-item') !== null);
  if (temProx) {
    await page.evaluate(() => document.querySelector('.fx-prox-item').click());
    await new Promise(r => setTimeout(r, 900));
    await shot(page, '06_admin_escalacao');
    await page.evaluate(() => { const o = document.querySelector('.fx-overlay'); if (o) o.click(); });
    await new Promise(r => setTimeout(r, 500));
  }
  await clickNav(page, 'Resultados'); await shot(page, '07_admin_resultados');
  await clickNav(page, 'Classificação'); await shot(page, '08_admin_classificacao');
  await clickNav(page, 'Artilharia'); await shot(page, '09_admin_artilharia');
  await clickNav(page, 'Melhor Jogador'); await shot(page, '10_admin_estatisticas');
  await clickNav(page, 'Campeonatos'); await shot(page, '11_admin_campeonatos');
  await clickNav(page, 'Transmissões'); await shot(page, '12_admin_transmissoes');
  await clickNav(page, 'Publicidade'); await shot(page, '13_admin_publicidade');
  await clickNav(page, 'Exportar'); await shot(page, '14_admin_exportar');
  await clickNav(page, 'Utilizadores Públicos'); await shot(page, '15_admin_publico');
  await clickNav(page, 'Utilizadores'); await shot(page, '16_admin_utilizadores');
  await ctx.close();
}

// ---------- GESTOR ----------
{
  const { ctx, page } = await novaPagina('ges_demo');
  await shot(page, '17_gestor_inicio');
  // abrir um resultado já lançado em modo leitura
  const resultado = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.fx-match'));
    const realizado = cards.find(c => c.textContent.includes('Realizado'));
    if (realizado) { realizado.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 1000));
  if (resultado) await shot(page, '18_gestor_resultado_leitura');
  else await shot(page, '17b_gestor_resultados');
  await ctx.close();
}

// ---------- ASSOCIAÇÃO ----------
{
  const { ctx, page } = await novaPagina('ass_demo');
  await shot(page, '19_assoc_inicio');
  await clickNav(page, 'Equipes'); await shot(page, '20_assoc_equipes');
  await clickNav(page, 'Calendário'); await shot(page, '21_assoc_calendario');
  await clickNav(page, 'Resultados'); await shot(page, '22_assoc_resultados');
  await ctx.close();
}

// ---------- CLUBE ----------
{
  const { ctx, page } = await novaPagina('clu_demo');
  await shot(page, '23_clube_inicio');
  await clickNav(page, 'Jogadores'); await shot(page, '24_clube_jogadores');
  await clickNav(page, 'Calendário'); await shot(page, '25_clube_calendario');
  await ctx.close();
}

// ---------- PÚBLICO ----------
{
  const { ctx, page } = await novaPagina('pub_demo');
  await shot(page, '26_publico_inicio');
  await clickNav(page, 'Calendário'); await shot(page, '27_publico_calendario');
  await clickNav(page, 'Cla'); await shot(page, '28_publico_classificacao');
  await clickNav(page, 'Ver jogos'); await shot(page, '29_publico_transmissoes');
  await clickNav(page, 'Parceiros'); await new Promise(r => setTimeout(r, 2500)); await shot(page, '30_publico_parceiros');
  // abrir um jogo com transmissão
  await clickNav(page, 'Ver jogos');
  const temLink = await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll('.fx-livecard button')).find(x => x.textContent.includes('Ver transmissão'));
    if (b) { b.click(); return true; }
    return false;
  });
  await new Promise(r => setTimeout(r, 2500));
  if (temLink) { await shot(page, '31_publico_ao_vivo'); await page.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 300)); }
  await ctx.close();
}

await browser.close();
console.log('Capturas terminadas em', OUT);