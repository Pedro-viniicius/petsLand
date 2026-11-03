#!/usr/bin/env node
// Screenshots para revisão visual. Uso: node scripts/shots.mjs [nicho]   (padrão: pet)
// Grava PNGs em .shots/ (CA1: 360x640; estados: banner aberto, barra fixa, foco e hover forçados).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as dormir } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pagina, launchChrome, startServer } from './browser-check.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SAIDA = join(RAIZ, '.shots');

const TELAS = [
  { nome: '360x640-dobra', width: 360, height: 640 },
  { nome: '320x568-dobra', width: 320, height: 568 },
  { nome: '360-pagina', width: 360, height: 800, completa: true },
  { nome: '390-pagina', width: 390, height: 844, completa: true },
  { nome: '768-pagina', width: 768, height: 1024, completa: true },
  { nome: '1280-pagina', width: 1280, height: 800, completa: true },
];

async function salvar(p, arquivo, completa) {
  const params = { format: 'png' };
  if (completa) {
    const { cssContentSize } = await p.cmd('Page.getLayoutMetrics');
    params.captureBeyondViewport = true;
    params.clip = { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 };
  }
  const { data } = await p.cmd('Page.captureScreenshot', params);
  writeFileSync(join(SAIDA, arquivo), Buffer.from(data, 'base64'));
  console.log(`  .shots/${arquivo}`);
}

async function forcar(p, seletor, estados) {
  const { root } = await p.cmd('DOM.getDocument', { depth: 0 });
  const { nodeId } = await p.cmd('DOM.querySelector', { nodeId: root.nodeId, selector: seletor });
  await p.cmd('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: estados });
  await dormir(400);
}

async function principal() {
  const nicho = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'pet';
  if (!existsSync(join(RAIZ, 'dist', nicho, 'index.html'))) {
    console.error(`shots: falta dist/${nicho}/index.html. Rode \`node build.mjs\` antes.`);
    process.exit(2);
  }
  mkdirSync(SAIDA, { recursive: true });
  let servidor, chrome, saida = 0;
  try {
    servidor = await startServer();
    chrome = await launchChrome();
    const url = `${servidor.origin}/${nicho}/`;
    const abrir = async (o, fn, destino = url) => {
      const p = await Pagina.abrir(chrome.cdp, { ...o, observar: false });
      try { await p.ir(destino, { espera: 600 }); await fn(p); } finally { await p.fechar(); }
    };
    console.log(`shots (${nicho}):`);
    for (const t of TELAS) await abrir(t, (p) => salvar(p, `${nicho}-${t.nome}.png`, t.completa));
    // Banner de consentimento aberto na dobra (CA1 com banner).
    await abrir({ width: 360, height: 640 }, async (p) => {
      await p.avaliar("for (const e of document.querySelectorAll('#consent')) e.hidden = false; true");
      await dormir(500);
      await salvar(p, `${nicho}-360x640-banner.png`);
    });
    // Barra fixa visível.
    await abrir({ width: 360, height: 640 }, async (p) => {
      await p.avaliar("window.scrollTo(0, document.querySelector('[data-cta=hero]').getBoundingClientRect().bottom + window.scrollY + 120); true");
      await dormir(900);
      await salvar(p, `${nicho}-360x640-barra.png`);
    });
    // Variante ?h=2&c=3.
    await abrir({ width: 360, height: 640 }, (p) => salvar(p, `${nicho}-360x640-h2c3.png`), `${url}?h=2&c=3`);
    // Estados do CTA (desktop, para valer o hover).
    for (const [nome, estados] of [['foco', ['focus-visible']], ['hover', ['hover']], ['active', ['hover', 'active']]]) {
      await abrir({ width: 1280, height: 800 }, async (p) => {
        await forcar(p, 'a[data-cta=hero]', estados);
        await salvar(p, `${nicho}-cta-${nome}.png`);
      });
    }
    // Sem JavaScript.
    await abrir({ width: 360, height: 640, js: false }, (p) => salvar(p, `${nicho}-360x640-sem-js.png`));
  } catch (e) {
    console.error(`shots: ${e.message}`);
    saida = 2;
  } finally {
    await chrome?.close().catch(() => {});
    await servidor?.close().catch(() => {});
  }
  process.exit(saida);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
