#!/usr/bin/env node
// Checagem em navegador via CDP. Uso: node scripts/browser-check.mjs [nicho]   (padrão: pet)
// Sobe o Chrome do sistema (headless) e um servidor estático próprio sobre dist/.
// Uma linha por check com o CA; código 1 se algum falhar, 2 se faltar entrada ou Chrome.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { setTimeout as dormir } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { construir } from '../build.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const CHROME = process.env.CHROME_BIN || '/usr/bin/google-chrome';

// ---------------------------------------------------------------------------
// Infraestrutura (reaproveitada por scripts/shots.mjs)
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.woff2': 'font/woff2',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
};

/** Servidor estático sobre `dist/` em 127.0.0.1, porta livre. */
export async function startServer(raiz = join(RAIZ, 'dist')) {
  const servidor = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      let rel = decodeURIComponent(url.pathname);
      let arq = normalize(join(raiz, rel));
      if (arq !== raiz && !arq.startsWith(raiz + sep)) { res.writeHead(403).end('403'); return; }
      if (existsSync(arq) && statSync(arq).isDirectory()) arq = join(arq, 'index.html');
      if (!existsSync(arq)) { res.writeHead(404, { 'content-type': 'text/plain' }).end('404'); return; }
      res.writeHead(200, { 'content-type': MIME[extname(arq)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(readFileSync(arq));
    } catch {
      res.writeHead(500).end('500');
    }
  });
  await new Promise((ok, erro) => { servidor.once('error', erro); servidor.listen(0, '127.0.0.1', ok); });
  const { port } = servidor.address();
  return { origin: `http://127.0.0.1:${port}`, close: () => new Promise((ok) => { servidor.closeAllConnections?.(); servidor.close(ok); }) };
}

/** Cliente CDP mínimo sobre o WebSocket global do Node 22. */
export class Cdp {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pend = new Map(); this.handlers = new Set();
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id) {
        const p = this.pend.get(m.id);
        if (!p) return;
        this.pend.delete(m.id);
        m.error ? p.reject(new Error(`${p.method}: ${m.error.message}`)) : p.resolve(m.result);
      } else for (const h of this.handlers) h(m);
    });
    ws.addEventListener('close', () => { for (const p of this.pend.values()) p.reject(new Error('conexão CDP fechada')); this.pend.clear(); });
  }
  static conectar(url) {
    return new Promise((ok, erro) => {
      const ws = new WebSocket(url);
      ws.addEventListener('open', () => ok(new Cdp(ws)), { once: true });
      ws.addEventListener('error', () => erro(new Error('falha ao abrir WebSocket CDP')), { once: true });
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve_, reject) => {
      const t = setTimeout(() => { this.pend.delete(id); reject(new Error(`timeout em ${method}`)); }, 20000);
      this.pend.set(id, { method, resolve: (v) => { clearTimeout(t); resolve_(v); }, reject: (e) => { clearTimeout(t); reject(e); } });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  on(fn) { this.handlers.add(fn); return () => this.handlers.delete(fn); }
  close() { try { this.ws.close(); } catch { /* já fechado */ } }
}

/** Lança o Chrome headless com perfil temporário. `close()` encerra o processo e apaga o perfil. */
export async function launchChrome() {
  if (!existsSync(CHROME)) throw new Error(`Chrome não encontrado em ${CHROME} (defina CHROME_BIN)`);
  const dir = mkdtempSync(join(tmpdir(), 'petsland-chrome-'));
  const args = [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${dir}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--disable-background-networking',
    '--disable-component-update', '--disable-sync', '--hide-scrollbars', '--mute-audio', '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4', 'about:blank',
  ];
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  const proc = spawn(CHROME, args, { stdio: 'ignore', detached: true });
  const saiu = new Promise((ok) => proc.once('exit', ok));
  let encerrado = false;
  const close = async () => {
    if (encerrado) return;
    encerrado = true;
    try { process.kill(-proc.pid, 'SIGTERM'); } catch { /* já saiu */ }
    const r = await Promise.race([saiu.then(() => 'saiu'), dormir(4000).then(() => 'timeout')]);
    if (r === 'timeout') { try { process.kill(-proc.pid, 'SIGKILL'); } catch { /* ok */ } await Promise.race([saiu, dormir(2000)]); }
    for (let i = 0; i < 5; i++) {
      try { rmSync(dir, { recursive: true, force: true }); break; } catch { await dormir(300); }
    }
  };
  try {
    let porta, caminho;
    const arq = join(dir, 'DevToolsActivePort');
    for (let i = 0; i < 100; i++) {
      if (existsSync(arq)) {
        const linhas = readFileSync(arq, 'utf8').split('\n');
        if (linhas[0] && linhas[1]) { porta = linhas[0]; caminho = linhas[1]; break; }
      }
      if (proc.exitCode != null) throw new Error('o Chrome encerrou ao iniciar');
      await dormir(100);
    }
    if (!porta) throw new Error('DevToolsActivePort não apareceu em 10 s');
    const cdp = await Cdp.conectar(`ws://127.0.0.1:${porta}${caminho}`);
    return { cdp, close: async () => { cdp.close(); await close(); } };
  } catch (e) {
    await close();
    throw e;
  }
}

const SCRIPT_INICIAL = `
window.__cls = 0; window.__lcp = null; window.__shifts = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__cls += e.value; window.__shifts.push(e.value); } }).observe({type:'layout-shift', buffered:true}); } catch (e) {}
try { new PerformanceObserver((l) => { const es = l.getEntries(); const e = es[es.length-1]; if (e) window.__lcp = { t: e.startTime, tag: e.element ? e.element.tagName : null, id: e.element ? e.element.id : '', src: e.url || '', size: e.size }; }).observe({type:'largest-contentful-paint', buffered:true}); } catch (e) {}
`;

/** Local = servidor de teste (127.0.0.1/localhost) ou URL sem rede (data:, blob:, about:). */
export function urlLocal(url) {
  if (/^(data|blob|about):/.test(url)) return true;
  try {
    const { protocol, hostname } = new URL(url);
    return (protocol === 'http:' || protocol === 'https:') && (hostname === '127.0.0.1' || hostname === 'localhost');
  } catch {
    return false;
  }
}

/**
 * Página isolada (contexto novo = localStorage limpo).
 * Defesa global (S1): TODA requisição fora do servidor local é interceptada pelo CDP (Fetch) e respondida
 * com 200 vazio, sem sair para a rede. Assim nenhum check, screenshot ou OG manda hit real a GA4/Clarity,
 * mesmo com IDs reais no content. `p.externas` registra cada uma ({url, depoisDoLoad}).
 */
export class Pagina {
  static async abrir(cdp, { width = 360, height = 640, mobile = width < 768, js = true, observar = true } = {}) {
    const p = new Pagina(cdp);
    const { browserContextId } = await cdp.send('Target.createBrowserContext', { disposeOnDetach: true });
    p.contexto = browserContextId;
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', browserContextId });
    p.targetId = targetId;
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    p.sid = sessionId;
    p.eventos = [];
    p.off = cdp.on((m) => { if (m.sessionId === sessionId) { p.eventos.push(m); p.ouvintes.forEach((f) => f(m)); } });
    p.ouvintes = new Set();
    p.requisicoes = [];
    p.externas = [];
    p.carregou = false;
    p.ouvintes.add((m) => { if (m.method === 'Network.requestWillBeSent') p.requisicoes.push(m.params.request.url); });
    p.ouvintes.add((m) => {
      if (m.method === 'Page.loadEventFired') p.carregou = true;
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request, resourceType } = m.params;
      if (urlLocal(request.url)) { p.cmd('Fetch.continueRequest', { requestId }).catch(() => {}); return; }
      p.externas.push({ url: request.url, depoisDoLoad: p.carregou });
      const tipo = resourceType === 'Document' ? 'text/html' : 'text/javascript';
      p.cmd('Fetch.fulfillRequest', { requestId, responseCode: 200, responseHeaders: [{ name: 'content-type', value: tipo }], body: '' }).catch(() => {});
    });
    await p.cmd('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
    for (const d of ['Page', 'Runtime', 'Network', 'DOM', 'CSS']) await p.cmd(`${d}.enable`);
    await p.cmd('Emulation.setFocusEmulationEnabled', { enabled: true });
    await p.cmd('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
    if (mobile) await p.cmd('Emulation.setTouchEmulationEnabled', { enabled: true });
    if (!js) await p.cmd('Emulation.setScriptExecutionDisabled', { value: true });
    if (observar) await p.cmd('Page.addScriptToEvaluateOnNewDocument', { source: SCRIPT_INICIAL });
    return p;
  }
  constructor(cdp) { this.cdp = cdp; }
  cmd(method, params) { return this.cdp.send(method, params, this.sid); }
  aguardarEvento(nome, ms = 15000) {
    return new Promise((ok, erro) => {
      const t = setTimeout(() => { this.ouvintes.delete(f); erro(new Error(`timeout esperando ${nome}`)); }, ms);
      const f = (m) => { if (m.method === nome) { clearTimeout(t); this.ouvintes.delete(f); ok(m.params); } };
      this.ouvintes.add(f);
    });
  }
  async ir(url, { espera = 400 } = {}) {
    const load = this.aguardarEvento('Page.loadEventFired');
    await this.cmd('Page.navigate', { url });
    await load;
    await dormir(espera);
  }
  async avaliar(expressao) {
    const r = await this.cmd('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(`erro na página: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    return r.result.value;
  }
  async esperar(expressao, ms = 3000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (await this.avaliar(expressao).catch(() => false)) return true;
      await dormir(100);
    }
    return false;
  }
  async tecla(key, code, vk) {
    for (const type of ['rawKeyDown', 'keyUp']) await this.cmd('Input.dispatchKeyEvent', { type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
  }
  async fechar() {
    this.off?.();
    try { await this.cdp.send('Target.closeTarget', { targetId: this.targetId }); } catch { /* ok */ }
    try { await this.cdp.send('Target.disposeBrowserContext', { browserContextId: this.contexto }); } catch { /* ok */ }
  }
}

// ---------------------------------------------------------------------------
// Helpers de página (rodam dentro do navegador)
// ---------------------------------------------------------------------------

const rectDe = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; })()`;
const visivelJs = (sel) => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && !e.hasAttribute('inert') && e.getAttribute('aria-hidden') !== 'true' && !e.closest('[inert],[hidden]'); })()`;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const LARGURAS = [320, 360, 390, 430, 768, 1024, 1280];

function criarContexto(cdp, origin, nicho, content) {
  return { cdp, origin, nicho, content, url: `${origin}/${nicho}/`, abrir: (o) => Pagina.abrir(cdp, o) };
}

async function comPagina(ctx, opcoes, fn, { url = ctx.url, espera } = {}) {
  const p = await ctx.abrir(opcoes);
  try {
    await p.ir(url, { espera });
    return await fn(p);
  } finally {
    await p.fechar();
  }
}

const HOST_ANALYTICS = /(^|\.)(googletagmanager\.com|google-analytics\.com|analytics\.google\.com|clarity\.ms|c\.bing\.com)$/i;
const CONVITE_TESTE = 'https://chat.whatsapp.com/TESTE1234';
const IDS_TESTE = { ga4: 'G-TESTE12345', clarity: 'abcd1234' };

/** Requisições externas já interceptadas pela Pagina; `antesDoLoad()` zera a marca do `load` antes de navegar. */
function interceptarExternas(p) {
  return { externas: p.externas, antesDoLoad: () => { p.carregou = false; } };
}
const lista = (xs) => xs.slice(0, 4).map((x) => { try { return new URL(x.url).hostname; } catch { return x.url; } }).join(', ');

const externas = (p, origin) => p.requisicoes.filter((u) => !/^(data|blob|about|chrome-extension):/.test(u) && !u.startsWith(origin));

export const CHECKS = [
  {
    ca: 'CA2', nome: 'sem rolagem horizontal de 320 a 1280 px',
    async rodar(ctx) {
      const ruins = [];
      for (const w of LARGURAS) {
        await comPagina(ctx, { width: w, height: 800 }, async (p) => {
          const d = await p.avaliar('({ sw: document.documentElement.scrollWidth, bw: document.body.scrollWidth, iw: window.innerWidth })');
          if (d.sw > d.iw || d.bw > d.iw) ruins.push(`${w}px: scrollWidth ${Math.max(d.sw, d.bw)} > ${d.iw}`);
        });
      }
      return { ok: ruins.length === 0, msg: ruins.length ? ruins.join('; ') : `scrollWidth <= innerWidth em ${LARGURAS.join(', ')}` };
    },
  },
  {
    ca: 'CA1', nome: 'h1 e CTA do hero inteiros em 360x640 (sem e com banner aberto)',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        const medir = async () => ({ h1: await p.avaliar(rectDe('h1')), cta: await p.avaliar(rectDe('[data-cta=hero]')), banner: await p.avaliar(rectDe('#consent')) });
        const falhas = [];
        const sem = await medir();
        if (!sem.h1 || !sem.cta) return { ok: false, msg: 'h1 ou [data-cta=hero] não encontrado' };
        const confere = (rot, m) => {
          if (m.h1.top < 0 || m.h1.bottom > 640) falhas.push(`${rot}: h1 termina em ${m.h1.bottom.toFixed(0)}`);
          if (m.cta.top < 0 || m.cta.bottom > 640) falhas.push(`${rot}: CTA termina em ${m.cta.bottom.toFixed(0)}`);
        };
        confere('sem banner', sem);
        let nota = '';
        const existe = await p.avaliar("!!document.getElementById('consent')");
        if (existe) {
          await p.avaliar("document.getElementById('consent').hidden = false; true");
          await dormir(400);
          const com = await medir();
          confere('com banner', com);
          if (com.banner && com.banner.width > 0 && com.banner.top < com.cta.bottom) falhas.push(`com banner: banner (topo ${com.banner.top.toFixed(0)}) cobre o CTA (base ${com.cta.bottom.toFixed(0)})`);
          nota = `; banner forçado, topo em ${com.banner?.top.toFixed(0)}`;
        } else nota = '; sem #consent no HTML (banner não testado)';
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `h1 termina em ${sem.h1.bottom.toFixed(0)}, CTA em ${sem.cta.bottom.toFixed(0)} (de 640)${nota}` };
      });
    },
  },
  {
    ca: 'CA3', nome: 'sem JavaScript: CTAs hero e final visíveis com href do convite',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640, js: false, observar: false }, async (p) => {
        const falhas = [];
        for (const loc of ['hero', 'final']) {
          const sel = `a[data-cta=${loc}]`;
          const vis = await p.avaliar(visivelJs(sel));
          const href = await p.avaliar(`document.querySelector(${JSON.stringify(sel)})?.getAttribute('href')`);
          if (!vis) falhas.push(`${loc}: invisível sem JS`);
          if (href !== ctx.content.convite) falhas.push(`${loc}: href ${href} != convite`);
        }
        const h1 = norm(await p.avaliar("document.querySelector('h1')?.innerText ?? ''"));
        if (!h1) falhas.push('h1 sem texto visível sem JS');
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `hero e final visíveis, href = convite, h1 "${h1}"` };
      });
    },
  },
  {
    ca: 'CA15', nome: 'clique no CTA navega para o convite sem preventDefault',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        // A navegação ao convite é interceptada pela Pagina (responde vazio, nada sai para a rede).
        await p.avaliar("window.__prevented = null; window.addEventListener('click', (e) => { window.__prevented = e.defaultPrevented; }); true");
        const alvo = await p.avaliar("(() => { const a = document.querySelector('a[data-cta=hero]'); return { href: a.href, target: a.getAttribute('target') }; })()");
        const nav = p.aguardarEvento('Page.frameRequestedNavigation', 5000).catch(() => null);
        const r = await p.avaliar(rectDe('a[data-cta=hero]'));
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        for (const type of ['mousePressed', 'mouseReleased']) await p.cmd('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        const ev = await nav;
        const prevented = await p.avaliar('window.__prevented').catch(() => null);
        const falhas = [];
        if (!ev) falhas.push('o clique não iniciou navegação');
        else if (ev.url !== alvo.href) falhas.push(`navegou para ${ev.url} (esperado ${alvo.href})`);
        if (alvo.target === '_blank') falhas.push('target=_blank');
        if (prevented === true) falhas.push('o clique teve preventDefault');
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `clique navega para o href do convite (preventDefault: ${prevented ?? 'n/d, página saiu'})` };
      });
    },
  },
  {
    ca: 'CA5', nome: 'no fim da página o rodapé não é interceptado pela barra nem pelo banner',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        await p.avaliar('window.scrollTo(0, document.documentElement.scrollHeight); true');
        await dormir(700);
        const d = await p.avaliar(`(() => {
          const alvos = [...document.querySelectorAll('footer a, footer button, footer p, footer small, footer li')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; });
          const barra = document.querySelector('#sticky'); const banner = document.querySelector('#consent');
          const cobre = (el) => { const r = el.getBoundingClientRect(); const x = r.left + r.width / 2; const y = Math.min(r.bottom - 1, window.innerHeight - 1, r.top + r.height / 2); const topo = document.elementFromPoint(x, y); return topo && topo !== el && !el.contains(topo) && !topo.contains(el) ? (topo.id || topo.tagName) : null; };
          const interceptados = alvos.map((e) => ({ t: (e.textContent || '').trim().slice(0, 30), por: cobre(e) })).filter((o) => o.por);
          const ultimo = alvos.reduce((a, e) => (!a || e.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? e : a), null);
          const rb = barra ? barra.getBoundingClientRect() : null;
          const barraVisivel = barra && getComputedStyle(barra).visibility !== 'hidden';
          return { n: alvos.length, interceptados, ultimoBase: ultimo ? ultimo.getBoundingClientRect().bottom : null, barraTopo: rb && barraVisivel ? rb.top : null, barraVisivel: !!barraVisivel, fimDaPagina: Math.round(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1 };
        })()`);
        const falhas = [];
        if (d.n === 0) falhas.push('sem elementos de rodapé encontrados');
        if (d.interceptados.length) falhas.push(`interceptados: ${d.interceptados.map((o) => `"${o.t}" por ${o.por}`).join(', ')}`);
        if (d.barraVisivel && d.barraTopo != null && d.ultimoBase != null && d.ultimoBase > d.barraTopo) falhas.push(`último elemento do rodapé (base ${d.ultimoBase.toFixed(0)}) abaixo do topo da barra (${d.barraTopo.toFixed(0)})`);
        if (!d.fimDaPagina) falhas.push('não chegou ao fim da página');
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `${d.n} elementos de rodapé livres; barra ${d.barraVisivel ? 'visível' : 'oculta'} no fim (safe area real = manual)` };
      });
    },
  },
  {
    ca: 'CA11', nome: 'barra fixa: oculta no topo, visível após o hero, oculta no CTA final',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        const barraVisivel = `(() => { const b = document.querySelector('#sticky'); if (!b) return false; const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return cs.visibility !== 'hidden' && cs.display !== 'none' && !b.hasAttribute('inert') && b.getAttribute('aria-hidden') !== 'true' && r.top < window.innerHeight - 4 && r.bottom > 4; })()`;
        if (!(await p.avaliar("!!document.querySelector('#sticky')"))) return { ok: false, msg: '#sticky ausente no HTML' };
        const falhas = [];
        const estado = [];
        const topo = await p.avaliar(barraVisivel);
        estado.push(`topo=${topo}`);
        if (topo) falhas.push('barra visível no topo (CTA do hero na tela)');
        await p.avaliar("window.scrollTo(0, document.querySelector('[data-cta=hero]').getBoundingClientRect().bottom + window.scrollY + 60); true");
        const meio = await p.esperar(barraVisivel, 2500);
        estado.push(`depois do hero=${meio}`);
        if (!meio) falhas.push('barra não apareceu depois que o CTA do hero saiu');
        else {
          const href = await p.avaliar("document.querySelector('#sticky a[data-cta=sticky]')?.getAttribute('href')");
          if (href !== ctx.content.convite) falhas.push(`href da barra ${href} != convite`);
        }
        await p.avaliar("document.querySelector('[data-cta=final]').scrollIntoView({block:'center'}); true");
        const sumiu = await p.esperar(`!(${barraVisivel})`, 2500);
        estado.push(`no CTA final=${!sumiu}`);
        if (!sumiu) falhas.push('barra continuou visível com o CTA final na tela');
        await p.avaliar('window.scrollTo(0, document.documentElement.scrollHeight); true');
        await dormir(500);
        if (await p.avaliar(barraVisivel)) falhas.push('barra voltou a aparecer no rodapé (depois do CTA final)');
        const desktop = await comPagina(ctx, { width: 1024, height: 800 }, (q) => q.avaliar("(() => { const b = document.querySelector('#sticky'); return !b || getComputedStyle(b).display === 'none' || getComputedStyle(b).visibility === 'hidden'; })()"));
        if (!desktop) falhas.push('barra visível em 1024 px (deveria existir só abaixo de 768)');
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `${estado.join(', ')}; oculta em 1024 px` };
      });
    },
  },
  {
    ca: 'CA12', nome: 'alvos de toque (CTA principal >= 48, demais >= 44) e estados',
    async rodar(ctx) {
      const falhas = [];
      const info = [];
      await comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        await p.avaliar("for (const e of document.querySelectorAll('#consent, [data-consent=open]')) e.hidden = false; true");
        await dormir(300);
        for (const [sel, min] of [['a[data-cta=hero]', 48], ['a[data-cta=final]', 48], ['a[data-cta=sticky]', 44], ['#consent [data-consent=accept]', 44], ['#consent [data-consent=deny]', 44], ['[data-consent=open]', 44]]) {
          const r = await p.avaliar(rectDe(sel));
          if (!r) { if (!sel.includes('consent')) falhas.push(`${sel} ausente`); continue; }
          if (r.width < min || r.height < min) falhas.push(`${sel} = ${r.width.toFixed(0)}x${r.height.toFixed(0)} (mín. ${min})`);
          else info.push(`${sel.replace('a[data-cta=', '').replace(/[\]#]/g, '')} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`);
        }
      });
      // Estados hover/active/focus-visible em desktop (hover: hover).
      await comPagina(ctx, { width: 1280, height: 800 }, async (p) => {
        const { root } = await p.cmd('DOM.getDocument', { depth: 0 });
        const { nodeId } = await p.cmd('DOM.querySelector', { nodeId: root.nodeId, selector: 'a[data-cta=hero]' });
        const estilo = () => p.avaliar("(() => { const cs = getComputedStyle(document.querySelector('a[data-cta=hero]')); return { bg: cs.backgroundColor, tr: cs.transform, ol: cs.outlineStyle + ' ' + cs.outlineWidth, sh: cs.boxShadow }; })()");
        const base = await estilo();
        const forcar = async (estados) => { await p.cmd('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: estados }); await dormir(400); return estilo(); };
        const hover = await forcar(['hover']);
        const active = await forcar(['hover', 'active']);
        const foco = await forcar(['focus-visible']);
        await forcar([]);
        if (hover.bg === base.bg && hover.tr === base.tr) falhas.push('hover não altera o CTA');
        if (active.bg === base.bg && active.tr === base.tr) falhas.push('active não altera o CTA');
        if (/^none/.test(foco.ol) || /^\S+ 0px/.test(foco.ol)) falhas.push(`focus-visible sem outline (${foco.ol})`);
        info.push('hover/active/focus-visible distintos');
      });
      return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : info.join(', ') };
    },
  },
  {
    ca: 'CA16', nome: 'A/B por ?h=2&c=3 troca o texto sem CLS; valores inválidos caem no padrão',
    async rodar(ctx) {
      const { headlines = [], ctas = [], padrao = { h: 1, c: 1 } } = ctx.content.ab ?? {};
      const falhas = [];
      const ler = (p) => p.avaliar(`({ h1: document.querySelector('h1')?.innerText ?? '', cta: document.querySelector('a[data-cta=hero]')?.innerText ?? '', h: document.documentElement.dataset.h, c: document.documentElement.dataset.c, cls: window.__cls })`);
      const padraoH = headlines[padrao.h - 1], padraoC = ctas[padrao.c - 1];
      const a = await comPagina(ctx, { width: 360, height: 640 }, ler);
      if (norm(a.h1) !== norm(padraoH ?? '')) falhas.push(`padrão: h1 "${norm(a.h1)}" != "${padraoH}"`);
      if (!norm(a.cta).includes(norm(padraoC ?? '\0'))) falhas.push(`padrão: CTA "${norm(a.cta)}" não contém "${padraoC}"`);
      if (headlines.length < 3 || ctas.length < 3) falhas.push('content.ab precisa de 3 headlines e 3 CTAs para testar ?h=2&c=3');
      const b = await comPagina(ctx, { width: 360, height: 640 }, ler, { url: `${ctx.url}?h=2&c=3` });
      if (norm(b.h1) !== norm(headlines[1] ?? '\0')) falhas.push(`?h=2: h1 "${norm(b.h1)}" != "${headlines[1]}"`);
      if (!norm(b.cta).includes(norm(ctas[2] ?? '\0'))) falhas.push(`?c=3: CTA "${norm(b.cta)}" não contém "${ctas[2]}"`);
      if (b.h !== '2' || b.c !== '3') falhas.push(`data-h/data-c = ${b.h}/${b.c}`);
      if (b.cls > 0.0001) falhas.push(`CLS ${b.cls.toFixed(4)} com ?h=2&c=3`);
      const c = await comPagina(ctx, { width: 360, height: 640 }, ler, { url: `${ctx.url}?h=9&c=abc` });
      if (norm(c.h1) !== norm(padraoH ?? '')) falhas.push(`?h=9 (inválido) deveria cair no padrão, h1 = "${norm(c.h1)}"`);
      const d = await comPagina(ctx, { width: 360, height: 640 }, ler, { url: `${ctx.url}?h=%3Cscript%3E&c=1e1` });
      if (norm(d.h1) !== norm(padraoH ?? '')) falhas.push('?h com HTML não caiu no padrão');
      return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `?h=2&c=3 mostra "${norm(b.h1)}" / "${norm(b.cta)}", CLS ${b.cls.toFixed(4)}; inválidos caem no padrão` };
    },
  },
  {
    ca: 'CA7', nome: 'CLS <= 0,1 e LCP local <= 2,5 s; registra o elemento LCP (CA19)',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        await p.avaliar(`(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y <= h; y += 300) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); return true; })()`);
        await dormir(800);
        const d = await p.avaliar('({ cls: window.__cls, lcp: window.__lcp })');
        const falhas = [];
        if (d.cls > 0.1) falhas.push(`CLS ${d.cls.toFixed(3)} > 0,1`);
        if (!d.lcp) falhas.push('LCP não registrado');
        else if (d.lcp.t > 2500) falhas.push(`LCP ${d.lcp.t.toFixed(0)} ms > 2500 (local, sem throttling)`);
        const el = d.lcp ? `${d.lcp.tag}${d.lcp.id ? '#' + d.lcp.id : ''}${d.lcp.src ? ' ' + d.lcp.src : ''}` : 'n/d';
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : `CLS ${d.cls.toFixed(4)}, LCP ${d.lcp.t.toFixed(0)} ms (local); INP = campo/manual`, extra: { ca: 'CA19', ok: !!d.lcp, aviso: d.lcp && d.lcp.tag !== 'H1' && d.lcp.tag !== 'IMG', msg: `elemento LCP = ${el} (esperado H1 ou imagem <= 60 KB)` } };
      });
    },
  },
  {
    ca: 'CA20', nome: 'navegação por Tab: foco visível, na tela e não coberto; barra oculta fora da ordem',
    async rodar(ctx) {
      const falhas = [];
      const resumos = [];
      for (const [w, h] of [[360, 640], [1280, 800]]) {
        await comPagina(ctx, { width: w, height: h }, async (p) => {
          const vistos = [];
          for (let i = 0; i < 40; i++) {
            await p.tecla('Tab', 'Tab', 9);
            await dormir(120);
            const a = await p.avaliar(`(() => {
              const e = document.activeElement; if (!e || e === document.body) return null;
              const cs = getComputedStyle(e); const r = e.getBoundingClientRect();
              const x = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1), y = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
              const topo = document.elementFromPoint(x, y);
              const ind = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || (cs.boxShadow !== 'none' && cs.outlineStyle === 'none');
              const sticky = document.querySelector('#sticky');
              return { cta: e.getAttribute('data-cta'), id: e.id || e.getAttribute('data-cta') || e.tagName + ':' + (e.textContent || '').trim().slice(0, 22), indicador: ind, naTela: r.bottom > 0 && r.top < innerHeight, coberto: !!topo && topo !== e && !e.contains(topo), naBarra: !!(sticky && sticky.contains(e)), barraOculta: sticky ? getComputedStyle(sticky).visibility === 'hidden' || sticky.hasAttribute('inert') : true, matchFV: e.matches(':focus-visible') };
            })()`);
            if (!a) break;
            if (vistos.some((v) => v.id === a.id && v.n >= 2)) break;
            const prev = vistos.find((v) => v.id === a.id);
            if (prev) prev.n++; else vistos.push({ ...a, n: 1 });
          }
          const rot = `${w}px`;
          if (vistos.length === 0) { falhas.push(`${rot}: Tab não focou nada`); return; }
          if (!vistos.some((v) => v.cta === 'hero')) falhas.push(`${rot}: CTA do hero não recebe foco por Tab`);
          for (const v of vistos) {
            if (!v.indicador) falhas.push(`${rot}: foco sem indicador visível em ${v.id}`);
            if (!v.naTela) falhas.push(`${rot}: ${v.id} focado fora da tela`);
            if (v.coberto) falhas.push(`${rot}: ${v.id} focado mas coberto por outro elemento`);
            if (v.naBarra && v.barraOculta) falhas.push(`${rot}: foco entrou na barra oculta`);
          }
          resumos.push(`${rot}: ${vistos.length} paradas`);
        });
      }
      return { ok: falhas.length === 0, msg: falhas.length ? [...new Set(falhas)].join('; ') : `${resumos.join(', ')}, todas com indicador de foco (leitor de tela = manual)` };
    },
  },
  {
    ca: 'CA14', nome: 'dist/ real sem consentimento: zero requisições fora da origem, nada gravado, banner sem CLS',
    async rodar(ctx) {
      const falhas = [];
      const notas = [];
      // 1) Sem escolha: nada de rede externa e nenhum dado gravado.
      const antes = await comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        await dormir(2200);
        return { ext: externas(p, ctx.origin), banner: await p.avaliar("(() => { const b = document.getElementById('consent'); return !!b && !b.hidden; })()"), ls: await p.avaliar("(() => { try { return Object.keys(localStorage).join(',') } catch (e) { return 'erro' } })()") };
      });
      if (antes.ext.length) falhas.push(`requisições externas antes do consentimento: ${antes.ext.slice(0, 4).join(', ')}`);
      if (antes.ls && antes.ls !== 'erro') falhas.push(`localStorage gravado antes da escolha: ${antes.ls}`);
      notas.push(`sem escolha: ${antes.ext.length} externas`);
      notas.push(antes.banner ? 'banner aberto' : 'banner fechado (IDs vazios/placeholder)');
      // Aceitar/Recusar só no CA14 com IDs de teste (build temporário): aqui nenhum clique em "Aceitar",
      // para não haver hit de analytics a partir do dist/ real (S1).
      // 2) CLS do banner.
      await comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        await p.avaliar("document.getElementById('consent').hidden = false; true");
        await dormir(800);
        const cls = await p.avaliar('window.__cls');
        if (cls > 0.0001) falhas.push(`CLS do banner = ${cls.toFixed(4)}`);
        notas.push(`CLS do banner ${cls.toFixed(4)}`);
      });
      return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : notas.join('; ') };
    },
  },
  {
    ca: 'CA14', nome: 'com IDs de teste (build temporário, rede interceptada): zero externas antes do aceite e após Recusar; só GA4/Clarity após Aceitar e só depois do load; CTA não é impedido',
    async rodar(ctx) {
      const tmp = mkdtempSync(join(tmpdir(), 'petsland-ca14-'));
      let servidor;
      try {
        mkdirSync(join(tmp, 'content'));
        writeFileSync(join(tmp, 'content', `${ctx.nicho}.json`), JSON.stringify({ ...ctx.content, convite: CONVITE_TESTE, analytics: { ...IDS_TESTE } }));
        const b = construir({ contentDir: join(tmp, 'content'), saida: join(tmp, 'dist') });
        if (!b.ok) return { ok: false, msg: `build temporário falhou: ${b.erros.join('; ')}` };
        servidor = await startServer(join(tmp, 'dist'));
        const url = `${servidor.origin}/${ctx.nicho}/`;
        const falhas = [];
        const notas = [];
        const abrir = async () => {
          const p = await ctx.abrir({ width: 360, height: 640 });
          const rede = interceptarExternas(p);
          return { p, rede };
        };
        const banner = (p) => p.avaliar("(() => { const b = document.getElementById('consent'); return !!b && !b.hidden; })()");
        // 1) Antes do aceite.
        {
          const { p, rede } = await abrir();
          try {
            await p.ir(url);
            await dormir(2500);
            if (!(await banner(p))) falhas.push('banner não apareceu com IDs válidos');
            if (rede.externas.length) falhas.push(`antes do aceite houve requisições externas: ${lista(rede.externas)}`);
            notas.push(`antes do aceite: ${rede.externas.length} externas`);
          } finally { await p.fechar(); }
        }
        // 2) Recusar, e de novo ao recarregar.
        {
          const { p, rede } = await abrir();
          try {
            await p.ir(url);
            await p.avaliar("document.querySelector('[data-consent=deny]').click(); true");
            await dormir(2500);
            rede.antesDoLoad();
            await p.ir(url);
            await dormir(2500);
            const salvo = await p.avaliar("localStorage.getItem('consent.v1')");
            if (!/denied/.test(salvo ?? '')) falhas.push(`Recusar não gravou denied (${salvo})`);
            if (rede.externas.length) falhas.push(`após Recusar (com recarga) houve externas: ${lista(rede.externas)}`);
            notas.push(`Recusar: ${rede.externas.length} externas`);
          } finally { await p.fechar(); }
        }
        // 3) Aceitar: só GA4/Clarity; recarga com escolha salva: só depois do load; clique no CTA.
        {
          const { p, rede } = await abrir();
          try {
            await p.ir(url);
            await p.avaliar("document.querySelector('[data-consent=accept]').click(); true");
            await dormir(4000);
            const apos = [...rede.externas];
            const fora = apos.filter((x) => { try { return !HOST_ANALYTICS.test(new URL(x.url).hostname); } catch { return true; } });
            const temGa = apos.some((x) => /googletagmanager\.com/.test(x.url) && x.url.includes(IDS_TESTE.ga4));
            const temClarity = apos.some((x) => /clarity\.ms/.test(x.url) && x.url.includes(IDS_TESTE.clarity));
            if (fora.length) falhas.push(`após Aceitar, domínios fora de GA4/Clarity: ${lista(fora)}`);
            if (!temGa || !temClarity) falhas.push(`após Aceitar faltou carregar ${[!temGa && 'GA4', !temClarity && 'Clarity'].filter(Boolean).join(' e ')}`);
            const salvo = await p.avaliar("localStorage.getItem('consent.v1')");
            if (!/granted/.test(salvo ?? '')) falhas.push(`Aceitar não gravou granted (${salvo})`);
            notas.push(`Aceitar: ${apos.length} externas (${[...new Set(apos.map((x) => new URL(x.url).hostname))].join(', ')})`);

            rede.externas.length = 0;
            rede.antesDoLoad();
            await p.ir(url, { espera: 0 });
            await dormir(3500);
            const cedo = rede.externas.filter((x) => !x.depoisDoLoad);
            if (cedo.length) falhas.push(`com escolha salva, externas antes do load: ${lista(cedo)}`);
            if (!rede.externas.length) falhas.push('com escolha salva, analytics não carregou depois do load');
            notas.push(`recarga com aceite: ${rede.externas.length} externas, ${cedo.length} antes do load`);

            // CTA: o clique não pode ser impedido, o evento vai ao dataLayer e a navegação segue ao convite.
            rede.externas.length = 0;
            const r = await p.avaliar(`(() => {
              const out = { prevented: null };
              window.addEventListener('click', (e) => { out.prevented = e.defaultPrevented; });
              const a = document.querySelector('a[data-cta=hero]');
              a.click();
              out.evento = Array.from(window.dataLayer || []).some((x) => x[0] === 'event' && x[1] === 'click_whatsapp_cta');
              return out;
            })()`).catch(() => null);
            await dormir(1200);
            if (!r) falhas.push('não foi possível clicar no CTA');
            else {
              if (r.prevented !== false) falhas.push(`clique no CTA com defaultPrevented=${r.prevented}`);
              if (!r.evento) falhas.push('clique no CTA não registrou click_whatsapp_cta');
            }
            const nav = rede.externas.some((x) => x.url === CONVITE_TESTE);
            if (!nav) falhas.push('clique no CTA não navegou para o convite');
            notas.push(`CTA: defaultPrevented=${r?.prevented}, evento=${r?.evento}, navegou=${nav}`);
          } finally { await p.fechar(); }
        }
        return { ok: falhas.length === 0, msg: falhas.length ? falhas.join('; ') : notas.join('; ') };
      } finally {
        await servidor?.close().catch(() => {});
        rmSync(tmp, { recursive: true, force: true });
      }
    },
  },
  {
    ca: 'CA25', nome: 'rede: nenhuma requisição externa no carregamento nem ao rolar (sem consentimento)',
    async rodar(ctx) {
      return comPagina(ctx, { width: 360, height: 640 }, async (p) => {
        await p.avaliar("window.scrollTo(0, document.documentElement.scrollHeight); true");
        await dormir(1500);
        const ext = externas(p, ctx.origin);
        const total = p.requisicoes.filter((u) => u.startsWith(ctx.origin)).length;
        return { ok: ext.length === 0, msg: ext.length ? `requisições externas: ${ext.join(', ')}` : `${total} requisições, todas da própria origem` };
      });
    },
  },
];

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

async function principal() {
  const nicho = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'pet';
  const arqHtml = join(RAIZ, 'dist', nicho, 'index.html');
  const arqContent = join(RAIZ, 'content', `${nicho}.json`);
  const ausentes = [arqHtml, arqContent].filter((a) => !existsSync(a));
  if (ausentes.length) {
    console.error('browser-check: faltam entradas:');
    for (const a of ausentes) console.error(`  - ${a.replace(RAIZ + '/', '')}`);
    console.error('Rode `node build.mjs` antes.');
    process.exit(2);
  }
  let content;
  try { content = JSON.parse(readFileSync(arqContent, 'utf8')); } catch (e) { console.error(`browser-check: content/${nicho}.json inválido: ${e.message}`); process.exit(2); }

  let servidor, chrome, saida = 0;
  const limpar = async () => { await chrome?.close().catch(() => {}); await servidor?.close().catch(() => {}); };
  const sinal = () => { limpar().finally(() => process.exit(130)); };
  process.once('SIGINT', sinal); process.once('SIGTERM', sinal);
  const falhasTotal = []; let avisos = 0, oks = 0;
  const imprime = (ca, nivel, msg) => console.log(`${{ ok: 'OK    ', falha: 'FALHA ', aviso: 'AVISO ' }[nivel]} ${ca.padEnd(4)} ${msg}`);
  try {
    servidor = await startServer();
    chrome = await launchChrome();
    const ctx = criarContexto(chrome.cdp, servidor.origin, nicho, content);
    const alerta = setTimeout(() => { console.error('browser-check: estourou 4 min, abortando'); limpar().finally(() => process.exit(1)); }, 240000);
    alerta.unref();
    for (const c of CHECKS) {
      let r;
      try { r = await c.rodar(ctx); } catch (e) { r = { ok: false, msg: `erro ao executar: ${e.message}` }; }
      const nivel = r.ok ? (r.aviso ? 'aviso' : 'ok') : 'falha';
      imprime(c.ca, nivel, `${c.nome}: ${r.msg}`);
      if (nivel === 'falha') falhasTotal.push(c.ca); else if (nivel === 'aviso') avisos++; else oks++;
      if (r.extra) {
        const n = r.extra.ok ? (r.extra.aviso ? 'aviso' : 'ok') : 'falha';
        imprime(r.extra.ca, r.extra.aviso ? 'aviso' : n, r.extra.msg);
        if (n === 'falha') falhasTotal.push(r.extra.ca); else if (r.extra.aviso) avisos++; else oks++;
      }
    }
    console.log(`\nbrowser-check (${nicho}): ${oks} ok, ${falhasTotal.length} falha(s), ${avisos} aviso(s)`);
    saida = falhasTotal.length ? 1 : 0;
  } catch (e) {
    console.error(`browser-check: ${e.message}`);
    saida = 2;
  } finally {
    await limpar();
  }
  process.exit(saida);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
