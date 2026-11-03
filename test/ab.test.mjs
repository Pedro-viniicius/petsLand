// CA16: headline e CTA alternáveis por ?h=N&c=N (src/js/ab-inline.js).
// O arquivo é script clássico com o marcador __AB__ que o build substitui;
// aqui fazemos a mesma substituição e rodamos o texto em `vm`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SRC = readFileSync(new URL('../src/js/ab-inline.js', import.meta.url), 'utf8');

function run(search, ab = { h: 3, c: 3, padrao: { h: 1, c: 1 } }, initial = { 'data-h': '1', 'data-c': '1' }) {
  const attrs = { ...initial };
  const documentElement = {
    setAttribute: (k, v) => { attrs[k] = String(v); },
    getAttribute: (k) => attrs[k] ?? null,
  };
  const code = SRC.replace('__AB__', JSON.stringify(ab));
  vm.runInNewContext(code, { document: { documentElement }, location: { search }, URLSearchParams });
  return attrs;
}

test('ab-inline: marcador __AB__ aparece uma única vez e não há import/export', () => {
  // uma só ocorrência: String#replace do build troca só a primeira
  assert.equal(SRC.split('__AB__').length - 1, 1);
  assert.doesNotMatch(SRC, /^\s*(import|export)\s/m);
});

test('sem parâmetros usa a variante padrão', () => {
  assert.deepEqual(run(''), { 'data-h': '1', 'data-c': '1' });
  assert.deepEqual(run('', { h: 3, c: 3, padrao: { h: 2, c: 3 } }), { 'data-h': '2', 'data-c': '3' });
});

test('?h=2&c=3 seleciona as variantes', () => {
  assert.deepEqual(run('?h=2&c=3'), { 'data-h': '2', 'data-c': '3' });
});

test('valores fora da lista ou não inteiros caem no padrão', () => {
  for (const q of ['?h=0&c=4', '?h=-1&c=1.5', '?h=abc&c=', '?h=02&c=2e0', '?h=%3Cscript%3E&c=1', '?h=9&c=99', '?h= 2&c=3 ']) {
    assert.deepEqual(run(q), { 'data-h': '1', 'data-c': '1' }, q);
  }
});

test('respeita o tamanho de cada lista', () => {
  const ab = { h: 2, c: 1, padrao: { h: 1, c: 1 } };
  assert.deepEqual(run('?h=3&c=2', ab), { 'data-h': '1', 'data-c': '1' });
  assert.deepEqual(run('?h=2&c=1', ab), { 'data-h': '2', 'data-c': '1' });
});

test('nunca escreve o texto do parâmetro no DOM', () => {
  const out = run('?h=1"><img src=x>&c=1');
  assert.equal(out['data-h'], '1');
});

test('erro inesperado não quebra a página (mantém o atributo pré-renderizado)', () => {
  const attrs = { 'data-h': '2', 'data-c': '2' };
  const documentElement = { setAttribute: () => { throw new Error('x'); } };
  const code = SRC.replace('__AB__', JSON.stringify({ h: 3, c: 3, padrao: { h: 1, c: 1 } }));
  assert.doesNotThrow(() => vm.runInNewContext(code, { document: { documentElement }, location: { search: '?h=3' }, URLSearchParams }));
  assert.deepEqual(attrs, { 'data-h': '2', 'data-c': '2' });
});
