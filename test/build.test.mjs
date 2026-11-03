import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { render, escapeHtml, validarContent, construir, jsonSeguro, montarCsp, CONVITE_RE, gerarOgHtml, hashOgHtml } from '../build.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..');
const TEMPLATE_MIN = path.join(AQUI, 'fixtures', 'template-min.html');
const TEMPLATE_REAL = path.join(RAIZ, 'src', 'template.html');
const PET = JSON.parse(fs.readFileSync(path.join(RAIZ, 'content', 'pet.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
// Os projetos de teste não têm src/img/: o preview do pet.json (hoje o próprio logo) volta a placeholder.
const PREVIEW_PLACEHOLDER = '[IMAGEM: thumb da prévia, 1:1, 64x64]';
const semImagemReal = (c) => { c.imagens = c.imagens.map((im) => (im.src.startsWith('[IMAGEM:') ? im : { ...im, src: PREVIEW_PLACEHOLDER })); return c; };
const semLogo = (o) => { const c = clone(o); delete c.logo; return semImagemReal(c); };

// Content "pronto": sem placeholder, para testar o caminho de release.
function contentReal() {
  const c = clone(PET);
  c.siteUrl = 'https://exemplo.com.br';
  c.nomeGrupo = 'Grupo Teste';
  c.convite = 'https://chat.whatsapp.com/AbC123';
  c.politicaPrivacidade = 'https://exemplo.com.br/privacidade';
  c.meta.title = 'Grupo Teste | Achadinhos pet';
  c.exemploOferta.texto = 'Achadinho de exemplo';
  c.confianca.pontos[1] = 'Você compra direto nas lojas, não com a gente.';
  c.analytics = { ga4: 'G-ABC123XYZ', clarity: 'abc123xyz' };
  c.rodape.avisoAfiliados = 'Alguns links são de afiliados.';
  delete c.logo; // os projetos de teste não têm src/img/; o logo tem testes próprios
  return semImagemReal(c);
}

function montarProjeto(contents, { template = TEMPLATE_MIN, comTemplate = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-test-'));
  fs.mkdirSync(path.join(dir, 'content'));
  for (const [nome, c] of Object.entries(contents)) fs.writeFileSync(path.join(dir, 'content', `${nome}.json`), JSON.stringify(c));
  fs.mkdirSync(path.join(dir, 'src', 'js'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'fonts'), { recursive: true });
  if (comTemplate) fs.copyFileSync(template, path.join(dir, 'src', 'template.html'));
  fs.writeFileSync(path.join(dir, 'src', 'styles.css'), 'body{margin:0}');
  fs.writeFileSync(path.join(dir, 'src', 'js', 'ab-inline.js'), '(function(a){window.x=a})(__AB__);');
  fs.writeFileSync(path.join(dir, 'src', 'js', 'ui.js'), 'export {};');
  for (const f of ['fredoka-latin-wght-normal.woff2', 'nunito-latin-wght-normal.woff2', 'OFL-fredoka.txt', 'OFL-nunito.txt']) fs.writeFileSync(path.join(dir, 'src', 'fonts', f), 'fonte');
  return dir;
}

// Simula `node scripts/og.mjs <nicho>`: og.png + og.png.sha256 do og.html atual.
function gerarOgFalso(dir, nicho = 'pet') {
  const og = fs.readFileSync(path.join(dir, 'dist', nicho, 'og.html'), 'utf8');
  fs.writeFileSync(path.join(dir, 'dist', nicho, 'og.png'), 'png');
  fs.writeFileSync(path.join(dir, 'dist', nicho, 'og.png.sha256'), `${hashOgHtml(og)}\n`);
}

// ---- engine ----------------------------------------------------------------------------
test('engine: variável escapada (XSS) e aspas', () => {
  const out = render('<p title="{{t}}">{{a.b}}</p>', { t: 'x" onload="y', a: { b: '<script>alert(1)</script>&\'' } });
  assert.equal(out, '<p title="x&quot; onload=&quot;y">&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;</p>');
  assert.equal(escapeHtml('<>"\'&'), '&lt;&gt;&quot;&#39;&amp;');
});

test('engine: each com this, this.campo, @index e @index1; if/else; aninhamento', () => {
  const ctx = { l: ['a', 'b'], o: [{ n: 'x', s: ['1', '2'] }], v: '', cheio: 'sim' };
  assert.equal(render('{{#each l}}{{@index}}={{@index1}}:{{this}};{{/each}}', ctx), '0=1:a;1=2:b;');
  assert.equal(render('{{#each o}}{{this.n}}[{{#each this.s}}{{this}}{{/each}}]{{/each}}', ctx), 'x[12]');
  assert.equal(render('{{#if v}}A{{else}}B{{/if}}{{#if cheio}}C{{/if}}', ctx), 'BC');
  assert.equal(render('{{#if nulo}}A{{/if}}', { nulo: null }), '');
  assert.equal(render('{{#if x.y}}A{{else}}B{{/if}}', { x: {} }), 'B');
});

test('engine: erros claros (variável ausente, bloco aberto, fora do each)', () => {
  assert.throws(() => render('{{naoexiste}}', {}), /variável não encontrada: \{\{naoexiste\}\}/);
  assert.throws(() => render('a\n{{#each l}}x', { l: [] }), /template:2: bloco \{\{#each l\}\} não foi fechado/);
  assert.throws(() => render('{{/if}}', {}), /sem abertura/);
  assert.throws(() => render('{{#if tipo}}x{{/if}}', {}), /não encontrada/);
  assert.throws(() => render('{{this}}', {}), /fora de \{\{#each\}\}/);
  assert.throws(() => render('{{o}}', { o: { a: 1 } }), /não é texto/);
  assert.throws(() => render('{{x}}', { x: null }), /não é texto/);
});

test('engine: saída sem escape só para a lista fechada de variáveis do build', () => {
  assert.equal(render("{{csp}}|{{{csp}}}", { csp: "default-src 'self'" }), "default-src 'self'|default-src 'self'");
  assert.throws(() => render('{{{nomeGrupo}}}', { nomeGrupo: '<b>' }), /não é permitido/);
  // variável do content com HTML nunca sai crua, mesmo chamada com {{ }}
  assert.equal(render('{{nomeGrupo}}', { nomeGrupo: '<b>' }), '&lt;b&gt;');
});

test('jsonSeguro nunca fecha a tag nem deixa < > & crus', () => {
  const s = jsonSeguro({ a: '</script><b>&\u2028' });
  assert.ok(!/[<>&\u2028]/.test(s));
  assert.deepEqual(JSON.parse(s), { a: '</script><b>&\u2028' });
});

// ---- validação ---------------------------------------------------------------------------
test('content/pet.json real é válido (só avisos de placeholder) e tem o formato do plano', () => {
  const v = validarContent(PET, { nomeArquivo: 'pet' });
  assert.deepEqual(v.erros, []);
  assert.ok(v.avisos.length > 0);
  assert.equal(PET.provaSocial, null);
  assert.equal(PET.ab.headlines.length, 3);
  assert.equal(PET.ab.ctas.length, 3);
  assert.equal(PET.beneficios.length, 3);
  assert.equal(PET.passos.length, 3);
});

test('CA10: convite só aceita chat.whatsapp.com/CODIGO; placeholder só avisa', () => {
  for (const ruim of ['http://chat.whatsapp.com/Abc', 'https://bit.ly/x', 'https://chat.whatsapp.com/Abc?x=1', 'https://chat.whatsapp.com/', 'javascript:alert(1)', 'https://chat.whatsapp.com.evil.com/Abc']) {
    const c = clone(PET); c.convite = ruim;
    assert.match(validarContent(c).erros.join('\n'), /convite/, ruim);
  }
  assert.ok(CONVITE_RE.test('https://chat.whatsapp.com/AbC123'));
  const c = clone(PET);
  assert.deepEqual(validarContent(c).erros, []);
  c.convite = 'https://chat.whatsapp.com/AbC123';
  assert.ok(!validarContent(c).avisos.some((a) => a.includes('convite')));
});

test('validação: IDs de analytics, ícone, A/B, prova social, cor, https', () => {
  const casos = [
    [(c) => { c.analytics.ga4 = 'UA-1'; }, /analytics\.ga4/],
    [(c) => { c.analytics.clarity = 'ABC'; }, /analytics\.clarity/],
    [(c) => { c.beneficios[0].icone = 'cachorro'; }, /icone/],
    [(c) => { c.ab.headlines.push('a', 'b'); }, /ab\.headlines/],
    [(c) => { c.ab.padrao.h = 4; }, /padrao\.h/],
    [(c) => { c.provaSocial = { texto: '10 mil membros' }; }, /provaSocial/],
    [(c) => { c.corDestaque.accent = 'verde'; }, /corDestaque/],
    [(c) => { c.politicaPrivacidade = 'http://x.com'; }, /politicaPrivacidade/],
    [(c) => { c.siteUrl = 'ftp://x.com'; }, /siteUrl/],
    [(c) => { c.beneficios.pop(); }, /beneficios/],
    [(c) => { delete c.ui.banner; }, /ui\.banner/],
    [(c) => { c.nicho = 'Pet!'; }, /nicho/],
  ];
  for (const [mut, re] of casos) {
    const c = clone(PET); mut(c);
    assert.match(validarContent(c, { nomeArquivo: 'pet' }).erros.join('\n'), re);
  }
  const ok = clone(PET); ok.provaSocial = { fonte: 'Painel do WhatsApp, 02/11/2026' };
  assert.deepEqual(validarContent(ok).erros, []);
});

test('--release: placeholder vira erro; slot [IMAGEM:] e exemplo desligado não bloqueiam', () => {
  const p = clone(PET); p.convite = '[https://chat.whatsapp.com/CODIGO]'; p.siteUrl = '[SITE_URL]';
  const v = validarContent(p, { release: true });
  assert.ok(v.erros.some((e) => e.includes('convite')));
  assert.ok(v.erros.some((e) => e.includes('siteUrl')));
  assert.ok(!v.erros.some((e) => e.includes('imagens')));
  const c = contentReal();
  assert.deepEqual(validarContent(c, { release: true }).erros, []);
  const d = contentReal(); d.exemploOferta = { ativo: false, texto: '[X]' };
  assert.deepEqual(validarContent(d, { release: true }).erros, []);
  assert.equal(validarContent(c, { release: true }).pendencias.length, 2);
});

// ---- build ---------------------------------------------------------------------------------
test('build: gera index, favicon, og.html e assets; todas as variantes A/B e CTA com o convite', () => {
  const dir = montarProjeto({ pet: contentReal() });
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  gerarOgFalso(dir);
  const r = construir({ raiz: dir, templatePath: TEMPLATE_MIN, release: true });
  assert.deepEqual(r.erros, []);
  assert.ok(r.ok);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  for (const h of PET.ab.headlines) assert.ok(html.includes(escapeHtml(h)), h);          // CA16
  for (const t of PET.ab.ctas) assert.ok(html.includes(escapeHtml(t)), t);
  assert.match(html, /data-h="1" data-c="1"/);
  assert.match(html, /<span class="ab" data-h="3">/);
  assert.match(html, /<a data-cta="hero" href="https:\/\/chat\.whatsapp\.com\/AbC123">/);   // CA3/CA10
  assert.match(html, /og:image" content="https:\/\/exemplo\.com\.br\/pet\/og\.png"/);       // CA21
  assert.match(html, /rel="preload" href="\.\.\/assets\/fonts\/fredoka-latin-wght-normal\.woff2" as="font"/);
  assert.equal((html.match(/rel="preload"[^>]*as="font"/g) || []).length, 1, 'preload só da Fredoka (h1/LCP)');
  assert.match(html, /<style>:root\{--c-accent:#C2410C;--c-on-accent:#FFFFFF\}<\/style>/);
  assert.ok(!html.includes('{{'));
  assert.ok(!html.includes('id="prova"'));                                                  // CA6: sem prova social
  assert.match(html, /\[relogio\].*\[outro\].*\[outro\]/s);
  assert.deepEqual(JSON.parse(html.match(/id="cfg">([^<]*)</)[1]), { ga4: 'G-ABC123XYZ', clarity: 'abc123xyz', niche: 'pet' });
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'pet', 'favicon.svg')));
  assert.match(fs.readFileSync(path.join(dir, 'dist', 'pet', 'og.html'), 'utf8'), /Grupo Teste/);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'assets', 'styles.css')));
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'assets', 'js', 'ui.js')));
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'assets', 'js', 'ab-inline.js')));
  for (const f of ['fredoka-latin-wght-normal.woff2', 'nunito-latin-wght-normal.woff2', 'OFL-fredoka.txt', 'OFL-nunito.txt']) {
    assert.ok(fs.existsSync(path.join(dir, 'dist', 'assets', 'fonts', f)), f);
  }
});

test('build: hash da CSP bate com o script e o style inline; domínios de analytics só se houver id', () => {
  const dir = montarProjeto({ pet: contentReal() });
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1].replace(/&#39;/g, "'");
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const h = (t) => `'sha256-${crypto.createHash('sha256').update(t, 'utf8').digest('base64')}'`;
  assert.ok(csp.includes(h(script)));
  assert.ok(csp.includes(h(style)));
  assert.match(csp, /script-src 'self' 'sha256-[^ ]+ https:\/\/www\.googletagmanager\.com https:\/\/\*\.clarity\.ms/);
  assert.match(csp, /base-uri 'none'; form-action 'none'/);
  assert.ok(!/frame|unsafe/.test(csp));
  // sem analytics
  const sem = montarCsp({ hashScript: "'sha256-a'", hashStyle: "'sha256-b'", ga4: '', clarity: '' });
  assert.ok(!/google|clarity|bing/.test(sem));
});

test('build: placeholders de analytics não vazam para o cfg nem para a CSP', () => {
  const dir = montarProjeto({ pet: semLogo(PET) });
  const r = construir({ raiz: dir, templatePath: TEMPLATE_MIN });
  assert.ok(r.ok);
  assert.ok(r.avisos.length > 0);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.deepEqual(JSON.parse(html.match(/id="cfg">([^<]*)</)[1]), { ga4: '', clarity: '', niche: 'pet' });
  assert.ok(!/googletagmanager|clarity\.ms/.test(html));
});

test('build: valores do content são escapados no HTML (segurança)', () => {
  const c = contentReal();
  c.nomeGrupo = '<img src=x onerror=alert(1)>';
  c.meta.title = '"></title><script>alert(1)</script>';
  c.ab.headlines[0] = '<b>oi</b>';
  c.beneficios[0].titulo = '</p><script>x</script>';
  const dir = montarProjeto({ pet: c });
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.ok(!html.includes('<script>alert(1)'));
  assert.ok(!html.includes('<b>oi</b>'));
  assert.ok(!html.includes('</p><script>x'));
  assert.ok(html.includes('&lt;b&gt;oi&lt;/b&gt;'));
  const og = fs.readFileSync(path.join(dir, 'dist', 'pet', 'og.html'), 'utf8');
  assert.ok(!og.includes('<img src=x'));
});

test('build: erro claro sem src/template.html (nada é gravado)', () => {
  const dir = montarProjeto({ pet: contentReal() }, { comTemplate: false });
  const r = construir({ raiz: dir });
  assert.equal(r.ok, false);
  assert.match(r.erros[0], /template não encontrado: src\/template\.html/);
  assert.ok(!fs.existsSync(path.join(dir, 'dist')));
});

test('build: variável inexistente no template falha com arquivo e linha', () => {
  const dir = montarProjeto({ pet: contentReal() });
  const tpl = path.join(dir, 'ruim.html');
  fs.writeFileSync(tpl, '<p>\n{{campoQueNaoExiste}}</p>');
  const r = construir({ raiz: dir, templatePath: tpl });
  assert.equal(r.ok, false);
  assert.match(r.erros.join('\n'), /ruim\.html:2: variável não encontrada/);
});

test('build --release falha com placeholder e convite inválido; sem --release só avisa', () => {
  // O pet.json já tem convite e siteUrl reais: os placeholders vêm daqui, para o teste não depender do estado do content.
  const comPlaceholder = semLogo(PET);
  comPlaceholder.convite = '[https://chat.whatsapp.com/CODIGO]';
  comPlaceholder.siteUrl = '[SITE_URL]';
  const dir = montarProjeto({ pet: comPlaceholder });
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  const r = construir({ raiz: dir, templatePath: TEMPLATE_MIN, release: true });
  assert.equal(r.ok, false);
  assert.ok(r.erros.length >= 5);
  for (const k of ['convite', 'siteUrl']) assert.ok(r.erros.some((e) => e.includes(`placeholder pendente em ${k}`)), k);
  const c = contentReal(); c.convite = 'https://bit.ly/abc';
  const dir2 = montarProjeto({ pet: c });
  assert.match(construir({ raiz: dir2, templatePath: TEMPLATE_MIN }).erros.join('\n'), /convite/);
});

test('build: multi-nicho e nicho único; nicho diferente do arquivo é erro', () => {
  const gato = contentReal(); gato.nicho = 'gato'; gato.corDestaque.accent = '#112233';
  const dir = montarProjeto({ pet: contentReal(), gato });
  const r = construir({ raiz: dir, templatePath: TEMPLATE_MIN });
  assert.deepEqual(r.nichos, ['gato', 'pet']);
  assert.match(fs.readFileSync(path.join(dir, 'dist', 'gato', 'index.html'), 'utf8'), /--c-accent:#112233/);
  assert.match(fs.readFileSync(path.join(dir, 'dist', 'gato', 'favicon.svg'), 'utf8'), /#112233/);
  fs.rmSync(path.join(dir, 'dist'), { recursive: true });
  assert.deepEqual(construir({ raiz: dir, templatePath: TEMPLATE_MIN, nicho: 'gato' }).nichos, ['gato']);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'pet')));
  assert.equal(construir({ raiz: dir, templatePath: TEMPLATE_MIN, nicho: 'nao-existe' }).ok, false);
  const errado = contentReal(); errado.nicho = 'outro';
  assert.match(construir({ raiz: montarProjeto({ pet: errado }), templatePath: TEMPLATE_MIN }).erros.join(), /difere do nome do arquivo/);
});

test('build: preserva og.png/apple-touch-icon.png e sem fonte omite o preload com aviso', () => {
  const dir = montarProjeto({ pet: contentReal() });
  construir({ raiz: dir, templatePath: TEMPLATE_MIN });
  fs.writeFileSync(path.join(dir, 'dist', 'pet', 'og.png'), 'png');
  fs.rmSync(path.join(dir, 'src', 'fonts', 'fredoka-latin-wght-normal.woff2'));
  const r = construir({ raiz: dir, templatePath: TEMPLATE_MIN });
  assert.ok(r.ok);
  assert.ok(r.avisos.some((a) => a.includes('fonte')));
  assert.equal(fs.readFileSync(path.join(dir, 'dist', 'pet', 'og.png'), 'utf8'), 'png');
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.ok(!html.includes('rel="preload"'));
});

test('build: imagem real é copiada e validada; slot [IMAGEM:] não renderiza', () => {
  const c = contentReal();
  c.imagens[1] = { slot: 'preview', src: 'thumb.webp', alt: '', width: 64, height: 64 };
  const dir = montarProjeto({ pet: c });
  assert.match(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).erros.join(), /thumb\.webp não existe/);
  fs.mkdirSync(path.join(dir, 'src', 'img'));
  fs.writeFileSync(path.join(dir, 'src', 'img', 'thumb.webp'), 'x');
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'assets', 'img', 'thumb.webp')));
  c.imagens[1].src = '../segredo.txt';
  fs.writeFileSync(path.join(dir, 'content', 'pet.json'), JSON.stringify(c));
  assert.match(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).erros.join(), /nome de arquivo inválido/);
});

test('build real: o template e o content do projeto casam (quando os dois existem)', { skip: !fs.existsSync(path.join(RAIZ, 'src', 'template.html')) }, () => {
  const saida = fs.mkdtempSync(path.join(os.tmpdir(), 'build-real-'));
  const r = construir({ raiz: RAIZ, saida });
  assert.deepEqual(r.erros, []);
  const html = fs.readFileSync(path.join(saida, 'pet', 'index.html'), 'utf8');
  assert.equal((html.match(/<h1[\s>]/g) || []).length, 1);
  const ctas = [...html.matchAll(/<a[^>]*data-cta="(hero|sticky|final)"[^>]*href="([^"]*)"/g)];
  assert.ok(ctas.length >= 1 && ctas.length <= 3);
  assert.ok(ctas.every((m) => m[2] === PET.convite));
});

// ---- rodada 1: correções ---------------------------------------------------------------------
test('R2: siteUrl com barra final gera canonical, og:url e og:image sem barra dupla (template real)', () => {
  const c = contentReal(); c.siteUrl = 'https://exemplo.com.br/';
  const dir = montarProjeto({ pet: c }, { template: TEMPLATE_REAL });
  const r = construir({ raiz: dir });
  assert.deepEqual(r.erros, []);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/exemplo\.com\.br\/pet\/">/);
  assert.match(html, /property="og:url" content="https:\/\/exemplo\.com\.br\/pet\/"/);
  assert.match(html, /property="og:image" content="https:\/\/exemplo\.com\.br\/pet\/og\.png"/);
  assert.match(html, /name="twitter:image" content="https:\/\/exemplo\.com\.br\/pet\/og\.png"/);
  assert.ok(!html.includes('br//pet'));
});

test('R3: build de um nicho só não apaga imagens de outro; build de todos recria img/', () => {
  const pet = contentReal(); pet.imagens[1] = { slot: 'preview', src: 'pet.webp', alt: '', width: 64, height: 64 };
  const gato = contentReal(); gato.nicho = 'gato'; gato.imagens[1] = { slot: 'preview', src: 'gato.webp', alt: '', width: 64, height: 64 };
  const dir = montarProjeto({ pet, gato });
  fs.mkdirSync(path.join(dir, 'src', 'img'));
  for (const f of ['pet.webp', 'gato.webp']) fs.writeFileSync(path.join(dir, 'src', 'img', f), f);
  const img = (f) => fs.existsSync(path.join(dir, 'dist', 'assets', 'img', f));
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  assert.ok(img('pet.webp') && img('gato.webp'));
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN, nicho: 'pet' }).ok);
  assert.ok(img('gato.webp'), 'build só do pet apagou a imagem do gato');
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'assets', 'js', 'ui.js')));
  // imagem órfã some no build de todos
  fs.writeFileSync(path.join(dir, 'dist', 'assets', 'img', 'velha.webp'), 'x');
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  assert.ok(!img('velha.webp') && img('pet.webp') && img('gato.webp'));
});

test('R4: thumb da prévia renderiza <img> com width/height/lazy/alt; sem imagem, caixa neutra sem texto', () => {
  const c = contentReal();
  c.imagens[1] = { slot: 'preview', src: 'thumb.webp', alt: '', width: 64, height: 64 };
  const dir = montarProjeto({ pet: c }, { template: TEMPLATE_REAL });
  fs.mkdirSync(path.join(dir, 'src', 'img'));
  fs.writeFileSync(path.join(dir, 'src', 'img', 'thumb.webp'), 'x');
  assert.deepEqual(construir({ raiz: dir }).erros, []);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.match(html, /<img class="bubble__thumb" src="\.\.\/assets\/img\/thumb\.webp" alt="" width="64" height="64" loading="lazy" decoding="async">/);
  const sem = montarProjeto({ pet: contentReal() }, { template: TEMPLATE_REAL });
  assert.deepEqual(construir({ raiz: sem }).erros, []);
  const h2 = fs.readFileSync(path.join(sem, 'dist', 'pet', 'index.html'), 'utf8');
  assert.ok(!/<img[^>]*bubble__thumb/.test(h2));
  assert.match(h2, /<span class="bubble__thumb" aria-hidden="true"><\/span>/);
  assert.ok(!h2.includes('[IMAGEM'), 'texto do placeholder não aparece');
  // D3/R9: rótulo vem do content; copyright = © ano nomeGrupo
  assert.ok(h2.includes(`<span>${escapeHtml(PET.ui.previaBadge)}</span>`));
  assert.ok(h2.includes(`© ${new Date().getFullYear()} Grupo Teste`));
});

test('R5: --release exige og.png gerado a partir do og.html atual', () => {
  const c = contentReal();
  const dir = montarProjeto({ pet: c });
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok);
  let r = construir({ raiz: dir, templatePath: TEMPLATE_MIN, release: true });
  assert.equal(r.ok, false);
  assert.match(r.erros.join('\n'), /og\.png ausente/);
  fs.writeFileSync(path.join(dir, 'dist', 'pet', 'og.png'), 'png');
  r = construir({ raiz: dir, templatePath: TEMPLATE_MIN, release: true });
  assert.match(r.erros.join('\n'), /og\.png desatualizado/, 'sem og.png.sha256');
  gerarOgFalso(dir);
  assert.deepEqual(construir({ raiz: dir, templatePath: TEMPLATE_MIN, release: true }).erros, []);
  // conteúdo que muda o og.html (nome do grupo) invalida o og.png, e nada é gravado
  c.nomeGrupo = 'Outro Grupo';
  fs.writeFileSync(path.join(dir, 'content', 'pet.json'), JSON.stringify(c));
  const antes = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  r = construir({ raiz: dir, templatePath: TEMPLATE_MIN, release: true });
  assert.equal(r.ok, false);
  assert.match(r.erros.join('\n'), /og\.png desatualizado/);
  assert.equal(fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8'), antes);
  assert.equal(hashOgHtml(gerarOgHtml(c, c.ab.headlines[0], true)).length, 64);
});

test('S2: ab.padrao só com h/c; "</SCRIPT>" e "<!--" nunca chegam ao script inline', () => {
  const c = contentReal(); c.ab.padrao = { h: 1, c: 1, x: '</SCRIPT><script>alert(1)</script>' };
  assert.match(validarContent(c).erros.join('\n'), /ab\.padrao: só as chaves h e c/);
  const dir = montarProjeto({ pet: c });
  assert.equal(construir({ raiz: dir, templatePath: TEMPLATE_MIN }).ok, false);
  for (const ruim of ['/* </SCRIPT> */', '/* <!-- */']) {
    const d = montarProjeto({ pet: contentReal() });
    fs.writeFileSync(path.join(d, 'src', 'js', 'ab-inline.js'), `${ruim}(function(a){window.x=a})(__AB__);`);
    const r = construir({ raiz: d, templatePath: TEMPLATE_MIN });
    assert.equal(r.ok, false, ruim);
    assert.match(r.erros.join(), /não pode conter/);
    assert.ok(!fs.existsSync(path.join(d, 'dist')), 'nada é gravado');
  }
  const ok = montarProjeto({ pet: contentReal() });
  assert.ok(construir({ raiz: ok, templatePath: TEMPLATE_MIN }).ok);
  const html = fs.readFileSync(path.join(ok, 'dist', 'pet', 'index.html'), 'utf8');
  assert.ok(html.includes('(function(a){window.x=a})({"h":3,"c":3,"padrao":{"h":1,"c":1}});'));
});

// ---- logo do grupo (content.logo) ---------------------------------------------------------
function comLogo(c, arquivos = true) {
  c.logo = { src: 'g/logo.webp', alt: '', width: 40, height: 40, favicon: 'g/favicon.png', appleTouchIcon: 'g/apple.png' };
  const dir = montarProjeto({ pet: c }, { template: TEMPLATE_REAL });
  if (arquivos) {
    fs.mkdirSync(path.join(dir, 'src', 'img', 'g'), { recursive: true });
    for (const [f, v] of [['logo.webp', 'webp'], ['favicon.png', 'fav'], ['apple.png', 'apple']]) fs.writeFileSync(path.join(dir, 'src', 'img', 'g', f), v);
  }
  return dir;
}

test('logo: validação de src/favicon/appleTouchIcon, alt e dimensões; ausente ou null é válido', () => {
  const base = () => { const c = contentReal(); c.logo = { src: 'pet/logo.webp', alt: '', width: 40, height: 40, favicon: 'pet/favicon.png', appleTouchIcon: 'pet/apple-touch-icon.png' }; return c; };
  assert.deepEqual(validarContent(base(), { release: true }).erros, []);
  assert.deepEqual(validarContent(contentReal(), { release: true }).erros, []);
  const nulo = contentReal(); nulo.logo = null;
  assert.deepEqual(validarContent(nulo).erros, []);
  const casos = [
    [(l) => { l.src = '../segredo.webp'; }, /logo\.src/],
    [(l) => { l.src = 'pet/logo.png'; }, /logo\.src/],
    [(l) => { l.favicon = 'pet/favicon.svg'; }, /logo\.favicon/],
    [(l) => { delete l.appleTouchIcon; }, /logo\.appleTouchIcon/],
    [(l) => { delete l.alt; }, /logo\.alt/],
    [(l) => { l.width = '40'; }, /logo: width\/height/],
    [(l) => { l.height = 0; }, /logo: width\/height/],
  ];
  for (const [mut, re] of casos) {
    const c = base(); mut(c.logo);
    assert.match(validarContent(c).erros.join('\n'), re);
  }
  const lista = contentReal(); lista.logo = ['x'];
  assert.match(validarContent(lista).erros.join('\n'), /logo: objeto/);
});

test('logo: com logo, <img> no cabeçalho sem lazy/fetchpriority, favicon.png e apple-touch-icon copiados, og.html com o logo', () => {
  const dir = comLogo(contentReal());
  assert.deepEqual(construir({ raiz: dir }).erros, []);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  const header = html.match(/<header class="top">[\s\S]*?<\/header>/)[0];
  assert.match(header, /<p class="brand"><img class="brand__logo" src="\.\.\/assets\/img\/g\/logo\.webp" alt="" width="40" height="40" loading="eager" decoding="async"><span>Grupo Teste<\/span><\/p>/);
  assert.ok(!/fetchpriority|loading="lazy"/.test(header));
  assert.match(html, /<link rel="icon" href="favicon\.png" type="image\/png" sizes="48x48">/);
  assert.ok(!html.includes('favicon.svg'));
  const d = (f) => path.join(dir, 'dist', 'pet', f);
  assert.equal(fs.readFileSync(path.join(dir, 'dist', 'assets', 'img', 'g', 'logo.webp'), 'utf8'), 'webp');
  assert.equal(fs.readFileSync(d('favicon.png'), 'utf8'), 'fav');
  assert.equal(fs.readFileSync(d('apple-touch-icon.png'), 'utf8'), 'apple');
  const og = fs.readFileSync(d('og.html'), 'utf8');
  assert.match(og, /<img src="apple-touch-icon\.png" alt="" width="72" height="72">/);
  assert.ok(!og.includes('<svg'));
  // CSP: imagem local já coberta por img-src 'self'
  assert.match(html, /img-src 'self'/);
});

test('logo: arquivo ausente é erro de build; sem logo, página igual à anterior e favicon.png antigo some', () => {
  const faltando = comLogo(contentReal(), false);
  assert.match(construir({ raiz: faltando }).erros.join('\n'), /logo g\/logo\.webp não existe/);
  const dir = comLogo(contentReal());
  assert.ok(construir({ raiz: dir }).ok);
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'pet', 'favicon.png')));
  fs.writeFileSync(path.join(dir, 'content', 'pet.json'), JSON.stringify(contentReal()));
  assert.deepEqual(construir({ raiz: dir }).erros, []);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.match(html, /<p class="brand"><span>Grupo Teste<\/span><\/p>/);
  assert.ok(!/<img[^>]*brand__logo/.test(html));
  assert.match(html, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  assert.ok(!fs.existsSync(path.join(dir, 'dist', 'pet', 'favicon.png')), 'favicon.png antigo deveria sumir');
  assert.ok(fs.existsSync(path.join(dir, 'dist', 'pet', 'favicon.svg')));
  assert.match(fs.readFileSync(path.join(dir, 'dist', 'pet', 'og.html'), 'utf8'), /<div class="nome"><svg/);
});

test('logo: content/pet.json real usa o logo do grupo e os arquivos existem e são leves', () => {
  assert.ok(PET.logo, 'content/pet.json deveria declarar logo');
  for (const f of [PET.logo.src, PET.logo.favicon, PET.logo.appleTouchIcon]) assert.ok(fs.existsSync(path.join(RAIZ, 'src', 'img', f)), f);
  assert.ok(fs.statSync(path.join(RAIZ, 'src', 'img', PET.logo.src)).size <= 8 * 1024, 'logo WebP > 8 KB');
  assert.equal(PET.logo.alt, '');
});

// ---- identidade laranja: fontes, etiqueta do hero, preview com o logo ------------------------
test('fontes: Fredoka e Nunito + licenças OFL-*.txt copiadas; fonte órfã (Manrope) some de dist; preload só da Fredoka', () => {
  const dir = montarProjeto({ pet: contentReal() });
  fs.mkdirSync(path.join(dir, 'dist', 'assets', 'fonts'), { recursive: true });
  for (const f of ['manrope-latin-wght-normal.woff2', 'OFL.txt']) fs.writeFileSync(path.join(dir, 'dist', 'assets', 'fonts', f), 'velha');
  fs.writeFileSync(path.join(dir, 'src', 'fonts', 'outra.woff2'), 'nao-listada');
  assert.ok(construir({ raiz: dir, templatePath: TEMPLATE_REAL }).ok);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dist', 'assets', 'fonts')).sort(),
    ['OFL-fredoka.txt', 'OFL-nunito.txt', 'fredoka-latin-wght-normal.woff2', 'nunito-latin-wght-normal.woff2']);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  const preloads = html.match(/<link rel="preload"[^>]*>/g) || [];
  assert.deepEqual(preloads, ['<link rel="preload" href="../assets/fonts/fredoka-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>']);
  // Falta só a Nunito: sem preload e sem copiar fontes (aviso cita o arquivo).
  fs.rmSync(path.join(dir, 'src', 'fonts', 'nunito-latin-wght-normal.woff2'));
  const r = construir({ raiz: dir, templatePath: TEMPLATE_REAL });
  assert.ok(r.ok);
  assert.ok(r.avisos.some((a) => a.includes('nunito-latin-wght-normal.woff2')));
  assert.ok(!fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8').includes('rel="preload"'));
});

test('og.html: identidade laranja (creme/marrom, Fredoka no título, Nunito no nome), sem Manrope nem faixa', () => {
  const og = gerarOgHtml(contentReal(), 'Título <x>', true);
  assert.match(og, /background:#FFF4E8;color:#2B1408/);
  assert.match(og, /font-family:Fredoka;src:url\("\.\.\/assets\/fonts\/fredoka-latin-wght-normal\.woff2"\)/);
  assert.match(og, /font-family:Nunito;src:url\("\.\.\/assets\/fonts\/nunito-latin-wght-normal\.woff2"\)/);
  assert.match(og, /h1\{font-family:Fredoka,/);
  assert.ok(!/Manrope|faixa/.test(og));
  assert.match(og, /<h1>Título &lt;x&gt;<\/h1>/);
  assert.ok(!gerarOgHtml(contentReal(), 'T', false).includes('@font-face'));
});

test('ui.heroEtiqueta: opcional; renderiza escapada acima do h1; ausente ou "" não renderiza; não-texto ou só espaços é erro', () => {
  const com = contentReal(); com.ui.heroEtiqueta = 'Grátis <b>já</b>';
  const dir = montarProjeto({ pet: com }, { template: TEMPLATE_REAL });
  assert.deepEqual(construir({ raiz: dir }).erros, []);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.match(html, /<p class="tag">Grátis &lt;b&gt;já&lt;\/b&gt;<\/p>\s*<h1 id="h1"/);
  for (const v of [undefined, '']) {
    const sem = contentReal(); if (v === undefined) delete sem.ui.heroEtiqueta; else sem.ui.heroEtiqueta = v;
    const d = montarProjeto({ pet: sem }, { template: TEMPLATE_REAL });
    assert.deepEqual(construir({ raiz: d }).erros, []);
    assert.ok(!fs.readFileSync(path.join(d, 'dist', 'pet', 'index.html'), 'utf8').includes('class="tag"'), String(v));
  }
  const ruim = contentReal(); ruim.ui.heroEtiqueta = { x: 1 };
  assert.match(validarContent(ruim).erros.join('\n'), /ui\.heroEtiqueta/);
  for (const v of ['   ', ' \t\n', '\u00A0']) {
    const branco = contentReal(); branco.ui.heroEtiqueta = v;
    assert.match(validarContent(branco).erros.join('\n'), /ui\.heroEtiqueta: só espaços/, JSON.stringify(v));
  }
});

test('preview: o slot pode apontar para o arquivo do logo (pet.json atual) e vira a thumb da prévia', () => {
  assert.equal(PET.imagens.find((i) => i.slot === 'preview').src, PET.logo.src, 'pet.json: preview usa o logo');
  const c = contentReal();
  c.imagens = c.imagens.map((im) => (im.slot === 'preview' ? { ...im, src: 'g/logo.webp' } : im));
  const dir = comLogo(c);
  assert.deepEqual(construir({ raiz: dir }).erros, []);
  const html = fs.readFileSync(path.join(dir, 'dist', 'pet', 'index.html'), 'utf8');
  assert.match(html, /<img class="bubble__thumb" src="\.\.\/assets\/img\/g\/logo\.webp" alt="" width="64" height="64" loading="lazy"/);
  assert.match(html, /<img class="brand__logo" src="\.\.\/assets\/img\/g\/logo\.webp"/);
});
