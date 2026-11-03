#!/usr/bin/env node
// Gera dist/<nicho>/og.png (1200x630) e apple-touch-icon.png (180x180) com o Chrome do sistema.
// Uso: node scripts/og.mjs [nicho]   (padrão: pet). Rode depois de `node build.mjs`.
// Entradas: dist/<nicho>/og.html e dist/<nicho>/favicon.svg. Só regenere quando o content mudar.
// Com content.logo, o build já copia favicon.png e apple-touch-icon.png de src/img/: aqui só sai o og.png
// (o og.html usa o apple-touch-icon.png como logo).
// Grava também dist/<nicho>/og.png.sha256 (hash do og.html usado): `node build.mjs --release` confere.
// A rede externa é interceptada pela Pagina (nada sai do computador).
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pagina, launchChrome, startServer } from './browser-check.mjs';
import { hashOgHtml } from '../build.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LIMITE_OG = 300 * 1024;

async function capturar(p, largura, altura) {
  const { data } = await p.cmd('Page.captureScreenshot', {
    format: 'png',
    clip: { x: 0, y: 0, width: largura, height: altura, scale: 1 },
  });
  return Buffer.from(data, 'base64');
}

async function principal() {
  const nicho = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'pet';
  const dir = join(RAIZ, 'dist', nicho);
  const ogHtml = join(dir, 'og.html');
  const favicon = join(dir, 'favicon.svg');
  const ausentes = [ogHtml, favicon].filter((a) => !existsSync(a));
  if (ausentes.length) {
    console.error('og: faltam entradas (rode `node build.mjs` antes):');
    for (const a of ausentes) console.error(`  - ${a.replace(RAIZ + '/', '')}`);
    process.exit(2);
  }
  const comLogo = existsSync(join(dir, 'favicon.png'));
  const svg = readFileSync(favicon, 'utf8');
  // Fundo opaco na cor do ícone: o iOS pinta cantos transparentes de preto.
  const fundo = /<rect[^>]*fill="(#[0-9A-Fa-f]{6})"/.exec(svg)?.[1] ?? '#ffffff';
  const iconeHtml = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:180px;height:180px;background:${fundo}}svg{display:block;width:180px;height:180px}</style>${svg}`;

  let servidor, chrome, saida = 0;
  try {
    servidor = await startServer();
    chrome = await launchChrome();

    const og = await Pagina.abrir(chrome.cdp, { width: 1200, height: 630, mobile: false, observar: false });
    try {
      const ogTexto = readFileSync(ogHtml, 'utf8');
      await og.ir(`${servidor.origin}/${nicho}/og.html`, { espera: 300 });
      await og.avaliar('document.fonts.ready.then(() => true)');
      const png = await capturar(og, 1200, 630);
      writeFileSync(join(dir, 'og.png'), png);
      writeFileSync(join(dir, 'og.png.sha256'), `${hashOgHtml(ogTexto)}\n`);
      console.log(`dist/${nicho}/og.png 1200x630, ${(png.length / 1024).toFixed(1)} KB`);
      if (png.length > LIMITE_OG) { console.error('og.png passa de 300 KB'); saida = 1; }
    } finally { await og.fechar(); }

    if (comLogo) {
      console.log(`dist/${nicho}/apple-touch-icon.png vem do logo (build), não regenerado`);
    } else {
      const ic = await Pagina.abrir(chrome.cdp, { width: 180, height: 180, mobile: false, observar: false });
      try {
        await ic.ir(`data:text/html;charset=utf-8,${encodeURIComponent(iconeHtml)}`, { espera: 200 });
        const png = await capturar(ic, 180, 180);
        writeFileSync(join(dir, 'apple-touch-icon.png'), png);
        console.log(`dist/${nicho}/apple-touch-icon.png 180x180, ${(png.length / 1024).toFixed(1)} KB`);
      } finally { await ic.fechar(); }
    }
  } catch (e) {
    console.error(`og: ${e.message}`);
    saida = 2;
  } finally {
    await chrome?.close().catch(() => {});
    await servidor?.close().catch(() => {});
  }
  process.exit(saida);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
