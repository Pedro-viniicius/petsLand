import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  contrastRatio, relativeLuminance, parseColor, parseTokens, resolveToken, checkContrastPairs,
  readPngSize, findForbiddenTerms, visibleText, parseAttrs, findTags, checkCtas, checkContrast,
  checkCss, checkDocument, checkAssetsAttrs, checkContent, checkPeso, checkOgPng, rodar, arquivosDePeso,
} from '../scripts/check.mjs';

const falhas = (r) => r.filter((x) => x.nivel === 'falha');

test('luminância e contraste WCAG', () => {
  assert.equal(relativeLuminance([255, 255, 255]), 1);
  assert.equal(relativeLuminance([0, 0, 0]), 0);
  assert.ok(Math.abs(contrastRatio('#000000', '#FFFFFF') - 21) < 1e-9);
  assert.ok(Math.abs(contrastRatio('#25D366', '#0B141A') - 9.38) < 0.02);
  assert.ok(Math.abs(contrastRatio('#FFFFFF', '#25D366') - 1.98) < 0.02);
  assert.ok(Math.abs(contrastRatio('#0B141A', '#FAFAF7') - 17.78) < 0.05);
  assert.ok(Number.isNaN(contrastRatio('xx', '#fff')));
});

test('parseColor aceita #rgb, #rrggbb e rgb()', () => {
  assert.deepEqual(parseColor('#fff'), [255, 255, 255]);
  assert.deepEqual(parseColor('#25D366'), [37, 211, 102]);
  assert.deepEqual(parseColor('rgb(11 20 26)'), [11, 20, 26]);
  assert.deepEqual(parseColor('rgb(11, 20, 26)'), [11, 20, 26]);
  assert.equal(parseColor('red'), null);
});

const CSS = `
/* comentário */
:root { --c-bg: #FAFAF7; --c-surface:#FFFFFF; --c-text: #0B141A; --c-text-muted:#4A5560;
  --c-accent: #25D366; --c-on-accent: var(--c-text); --c-border:#7F8A91; --c-focus: #0B141A; }
body { color: red; }
@media (prefers-reduced-motion: reduce) { * { transition: none } }
.x { padding-bottom: env(safe-area-inset-bottom); }
`;

test('parseTokens lê :root e resolve var()', () => {
  const t = parseTokens(CSS);
  assert.equal(t['--c-bg'], '#FAFAF7');
  assert.equal(resolveToken(t, 'on-accent'), '#0B141A');
  assert.equal(resolveToken(t, 'inexistente'), null);
  assert.equal(parseTokens('a{--x:1}')['--x'], undefined);
});

test('parseTokens aceita nomes sem prefixo c- da spec', () => {
  const t = parseTokens(':root{--bg:#fff;--text:#000}');
  assert.equal(resolveToken(t, 'bg'), '#fff');
});

test('pares de contraste passam com os tokens da spec e falham com cor ruim', () => {
  const pares = checkContrastPairs(parseTokens(CSS));
  assert.ok(pares.length >= 6);
  assert.ok(pares.every((p) => p.ok), JSON.stringify(pares.filter((p) => !p.ok)));
  const ruim = checkContrastPairs(parseTokens(':root{--c-bg:#fff;--c-surface:#fff;--c-text:#fff;--c-text-muted:#eee;--c-accent:#25D366;--c-on-accent:#fff;--c-focus:#fff}'));
  assert.ok(ruim.some((p) => !p.ok));
  const pares2 = checkContrastPairs(parseTokens(CSS));
  assert.ok(pares2.some((p) => p.par === 'border/bg' && p.ok && p.ratio >= 3));
  const bordaFraca = checkContrastPairs(parseTokens(CSS.replace('--c-border:#7F8A91', '--c-border:#DDE0DA')));
  assert.ok(bordaFraca.some((p) => p.par === 'border/bg' && !p.ok));
  const marca = ':root{--c-bg:#FFFFFF;--c-surface-2:#FFF4E8;--c-brand:#E85D10;--c-on-brand:#FFFFFF;--c-highlight:#FFD45C;--c-on-highlight:#2B1408}';
  const pm = checkContrastPairs(parseTokens(marca));
  for (const n of ['on-brand/brand', 'on-highlight/highlight', 'brand/surface-2', 'brand/bg']) assert.ok(pm.some((p) => p.par === n && p.ok), n);
  assert.ok(checkContrastPairs(parseTokens(marca.replace('--c-brand:#E85D10', '--c-brand:#F4A26B'))).some((p) => p.par === 'brand/surface-2' && !p.ok));
  assert.ok(checkContrastPairs(parseTokens(marca.replace('--c-on-highlight:#2B1408', '--c-on-highlight:#FFFFFF'))).some((p) => p.par === 'on-highlight/highlight' && !p.ok));
  const faltando = checkContrastPairs(parseTokens(':root{--c-bg:#fff}'));
  assert.ok(faltando.some((p) => p.faltando && !p.ok));
});

test('checkContrast usa o <style> inline do HTML por cima do CSS', () => {
  assert.equal(falhas(checkContrast(CSS, '')).length, 0);
  const html = '<style>:root{--c-on-accent:#ffffff;--c-accent:#25D366}</style>';
  const f = falhas(checkContrast(CSS, html));
  assert.ok(f.length >= 1);
  assert.ok(f.some((x) => x.ca === 'CA13'));
});

test('checkCss', () => {
  assert.equal(falhas(checkCss(CSS)).length, 0);
  assert.ok(falhas(checkCss('a{color:red}')).length >= 2);
  assert.ok(falhas(checkCss(CSS + '@import url("https://x.com/a.css");')).some((x) => x.ca === 'CA25'));
  assert.ok(falhas(checkCss(CSS + '@font-face{src:url(https://f.com/a.woff2)}')).some((x) => x.ca === 'CA25'));
});

function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

test('readPngSize lê o IHDR', () => {
  assert.deepEqual(readPngSize(png(1200, 630)), { width: 1200, height: 630 });
  assert.equal(readPngSize(Buffer.from('não sou png, mas tenho mais de vinte e quatro bytes')), null);
  assert.equal(readPngSize(Buffer.alloc(5)), null);
  const semIhdr = png(1, 1); semIhdr.write('XXXX', 12, 'ascii');
  assert.equal(readPngSize(semIhdr), null);
});

test('checkOgPng', () => {
  assert.equal(falhas(checkOgPng(png(1200, 630))).length, 0);
  assert.equal(falhas(checkOgPng(png(1200, 600))).length, 1);
  assert.equal(falhas(checkOgPng(null)).length, 1);
  const grande = Buffer.concat([png(1200, 630), Buffer.alloc(301 * 1024)]);
  assert.equal(falhas(checkOgPng(grande)).length, 1);
});

test('findForbiddenTerms ignora acento e caixa, respeita palavra inteira', () => {
  assert.deepEqual(findForbiddenTerms('Últimas VAGAS hoje!'), ['ultimas vagas']);
  assert.deepEqual(findForbiddenTerms('Só hoje, 100% seguro'), ['100% seguro', 'so hoje']);
  assert.deepEqual(findForbiddenTerms('Ainda restam poucas'), ['restam']);
  assert.deepEqual(findForbiddenTerms('as melhores ofertas pet'), ['melhores ofertas']);
  assert.deepEqual(findForbiddenTerms('Ofertas selecionadas, vagas ilimitadas'), []);
  assert.deepEqual(findForbiddenTerms('arrestam'), []);
});

test('parseAttrs, findTags e visibleText', () => {
  assert.deepEqual(parseAttrs('href="a&amp;b" data-cta=hero hidden'), { href: 'a&b', 'data-cta': 'hero', hidden: '' });
  const tags = findTags('<meta name="x" content="a > b"><meta property=y content=z>', 'meta');
  assert.equal(tags.length, 2);
  assert.equal(tags[0].attrs.content, 'a > b');
  assert.equal(visibleText('<p>Oi <b>mundo</b></p><script>x()</script><style>a{}</style><!-- c -->&amp;!'), 'Oi mundo &!');
});

const CONVITE = 'https://chat.whatsapp.com/ABC123';
const content = {
  convite: CONVITE, politicaPrivacidade: 'https://ex.com/privacidade', siteUrl: 'https://ex.com',
  ab: { headlines: ['H1', 'H2'], ctas: ['Entrar no grupo grátis', 'Receber ofertas no WhatsApp'] },
  provaSocial: null,
};
const cta = (loc, extra = '') => `<a data-cta="${loc}" href="${CONVITE}" ${extra}><span class="ab" data-c="1">Entrar no grupo grátis</span><span class="ab" data-c="2">Receber ofertas no WhatsApp</span><svg aria-hidden="true"><path d="M1 1"/></svg></a>`;

test('checkCtas: ok', () => {
  const html = `<main>${cta('hero')}${cta('final')}</main><div id="sticky">${cta('sticky')}</div>`;
  assert.equal(falhas(checkCtas(html, content)).length, 0);
});

test('checkCtas: href errado, 4 CTAs, texto fora da lista, target blank', () => {
  const ruim = cta('hero').replace(CONVITE, 'https://bit.ly/x');
  assert.ok(falhas(checkCtas(ruim + cta('final'), content)).some((x) => x.ca === 'CA3'));
  const quatro = cta('hero') + cta('sticky') + cta('final') + cta('final');
  assert.ok(falhas(checkCtas(quatro, content)).some((x) => x.ca === 'CA9'));
  const texto = cta('hero').replace('Entrar no grupo grátis', 'Compre já') + cta('final');
  assert.ok(falhas(checkCtas(texto, content)).some((x) => x.msg.includes('Compre já')));
  assert.ok(falhas(checkCtas(cta('hero', 'target="_blank"') + cta('final'), content)).length >= 1);
  assert.ok(falhas(checkCtas('<p>nada</p>', content)).length >= 1);
});

const DOC = `<!doctype html><html lang="pt-BR" data-h="1" data-c="1"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Grupo</title><meta name="description" content="d"><meta name="theme-color" content="#FAFAF7">
<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:type" content="website">
<meta property="og:url" content="https://ex.com/pet/"><meta property="og:image" content="https://ex.com/pet/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="../assets/styles.css">
<script>document.documentElement.dataset.h='1'</script></head>
<body><header>G</header><main><h1>Oi</h1>${cta('hero')}<img src="a.webp" alt="" width="64" height="64" loading="lazy">
<details><summary>Pergunta</summary>R</details></main>
<footer><a href="${CONVITE}">convite</a> <a href="https://ex.com/privacidade">Política</a></footer>
<script type="application/json" id="cfg">{}</script><script type="module" src="../assets/ui.js"></script></body></html>`;

test('checkDocument: documento válido', () => {
  const r = checkDocument(DOC, content);
  assert.equal(falhas(r).length, 0, JSON.stringify(falhas(r)));
});

test('checkDocument: detecta violações', () => {
  const casos = [
    [DOC.replace('lang="pt-BR"', 'lang="en"'), 'CA20'],
    [DOC.replace('<h1>Oi</h1>', '<h1>Oi</h1><h1>Dois</h1>'), 'CA20'],
    [DOC.replace('<main>', '<nav>x</nav><main>'), 'CA22'],
    [DOC.replace('<main>', '<main><form></form>'), 'CA22'],
    [DOC.replace(', viewport-fit=cover', ''), 'CA5'],
    [DOC.replace('<meta property="og:image" content="https://ex.com/pet/og.png">', ''), 'CA21'],
    [DOC.replace('https://ex.com/pet/og.png', 'http://ex.com/pet/og.png'), 'CA21'],
    [DOC.replace('<footer>', '<footer><a href="https://loja.com/x">x</a>'), 'CA25'],
    [DOC.replace('<head>', '<head><link rel="preconnect" href="https://www.googletagmanager.com">'), 'CA25'],
    [DOC.replace('<script type="application/json"', '<script src="https://cdn.x.com/a.js" defer></script><script type="application/json"'), 'CA25'],
    [DOC.replace(' alt=""', ''), 'CA20'],
  ];
  for (const [html, ca] of casos) {
    assert.ok(falhas(checkDocument(html, content)).some((x) => x.ca === ca), `esperava falha ${ca}`);
  }
});

test('checkDocument: og:image com placeholder só avisa', () => {
  const r = checkDocument(DOC.replace('https://ex.com/pet/og.png', '[SITE_URL]/pet/og.png'), content);
  assert.equal(falhas(r).length, 0);
  assert.ok(r.some((x) => x.nivel === 'aviso' && x.ca === 'CA21'));
});

test('checkAssetsAttrs', () => {
  assert.equal(falhas(checkAssetsAttrs(DOC)).length, 0);
  const ruim = (h) => falhas(checkAssetsAttrs(h, () => null));
  assert.ok(ruim(DOC.replace(' width="64"', '')).length);
  assert.ok(ruim(DOC.replace(' loading="lazy"', '')).length);
  // logo do cabeçalho: loading="eager" explícito, sem fetchpriority, é aceito; valor desconhecido não
  assert.equal(ruim(DOC.replace(' loading="lazy"', ' loading="eager"')).length, 0);
  assert.ok(ruim(DOC.replace(' loading="lazy"', ' loading="auto"')).length);
  assert.ok(ruim(DOC.replace('<script type="module" src="../assets/ui.js">', '<script src="../assets/ui.js">')).length);
  assert.ok(ruim(DOC.replace(' loading="lazy"', ' fetchpriority="high"').replace('a.webp', 'a.png')).length);
  const duas = DOC.replace('</details>', '</details><img src="b.webp" alt="" width="1" height="1" fetchpriority="high"><img src="c.webp" alt="" width="1" height="1" fetchpriority="high">');
  assert.ok(ruim(duas).length);
  const grande = DOC.replace(' loading="lazy"', ' fetchpriority="high"');
  assert.ok(falhas(checkAssetsAttrs(grande, () => 61 * 1024)).length);
  assert.equal(falhas(checkAssetsAttrs(grande, () => 20 * 1024)).length, 0);
  assert.ok(ruim(DOC.replace('</body>', '<script>x()</script></body>')).length);
});

test('checkContent: prova social, números, termos e logos', () => {
  assert.equal(falhas(checkContent(DOC, content)).length, 0);
  assert.ok(falhas(checkContent(DOC.replace('Oi', 'Mais de 10 mil membros'), content)).some((x) => x.ca === 'CA6'));
  assert.ok(falhas(checkContent(DOC.replace('Oi', '2.500 pessoas já entraram'), content)).some((x) => x.ca === 'CA6'));
  assert.ok(falhas(checkContent(DOC.replace('Oi', 'Veja os depoimentos'), content)).some((x) => x.ca === 'CA6'));
  assert.ok(falhas(checkContent(DOC.replace('<main>', '<main><blockquote>x</blockquote>'), content)).some((x) => x.ca === 'CA6'));
  assert.ok(falhas(checkContent(DOC.replace('Oi', 'Só hoje!'), content)).some((x) => x.ca === 'CA23'));
  assert.ok(falhas(checkContent(DOC, { ...content, subtitulo: 'Restam 3 vagas' })).some((x) => x.ca === 'CA23'));
  assert.ok(falhas(checkContent(DOC.replace('alt=""', 'alt="Logo Shopee"'), content)).some((x) => x.ca === 'CA24'));
  assert.ok(falhas(checkContent(DOC.replace('<main>', '<main><svg aria-label="Amazon"></svg>'), content)).some((x) => x.ca === 'CA24'));
  assert.ok(falhas(checkContent(DOC, { ...content, provaSocial: { itens: [] } })).some((x) => x.ca === 'CA6'));
});

test('checkContent: placeholders [..] não contam como número', () => {
  assert.equal(falhas(checkContent(DOC.replace('Oi', 'Achado: [3 mil produtos]'), content)).length, 0);
});

test('checkPeso', () => {
  assert.equal(falhas(checkPeso([{ nome: 'a', bytes: 150 * 1024, gzip: 50 }])).length, 0);
  assert.equal(falhas(checkPeso([{ nome: 'a', bytes: 150 * 1024 }, { nome: 'b', bytes: 51 * 1024 }])).length, 1);
});

test('R1: CA18 percorre dist/assets recursivamente (js em subpasta conta; OFL*.txt e img/ não)', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'peso-'));
  try {
    for (const [rel, kb] of [['styles.css', 10], ['js/ui.js', 4], ['js/sub/extra.js', 190], ['fonts/f.woff2', 20], ['fonts/OFL.txt', 50], ['fonts/OFL-nunito.txt', 50], ['img/foto.webp', 300]]) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.writeFileSync(path.join(dir, rel), 'x'.repeat(kb * 1024));
    }
    const lista = arquivosDePeso(dir);
    assert.deepEqual(lista.map((a) => a.nome).sort(), ['assets/fonts/f.woff2', 'assets/js/sub/extra.js', 'assets/js/ui.js', 'assets/styles.css']);
    assert.equal(lista.find((a) => a.nome.endsWith('f.woff2')).gzip, 20 * 1024, 'woff2 não recomprime');
    assert.equal(falhas(checkPeso(lista)).length, 1, '224 KB > 200 KB por causa do .js na subpasta');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('rodar falha com mensagem clara quando faltam entradas', () => {
  const r = rodar('pet', '/tmp/diretorio-que-nao-existe-xyz');
  assert.ok(r.ausentes.length >= 3);
  assert.deepEqual(r.resultados, []);
});

test('resolveToken calcula color-mix(in srgb) com var()', () => {
  const t = parseTokens(':root{--c-accent:#25D366;--c-accent-hover:color-mix(in srgb, var(--c-accent) 88%, #000);--c-x:color-mix(in srgb, #fff 50%, #000)}');
  assert.deepEqual(parseColor(resolveToken(t, 'accent-hover')), [33, 186, 90]);
  assert.deepEqual(parseColor(resolveToken(t, 'x')), [128, 128, 128]);
  const par = checkContrastPairs(parseTokens(':root{--c-accent:#25D366;--c-on-accent:#0B141A;--c-accent-hover:color-mix(in srgb, var(--c-accent) 88%, #000)}'), [{ fg: 'on-accent', bg: 'accent-hover', min: 4.5, ca: ['CA4'], obrigatorio: true }]);
  assert.ok(par[0].ok && par[0].ratio > 7 && par[0].ratio < 7.5);
});
