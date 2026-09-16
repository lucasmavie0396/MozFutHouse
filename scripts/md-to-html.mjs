import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const here = dirname(fileURLToPath(import.meta.url));
const md = new MarkdownIt({ html: true, linkify: true });

const args = process.argv.slice(2);
function argVal(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] != null ? args[i + 1] : def;
}
const srcName = argVal('src', 'EBOOK-MozFutHouse.md');
const outName = argVal('out', 'EBOOK-MozFutHouse.html');
const docTitle = argVal('title', 'MozFutHouse — Guia Completo do Sistema');
const docSub = argVal('subtitle', 'Guia Completo do Sistema');
const docVersion = argVal('version', '1.0');

const src = readFileSync(join(here, '..', srcName), 'utf8');
const body = md.render(src);

const css = `
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  @page cover { margin: 0; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', 'Calibri', 'Arial', sans-serif; color: #1c2333; line-height: 1.55; font-size: 12pt; }
  h1 { font-size: 20pt; color: #0B1220; border-bottom: 3px solid #F2B807; padding-bottom: 6px; margin-top: 34px; page-break-after: avoid; }
  h2 { font-size: 15pt; color: #0B1220; margin-top: 26px; border-bottom: 1px solid #d4dbe6; padding-bottom: 4px; page-break-after: avoid; }
  h3 { font-size: 12.5pt; color: #0B1220; margin-top: 18px; page-break-after: avoid; }
  p { margin: 8px 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 10.5pt; page-break-inside: auto; }
  th { background: #0B1220; color: #fff; text-align: left; }
  th, td { border: 1px solid #c8d0dd; padding: 6px 9px; vertical-align: top; }
  tr { page-break-inside: avoid; }
  code { background: #eef2f7; border: 1px solid #d4dbe6; border-radius: 3px; padding: 0 4px; font-size: 10pt; }
  pre { background: #0B1220; color: #e8edf5; border-radius: 6px; padding: 12px; overflow: hidden; page-break-inside: avoid; }
  pre code { background: none; border: none; color: #e8edf5; }
  blockquote { border-left: 4px solid #F2B807; margin: 12px 0; padding: 4px 14px; background: #fbf7ec; color: #3a3f4b; }
  ul, ol { margin: 8px 0; padding-left: 24px; }
  li { margin: 4px 0; }
  a { color: #b8860b; text-decoration: none; }
  img { max-width: 100%; border: 1px solid #c8d0dd; border-radius: 4px; margin: 10px 0 2px; }
  em { color: #555f72; }
  .cover { page: cover; width: 100%; height: 100vh; background: #0B1220; color: #eceff4; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; page-break-after: always; }
  .cover .logo { width: 64px; height: 64px; background: #F2B807; color: #0B1220; font-weight: 800; font-size: 34pt; line-height: 64px; border-radius: 12px; font-family: 'Arial Black', sans-serif; margin-bottom: 22px; }
  .cover h1.title { border: none; margin: 0; font-size: 34pt; letter-spacing: 1px; }
  .cover .sub { font-size: 13pt; color: #aab4c6; margin-top: 14px; }
  .cover .meta { font-size: 10.5pt; color: #7f8aa0; margin-top: 40px; }
  .toc li { list-style: none; margin: 3px 0; }
  strong { color: #0B1220; }
`;

const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<title>${docTitle}</title>
<style>${css}</style>
</head>
<body>
  <div class="cover">
    <div class="logo">M</div>
    <h1 class="title">MozFutHouse</h1>
    <div class="sub">${docSub}</div>
    <div class="sub" style="font-size:11pt; margin-top:6px;">Gestão e divulgação de campeonatos de futsal</div>
    <div class="meta">Versão ${docVersion} · Setembro 2026</div>
  </div>
${body}
</body>
</html>`;

const out = join(here, '..', outName);
writeFileSync(out, html, 'utf8');
console.log('HTML gerado:', out);