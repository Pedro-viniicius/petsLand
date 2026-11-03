// QA: bordas no navegador real (Chrome headless via CDP). Pula se o Chrome não existir.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as dormir } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { construir } from '../build.mjs';
import { CHROME, launchChrome, Pagina, startServer } from '../scripts/browser-check.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PET = JSON.parse(fs.readFileSync(path.join(RAIZ, 'content', 'pet.json'), 'utf8'));
const temChrome = fs.existsSync(CHROME);
const opts = { skip: !temChrome && 'Chrome não encontrado', timeout: 120000 };
const clone = (o) => JSON.parse(JSON.stringify(o));

let tmp, chrome, srvSem, srvCom, srvLongo, srvSemFonte, srvFonteLenta, srvFonteLentaSemBanner, conteudoSem;

function construirEm(nome, content, extra = {}) {
  const contentDir = path.join(tmp, nome, 'content');
  fs.mkdirSync(contentDir, { recursive: true });
  fs.writeFileSync(path.join(contentDir, 'pet.json'), JSON.stringify(content));
  const saida = path.join(tmp, nome, 'dist');
  const r = construir({ contentDir, saida, ...extra });
  assert.equal(r.ok, true, r.erros.join('\n'));
  return saida;
}

before(async () => {
  if (!temChrome) return;
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-nav-'));
  const real = clone(PET);
  real.convite = 'https://chat.whatsapp.com/AbC123';
  conteudoSem = real;
  srvSem = await startServer(construirEm('sem', real));
  const com = clone(real);
  com.analytics = { ga4: 'G-TESTE12345', clarity: 'abcd1234' };
  srvCom = await startServer(construirEm('com', com));
  const longo = clone(real);
  longo.nomeGrupo = 'Superlongonomedegrupoquenaotemespaconenhumparaquebrar';
  longo.ab.headlines[0] = 'Supercalifragilisticoexpialidosooooooooooooooooooooooooooooooooooooo pet';
  longo.ab.ctas[0] = 'Entrarnogrupogratisagoramesmosemperdertempoalgum';
  longo.subtitulo = 'https://exemplo.com.br/um/caminho/muito/longo/sem/espacos/que/pode/estourar/a/largura/da/tela/' + 'a'.repeat(80);
  longo.confianca.detalhes[0].resposta = 'x'.repeat(200);
  srvLongo = await startServer(construirEm('longo', longo));
  // Fonte ausente: build sem src/fonts (sem preload, @font-face dá 404, fica a família de fallback).
  const fontesVazias = path.join(tmp, 'fontes-vazias');
  fs.mkdirSync(fontesVazias);
  srvSemFonte = await startServer(construirEm('semfonte', com, { fontsDir: fontesVazias }));
  srvFonteLenta = await servidorComAtraso(srvCom.origin, /\.woff2$/, 1500);
  // Sem IDs de analytics o banner não abre: isola o CLS causado só pela troca de fonte.
  srvFonteLentaSemBanner = await servidorComAtraso(srvSem.origin, /\.woff2$/, 1500);
  chrome = await launchChrome();
});
after(async () => {
  for (const s of [srvFonteLenta, srvFonteLentaSemBanner, srvSem, srvCom, srvLongo, srvSemFonte]) await s?.close();
  await chrome?.close();
  if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
});

/** Proxy local para `origem` que segura por `ms` as respostas cujo caminho casa com `re` (fonte atrasada). */
async function servidorComAtraso(origem, re, ms) {
  const servidor = http.createServer(async (req, res) => {
    try {
      if (re.test(new URL(req.url, 'http://x').pathname)) await dormir(ms);
      const r = await fetch(`${origem}${req.url}`);
      res.writeHead(r.status, { 'content-type': r.headers.get('content-type') ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(Buffer.from(await r.arrayBuffer()));
    } catch { if (!res.headersSent) res.writeHead(502); res.end(); }
  });
  await new Promise((ok) => servidor.listen(0, '127.0.0.1', ok));
  return { origin: `http://127.0.0.1:${servidor.address().port}`, close: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(ok); }) };
}

async function abrir(srv, url, o = {}, { antes } = {}) {
  const p = await Pagina.abrir(chrome.cdp, o);
  p.erros = [];
  p.ouvintes.add((m) => {
    if (m.method === 'Runtime.exceptionThrown') p.erros.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  });
  if (antes) await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: antes });
  await p.ir(`${srv.origin}${url}`);
  return p;
}
const textoVisivel = (sel) => `[...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => getComputedStyle(e).display !== 'none').map(e => e.textContent.trim())`;

test('CA16 borda: ?h/?c estranhos nunca quebram e caem no padrão ou no primeiro valor válido', async (t) => {
  const H = conteudoSem.ab.headlines; const C = conteudoSem.ab.ctas;
  const casos = [
    ['?h=0', 1, 1], ['?h=03', 1, 1], ['?h=2&h=3', 2, 1], ['?h=', 1, 1], ['?c=', 1, 1], ['?h=4', 1, 1], ['?h=-1', 1, 1],
    ['?h=2.0', 1, 1], ['?h=%32', 2, 1], ['?h=%0A2', 1, 1], ['?H=2&C=3', 1, 1], ['?h=<script>alert(1)</script>', 1, 1],
    ['?h=2&c=3#ancora', 2, 3], ['?h=3&c=2&utm_source=ig&fbclid=abc', 3, 2], ['?h=２', 1, 1], ['?h=1e0', 1, 1], ['?h=%00', 1, 1],
    ['?c=3&h=2', 2, 3], ['?h=2&c=9', 2, 1],
  ];
  for (const [qs, h, c] of casos) {
    await t.test(qs, async () => {
      const p = await abrir(srvSem, `/pet/${qs}`);
      try {
        const d = await p.avaliar(`({ h: document.documentElement.dataset.h, c: document.documentElement.dataset.c, hs: ${textoVisivel('h1 .ab')}, cs: ${textoVisivel('a[data-cta=hero] .ab')}, corpo: document.body.innerText })`);
        assert.equal(d.h, String(h)); assert.equal(d.c, String(c));
        assert.deepEqual(d.hs, [H[h - 1]]);
        assert.deepEqual(d.cs, [C[c - 1]]);
        assert.ok(!/alert\(1\)/.test(d.corpo), 'parâmetro não pode ir ao DOM como texto');
        assert.deepEqual(p.erros, []);
      } finally { await p.fechar(); }
    });
  }
});

test('CA16 borda: sem JavaScript, ?h=2 mostra a variante padrão (sem flash de outra)', opts, async () => {
  const p = await Pagina.abrir(chrome.cdp, { js: false });
  try {
    await p.ir(`${srvSem.origin}/pet/?h=2&c=3`);
    const d = await p.avaliar(`({ hs: ${textoVisivel('h1 .ab')}, cs: ${textoVisivel('a[data-cta=hero] .ab')} })`);
    assert.deepEqual(d.hs, [conteudoSem.ab.headlines[0]]);
    assert.deepEqual(d.cs, [conteudoSem.ab.ctas[0]]);
  } finally { await p.fechar(); }
});

test('CA3/CA15 borda: um único h1, uma variante visível por CTA, nenhum texto de variante oculto lido por leitor de tela', opts, async () => {
  const p = await abrir(srvSem, '/pet/?h=3&c=2');
  try {
    const d = await p.avaliar(`({ h1: document.querySelectorAll('h1').length, ctas: [...document.querySelectorAll('a[data-cta]')].map(a => ({ k: a.dataset.cta, v: [...a.querySelectorAll('.ab')].filter(e => getComputedStyle(e).display !== 'none').length, href: a.href })), nome: document.querySelector('h1').innerText })`);
    assert.equal(d.h1, 1);
    for (const c of d.ctas) { assert.equal(c.v, 1, c.k); assert.equal(c.href, 'https://chat.whatsapp.com/AbC123'); }
    assert.equal(d.nome, conteudoSem.ab.headlines[2]);
  } finally { await p.fechar(); }
});

test('CA2 borda: texto sem espaço (nome, headline, CTA, URL colada) não gera rolagem horizontal em 320 a 768 px', opts, async () => {
  for (const w of [320, 360, 390, 768]) {
    const p = await abrir(srvLongo, '/pet/', { width: w, height: 700 });
    try {
      await p.avaliar("document.querySelectorAll('details').forEach(d => d.open = true); true");
      await dormir(150);
      const d = await p.avaliar('({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: innerWidth })');
      assert.ok(d.sw <= d.iw && d.bw <= d.iw, `${w}px: scrollWidth ${d.sw}/${d.bw} > ${d.iw}`);
    } finally { await p.fechar(); }
  }
});

test('CA2 borda: FAQ aberto por teclado (Enter e Espaço) não gera rolagem horizontal em 320 px', opts, async () => {
  const p = await abrir(srvSem, '/pet/', { width: 320, height: 568 });
  try {
    await p.avaliar("document.querySelector('details summary').focus(); true");
    const digitar = async (key, code, vk, text) => {
      await p.cmd('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, text });
      await p.cmd('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await dormir(200);
    };
    await digitar('Enter', 'Enter', 13, '\r');
    assert.equal(await p.avaliar("document.querySelector('details').open"), true, 'Enter deve abrir');
    await digitar(' ', 'Space', 32, ' ');
    assert.equal(await p.avaliar("document.querySelector('details').open"), false, 'Espaço deve fechar');
    await p.avaliar("document.querySelectorAll('details').forEach(d => d.open = true); true");
    const d = await p.avaliar('document.documentElement.scrollWidth <= innerWidth');
    assert.equal(d, true);
  } finally { await p.fechar(); }
});

test('CA1 borda: 320x568 — h1 e CTA do hero cabem sem rolar (também com banner)', opts, async () => {
  for (const srv of [srvSem, srvCom]) {
    const p = await abrir(srv, '/pet/', { width: 320, height: 568 });
    try {
      const d = await p.avaliar("({ h1: document.querySelector('h1').getBoundingClientRect().bottom, cta: document.querySelector('a[data-cta=hero]').getBoundingClientRect().bottom, banner: !document.querySelector('#consent').hidden })");
      assert.ok(d.h1 <= 568 && d.cta <= 568, `320x568 (banner=${d.banner}): h1 ${d.h1}, CTA ${d.cta}`);
    } finally { await p.fechar(); }
  }
});

test('CA1/CA14 borda: com banner aberto o CTA do hero (360x640 e 320x568) não fica coberto', opts, async () => {
  for (const [w, h] of [[360, 640], [320, 568], [390, 664]]) {
    const p = await abrir(srvCom, '/pet/', { width: w, height: h });
    try {
      assert.equal(await p.avaliar("!document.querySelector('#consent').hidden"), true, 'banner deveria estar aberto');
      const d = await p.avaliar(`(() => { const a = document.querySelector('a[data-cta=hero]'); const r = a.getBoundingClientRect(); const topo = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2); const b = document.querySelector('#consent').getBoundingClientRect(); return { cobre: !(topo === a || a.contains(topo)), ctaBottom: r.bottom, bannerTop: b.top }; })()`);
      assert.equal(d.cobre, false, `${w}x${h}: CTA coberto`);
      assert.ok(d.ctaBottom <= d.bannerTop + 0.5, `${w}x${h}: CTA (${d.ctaBottom}) invade o banner (topo ${d.bannerTop})`);
    } finally { await p.fechar(); }
  }
});

test('CA5 borda: fim da página com banner aberto e fechado, em 320, 360 e 1280 — último elemento livre', opts, async () => {
  for (const [w, h] of [[320, 568], [360, 640], [1280, 800]]) {
    for (const aberto of [true, false]) {
      const p = await abrir(srvCom, '/pet/', { width: w, height: h });
      try {
        if (!aberto) { await p.avaliar("document.querySelector('[data-consent=deny]').click(); true"); await dormir(400); }
        await p.avaliar('window.scrollTo(0, document.documentElement.scrollHeight); true');
        await dormir(700);
        const d = await p.avaliar(`(() => {
          const ult = document.querySelector('.foot__copy').getBoundingClientRect();
          const blocos = ['#consent', '#sticky'].map(s => document.querySelector(s)).filter(e => e && !e.hidden && !e.hasAttribute('inert') && getComputedStyle(e).visibility !== 'hidden' && e.getBoundingClientRect().height > 0).map(e => e.getBoundingClientRect().top);
          const topoDock = blocos.length ? Math.min(...blocos) : 1e9;
          const alvos = [...document.querySelectorAll('.foot a, .foot button:not([hidden]), .foot p')];
          const cobertos = alvos.filter(e => { const r = e.getBoundingClientRect(); if (!r.width) return false; const t = document.elementFromPoint(r.left + r.width/2, Math.min(r.bottom - 1, innerHeight - 1)); return t && t !== e && !e.contains(t) && !t.contains(e); }).map(e => e.className);
          return { ultBottom: ult.bottom, topoDock, cobertos, fim: Math.round(scrollY + innerHeight) >= document.documentElement.scrollHeight - 1 };
        })()`);
        assert.equal(d.fim, true);
        assert.ok(d.ultBottom <= d.topoDock + 0.5, `${w}x${h} banner=${aberto}: copyright em ${d.ultBottom} sob a dock (${d.topoDock})`);
        assert.deepEqual(d.cobertos, [], `${w}x${h} banner=${aberto}`);
      } finally { await p.fechar(); }
    }
  }
});

test('CA20 borda: Tab percorre todos os interativos na ordem do DOM, sem foco sob a dock (banner aberto)', opts, async () => {
  for (const [w, h] of [[320, 568], [360, 640], [1280, 800]]) {
    const p = await abrir(srvCom, '/pet/', { width: w, height: h });
    try {
      const paradas = [];
      for (let i = 0; i < 25; i++) {
        await p.tecla('Tab', 'Tab', 9);
        await dormir(80);
        const d = await p.avaliar(`(() => { const e = document.activeElement; if (!e || e === document.body) return { fim: true }; const r = e.getBoundingClientRect(); const dock = [...document.querySelectorAll('#consent, #sticky')].filter(x => !x.hidden && !x.hasAttribute('inert') && getComputedStyle(x).visibility !== 'hidden' && x.getBoundingClientRect().height > 0); const naDock = dock.some(x => x.contains(e)); const topo = dock.length ? Math.min(...dock.map(x => x.getBoundingClientRect().top)) : 1e9; return { rotulo: (e.dataset.cta || e.dataset.consent || e.tagName + ':' + (e.textContent || '').trim().slice(0, 20)), top: r.top, bottom: r.bottom, naDock, topoDock: topo, h: innerHeight, ordem: [...document.querySelectorAll('a[href],button:not([hidden]),summary')].indexOf(e) }; })()`);
        if (d.fim) break;
        paradas.push(d);
        if (!d.naDock) {
          assert.ok(d.bottom <= d.topoDock + 0.5, `${w}px: foco em "${d.rotulo}" (base ${d.bottom}) sob a dock (${d.topoDock})`);
          assert.ok(d.top >= -0.5 && d.bottom <= d.h + 0.5, `${w}px: foco fora da tela em "${d.rotulo}"`);
        }
      }
      const rotulos = paradas.map((x) => x.rotulo);
      assert.ok(rotulos.includes('hero') && rotulos.includes('final') && rotulos.includes('accept') && rotulos.includes('deny'), `${w}px: paradas ${rotulos.join(' > ')}`);
      assert.ok(!rotulos.includes('sticky'), 'barra oculta/inert não pode receber foco');
      // hero vem antes do final; FAQ (summary) entre eles; política no rodapé depois do final.
      assert.ok(rotulos.indexOf('hero') < rotulos.indexOf('final'));
      assert.equal(rotulos.filter((r) => r.startsWith('SUMMARY')).length, 4);
      const ordens = paradas.filter((x) => !x.naDock).map((x) => x.ordem);
      assert.deepEqual(ordens, [...ordens].sort((a, b) => a - b), `${w}px: ordem do foco diferente do DOM`);
    } finally { await p.fechar(); }
  }
});

test('CA20 borda: foco na barra fixa quando visível leva ao convite e Tab nunca fica preso', opts, async () => {
  const p = await abrir(srvSem, '/pet/', { width: 360, height: 640 });
  try {
    await p.avaliar("window.scrollTo(0, document.querySelector('[data-cta=hero]').getBoundingClientRect().bottom + scrollY + 80); true");
    assert.equal(await p.esperar("!document.querySelector('#sticky').hasAttribute('inert')", 2500), true);
    await p.avaliar("document.querySelector('#sticky a').focus(); true");
    assert.equal(await p.avaliar("document.activeElement.dataset.cta"), 'sticky');
    // Rolar até o CTA final deve ocultar a barra e tirar o foco dela (inert).
    await p.avaliar("document.querySelector('[data-cta=final]').scrollIntoView({block:'center'}); true");
    assert.equal(await p.esperar("document.querySelector('#sticky').hasAttribute('inert')", 2500), true);
    assert.notEqual(await p.avaliar('document.activeElement.dataset.cta || ""'), 'sticky', 'foco ficou em elemento inert');
  } finally { await p.fechar(); }
});

test('CA14 borda: localStorage lançando exceção — página funciona, banner aparece, sem erro não tratado, CTA navega', opts, async () => {
  const quebrar = `for (const k of ['getItem','setItem','removeItem']) Storage.prototype[k] = function(){ throw new DOMException('negado','SecurityError'); }; Object.defineProperty(window, 'localStorage', { get(){ throw new DOMException('negado','SecurityError'); }, configurable: true });`;
  const p = await abrir(srvCom, '/pet/', {}, { antes: quebrar });
  try {
    assert.deepEqual(p.erros, [], 'erro não tratado ao carregar');
    assert.equal(await p.avaliar("!document.querySelector('#consent').hidden"), true, 'banner deve aparecer');
    await p.avaliar("document.querySelector('[data-consent=deny]').click(); true");
    await dormir(300);
    assert.equal(await p.avaliar("document.querySelector('#consent').hidden"), true, 'Recusar deve fechar mesmo sem storage');
    assert.deepEqual(p.erros, []);
    assert.ok(!p.requisicoes.some((u) => /googletagmanager|clarity/.test(u)), 'recusou: nada de analytics');
  } finally { await p.fechar(); }
});

test('CA14 borda: localStorage com lixo ("{", valor desconhecido, tipo errado) é tratado como sem escolha', opts, async () => {
  for (const lixo of ['{', '{"v":"talvez","t":"x"}', 'null', '[]', '"granted"', '{"v":"granted"}']) {
    const p = await abrir(srvCom, '/pet/', {}, { antes: `try{localStorage.setItem('consent.v1', ${JSON.stringify(lixo)})}catch(e){}` });
    try {
      assert.deepEqual(p.erros, [], `lixo ${lixo}`);
      const aberto = await p.avaliar("!document.querySelector('#consent').hidden");
      const externas = p.requisicoes.filter((u) => /googletagmanager|clarity/.test(u));
      // Só "granted" explícito e válido poderia carregar; qualquer outra coisa deve perguntar de novo.
      if (lixo !== '{"v":"granted"}') { assert.equal(aberto, true, `lixo ${lixo}: banner deveria reabrir`); assert.equal(externas.length, 0, `lixo ${lixo}: não pode carregar analytics`); }
    } finally { await p.fechar(); }
  }
});

test('CA20 borda: prefers-reduced-motion zera transições e animações do dock e dos botões', opts, async () => {
  const p = await Pagina.abrir(chrome.cdp, { width: 360, height: 640 });
  try {
    await p.cmd('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await p.ir(`${srvCom.origin}/pet/`);
    const d = await p.avaliar(`(() => { const out = []; for (const e of document.querySelectorAll('#sticky, #consent, .btn, .cbtn, details, .chev, .ab')) { const cs = getComputedStyle(e); const dur = (s) => s.split(',').map(x => parseFloat(x) * (x.includes('ms') ? 1 : 1000)); const t = Math.max(...dur(cs.transitionDuration)); const a = Math.max(...dur(cs.animationDuration)); if (t > 1 || a > 1) out.push(e.id || e.className); } return out; })()`);
    assert.deepEqual(d, [], 'elementos ainda animam com reduced-motion');
  } finally { await p.fechar(); }
});

test('CA25 borda: nenhuma requisição externa em 1280 px nem com rolagem, abertura do FAQ e Tab (sem consentimento)', opts, async () => {
  const p = await abrir(srvSem, '/pet/?h=2&c=3', { width: 1280, height: 800 });
  try {
    for (let i = 0; i < 12; i++) await p.tecla('Tab', 'Tab', 9);
    await p.avaliar("window.scrollTo(0, 99999); document.querySelectorAll('details').forEach(d => d.open = true); true");
    await dormir(500);
    const ext = p.requisicoes.filter((u) => !u.startsWith(srvSem.origin) && !/^(data|blob|about):/.test(u));
    assert.deepEqual(ext, []);
    assert.deepEqual(p.erros, []);
  } finally { await p.fechar(); }
});

test('CA25 borda: nenhuma requisição devolve 404 (favicon, fonte, CSS, JS)', opts, async () => {
  const p = await Pagina.abrir(chrome.cdp, { width: 360, height: 640 });
  const ruins = [];
  p.ouvintes.add((m) => { if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) ruins.push(`${m.params.response.status} ${m.params.response.url}`); });
  try {
    await p.ir(`${srvSem.origin}/pet/`);
    assert.deepEqual(ruins.filter((u) => !/apple-touch-icon|og\.png/.test(u)), []);
  } finally { await p.fechar(); }
});

// Mede o CTA do hero contra o banner aberto, a família efetiva do h1 e se a Fredoka já carregou.
const MEDIR_CTA_BANNER = `(() => {
  const a = document.querySelector('a[data-cta=hero]'); const r = a.getBoundingClientRect();
  const topo = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const b = document.querySelector('#consent');
  const fredoka = [...document.fonts].filter((f) => f.family.replace(/"/g, '') === 'Fredoka').map((f) => f.status);
  return { aberto: !b.hidden, cobre: !(topo === a || a.contains(topo)), ctaBottom: r.bottom, bannerTop: b.getBoundingClientRect().top, fredoka, };
})()`;

test('CA1/CA14 borda: 320x568 com banner aberto e fonte atrasada (1,5 s) ou ausente — CTA do hero fora do banner no fallback e depois do swap', opts, async () => {
  // Fonte atrasada: mede antes do load (fallback ainda na tela) e depois do swap.
  const p = await abrir(srvFonteLenta, '/pet/', { width: 320, height: 568 });
  try {
    // abrir() espera o load, que já inclui a fonte (preload); reabre medindo cedo.
    const dom = p.aguardarEvento('Page.domContentEventFired');
    await p.cmd('Page.navigate', { url: `${srvFonteLenta.origin}/pet/?cedo` });
    await dom;
    await dormir(300);
    // O banner só abre no load, e o load espera a fonte (preload): força a abertura para medir o fallback com banner.
    await p.avaliar("document.querySelector('#consent').removeAttribute('hidden'); true");
    const cedo = await p.avaliar(MEDIR_CTA_BANNER);
    assert.ok(!cedo.fredoka.includes('loaded'), `a Fredoka já tinha carregado; a medida não é do fallback (${cedo.fredoka})`);
    assert.equal(cedo.aberto, true, 'banner deveria estar aberto');
    assert.equal(cedo.cobre, false, `fallback: CTA coberto (CTA ${cedo.ctaBottom}, banner ${cedo.bannerTop})`);
    assert.ok(cedo.ctaBottom <= cedo.bannerTop + 0.5, `fallback: CTA (${cedo.ctaBottom}) invade o banner (topo ${cedo.bannerTop})`);
    await dormir(2000);
    const depois = await p.avaliar(MEDIR_CTA_BANNER);
    assert.ok(depois.fredoka.includes('loaded'), `Fredoka deveria ter carregado (${depois.fredoka})`);
    assert.equal(depois.cobre, false, 'depois do swap: CTA coberto');
    assert.ok(depois.ctaBottom <= depois.bannerTop + 0.5, `depois do swap: CTA (${depois.ctaBottom}) invade o banner (topo ${depois.bannerTop})`);
  } finally { await p.fechar(); }
  // Fonte ausente: fica no fallback para sempre.
  const q = await abrir(srvSemFonte, '/pet/', { width: 320, height: 568 });
  try {
    const d = await q.avaliar(MEDIR_CTA_BANNER);
    assert.ok(!d.fredoka.includes('loaded'), 'sem arquivo de fonte não pode haver Fredoka carregada');
    assert.equal(d.aberto, true, 'banner deveria estar aberto');
    assert.equal(d.cobre, false, `sem fonte: CTA coberto (CTA ${d.ctaBottom}, banner ${d.bannerTop})`);
    assert.ok(d.ctaBottom <= d.bannerTop + 0.5, `sem fonte: CTA (${d.ctaBottom}) invade o banner (topo ${d.bannerTop})`);
    assert.deepEqual(q.erros, []);
  } finally { await q.fechar(); }
});

const MEDIR_CLS_FONTES = `(async () => { await document.fonts.ready; return { cls: window.__cls, banner: !document.querySelector('#consent').hidden, fontes: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')) }; })()`;

test('CA4/CA7 borda: CLS <= 0,1 com as fontes atrasadas 1,5 s (fallback calibrado) em 320, 360, 390 e 1280 px', opts, async () => {
  for (const [w, h] of [[320, 568], [360, 640], [390, 664], [1280, 800]]) {
    // Pagina.abrir (observar: true) injeta o observer de layout-shift com Page.addScriptToEvaluateOnNewDocument.
    const p = await abrir(srvFonteLentaSemBanner, '/pet/', { width: w, height: h });
    try {
      await dormir(2000);
      const d = await p.avaliar(MEDIR_CLS_FONTES);
      for (const f of ['Fredoka', 'Nunito']) assert.ok(d.fontes.includes(f), `${w}x${h}: ${f} deveria ter carregado (swap) antes da medida`);
      assert.equal(d.banner, false, 'este teste isola o CLS da fonte: o banner não pode abrir');
      assert.equal(typeof d.cls, 'number', 'observer de layout-shift não foi injetado');
      assert.ok(d.cls <= 0.1, `${w}x${h}: CLS com fonte atrasada = ${d.cls.toFixed(4)} (> 0,1)`);
    } finally { await p.fechar(); }
  }
});

// Trava a regressão do achado da rodada 1: o banner que abre no load não pode mudar a geometria do .dock
// (o .consent é position: absolute dentro dele). Em load rápido o Chrome marca hadRecentInput=true (input sintético
// do CDP), por isso o check "banner sem CLS" do browser-check não pegava; aqui o load é atrasado pela fonte lenta.
test('CA4/CA14 borda: CLS <= 0,1 com banner abrindo depois de load lento (fonte 1,5 s) em 320, 360, 390 e 1280 px', opts, async () => {
  for (const [w, h] of [[320, 568], [360, 640], [390, 664], [1280, 800]]) {
    const p = await abrir(srvFonteLenta, '/pet/', { width: w, height: h });
    try {
      await dormir(2000);
      const d = await p.avaliar(MEDIR_CLS_FONTES);
      assert.equal(d.banner, true, 'banner deveria estar aberto');
      assert.ok(d.cls <= 0.1, `${w}x${h}: CLS com banner + fonte atrasada = ${d.cls.toFixed(4)} (> 0,1)`);
    } finally { await p.fechar(); }
  }
});
