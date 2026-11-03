#!/usr/bin/env node
// Check estático da landing. Uso: node scripts/check.mjs [nicho]   (padrão: pet)
// Lê dist/<nicho>/index.html, dist/assets/*, content/<nicho>.json e src/styles.css.
// Saída: uma linha por check com o CA correspondente; código 1 se algum check falhar,
// código 2 se faltar arquivo de entrada.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// Funções puras (exportadas e testadas em test/check.test.mjs)
// ---------------------------------------------------------------------------

/** Limites usados pelos checks. */
export const LIMITE_PESO_INICIAL = 200 * 1024;
export const LIMITE_IMAGEM_LCP = 60 * 1024;
export const LIMITE_OG = 300 * 1024;

export const FORBIDDEN_TERMS = [
  '100% seguro',
  'melhores ofertas',
  'ultimas vagas',
  'restam',
  'so hoje',
  'vagas limitadas',
  // promessas absolutas e urgência falsa (CA23), além da lista mínima do plano
  '100% garantido',
  'sem risco',
  'menor preco garantido',
  'melhor preco garantido',
  'ultimas unidades',
];

export const STORE_NAMES = [
  'shopee', 'amazon', 'mercado livre', 'mercadolivre', 'magalu', 'magazine luiza',
  'shein', 'aliexpress', 'americanas', 'casas bahia', 'petz', 'cobasi', 'petlove',
];

/** Normaliza para comparação: minúsculas, sem acento, espaços colapsados. */
export function normalize(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Devolve os termos proibidos (da lista original) presentes no texto. */
export function findForbiddenTerms(text, terms = FORBIDDEN_TERMS) {
  const t = normalize(text);
  const found = [];
  for (const term of terms) {
    const n = normalize(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(?<![a-z0-9])${n}(?![a-z0-9])`).test(t)) found.push(term);
  }
  return found;
}

/** Converte "#rgb", "#rrggbb", "rgb(r g b)" ou "rgb(r,g,b)" em [r,g,b] (0-255); null se inválido. */
export function parseColor(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(v);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16));
  m = /^#([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(v);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(v);
  if (m) return [m[1], m[2], m[3]].map(Number);
  return null;
}

/** Luminância relativa WCAG 2.x. */
export function relativeLuminance([r, g, b]) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razão de contraste WCAG entre duas cores (strings ou [r,g,b]). */
export function contrastRatio(a, b) {
  const ca = Array.isArray(a) ? a : parseColor(a);
  const cb = Array.isArray(b) ? b : parseColor(b);
  if (!ca || !cb) return NaN;
  const la = relativeLuminance(ca);
  const lb = relativeLuminance(cb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Extrai as custom properties declaradas em blocos `:root { ... }` (o último vence). */
export function parseTokens(css) {
  const limpo = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  const tokens = {};
  const re = /:root\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(limpo))) {
    for (const decl of m[1].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const nome = decl.slice(0, i).trim();
      if (nome.startsWith('--')) tokens[nome] = decl.slice(i + 1).trim();
    }
  }
  return tokens;
}

/**
 * Resolve um token (aceita `--c-nome` ou `--nome`) até uma cor utilizável: segue var(--x) e
 * calcula color-mix(in srgb, A p%, B [q%]). Devolve "rgb(r g b)" ou o valor bruto se não for cor.
 */
export function resolveToken(tokens, nome, profundidade = 0) {
  const candidatos = nome.startsWith('--') ? [nome] : [`--c-${nome}`, `--${nome}`];
  for (const c of candidatos) if (c in tokens) return resolveValue(tokens, tokens[c], profundidade);
  return null;
}

function resolveValue(tokens, valor, profundidade = 0) {
  if (profundidade > 8) return null;
  const v = String(valor).trim();
  const ref = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(v);
  if (ref) return resolveToken(tokens, ref[1], profundidade + 1);
  const mix = /^color-mix\(\s*in\s+srgb\s*,\s*(.+)\)$/i.exec(v);
  if (mix) {
    const partes = splitTopLevel(mix[1]);
    if (partes.length !== 2) return null;
    const lê = (parte) => {
      const m = /^(.*?)(?:\s+(\d+(?:\.\d+)?)%)?$/.exec(parte.trim());
      const cor = parseColor(resolveValue(tokens, m[1].trim(), profundidade + 1) ?? '');
      return { cor, pct: m[2] == null ? null : Number(m[2]) };
    };
    const a = lê(partes[0]);
    const b = lê(partes[1]);
    if (!a.cor || !b.cor) return null;
    let pa = a.pct ?? (b.pct == null ? 50 : 100 - b.pct);
    const pb = b.pct ?? 100 - pa;
    const soma = pa + pb;
    pa = pa / soma;
    const mixc = a.cor.map((x, i) => Math.round(x * pa + b.cor[i] * (1 - pa)));
    return `rgb(${mixc.join(' ')})`;
  }
  return v;
}

function splitTopLevel(s) {
  const out = [];
  let nivel = 0;
  let atual = '';
  for (const ch of s) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (ch === ',' && nivel === 0) { out.push(atual); atual = ''; } else atual += ch;
  }
  out.push(atual);
  return out;
}

/**
 * Pares de cor checados. `obrigatorio: false` só entra se os dois tokens existirem.
 * `fallbackFg`: se o token de primeiro plano não existir, usa este (a spec usa --text como anel de foco).
 */
export const CONTRAST_PAIRS = [
  { fg: 'text', bg: 'bg', min: 4.5, ca: ['CA4'], obrigatorio: true },
  { fg: 'text', bg: 'surface', min: 4.5, ca: ['CA4'], obrigatorio: true },
  { fg: 'text-muted', bg: 'bg', min: 4.5, ca: ['CA4'], obrigatorio: true },
  { fg: 'text-muted', bg: 'surface', min: 4.5, ca: ['CA4'], obrigatorio: true },
  { fg: 'on-accent', bg: 'accent', min: 4.5, ca: ['CA4', 'CA13'], obrigatorio: true },
  { fg: 'focus', bg: 'bg', min: 3, ca: ['CA4'], obrigatorio: true, fallbackFg: 'text' },
  { fg: 'text', bg: 'surface-2', min: 4.5, ca: ['CA4'], obrigatorio: false },
  { fg: 'text-muted', bg: 'surface-2', min: 4.5, ca: ['CA4'], obrigatorio: false },
  { fg: 'text', bg: 'surface-3', min: 4.5, ca: ['CA4'], obrigatorio: false },
  { fg: 'text-muted', bg: 'surface-3', min: 4.5, ca: ['CA4'], obrigatorio: false },
  { fg: 'on-accent', bg: 'accent-hover', min: 4.5, ca: ['CA4'], obrigatorio: false },
  { fg: 'on-accent', bg: 'accent-active', min: 4.5, ca: ['CA4'], obrigatorio: false },
  // Identidade laranja: --c-on-brand só em texto grande/ícone (3:1); selo amarelo com texto normal (4,5:1).
  { fg: 'on-brand', bg: 'brand', min: 3, ca: ['CA4'], obrigatorio: false },
  { fg: 'on-highlight', bg: 'highlight', min: 4.5, ca: ['CA4'], obrigatorio: false },
  // Ícones e números em --c-brand (#E85D10) sobre fundo e creme: objeto gráfico >= 3:1 (WCAG 1.4.11).
  { fg: 'brand', bg: 'surface-2', min: 3, ca: ['CA4'], obrigatorio: false },
  { fg: 'brand', bg: 'bg', min: 3, ca: ['CA4'], obrigatorio: false },
  // Borda de componente (--c-border; o divisor decorativo é --c-divider e não entra) >= 3:1 (WCAG 1.4.11).
  { fg: 'border', bg: 'bg', min: 3, ca: ['CA4'], obrigatorio: true },
  { fg: 'border', bg: 'surface', min: 3, ca: ['CA4'], obrigatorio: false },
  { fg: 'border', bg: 'surface-2', min: 3, ca: ['CA4'], obrigatorio: false },
];

/** Calcula todos os pares. Devolve [{par, ratio, min, ok, faltando?, ca}]. */
export function checkContrastPairs(tokens, pairs = CONTRAST_PAIRS) {
  const saida = [];
  for (const p of pairs) {
    let fgNome = p.fg;
    let fg = resolveToken(tokens, fgNome);
    if (fg == null && p.fallbackFg) {
      fgNome = p.fallbackFg;
      fg = resolveToken(tokens, fgNome);
    }
    const bg = resolveToken(tokens, p.bg);
    const par = `${fgNome}/${p.bg}`;
    if (fg == null || bg == null) {
      if (p.obrigatorio) saida.push({ par, min: p.min, ca: p.ca, ok: false, faltando: true });
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    saida.push({ par, ratio, min: p.min, ca: p.ca, ok: ratio >= p.min });
  }
  return saida;
}

/** Lê largura e altura do cabeçalho IHDR de um PNG; null se não for PNG válido. */
export function readPngSize(buf) {
  if (!buf || buf.length < 24) return null;
  const assinatura = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (let i = 0; i < 8; i++) if (buf[i] !== assinatura[i]) return null;
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Decodifica as entidades HTML mais comuns. */
export function decodeEntities(s) {
  return String(s)
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function stripComments(html) {
  return String(html).replace(/<!--[\s\S]*?-->/g, '');
}

/** Atributos de uma string de atributos: {nome: valor} (valor '' para booleano). */
export function parseAttrs(str) {
  const attrs = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m;
  while ((m = re.exec(str))) {
    attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  }
  return attrs;
}

/** Todas as tags de abertura `<nome ...>`: [{attrs, index, end}]. */
export function findTags(html, nome) {
  const re = new RegExp(`<${nome}(?=[\\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*)>`, 'gi');
  const saida = [];
  let m;
  while ((m = re.exec(html))) {
    saida.push({ attrs: parseAttrs(m[1]), index: m.index, end: m.index + m[0].length });
  }
  return saida;
}

/** Elementos com conteúdo: [{attrs, inner, index}] (sem aninhar o mesmo nome). */
export function findElements(html, nome) {
  const re = new RegExp(`<${nome}(?=[\\s/>])((?:"[^"]*"|'[^']*'|[^>"'])*)>([\\s\\S]*?)</${nome}\\s*>`, 'gi');
  const saida = [];
  let m;
  while ((m = re.exec(html))) saida.push({ attrs: parseAttrs(m[1]), inner: m[2], index: m.index });
  return saida;
}

/** Texto visível aproximado (sem script/style/template, tags viram espaço, entidades decodificadas). */
export function visibleText(html) {
  const t = stripComments(html)
    .replace(/<(script|style|template|noscript)[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return decodeEntities(t).replace(/\s+/g, ' ').trim();
}

function textoDe(innerHtml) {
  return decodeEntities(String(innerHtml).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function coletarStrings(valor, saida = []) {
  if (typeof valor === 'string') saida.push(valor);
  else if (Array.isArray(valor)) valor.forEach((v) => coletarStrings(v, saida));
  else if (valor && typeof valor === 'object') Object.values(valor).forEach((v) => coletarStrings(v, saida));
  return saida;
}

const ehPlaceholder = (s) => typeof s === 'string' && /^\s*\[/.test(s);

// ---------------------------------------------------------------------------
// Checks. Cada um devolve [{ca, nivel: 'ok'|'falha'|'aviso', msg}]
// ---------------------------------------------------------------------------

const ok = (ca, msg) => ({ ca, nivel: 'ok', msg });
const falha = (ca, msg) => ({ ca, nivel: 'falha', msg });
const aviso = (ca, msg) => ({ ca, nivel: 'aviso', msg });
const res = (ca, passou, msgOk, msgFalha) => (passou ? ok(ca, msgOk) : falha(ca, msgFalha));

/** CA3 e CA9: CTAs. */
export function checkCtas(html, content) {
  const r = [];
  const h = stripComments(html);
  const ctas = findElements(h, 'a').filter((a) => 'data-cta' in a.attrs);
  const locais = ctas.map((a) => a.attrs['data-cta']);
  const convite = content.convite;

  r.push(
    res('CA3', ctas.length > 0 && ctas.every((a) => a.attrs.href === convite),
      `${ctas.length} CTA(s) com href igual ao convite`,
      `CTA com href diferente de content.convite: ${ctas.filter((a) => a.attrs.href !== convite).map((a) => a.attrs['data-cta'] + '=' + a.attrs.href).join(', ') || 'nenhum CTA encontrado'}`),
  );
  r.push(
    res('CA3', ['hero', 'final'].every((l) => locais.includes(l)),
      'CTAs hero e final presentes no HTML (funcionam sem JS)',
      `faltam CTAs no HTML: ${['hero', 'final'].filter((l) => !locais.includes(l)).join(', ')}`),
  );
  r.push(
    res('CA3', ctas.every((a) => a.attrs.target !== '_blank'),
      'nenhum CTA com target=_blank',
      'CTA com target=_blank (o convite deve abrir direto no app)'),
  );
  r.push(
    res('CA9', ctas.length <= 3 && locais.every((l) => ['hero', 'sticky', 'final'].includes(l)) && new Set(locais).size === locais.length,
      `${ctas.length} CTA(s), valores ${locais.join('|')}`,
      `CTAs fora do contrato: ${ctas.length} encontrados (${locais.join(', ')}); máx. 3 com valores únicos hero|sticky|final`),
  );

  const permitidos = new Set(
    [...(content.ab?.ctas ?? []), ...(content.ctas ?? [])].map((t) => normalize(typeof t === 'string' ? t : t?.texto ?? '')),
  );
  const estranhos = [];
  for (const a of ctas) {
    const variantes = findElements(a.inner, '[a-z0-9]+').filter((e) => 'data-c' in e.attrs);
    const textos = variantes.length ? variantes.map((v) => textoDe(v.inner)) : [textoDe(a.inner)];
    for (const t of textos) if (!permitidos.has(normalize(t))) estranhos.push(`${a.attrs['data-cta']}: "${t}"`);
  }
  r.push(
    res('CA9', permitidos.size > 0 && estranhos.length === 0,
      'textos dos CTAs vêm só de content.ab.ctas',
      permitidos.size === 0 ? 'content.ab.ctas ausente ou vazio' : `texto de CTA fora de content.ab.ctas: ${estranhos.join('; ')}`),
  );
  return r;
}

/** CA4 e CA13 a partir dos tokens do CSS (mais o `<style>` inline do HTML, que sobrescreve). */
export function checkContrast(css, html = '') {
  const inline = findElements(stripComments(html), 'style').map((s) => s.inner).join('\n');
  const tokens = { ...parseTokens(css), ...parseTokens(inline) };
  const pares = checkContrastPairs(tokens);
  const r = [];
  for (const p of pares) {
    const txt = p.faltando ? `token ausente para o par ${p.par}` : `${p.par} = ${p.ratio.toFixed(2)}:1 (mín. ${p.min})`;
    for (const c of p.ca) r.push(p.ok ? ok(c, txt) : falha(c, txt + (p.faltando ? '' : ' abaixo do mínimo')));
  }
  return r;
}

/** CA5 (parte estática), CA22 (CSS) e CA25 (CSS externo). */
export function checkCss(css) {
  const r = [];
  const c = String(css).replace(/\/\*[\s\S]*?\*\//g, '');
  r.push(res('CA5', /env\(\s*safe-area-inset-bottom/.test(c), 'CSS usa env(safe-area-inset-bottom)', 'CSS sem env(safe-area-inset-bottom)'));
  r.push(res('CA22', /prefers-reduced-motion/.test(c), 'CSS tem prefers-reduced-motion', 'CSS sem prefers-reduced-motion'));
  const externos = [...c.matchAll(/url\(\s*['"]?\s*((?:https?:)?\/\/[^)'"\s]+)/gi)].map((m) => m[1]);
  const imports = [...c.matchAll(/@import\s+(?:url\()?\s*['"]?([^'")\s;]+)/gi)].map((m) => m[1]);
  r.push(res('CA25', externos.length === 0 && imports.length === 0, 'CSS sem url() externa nem @import', `CSS com recurso externo: ${[...externos, ...imports].join(', ')}`));
  return r;
}

/** CA5, CA20, CA21, CA22, CA25: estrutura do documento. */
export function checkDocument(html, content, nicho = 'pet') {
  const r = [];
  const h = stripComments(html);
  const tags = (n) => findTags(h, n);

  // CA5: viewport
  const viewport = tags('meta').find((m) => m.attrs.name === 'viewport');
  r.push(res('CA5', !!viewport && /viewport-fit\s*=\s*cover/.test(viewport.attrs.content ?? ''), 'meta viewport com viewport-fit=cover', 'meta viewport sem viewport-fit=cover'));

  // CA20: semântica
  const htmlTag = tags('html')[0];
  r.push(res('CA20', htmlTag?.attrs.lang === 'pt-BR', '<html lang="pt-BR">', `lang do <html> = ${htmlTag?.attrs.lang ?? 'ausente'} (esperado pt-BR)`));
  const h1s = tags('h1').length;
  r.push(res('CA20', h1s === 1, 'um único <h1>', `${h1s} elementos <h1> (esperado 1)`));
  const faltamLandmarks = ['header', 'main', 'footer'].filter((l) => tags(l).length !== 1);
  r.push(res('CA20', faltamLandmarks.length === 0, 'landmarks header/main/footer presentes', `landmark ausente ou duplicado: ${faltamLandmarks.join(', ')}`));
  const semAlt = tags('img').filter((i) => !('alt' in i.attrs));
  r.push(res('CA20', semAlt.length === 0, 'todas as <img> têm alt', `${semAlt.length} <img> sem atributo alt`));
  const semNome = [...findElements(h, 'a'), ...findElements(h, 'button'), ...findElements(h, 'summary')]
    .filter((e) => !textoDe(e.inner) && !(e.attrs['aria-label'] ?? '').trim());
  r.push(res('CA20', semNome.length === 0, 'links, botões e summaries com nome acessível', `${semNome.length} controle(s) sem texto nem aria-label`));
  const ids = [...h.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  r.push(res('CA20', dup.length === 0, 'ids únicos', `ids duplicados: ${[...new Set(dup)].join(', ')}`));
  const tabPos = [...h.matchAll(/\stabindex\s*=\s*"?(\d+)/g)].filter((m) => Number(m[1]) > 0);
  r.push(res('CA20', tabPos.length === 0, 'sem tabindex positivo', 'tabindex positivo bagunça a ordem do teclado'));

  // CA22: elementos proibidos
  const proibidos = ['nav', 'form', 'input', 'dialog', 'iframe', 'embed', 'object', 'video', 'audio', 'canvas'].filter((t) => tags(t).length > 0);
  r.push(res('CA22', proibidos.length === 0, 'sem nav, form, input, dialog, iframe nem mídia pesada', `elementos proibidos no HTML: ${proibidos.join(', ')}`));

  // CA21: metas
  const meta = {};
  for (const m of tags('meta')) {
    const k = m.attrs.name ?? m.attrs.property;
    if (k) meta[k] = m.attrs.content ?? '';
  }
  const titulo = findElements(h, 'title')[0];
  const faltam = [];
  if (!titulo || !textoDe(titulo.inner)) faltam.push('<title>');
  for (const k of ['description', 'og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'twitter:card', 'theme-color']) {
    if (!meta[k]) faltam.push(k);
  }
  if (!tags('link').some((l) => /(^|\s)icon(\s|$)/.test(l.attrs.rel ?? '') && l.attrs.href)) faltam.push('link rel=icon');
  r.push(res('CA21', faltam.length === 0, 'title, description, OG, Twitter, favicon e theme-color presentes', `faltam: ${faltam.join(', ')}`));

  const ogImg = meta['og:image'];
  if (ogImg) {
    if (ehPlaceholder(ogImg)) r.push(aviso('CA21', `og:image com placeholder (${ogImg}); defina content.siteUrl antes do release`));
    else {
      const absoluto = /^https:\/\/[^\s]+$/.test(ogImg);
      r.push(res('CA21', absoluto && ogImg.endsWith(`/${nicho}/og.png`), `og:image absoluto (${ogImg})`, `og:image deve ser URL https absoluta terminando em /${nicho}/og.png (atual: ${ogImg})`));
    }
  }
  for (const [k, esperado] of [['og:image:width', '1200'], ['og:image:height', '630']]) {
    if (k in meta) r.push(res('CA21', meta[k] === esperado, `${k} = ${esperado}`, `${k} = ${meta[k]} (esperado ${esperado})`));
  }
  if (meta['twitter:card'] && meta['twitter:card'] !== 'summary_large_image') r.push(falha('CA21', `twitter:card = ${meta['twitter:card']} (esperado summary_large_image)`));

  // CA25: links e scripts externos
  const permitidos = new Set([content.convite, content.politicaPrivacidade].filter(Boolean));
  const externos = [];
  const candidatos = [];
  for (const nome of ['a', 'link', 'script', 'img', 'source', 'iframe', 'video', 'audio', 'embed', 'object', 'form']) {
    for (const t of tags(nome)) {
      for (const atributo of ['src', 'href', 'srcset', 'action', 'data']) {
        const v = t.attrs[atributo];
        if (v && /^(https?:)?\/\//i.test(v.trim())) candidatos.push({ tag: nome, atributo, v: v.trim(), rel: t.attrs.rel ?? '' });
      }
    }
  }
  for (const c of candidatos) {
    if (permitidos.has(c.v)) continue;
    if (c.tag === 'link' && /(^|\s)canonical(\s|$)/.test(c.rel) && (!content.siteUrl || c.v.startsWith(content.siteUrl))) continue;
    externos.push(`<${c.tag} ${c.atributo}="${c.v}">`);
  }
  r.push(res('CA25', externos.length === 0, 'sem src/href externo além de convite e política', `recurso externo no HTML: ${externos.join(', ')}`));
  const prefetch = tags('link').filter((l) => /(preconnect|dns-prefetch|prefetch|prerender)/.test(l.attrs.rel ?? '') && /^(https?:)?\/\//i.test(l.attrs.href ?? ''));
  r.push(res('CA25', prefetch.length === 0, 'sem preconnect/dns-prefetch para domínio externo', `preconnect/dns-prefetch externo (vaza IP antes do consentimento): ${prefetch.map((l) => l.attrs.href).join(', ')}`));
  const csp = tags('meta').find((m) => (m.attrs['http-equiv'] ?? '').toLowerCase() === 'content-security-policy');
  r.push(csp ? ok('CA25', 'CSP presente em <meta>') : aviso('CA25', 'sem <meta http-equiv="Content-Security-Policy"> (o build deveria gerar)'));
  return r;
}

/** CA19: imagens e scripts. `tamanhoArquivo(src)` devolve bytes ou null. */
export function checkAssetsAttrs(html, tamanhoArquivo = () => null) {
  const r = [];
  const h = stripComments(html);
  const imgs = findTags(h, 'img');
  const semDim = imgs.filter((i) => !/^\d+$/.test(i.attrs.width ?? '') || !/^\d+$/.test(i.attrs.height ?? ''));
  r.push(res('CA19', semDim.length === 0, `${imgs.length} imagem(ns), todas com width/height`, `${semDim.length} <img> sem width/height numéricos`));
  const prio = imgs.filter((i) => 'fetchpriority' in i.attrs);
  r.push(res('CA19', prio.length <= 1, `fetchpriority em ${prio.length} imagem(ns)`, `fetchpriority em ${prio.length} imagens (só o LCP pode ter)`));
  // loading="eager" explícito = imagem pequena acima da dobra que não é o LCP (ex.: logo do cabeçalho).
  const semLazy = imgs.filter((i) => !('fetchpriority' in i.attrs) && i.attrs.loading !== 'lazy' && i.attrs.loading !== 'eager');
  r.push(res('CA19', semLazy.length === 0, 'imagens fora do LCP com loading="lazy" (ou "eager" explícito acima da dobra)', `${semLazy.length} <img> sem loading="lazy"/"eager" e sem fetchpriority`));
  for (const i of prio) {
    if (i.attrs.loading === 'lazy') r.push(falha('CA19', 'imagem LCP com loading="lazy"'));
    const bytes = tamanhoArquivo(i.attrs.src);
    if (bytes != null) r.push(res('CA19', bytes <= LIMITE_IMAGEM_LCP, `imagem LCP ${(bytes / 1024).toFixed(1)} KB`, `imagem LCP ${(bytes / 1024).toFixed(1)} KB > 60 KB`));
    if (!/\.(avif|webp)$/i.test(i.attrs.src ?? '')) r.push(falha('CA19', 'imagem LCP deve ser AVIF ou WebP'));
  }
  const scripts = findTags(h, 'script');
  const lentos = scripts.filter((s) => s.attrs.src && !('defer' in s.attrs) && s.attrs.type !== 'module' && !('async' in s.attrs));
  r.push(res('CA19', lentos.length === 0, 'scripts externos com defer/module', `${lentos.length} <script src> bloqueante(s) (sem defer, module ou async)`));
  const head = /<head[\s>][\s\S]*?<\/head>/i.exec(h)?.[0] ?? '';
  const inlineExec = findElements(h, 'script').filter((s) => !s.attrs.src && (!s.attrs.type || s.attrs.type === 'module' || /javascript/.test(s.attrs.type)));
  const noHead = inlineExec.filter((s) => head.includes(s.inner));
  r.push(res('CA19', inlineExec.length <= 1 && noHead.length === inlineExec.length, `${inlineExec.length} script inline executável (A/B no <head>)`, `scripts inline executáveis: ${inlineExec.length} (esperado no máx. 1, no <head>)`));
  return r;
}

/** CA6, CA23, CA24: conteúdo proibido. */
export function checkContent(html, content) {
  const r = [];
  const h = stripComments(html);
  const texto = visibleText(h);
  const metas = findTags(h, 'meta').map((m) => m.attrs.content ?? '').join(' ');
  const todoTexto = [texto, metas, ...coletarStrings(content)].join(' \n ');
  const semPlaceholders = (s) => s.replace(/\[[^\]]*\]/g, ' ');

  // CA6
  if (content.provaSocial == null) {
    const bloco = /(prova[-_ ]?social|data-prova|<blockquote|testimonial)/i.test(h);
    r.push(res('CA6', !bloco, 'provaSocial = null e nenhum bloco de prova social no HTML', 'provaSocial = null mas o HTML tem bloco de prova social/blockquote'));
  } else {
    r.push(content.provaSocial.fonte ? ok('CA6', 'provaSocial com fonte') : falha('CA6', 'provaSocial sem fonte verificável'));
  }
  const numeros = [...semPlaceholders(texto).matchAll(/\d[\d.,]*\s*(?:mil\b|membros?\b|pessoas?\b|participantes?\b)|\bmil\s+(?:membros|pessoas)\b/gi)].map((m) => m[0]);
  r.push(res('CA6', numeros.length === 0, 'sem número de membros/pessoas/mil no texto', `número possivelmente inventado: ${numeros.join(' | ')}`));
  const dep = /depoiment/i.test(semPlaceholders(texto));
  r.push(content.provaSocial == null && dep ? falha('CA6', 'a palavra "depoimento" aparece no texto sem provaSocial') : ok('CA6', 'sem "depoimento" no texto'));
  r.push(aviso('CA6', 'revisão humana do content/pet.json pendente (nenhum dado inventado)'));

  // CA23
  const termos = findForbiddenTerms(todoTexto);
  r.push(res('CA23', termos.length === 0, 'sem termos de urgência/escassez/promessa absoluta', `termos proibidos: ${termos.join(', ')}`));

  // CA24
  const suspeitos = [];
  const checa = (onde, valor) => {
    const n = normalize(valor ?? '');
    for (const loja of STORE_NAMES) if (n && n.includes(loja)) suspeitos.push(`${onde}="${valor}"`);
  };
  for (const i of findTags(h, 'img')) {
    checa('img alt', i.attrs.alt); checa('img aria-label', i.attrs['aria-label']); checa('img id', i.attrs.id); checa('img src', i.attrs.src);
  }
  for (const s of findElements(h, 'svg')) {
    checa('svg aria-label', s.attrs['aria-label']); checa('svg id', s.attrs.id);
    for (const t of findElements(s.inner, 'title')) checa('svg title', textoDe(t.inner));
  }
  r.push(res('CA24', suspeitos.length === 0, 'sem logos/selos de loja (alt, aria-label, id, src)', `nome de loja em imagem/SVG: ${suspeitos.join(', ')}`));
  r.push(aviso('CA24', 'revisão do designer pendente (nenhum logo de loja)'));
  return r;
}

/** CA18: soma do peso inicial. `arquivos` = [{nome, bytes, gzip}]. */
export function checkPeso(arquivos) {
  const total = arquivos.reduce((s, a) => s + a.bytes, 0);
  const gz = arquivos.reduce((s, a) => s + (a.gzip ?? 0), 0);
  const detalhe = arquivos.map((a) => `${a.nome} ${(a.bytes / 1024).toFixed(1)} KB`).join(', ');
  return [res('CA18', total <= LIMITE_PESO_INICIAL, `peso inicial ${(total / 1024).toFixed(1)} KB (gzip ${(gz / 1024).toFixed(1)} KB) <= 200 KB [${detalhe}]`, `peso inicial ${(total / 1024).toFixed(1)} KB > 200 KB [${detalhe}]`)];
}

/** CA21: og.png. */
export function checkOgPng(buf) {
  if (!buf) return [falha('CA21', 'og.png ausente (rode node scripts/og.mjs <nicho>)')];
  const dim = readPngSize(buf);
  const r = [];
  r.push(res('CA21', dim && dim.width === 1200 && dim.height === 630, 'og.png 1200x630', `og.png ${dim ? `${dim.width}x${dim.height}` : 'não é PNG válido'} (esperado 1200x630)`));
  r.push(res('CA21', buf.length <= LIMITE_OG, `og.png ${(buf.length / 1024).toFixed(1)} KB <= 300 KB`, `og.png ${(buf.length / 1024).toFixed(1)} KB > 300 KB`));
  return r;
}

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function listar(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => statSync(join(dir, f)).isFile()) : [];
}

/**
 * CA18: arquivos de dist/assets que entram no peso inicial, percorrendo subpastas (js/, fonts/…).
 * Ficam de fora as licenças das fontes (OFL*.txt) e img/ (imagens têm limite próprio no CA19 e carregam lazy).
 * @returns {{nome: string, bytes: number, gzip: number}[]}  nome relativo a dist/ ("assets/js/ui.js")
 */
export function arquivosDePeso(assetsDir) {
  const out = [];
  const andar = (dir, rel) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).sort()) {
      const abs = join(dir, f);
      const r = rel ? `${rel}/${f}` : f;
      if (statSync(abs).isDirectory()) {
        if (r !== 'img') andar(abs, r);
      } else if (!/^OFL.*\.txt$/.test(f)) {
        const buf = readFileSync(abs);
        out.push({ nome: `assets/${r}`, bytes: buf.length, gzip: /\.woff2?$/i.test(f) ? buf.length : gzipSync(buf).length });
      }
    }
  };
  andar(assetsDir, '');
  return out;
}

export function rodar(nicho = 'pet', raiz = RAIZ) {
  const caminhos = {
    html: join(raiz, 'dist', nicho, 'index.html'),
    assets: join(raiz, 'dist', 'assets'),
    content: join(raiz, 'content', `${nicho}.json`),
    css: join(raiz, 'src', 'styles.css'),
  };
  const ausentes = [];
  if (!existsSync(caminhos.html)) ausentes.push(`dist/${nicho}/index.html`);
  if (listar(caminhos.assets).length === 0) ausentes.push('dist/assets/* (vazio ou ausente)');
  if (!existsSync(caminhos.content)) ausentes.push(`content/${nicho}.json`);
  if (!existsSync(caminhos.css)) ausentes.push('src/styles.css');
  if (ausentes.length) return { ausentes, resultados: [] };

  let content;
  try {
    content = JSON.parse(readFileSync(caminhos.content, 'utf8'));
  } catch (e) {
    return { ausentes: [`content/${nicho}.json inválido: ${e.message}`], resultados: [] };
  }
  const html = readFileSync(caminhos.html, 'utf8');
  const css = readFileSync(caminhos.css, 'utf8');
  const dirNicho = join(raiz, 'dist', nicho);

  const tamanho = (src) => {
    if (!src || /^(https?:)?\/\//.test(src)) return null;
    const p = resolve(dirNicho, src);
    return existsSync(p) ? statSync(p).size : null;
  };

  const pesoArquivos = [{ nome: `${nicho}/index.html`, bytes: Buffer.byteLength(html), gzip: gzipSync(html).length }, ...arquivosDePeso(caminhos.assets)];
  const ogPath = join(dirNicho, 'og.png');

  const resultados = [
    ...checkCtas(html, content),
    ...checkContrast(css, html),
    ...checkCss(css),
    ...checkDocument(html, content, nicho),
    ...checkAssetsAttrs(html, tamanho),
    ...checkContent(html, content),
    ...checkPeso(pesoArquivos),
    ...checkOgPng(existsSync(ogPath) ? readFileSync(ogPath) : null),
  ];
  return { ausentes: [], resultados };
}

function principal() {
  const nicho = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 'pet';
  const { ausentes, resultados } = rodar(nicho);
  if (ausentes.length) {
    console.error('check: não consigo verificar, faltam entradas:');
    for (const a of ausentes) console.error(`  - ${a}`);
    console.error('Rode `node build.mjs` antes (e confira content/ e src/).');
    process.exit(2);
  }
  const ordem = (a, b) => Number(a.ca.slice(2)) - Number(b.ca.slice(2));
  const rotulo = { ok: 'OK    ', falha: 'FALHA ', aviso: 'AVISO ' };
  for (const x of [...resultados].sort(ordem)) console.log(`${rotulo[x.nivel]} ${x.ca.padEnd(4)} ${x.msg}`);
  const falhas = resultados.filter((x) => x.nivel === 'falha').length;
  const avisos = resultados.filter((x) => x.nivel === 'aviso').length;
  console.log(`\ncheck (${nicho}): ${resultados.length - falhas - avisos} ok, ${falhas} falha(s), ${avisos} aviso(s)`);
  process.exit(falhas ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) principal();
