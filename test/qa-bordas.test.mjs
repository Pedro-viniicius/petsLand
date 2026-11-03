// QA: casos de borda do build com o template REAL (escape, A/B, analytics, segundo nicho, dist em dia).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { construir, validarContent } from '../build.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PET = JSON.parse(fs.readFileSync(path.join(RAIZ, 'content', 'pet.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));
const VENENO = `<script>alert(1)</script>" onload="x" '&amp; {{convite}} $& $1 </script><img src=x onerror=y>`;

function base() {
  const c = clone(PET);
  c.siteUrl = 'https://exemplo.com.br';
  c.convite = 'https://chat.whatsapp.com/AbC123';
  c.politicaPrivacidade = 'https://exemplo.com.br/privacidade';
  return c;
}
function construirCom(contents, extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-bordas-'));
  const contentDir = path.join(tmp, 'content');
  fs.mkdirSync(contentDir);
  for (const [nome, c] of Object.entries(contents)) fs.writeFileSync(path.join(contentDir, `${nome}.json`), JSON.stringify(c));
  const saida = path.join(tmp, 'dist');
  const r = construir({ contentDir, saida, ...extra });
  return { r, saida, tmp, limpar: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}
const ler = (saida, nicho = 'pet') => fs.readFileSync(path.join(saida, nicho, 'index.html'), 'utf8');
// Substitui toda string "textual" do content por veneno (exceto campos com formato validado).
function envenenar(c) {
  const poupar = new Set(['nicho', 'siteUrl', 'convite', 'politicaPrivacidade', 'icone', 'slot', 'src', 'favicon', 'appleTouchIcon', 'accent', 'onAccent', 'ga4', 'clarity']);
  const visita = (v, chave) => {
    if (typeof v === 'string') return poupar.has(chave) ? v : `${chave}:${VENENO}`;
    if (Array.isArray(v)) return v.map((x) => visita(x, chave));
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, visita(x, k)]));
    return v;
  };
  return visita(c, '');
}

test('escape: veneno em TODOS os campos de texto não vira marcação nem quebra atributo', () => {
  const c = envenenar(base());
  const { r, saida, limpar } = construirCom({ pet: c });
  try {
    assert.equal(r.ok, true, r.erros.join('\n'));
    const html = ler(saida);
    assert.ok(!html.includes('<script>alert(1)'), 'script injetado cru');
    assert.ok(!html.includes('<img src=x'), 'img injetada crua');
    assert.ok(!html.includes('" onload="x"'), 'aspas cruas permitiram injetar atributo');
    assert.ok(!html.includes('onerror=y>'));
    // Só os 4 <script> legítimos: ab inline, cfg json e 2 módulos.
    assert.equal((html.match(/<script\b/g) || []).length, 4);
    // Só o logo do cabeçalho (content.logo) e a thumb da prévia quando o slot preview é arquivo real; [IMAGEM:] não renderiza.
    const previewReal = c.exemploOferta.ativo && c.imagens.some((i) => i.slot === 'preview' && !i.src.startsWith('[IMAGEM:'));
    assert.equal((html.match(/<img\b/g) || []).length, (PET.logo ? 1 : 0) + (previewReal ? 1 : 0));
    assert.ok(!/<img\b[^>]*src="\[IMAGEM/.test(html), 'slot [IMAGEM:] não pode renderizar');
    // {{convite}} no texto não é reinterpretado; $& e $1 saem literais (escapados).
    assert.ok(html.includes('$&amp; $1'), '$& e $1 devem sair literais (escapados), sem expansão de String.replace');
    assert.ok(html.includes('{{convite}}'), 'texto {{convite}} deve aparecer literal');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    // Nenhum campo do content aparece com aspas cruas dentro de atributo: meta description e title.
    // Todos os CTAs continuam com o href exato do convite.
    const ctas = [...html.matchAll(/<a\b[^>]*data-cta="(\w+)"[^>]*>/g)];
    assert.equal(ctas.length, 3);
    for (const m of ctas) assert.ok(m[0].includes('href="https://chat.whatsapp.com/AbC123"'), m[0]);
  } finally { limpar(); }
});

test('escape: aspas e < em href de política e siteUrl não escapam do atributo', () => {
  const c = base();
  c.politicaPrivacidade = 'https://exemplo.com.br/p?a="onmouseover="x&b=<b>';
  c.siteUrl = 'https://exemplo.com.br/x"y';
  const { r, saida, limpar } = construirCom({ pet: c });
  try {
    assert.equal(r.ok, true, r.erros.join('\n'));
    const html = ler(saida);
    assert.ok(!/href="[^"]*"onmouseover=/.test(html));
    assert.ok(!html.includes('<b>'));
    for (const m of html.matchAll(/<(?:a|meta|link)\b[^>]*>/g)) assert.ok(!/\s(onmouseover|onload)=/.test(m[0]), m[0]);
  } finally { limpar(); }
});

test('segurança: esquemas perigosos e convites malformados são rejeitados', () => {
  for (const campo of ['politicaPrivacidade', 'siteUrl']) {
    for (const ruim of ['javascript:alert(1)', 'http://exemplo.com', 'data:text/html,x', '//exemplo.com', 'exemplo.com']) {
      const c = base(); c[campo] = ruim;
      assert.ok(validarContent(c).erros.some((e) => e.startsWith(campo)), `${campo}=${ruim} deveria falhar`);
    }
  }
  for (const ruim of ['https://chat.whatsapp.com/AbC123\n', ' https://chat.whatsapp.com/AbC123', 'https://chat.whatsapp.com/AbC123?x=1', 'https://chat.whatsapp.com/AbC123/', 'https://chat.whatsapp.com.evil.com/AbC123', 'http://chat.whatsapp.com/AbC123', 'https://bit.ly/abc', 'https://chat.whatsapp.com/', 'https://chat.whatsapp.com/Ab_C']) {
    const c = base(); c.convite = ruim;
    assert.ok(validarContent(c).erros.some((e) => e.startsWith('convite')), `convite ${JSON.stringify(ruim)} deveria falhar`);
  }
});

test('exemploOferta: ativo=false omite o bloco (mesmo sem texto); sem "ativo" é erro claro e nada é gravado', () => {
  const off = base(); off.exemploOferta = { ativo: false };
  const a = construirCom({ pet: off });
  try {
    assert.equal(a.r.ok, true, a.r.erros.join('\n'));
    const html = ler(a.saida);
    assert.ok(!html.includes('class="preview"') && !html.includes('Exemplo ilustrativo'));
  } finally { a.limpar(); }
  const semAtivo = base(); semAtivo.exemploOferta = { texto: 'x' };
  const b = construirCom({ pet: semAtivo });
  try {
    assert.equal(b.r.ok, false);
    assert.ok(b.r.erros.some((e) => /exemploOferta/.test(e)), b.r.erros.join('\n'));
    assert.equal(fs.existsSync(path.join(b.saida, 'pet', 'index.html')), false, 'não deve gravar nada com erro');
  } finally { b.limpar(); }
  const semBloco = base(); delete semBloco.exemploOferta;
  assert.ok(validarContent(semBloco).erros.some((e) => /exemploOferta/.test(e)));
});

test('exemploOferta ativo mostra o rótulo "Exemplo ilustrativo" e a legenda (CA6)', () => {
  const { r, saida, limpar } = construirCom({ pet: base() });
  try {
    assert.equal(r.ok, true);
    const html = ler(saida);
    assert.ok(html.includes('Exemplo ilustrativo'));
    assert.ok(html.includes('Não é uma oferta real'));
  } finally { limpar(); }
});

test('analytics: nenhum ID, só GA4, só Clarity e ambos — cfg e CSP coerentes', () => {
  const casos = [
    [{ ga4: '', clarity: '' }, { ga4: '', clarity: '' }, [], ['googletagmanager', 'clarity.ms', 'google-analytics']],
    [{ ga4: 'G-ABC123', clarity: '' }, { ga4: 'G-ABC123', clarity: '' }, ['www.googletagmanager.com'], ['clarity.ms']],
    [{ ga4: '', clarity: 'abc123' }, { ga4: '', clarity: 'abc123' }, ['*.clarity.ms'], ['googletagmanager']],
    [{ ga4: 'G-ABC123', clarity: 'abc123' }, { ga4: 'G-ABC123', clarity: 'abc123' }, ['www.googletagmanager.com', '*.clarity.ms'], []],
    [{ ga4: '[G-XXXXXXXXXX]', clarity: '[CLARITY_ID]' }, { ga4: '', clarity: '' }, [], ['googletagmanager', 'clarity.ms']],
  ];
  for (const [entrada, cfgEsperado, tem, naoTem] of casos) {
    const c = base(); c.analytics = entrada;
    const { r, saida, limpar } = construirCom({ pet: c });
    try {
      assert.equal(r.ok, true, r.erros.join('\n'));
      const html = ler(saida);
      const cfg = JSON.parse(html.match(/<script type="application\/json" id="cfg">(.*?)<\/script>/s)[1]);
      assert.deepEqual(cfg, { ...cfgEsperado, niche: 'pet' });
      const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
      for (const t of tem) assert.ok(csp.includes(t), `CSP deveria ter ${t}: ${csp}`);
      for (const t of naoTem) assert.ok(!csp.includes(t), `CSP não deveria ter ${t}: ${csp}`);
      assert.ok(!/preconnect|dns-prefetch/.test(html), 'proibido preconnect/dns-prefetch');
      assert.ok(!/googletagmanager\.com|clarity\.ms/.test(html.replace(/Content-Security-Policy" content="[^"]*"/, '')), 'domínio de analytics só pode aparecer na CSP');
    } finally { limpar(); }
  }
});

test('analytics: IDs com injeção são rejeitados', () => {
  for (const [k, v] of [['ga4', 'G-ABC"><script>'], ['ga4', 'g-abc123'], ['clarity', 'ABC123'], ['clarity', 'a b'], ['clarity', "x');alert(1);//"]]) {
    const c = base(); c.analytics[k] = v;
    assert.ok(validarContent(c).erros.some((e) => e.startsWith(`analytics.${k}`)), `${k}=${v}`);
  }
});

test('A/B: listas de 1, 2 e 3 itens; 4 itens, vazio e padrao fora da lista são erro', () => {
  for (const n of [1, 2, 3]) {
    const c = base();
    c.ab.headlines = c.ab.headlines.slice(0, n); c.ab.ctas = c.ab.ctas.slice(0, n);
    c.ab.padrao = { h: n, c: n };
    const { r, saida, limpar } = construirCom({ pet: c });
    try {
      assert.equal(r.ok, true, r.erros.join('\n'));
      const html = ler(saida);
      assert.equal((html.match(/class="ab" data-h="\d"/g) || []).length, n);
      assert.equal((html.match(/class="ab" data-c="\d"/g) || []).length, n * 3);
      assert.ok(html.includes(`data-h="${n}" data-c="${n}"`));
      assert.ok(html.includes(`"h":${n},"c":${n}`), 'tamanho das listas embutido no inline');
    } finally { limpar(); }
  }
  const mut = (f) => { const c = base(); f(c); return validarContent(c).erros.length > 0; };
  assert.ok(mut((c) => { c.ab.headlines.push('quarta'); }));
  assert.ok(mut((c) => { c.ab.ctas = []; }));
  assert.ok(mut((c) => { c.ab.headlines[1] = '   '; }));
  assert.ok(mut((c) => { c.ab.padrao = { h: 0, c: 1 }; }));
  assert.ok(mut((c) => { c.ab.padrao = { h: 4, c: 1 }; }));
  assert.ok(mut((c) => { c.ab.padrao = { h: 1.5, c: 1 }; }));
  assert.ok(mut((c) => { c.ab.padrao = { h: '1', c: 1 }; }));
  assert.ok(mut((c) => { delete c.ab; }));
});

test('CTAs (CA9/CA10): exatamente 3 a[data-cta] e todos com o convite, sem target nem rel inesperado', () => {
  const { r, saida, limpar } = construirCom({ pet: base() });
  try {
    const html = ler(saida);
    const tags = [...html.matchAll(/<a\b[^>]*data-cta="([^"]+)"[^>]*>/g)];
    assert.deepEqual(tags.map((m) => m[1]).sort(), ['final', 'hero', 'sticky']);
    for (const m of tags) { assert.ok(!/target=/.test(m[0])); assert.ok(m[0].includes('href="https://chat.whatsapp.com/AbC123"')); }
  } finally { limpar(); }
});

test('texto longo (20 mil caracteres) e Unicode exótico não quebram o build', () => {
  const c = base();
  c.subtitulo = 'ração '.repeat(3500);
  c.ab.headlines[0] = 'Olá 🐶🐱     日本語 ‮ invertido';
  const { r, saida, limpar } = construirCom({ pet: c });
  try {
    assert.equal(r.ok, true, r.erros.join('\n'));
    const html = ler(saida);
    assert.ok(html.includes('🐶🐱'));
    assert.ok(html.length > 20000);
  } finally { limpar(); }
});

test('segundo nicho: build isolado em outro diretório, cor própria, assets compartilhados, pet intacto', () => {
  const gato = base();
  gato.nicho = 'gato';
  gato.nomeGrupo = 'Grupo Gato';
  gato.convite = 'https://chat.whatsapp.com/GatoXyz789';
  gato.corDestaque = { accent: '#FF5A1F', onAccent: '#000000' };
  gato.ab.headlines = ['Achadinhos para gatos', 'Ofertas felinas'];
  gato.ab.ctas = ['Quero entrar'];
  gato.ab.padrao = { h: 2, c: 1 };
  gato.analytics = { ga4: '', clarity: '' };
  const { r, saida, limpar } = construirCom({ pet: base(), gato });
  try {
    assert.equal(r.ok, true, r.erros.join('\n'));
    assert.deepEqual(r.nichos.sort(), ['gato', 'pet']);
    const g = ler(saida, 'gato'); const p = ler(saida, 'pet');
    assert.ok(g.includes('--c-accent:#FF5A1F;--c-on-accent:#000000'));
    assert.ok(p.includes('--c-accent:#C2410C'));
    assert.ok(g.includes('data-niche="gato"') && g.includes('"niche":"gato"'));
    assert.ok(g.includes('data-h="2" data-c="1"'));
    assert.ok(g.includes('https://exemplo.com.br/gato/og.png'));
    assert.ok(!g.includes('Receba achadinhos pet') && !g.includes('AbC123"'), 'vazamento de conteúdo do pet no gato');
    assert.ok(!p.includes('GatoXyz789'));
    assert.ok(fs.readFileSync(path.join(saida, 'gato', 'favicon.svg'), 'utf8').includes('#FF5A1F'));
    assert.ok(fs.readFileSync(path.join(saida, 'gato', 'og.html'), 'utf8').includes('Ofertas felinas'));
    for (const f of ['styles.css', 'js/ui.js', 'js/consent.js']) assert.ok(fs.existsSync(path.join(saida, 'assets', f)), f);
    assert.ok(!fs.existsSync(path.join(saida, 'assets', 'js', 'ab-inline.js')), 'ab-inline é inline, não vai para assets');
    // Hashes da CSP são por nicho (cada um tem seu inline e seu accent).
    const hashes = (h) => [...h.matchAll(/sha256-[A-Za-z0-9+/=]+/g)].map((m) => m[0]);
    assert.notDeepEqual(hashes(g), hashes(p));
  } finally { limpar(); }
});

test('multi-nicho: um content inválido impede gravar qualquer saída (tudo ou nada)', () => {
  const ruim = base(); ruim.nicho = 'gato'; ruim.convite = 'https://bit.ly/x';
  const { r, saida, limpar } = construirCom({ pet: base(), gato: ruim });
  try {
    assert.equal(r.ok, false);
    assert.ok(r.erros.some((e) => e.includes('gato.json') && /convite/.test(e)));
    assert.equal(fs.existsSync(path.join(saida, 'pet', 'index.html')), false);
  } finally { limpar(); }
});

test('prova social (CA6): null não gera bloco; objeto sem fonte é erro', () => {
  const { r, saida, limpar } = construirCom({ pet: base() });
  try { assert.equal(r.ok, true); assert.ok(!/prova|depoiment|membros|mil pessoas/i.test(ler(saida))); } finally { limpar(); }
  const c = base(); c.provaSocial = { texto: '12 mil membros' };
  assert.ok(validarContent(c).erros.some((e) => /provaSocial/.test(e)));
});

test('idempotência: dois builds seguidos geram HTML idêntico', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-idem-'));
  try {
    fs.mkdirSync(path.join(tmp, 'content'));
    fs.writeFileSync(path.join(tmp, 'content', 'pet.json'), JSON.stringify(base()));
    const opts = { contentDir: path.join(tmp, 'content'), saida: path.join(tmp, 'dist') };
    construir(opts); const a = ler(opts.saida);
    construir(opts); const b = ler(opts.saida);
    assert.equal(a, b);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('release: o content real do projeto continua falhando por placeholder, sem gravar', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-rel-'));
  try {
    const r = construir({ release: true, saida: path.join(tmp, 'dist') });
    assert.equal(r.ok, false);
    assert.ok(r.erros.some((e) => /placeholder/.test(e)));
    assert.equal(fs.existsSync(path.join(tmp, 'dist', 'pet')), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('dist/ versionado está em dia com src/ + content/ (regressão: esqueceu de rodar o build)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-dist-'));
  try {
    const r = construir({ saida: tmp });
    assert.equal(r.ok, true, r.erros.join('\n'));
    const iguais = (rel) => assert.equal(fs.readFileSync(path.join(tmp, rel), 'utf8'), fs.readFileSync(path.join(RAIZ, 'dist', rel), 'utf8'), `dist/${rel} desatualizado`);
    for (const rel of ['pet/index.html', 'pet/favicon.svg', 'pet/og.html', 'assets/styles.css', 'assets/js/ui.js', 'assets/js/consent.js']) iguais(rel);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
