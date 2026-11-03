// CA14, CA15 (e CA17 no comentário de cabeçalho de consent.js):
// consentimento LGPD, carga de GA4/Clarity só após aceite + load, revogação
// e evento click_whatsapp_cta. DOM, localStorage, gtag e cookies à mão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  STORAGE_KEY,
  parseConfig,
  safeStorage,
  readChoice,
  saveChoice,
  CHOICE_MAX_AGE_MS,
  GA4_RE,
  CLARITY_RE,
  variantOf,
  ctaEventParams,
  trackCtaClick,
  analyticsCookieNames,
  cookieDomains,
  initConsent,
} from '../src/js/consent.js';

const SRC = readFileSync(new URL('../src/js/consent.js', import.meta.url), 'utf8');
const AGORA = new Date().toISOString();

// ---------- mocks ----------
// Documento "ativo" do mock: focus() muda activeElement e dispara focusin no documento.
let docAtual = null;
function el(tag, attrs = {}, parent = null) {
  const a = { ...attrs };
  const listeners = {};
  const node = {
    tag,
    attrs: a,
    parent,
    children: [],
    textContent: '',
    focusable: true,
    focus(opts) {
      if (!node.focusable || !docAtual) return;
      docAtual.activeElement = node;
      docAtual.focusOpts.push(opts);
      for (const fn of docAtual.documentElement._l.focusin || []) fn({ type: 'focusin', target: node });
    },
    contains(other) {
      for (let n = other; n; n = n.parent) if (n === node) return true;
      return false;
    },
    querySelector(sel) {
      const tagSel = sel.toLowerCase();
      const walk = (n) => { for (const ch of n.children) { if (ch.tag === tagSel) return ch; const r = walk(ch); if (r) return r; } return null; };
      return walk(node);
    },
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    removeAttribute: (k) => { delete a[k]; },
    hasAttribute: (k) => k in a,
    addEventListener: (t, fn) => { (listeners[t] ||= []).push(fn); },
    dispatch(type, target = node) {
      const ev = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
      for (let n = target; n; n = n.parent) for (const fn of n._l?.[type] || []) fn(ev);
      return ev;
    },
    _l: listeners,
    closest(sel) {
      for (let n = node; n; n = n.parent) if (n.matches?.(sel)) return n;
      return null;
    },
    matches(sel) {
      if (sel === '[data-consent]') return 'data-consent' in a;
      if (sel === 'a[data-cta]') return tag === 'a' && 'data-cta' in a;
      return false;
    },
  };
  if (parent) parent.children.push(node);
  return node;
}

function memStorage({ throwGet = false, throwSet = false, init = {} } = {}) {
  const m = new Map(Object.entries(init));
  return {
    m,
    getItem: (k) => { if (throwGet) throw new Error('bloqueado'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (throwSet) throw new Error('cota'); m.set(k, String(v)); },
  };
}

function setup({ cfg = { ga4: 'G-ABC123XYZ', clarity: 'abc123def', niche: 'pet' }, stored, storage, readyState = 'loading', idle = true, h = '2', c = '3', cookie = '' } = {}) {
  const root = el('html', { 'data-h': h, 'data-c': c });
  const body = el('body', { 'data-niche': 'pet' }, root);
  const main = el('main', { id: 'main', tabindex: '-1' }, body);
  const dock = el('div', {}, body);
  const banner = el('div', { id: 'consent', hidden: '' }, dock);
  const accept = el('button', { 'data-consent': 'accept' }, banner);
  const deny = el('button', { 'data-consent': 'deny' }, banner);
  const status = el('p', { role: 'status', 'data-consent-status': '', 'data-saved': 'Preferência salva.' }, dock);
  const foot = el('footer', {}, body);
  const openBtn = el('button', { 'data-consent': 'open', hidden: '' }, foot);
  const hero = el('a', { 'data-cta': 'hero', href: 'https://chat.whatsapp.com/X' }, main);
  const heroSpan = el('span', {}, hero);
  const sticky = el('a', { 'data-cta': 'sticky' }, body);
  const final = el('a', { 'data-cta': 'final' }, body);
  const other = el('a', { 'data-cta': 'rodape' }, body);
  const cfgEl = el('script', { id: 'cfg' });
  cfgEl.textContent = typeof cfg === 'string' ? cfg : JSON.stringify(cfg);
  const head = el('head');
  const scripts = [];
  head.appendChild = (s) => { scripts.push(s); return s; };

  const cookieWrites = [];
  const doc = {
    activeElement: body,
    focusOpts: [],
    readyState,
    documentElement: root,
    body,
    head,
    get cookie() { return cookie; },
    set cookie(v) { cookieWrites.push(v); },
    getElementById: (id) => ({ cfg: cfgEl, consent: banner })[id] || null,
    querySelector: (s) => ({ '[data-consent="open"]': openBtn, '[data-consent-status]': status, main })[s] || null,
    createElement: (t) => ({ tag: t }),
    addEventListener: (t, fn) => { (root._l[t] ||= []).push(fn); },
  };
  docAtual = doc;
  // eventos de documento sobem até o <html>
  const winListeners = {};
  const store = storage || memStorage({ init: stored ? { [STORAGE_KEY]: JSON.stringify(stored) } : {} });
  const reloads = [];
  const idleQueue = [];
  const win = {
    localStorage: store,
    location: { hostname: 'www.exemplo.com.br', reload: () => reloads.push(1) },
    addEventListener: (t, fn) => { (winListeners[t] ||= []).push(fn); },
    setTimeout: (fn) => idleQueue.push(fn),
  };
  if (idle) win.requestIdleCallback = (fn) => idleQueue.push(fn);
  const fireLoad = () => { doc.readyState = 'complete'; for (const fn of winListeners.load || []) fn(); };
  const flushIdle = () => { while (idleQueue.length) idleQueue.shift()(); };
  return { win, doc, root, main, banner, accept, deny, status, openBtn, hero, heroSpan, sticky, final, other, scripts, cookieWrites, store, reloads, fireLoad, flushIdle };
}

const srcs = (t) => t.scripts.map((s) => s.src);
const dlEntries = (win) => (win.dataLayer || []).map((a) => Array.from(a));

// ---------- funções puras ----------
test('parseConfig: aceita IDs válidos e descarta placeholder, lixo e injeção', () => {
  assert.deepEqual(parseConfig('{"ga4":"G-ABC123","clarity":"k2x9abcd","niche":"pet"}'), { ga4: 'G-ABC123', clarity: 'k2x9abcd', niche: 'pet' });
  assert.deepEqual(parseConfig('{"ga4":"[GA4_ID]","clarity":"[CLARITY_ID]","niche":"pet"}'), { ga4: '', clarity: '', niche: 'pet' });
  assert.deepEqual(parseConfig('{"ga4":"G-1\\"><script>","clarity":"abc/../x","niche":"<b>"}'), { ga4: '', clarity: '', niche: '' });
  assert.deepEqual(parseConfig('não é json'), { ga4: '', clarity: '', niche: '' });
  assert.deepEqual(parseConfig(''), { ga4: '', clarity: '', niche: '' });
  assert.deepEqual(parseConfig('null'), { ga4: '', clarity: '', niche: '' });
  assert.deepEqual(parseConfig('{"ga4":123,"clarity":null}'), { ga4: '', clarity: '', niche: '' });
});

test('escolha: grava só {v, t} e lê de volta; tolera storage quebrado', () => {
  const s = memStorage();
  assert.equal(readChoice(s), null);
  assert.equal(saveChoice(s, 'granted', new Date('2026-11-02T10:00:00Z')), true);
  assert.deepEqual(JSON.parse(s.m.get(STORAGE_KEY)), { v: 'granted', t: '2026-11-02T10:00:00.000Z' });
  assert.equal(readChoice(s), 'granted');
  assert.equal(saveChoice(s, 'talvez'), false);
  s.m.set(STORAGE_KEY, '{"v":"outro"}');
  assert.equal(readChoice(s), null);
  s.m.set(STORAGE_KEY, '{quebrado');
  assert.equal(readChoice(s), null);
  assert.equal(readChoice(memStorage({ throwGet: true })), null);
  assert.equal(saveChoice(memStorage({ throwSet: true }), 'denied'), false);
  assert.equal(readChoice(null), null);
  assert.equal(saveChoice(null, 'denied'), false);
  const win = {};
  Object.defineProperty(win, 'localStorage', { get() { throw new Error('SecurityError'); } });
  assert.equal(safeStorage(win), null);
});

test('variantOf e ctaEventParams: só valores de listas fechadas', () => {
  const t = setup();
  assert.equal(variantOf(t.root), 'h2c3');
  assert.equal(variantOf(setup({ h: '7', c: '1' }).root), 'nd');
  const cfg = { niche: 'pet' };
  assert.deepEqual(ctaEventParams(t.hero, t.doc, cfg), { cta_location: 'hero', niche: 'pet', variant: 'h2c3', transport_type: 'beacon' });
  assert.equal(ctaEventParams(t.sticky, t.doc, cfg).cta_location, 'sticky');
  assert.equal(ctaEventParams(t.final, t.doc, cfg).cta_location, 'final');
  assert.equal(ctaEventParams(t.other, t.doc, cfg), null);
  assert.equal(ctaEventParams(t.hero, t.doc, { niche: '' }).niche, 'pet', 'cai no <body data-niche>');
});

test('trackCtaClick: só com consentimento e gtag', () => {
  const calls = [];
  const win = { gtag: (...a) => calls.push(a) };
  const p = { cta_location: 'hero', niche: 'pet', variant: 'h1c1', transport_type: 'beacon' };
  assert.equal(trackCtaClick(win, p, 'denied'), false);
  assert.equal(trackCtaClick(win, p, null), false);
  assert.equal(trackCtaClick({}, p, 'granted'), false);
  assert.equal(trackCtaClick(win, null, 'granted'), false);
  assert.equal(trackCtaClick({ gtag() { throw new Error('x'); } }, p, 'granted'), false);
  assert.equal(calls.length, 0);
  assert.equal(trackCtaClick(win, p, 'granted'), true);
  assert.deepEqual(calls, [['event', 'click_whatsapp_cta', p]]);
});

test('cookies: nomes de analytics e domínios candidatos', () => {
  assert.deepEqual(
    analyticsCookieNames('_ga=GA1.1.1; _ga_ABC123=GS1; tema=claro; _clck=x; _clsk=y; _gid=z; _galinha=1'),
    ['_ga', '_ga_ABC123', '_clck', '_clsk', '_gid'],
  );
  assert.deepEqual(analyticsCookieNames(''), []);
  assert.deepEqual(cookieDomains('www.exemplo.com.br'), ['', 'www.exemplo.com.br', '.www.exemplo.com.br', 'exemplo.com.br', '.exemplo.com.br', 'com.br', '.com.br']);
  assert.deepEqual(cookieDomains('localhost'), ['']);
  assert.deepEqual(cookieDomains('127.0.0.1'), ['']);
});

test('fonte: nenhuma URL externa além de gtag.js e da tag do Clarity; sem preconnect', () => {
  const urls = SRC.match(/https?:\/\/[^'"`\s)]+/g) || [];
  assert.deepEqual([...new Set(urls)].sort(), ['https://www.clarity.ms/tag/', 'https://www.googletagmanager.com/gtag/js?id=']);
  assert.doesNotMatch(SRC, /preconnect|dns-prefetch|prefetch/);
  assert.doesNotMatch(SRC, /preventDefault\(/);
});

// ---------- fluxo (CA14) ----------
test('sem IDs válidos: nada aparece e nada carrega', () => {
  const t = setup({ cfg: { ga4: '[GA4_ID]', clarity: '', niche: 'pet' }, readyState: 'complete' });
  assert.equal(initConsent(t.win, t.doc), null);
  assert.equal(t.banner.hasAttribute('hidden'), true);
  assert.equal(t.openBtn.hasAttribute('hidden'), true);
  assert.equal(t.scripts.length, 0);
});

test('primeira visita: banner só depois do load; nada externo antes de aceitar', () => {
  const t = setup();
  initConsent(t.win, t.doc);
  assert.equal(t.banner.hasAttribute('hidden'), true, 'antes do load');
  assert.equal(t.openBtn.hasAttribute('hidden'), false, 'botão do rodapé revelado');
  t.fireLoad();
  t.flushIdle();
  assert.equal(t.banner.hasAttribute('hidden'), false, 'depois do load');
  assert.equal(t.scripts.length, 0);
  assert.equal(t.win.gtag, undefined);
  assert.equal(t.win.clarity, undefined);
  assert.equal(t.win.dataLayer, undefined);
  // clique no CTA sem consentimento: nada enviado, navegação intacta
  const ev = t.hero.dispatch('click', t.heroSpan);
  assert.equal(ev.defaultPrevented, false);
  assert.equal(t.win.dataLayer, undefined);
});

test('Aceitar: grava, fecha, anuncia e carrega GA4 + Clarity depois do load e em ocioso', () => {
  const t = setup();
  initConsent(t.win, t.doc);
  t.fireLoad();
  t.banner.dispatch('click', t.accept);
  assert.equal(JSON.parse(t.store.m.get(STORAGE_KEY)).v, 'granted');
  assert.deepEqual(Object.keys(JSON.parse(t.store.m.get(STORAGE_KEY))).sort(), ['t', 'v']);
  assert.equal(t.banner.hasAttribute('hidden'), true);
  assert.equal(t.status.textContent, 'Preferência salva.');
  assert.equal(t.scripts.length, 0, 'espera o tempo ocioso');
  t.flushIdle();
  assert.deepEqual(srcs(t), ['https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ', 'https://www.clarity.ms/tag/abc123def']);
  assert.ok(t.scripts.every((s) => s.async === true));
  const dl = dlEntries(t.win);
  assert.deepEqual(dl[0], ['consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' }]);
  assert.equal(dl[1][0], 'js');
  assert.deepEqual(dl[2], ['config', 'G-ABC123XYZ', { allow_google_signals: false, allow_ad_personalization_signals: false }]);
  assert.deepEqual(Array.from(t.win.clarity.q[0]), ['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]);
  assert.equal(t.reloads.length, 0);
});

test('Aceitar antes do load: scripts só depois do evento load (fallback setTimeout sem requestIdleCallback)', () => {
  const t = setup({ idle: false });
  const api = initConsent(t.win, t.doc);
  api.choose('granted');
  t.flushIdle();
  assert.equal(t.scripts.length, 0);
  t.fireLoad();
  t.flushIdle();
  assert.equal(t.scripts.length, 2);
});

test('Recusar: grava, fecha, não carrega nada e não recarrega', () => {
  const t = setup({ readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.banner.dispatch('click', t.deny);
  t.flushIdle();
  assert.equal(JSON.parse(t.store.m.get(STORAGE_KEY)).v, 'denied');
  assert.equal(t.banner.hasAttribute('hidden'), true);
  assert.equal(t.scripts.length, 0);
  assert.equal(t.win.gtag, undefined);
  assert.equal(t.reloads.length, 0);
  assert.equal(t.cookieWrites.length, 0);
});

test('escolha salva "denied": banner não aparece, nada carrega', () => {
  const t = setup({ stored: { v: 'denied', t: AGORA }, readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.flushIdle();
  assert.equal(t.banner.hasAttribute('hidden'), true);
  assert.equal(t.scripts.length, 0);
});

test('escolha salva "granted": carrega sem mostrar banner', () => {
  const t = setup({ stored: { v: 'granted', t: AGORA }, readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.flushIdle();
  assert.equal(t.banner.hasAttribute('hidden'), true);
  assert.equal(t.scripts.length, 2);
});

test('localStorage indisponível: pergunta, respeita a escolha nesta visita e não lança', () => {
  const t = setup({ storage: memStorage({ throwGet: true, throwSet: true }), readyState: 'complete' });
  const api = initConsent(t.win, t.doc);
  assert.equal(t.banner.hasAttribute('hidden'), false);
  api.choose('denied');
  t.flushIdle();
  assert.equal(t.banner.hasAttribute('hidden'), true);
  assert.equal(t.scripts.length, 0);
});

test('só GA4 configurado: carrega só gtag.js', () => {
  const t = setup({ cfg: { ga4: 'G-ABC123XYZ', clarity: '[CLARITY_ID]', niche: 'pet' }, stored: { v: 'granted', t: AGORA }, readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.flushIdle();
  assert.deepEqual(srcs(t), ['https://www.googletagmanager.com/gtag/js?id=G-ABC123XYZ']);
});

test('revogar: Preferências → Recusar faz consent update, apaga cookies e recarrega', () => {
  const t = setup({ stored: { v: 'granted', t: AGORA }, readyState: 'complete', cookie: '_ga=1; _ga_ABC=2; _clck=3; _clsk=4; tema=claro' });
  initConsent(t.win, t.doc);
  t.flushIdle();
  t.openBtn.dispatch('click');
  assert.equal(t.banner.hasAttribute('hidden'), false, 'reabre o banner');
  t.banner.dispatch('click', t.deny);
  const dl = dlEntries(t.win);
  assert.deepEqual(dl.at(-1), ['consent', 'update', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' }]);
  const cq = t.win.clarity.q.map((a) => Array.from(a));
  assert.deepEqual(cq.slice(-2), [['consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }], ['consent', false]]);
  for (const n of ['_ga', '_ga_ABC', '_clck', '_clsk']) {
    assert.ok(t.cookieWrites.includes(`${n}=; Max-Age=0; Path=/`), n);
    assert.ok(t.cookieWrites.includes(`${n}=; Max-Age=0; Path=/; Domain=.exemplo.com.br`), n);
  }
  assert.ok(!t.cookieWrites.some((w) => w.startsWith('tema=')), 'não toca em cookie alheio');
  assert.equal(JSON.parse(t.store.m.get(STORAGE_KEY)).v, 'denied');
  assert.equal(t.reloads.length, 1);
});

test('aceitar e recusar na mesma visita, antes do ocioso: nada carrega', () => {
  const t = setup({ readyState: 'complete' });
  const api = initConsent(t.win, t.doc);
  api.choose('granted');
  api.choose('denied');
  t.flushIdle();
  assert.equal(t.scripts.length, 0);
  assert.equal(t.reloads.length, 1);
});

// ---------- evento (CA15) ----------
test('click_whatsapp_cta: parâmetros, beacon e sem preventDefault', () => {
  const t = setup({ stored: { v: 'granted', t: AGORA }, readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.flushIdle();
  const ev = t.hero.dispatch('click', t.heroSpan);
  assert.equal(ev.defaultPrevented, false);
  t.final.dispatch('click');
  t.other.dispatch('click');
  const events = dlEntries(t.win).filter((a) => a[0] === 'event');
  assert.deepEqual(events, [
    ['event', 'click_whatsapp_cta', { cta_location: 'hero', niche: 'pet', variant: 'h2c3', transport_type: 'beacon' }],
    ['event', 'click_whatsapp_cta', { cta_location: 'final', niche: 'pet', variant: 'h2c3', transport_type: 'beacon' }],
  ]);
});

test('click_whatsapp_cta: depois de recusar, nenhum evento', () => {
  const t = setup({ readyState: 'complete' });
  // O código testado engole exceção do gtag (try/catch), então assert.fail aqui dentro nunca falharia: conta as chamadas.
  const calls = [];
  t.win.gtag = (...a) => calls.push(a);
  initConsent(t.win, t.doc);
  t.banner.dispatch('click', t.deny);
  t.sticky.dispatch('click');
  t.hero.dispatch('click', t.heroSpan);
  assert.equal(calls.length, 0);
});

// ---------- validade da escolha (S3) ----------
test('readChoice: escolha com mais de 12 meses, sem data ou com data inválida/futura conta como ausente', () => {
  const agora = Date.parse('2026-11-02T12:00:00Z');
  const s = (o) => memStorage({ init: { [STORAGE_KEY]: JSON.stringify(o) } });
  const iso = (ms) => new Date(ms).toISOString();
  assert.equal(readChoice(s({ v: 'granted', t: iso(agora - 1000) }), agora), 'granted');
  assert.equal(readChoice(s({ v: 'denied', t: iso(agora - CHOICE_MAX_AGE_MS + 60000) }), agora), 'denied');
  assert.equal(readChoice(s({ v: 'granted', t: iso(agora - CHOICE_MAX_AGE_MS - 60000) }), agora), null, 'expirada');
  assert.equal(readChoice(s({ v: 'denied', t: '2024-01-01T00:00:00Z' }), agora), null, 'expirada (denied também)');
  assert.equal(readChoice(s({ v: 'granted' }), agora), null, 'sem data');
  assert.equal(readChoice(s({ v: 'granted', t: 'x' }), agora), null, 'data inválida');
  assert.equal(readChoice(s({ v: 'granted', t: iso(agora + 7 * 86400000) }), agora), null, 'data no futuro');
});

test('escolha "granted" expirada: banner volta e nada carrega antes de novo aceite', () => {
  const t = setup({ stored: { v: 'granted', t: '2020-01-01T00:00:00.000Z' }, readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.flushIdle();
  assert.equal(t.banner.hasAttribute('hidden'), false);
  assert.equal(t.scripts.length, 0);
});

// ---------- regex única dos IDs (S5) ----------
test('IDs: build e navegador usam a mesma regex (GA4 e Clarity com 4 a 20 caracteres)', async () => {
  const { validarContent } = await import('../build.mjs');
  const pet = JSON.parse(readFileSync(new URL('../content/pet.json', import.meta.url), 'utf8'));
  const casos = [
    ['ga4', 'G-ABCD'], ['ga4', 'G-ABC'], ['ga4', 'G-' + 'A'.repeat(20)], ['ga4', 'G-' + 'A'.repeat(21)], ['ga4', 'G-abc123'],
    ['clarity', 'abcd'], ['clarity', 'abc'], ['clarity', 'a'.repeat(20)], ['clarity', 'a'.repeat(21)], ['clarity', 'ABCD1234'],
  ];
  for (const [k, id] of casos) {
    const c = JSON.parse(JSON.stringify(pet));
    c.analytics[k] = id;
    const buildAceita = !validarContent(c).erros.some((e) => e.includes(`analytics.${k}`));
    const cfg = parseConfig(JSON.stringify({ [k]: id }));
    const navAceita = cfg[k] === id;
    assert.equal(buildAceita, navAceita, `${k}=${id}: build ${buildAceita}, navegador ${navAceita}`);
    assert.equal(navAceita, (k === 'ga4' ? GA4_RE : CLARITY_RE).test(id));
  }
});

// ---------- foco (D1) ----------
test('foco: ao escolher no banner da 1ª visita, volta ao último elemento focado fora dele', () => {
  const t = setup({ readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.hero.focus();
  t.accept.focus();
  t.banner.dispatch('click', t.accept);
  assert.equal(t.doc.activeElement, t.hero);
  assert.deepEqual(t.doc.focusOpts.at(-1), { preventScroll: true });
});

test('foco: sem foco anterior (ou alvo não focável), vai para o <main tabindex=-1>', () => {
  const t = setup({ readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.deny.focus();
  t.banner.dispatch('click', t.deny);
  assert.equal(t.doc.activeElement, t.main);
  const u = setup({ readyState: 'complete' });
  initConsent(u.win, u.doc);
  u.sticky.focus();
  u.sticky.focusable = false; // ex.: a barra fixa ficou inert: o navegador tira o foco dela
  u.doc.activeElement = u.root.children[0];
  u.banner.dispatch('click', u.accept);
  assert.equal(u.doc.activeElement, u.main);
});

test('foco: reabrir pelo rodapé foca o 1º botão do banner; escolher devolve ao botão do rodapé', () => {
  const t = setup({ stored: { v: 'denied', t: AGORA }, readyState: 'complete' });
  initConsent(t.win, t.doc);
  t.hero.focus();
  t.openBtn.dispatch('click');
  assert.equal(t.banner.hasAttribute('hidden'), false);
  assert.equal(t.doc.activeElement, t.accept, 'primeiro botão do banner');
  t.banner.dispatch('click', t.deny);
  assert.equal(t.doc.activeElement, t.openBtn, 'volta ao botão do rodapé, não ao hero');
});
