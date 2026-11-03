// CA11: barra fixa surge quando o CTA do hero sai por cima e some quando o
// CTA final aparece (src/js/ui.js). DOM e IntersectionObserver feitos à mão.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stickyVisible, applySticky, entryState, initSticky } from '../src/js/ui.js';

function el(attrs = {}) {
  const a = { ...attrs };
  return {
    attrs: a,
    getAttribute: (k) => (k in a ? a[k] : null),
    setAttribute: (k, v) => { a[k] = String(v); },
    removeAttribute: (k) => { delete a[k]; },
    hasAttribute: (k) => k in a,
  };
}

test('stickyVisible: tabela de estados', () => {
  const base = { heroVisible: false, heroAbove: true, finalVisible: false, finalAbove: false, consentOpen: false };
  assert.equal(stickyVisible(base), true, 'hero saiu por cima, final ainda abaixo');
  assert.equal(stickyVisible({ ...base, heroVisible: true, heroAbove: false }), false, 'hero na tela');
  assert.equal(stickyVisible({ ...base, heroAbove: false }), false, 'hero abaixo do viewport (nunca passou)');
  assert.equal(stickyVisible({ ...base, finalVisible: true }), false, 'final na tela');
  assert.equal(stickyVisible({ ...base, finalAbove: true }), false, 'final já passou (rodapé)');
  assert.equal(stickyVisible({ ...base, consentOpen: true }), false, 'banner aberto: um elemento inferior por vez');
  assert.equal(stickyVisible({}), false);
  assert.equal(stickyVisible(undefined), false);
});

test('entryState: visível, acima e abaixo', () => {
  assert.deepEqual(entryState({ isIntersecting: true, boundingClientRect: { top: -10 } }), { visible: true, above: false });
  assert.deepEqual(entryState({ isIntersecting: false, boundingClientRect: { top: -80 } }), { visible: false, above: true });
  assert.deepEqual(entryState({ isIntersecting: false, boundingClientRect: { top: 900 } }), { visible: false, above: false });
});

test('applySticky: mostra tirando inert/aria-hidden e esconde recolocando', () => {
  const bar = el({ inert: '', 'aria-hidden': 'true' });
  applySticky(bar, true);
  assert.equal(bar.hasAttribute('inert'), false);
  assert.equal(bar.hasAttribute('aria-hidden'), false);
  applySticky(bar, false);
  assert.equal(bar.getAttribute('inert'), '');
  assert.equal(bar.getAttribute('aria-hidden'), 'true');
});

function setup({ io = true, mo = true, bannerHidden = true } = {}) {
  const bar = el({ inert: '', 'aria-hidden': 'true' });
  const hero = el({ 'data-cta': 'hero' });
  const fin = el({ 'data-cta': 'final' });
  const banner = el(bannerHidden ? { hidden: '' } : {});
  const doc = {
    getElementById: (id) => ({ sticky: bar, consent: banner })[id] || null,
    querySelector: (s) => (s.includes('hero') ? hero : s.includes('final') ? fin : null),
  };
  const ctx = { observed: [], cb: null, moCb: null };
  const win = {};
  if (io) {
    win.IntersectionObserver = class {
      constructor(cb) { ctx.cb = cb; }
      observe(t) { ctx.observed.push(t); }
    };
  }
  if (mo) {
    win.MutationObserver = class {
      constructor(cb) { ctx.moCb = cb; }
      observe() {}
    };
  }
  return { bar, hero, fin, banner, doc, win, ctx };
}

const shown = (bar) => !bar.hasAttribute('inert') && !bar.hasAttribute('aria-hidden');

test('initSticky: rolagem por 3 posições (topo, meio, fim)', () => {
  const { bar, hero, fin, doc, win, ctx } = setup();
  initSticky(win, doc);
  assert.deepEqual(ctx.observed, [hero, fin]);
  assert.equal(shown(bar), false, 'carga: oculta');

  // topo: hero visível, final abaixo
  ctx.cb([
    { target: hero, isIntersecting: true, boundingClientRect: { top: 300 } },
    { target: fin, isIntersecting: false, boundingClientRect: { top: 2400 } },
  ]);
  assert.equal(shown(bar), false);

  // meio: hero saiu por cima
  ctx.cb([{ target: hero, isIntersecting: false, boundingClientRect: { top: -60 } }]);
  assert.equal(shown(bar), true);

  // fim: CTA final aparece e depois passa por cima (rodapé)
  ctx.cb([{ target: fin, isIntersecting: true, boundingClientRect: { top: 400 } }]);
  assert.equal(shown(bar), false);
  ctx.cb([{ target: fin, isIntersecting: false, boundingClientRect: { top: -100 } }]);
  assert.equal(shown(bar), false, 'não volta sobre o rodapé');

  // volta para o meio
  ctx.cb([{ target: fin, isIntersecting: false, boundingClientRect: { top: 900 } }]);
  assert.equal(shown(bar), true);
});

test('initSticky: banner aberto suprime a barra e fechar devolve', () => {
  const { bar, hero, banner, doc, win, ctx } = setup();
  initSticky(win, doc);
  ctx.cb([{ target: hero, isIntersecting: false, boundingClientRect: { top: -60 } }]);
  assert.equal(shown(bar), true);
  banner.removeAttribute('hidden');
  ctx.moCb([]);
  assert.equal(shown(bar), false);
  banner.setAttribute('hidden', '');
  ctx.moCb([]);
  assert.equal(shown(bar), true);
});

test('initSticky: sem IntersectionObserver fica oculta e não lança', () => {
  const { bar, doc, win } = setup({ io: false });
  assert.equal(initSticky(win, doc), null);
  assert.equal(shown(bar), false);
});

test('initSticky: sem #sticky não faz nada', () => {
  const doc = { getElementById: () => null, querySelector: () => null };
  assert.equal(initSticky({}, doc), null);
});
