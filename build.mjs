// Build das landing pages estáticas: content/<nicho>.json + src/template.html -> dist/<nicho>/index.html
//
// Uso:  node build.mjs [nicho] [--release]
//   sem nicho: constrói todos os content/*.json. --release falha se restar placeholder [..] (exceto slots
//   de imagem "[IMAGEM: ..]", que só ficam na lista de pendências), se o convite não casar com
//   ^https://chat\.whatsapp\.com/[A-Za-z0-9]+$ ou se siteUrl/política/IDs de analytics forem placeholder.
//
// ===================================================================================================
// SINTAXE DA ENGINE (src/template.html)
// ===================================================================================================
//   {{a.b}}                   valor escapado para HTML (& < > " '). Variável inexistente = ERRO de build.
//   {{{nome}}}                valor SEM escape, só para as variáveis de build listadas em RAW_PERMITIDOS.
//   {{#each lista}}..{{/each}} repete para cada item de um array (null = vazio). Dentro:
//                               {{this}}            item (string/número), escapado
//                               {{this.campo}}      campo do item (aceita caminho: this.ico.relogio)
//                               {{@index}}          índice base 0      {{@index1}} índice base 1
//                             nomes sem "this." são buscados no item e depois no contexto raiz. Pode aninhar.
//   {{#if chave}}..{{else}}..{{/if}}   verdadeiro = não vazio/null/false/0. {{else}} é opcional.
//                             Caminho que não existe em lugar nenhum = ERRO (pega typo); caminho
//                             que existe mas está vazio/null (ex.: provaSocial, img.hero) = falso.
//
// ===================================================================================================
// ESQUEMA DE content/<nicho>.json
// ===================================================================================================
//   nicho               "pet" (= nome do arquivo; ^[a-z0-9-]+$)
//   siteUrl             "https://dominio" (barra final é removida) -> canonical, og:url e og:image absolutos
//   nomeGrupo           texto
//   logo                opcional: {src, alt, width, height, favicon, appleTouchIcon}; os 3 arquivos ficam em src/img/.
//                       src (WebP) vai ao cabeçalho ao lado do nome (width/height = tamanho exibido); favicon (PNG
//                       48x48) e appleTouchIcon (PNG 180x180) são copiados para dist/<nicho>/favicon.png e
//                       apple-touch-icon.png. Ausente (ou null): sem <img> no cabeçalho, favicon.svg gerado e
//                       apple-touch-icon.png feito pelo scripts/og.mjs (comportamento anterior).
//   convite             https://chat.whatsapp.com/CODIGO (placeholder entre colchetes só com aviso)
//   politicaPrivacidade URL https
//   corDestaque         {accent, onAccent}  hex #RRGGBB
//   meta                {title, description}
//   ab                  {headlines[1..3], ctas[1..3], padrao{h, c}}   (textos de CTA vêm SÓ daqui)
//   subtitulo, microcopy
//   ui                  {beneficiosTitulo, passosTitulo, confiancaTitulo, ctaFinalTitulo, previaLegenda, linkPolitica,
//                        preferenciasCookies, previaBadge, ariaAtalho, ariaCookies, banner{texto, aceitar, recusar, salvo}}
//                       + heroEtiqueta (opcional): etiqueta acima do h1; ausente ou "" = não renderiza.
//   beneficios[3]       {titulo, texto, icone: relogio|etiqueta|balao}
//   passos[3]           {titulo, texto}
//   exemploOferta       {ativo, texto}  (texto aceita \n para quebrar linha; rótulo em ui.previaBadge)
//   confianca           {pontos[], detalhes[{pergunta, resposta}]}
//   provaSocial         null (ou objeto com "fonte" preenchida: o dono fornece dado real)
//   imagens[]           {slot: hero|preview, src, alt, width, height}; src "[IMAGEM: ..]" = não renderiza;
//                       senão é um arquivo de src/img/ (copiado para dist/assets/img/). Hoje o template só
//                       renderiza o slot preview (thumb da prévia); o slot hero ainda não é usado. O preview pode
//                       reaproveitar o logo (ex.: "pet/logo.webp"), desde que o arquivo exista em src/img/.
//   analytics           {ga4: G-XXXX, clarity: id}  ("" desliga; placeholder desliga e avisa)
//   rodape              {avisoAfiliados}
//
// ===================================================================================================
// VARIÁVEIS INJETADAS PELO BUILD (além de todas as chaves do content)
// ===================================================================================================
//   {{assets}}            "../assets"  (styles em {{assets}}/styles.css, js em {{assets}}/js/<arq>.js,
//                         fontes em dist/assets/fonts/{fredoka,nunito}-latin-wght-normal.woff2 + OFL-*.txt, imagens em {{assets}}/img/)
//   Os 5 nomes abaixo (lista fechada RAW_PERMITIDOS) saem SEM escape com {{x}} ou {{{x}}}; nenhum outro sai.
//   {{csp}}               valor do atributo content da meta CSP
//   {{abInline}}          src/js/ab-inline.js com o marcador __AB__ (uma ocorrência) trocado por {"h":N,"c":M,"padrao":{"h":1,"c":1}}; o template envolve com <script>; hash na CSP
//   {{accentStyle}}     <style>:root{--c-accent:..;--c-on-accent:..}</style> completo (hash na CSP)
//   {{fontPreload}}     <link rel="preload" as="font" ..> só da Fredoka (h1/LCP), ou "" se faltar alguma fonte
//   {{cfgJson}}         JSON seguro p/ <script type="application/json" id="cfg"> : {ga4, clarity, niche}
//                         (ids placeholder viram "")
//   {{abH}} {{abC}}       variante padrão (content.ab.padrao.h / .c) para <html data-h data-c>
//   {{ano}}               ano corrente (copyright)
//   {{canonical}}         siteUrl + "/<nicho>/"      {{ogImage}} siteUrl + "/<nicho>/og.png"
//   {{ogUrl}}             = canonical
//   {{logo}}              {src (já com ../assets/img/), alt, width, height} ou null (use {{#if logo}})
//   {{img.hero}} {{img.preview}}   {src, alt, width, height} ou ausente (use {{#if img.preview}}); src já com ../assets/img/
//   cada beneficios[i].ico.<icone> = true (ex.: {{#if this.ico.relogio}}<svg>..</svg>{{/if}})
//
// Saída: dist/<nicho>/{index.html, favicon.svg, og.html} (+ favicon.png e apple-touch-icon.png com logo); dist/assets/{styles.css, js/*.js (menos
// ab-inline.js, que vai inline), fonts/*, img/*}. og.png, og.png.sha256 e apple-touch-icon.png (scripts/og.mjs)
// são preservados. Build de um nicho só não apaga dist/assets/img/ (imagens dos outros nichos); o build de todos
// recria a pasta. --release também exige dist/<nicho>/og.png gerado a partir do og.html atual (og.png.sha256).
// ===================================================================================================
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
// Regex única dos IDs (S5): a mesma que o navegador usa. consent.js só roda initConsent com window/document.
import { GA4_RE, CLARITY_RE } from './src/js/consent.js';

const RAIZ_PADRAO = path.dirname(fileURLToPath(import.meta.url));

export const CONVITE_RE = /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/;
const NICHO_RE = /^[a-z0-9-]+$/;
const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const ICONES = ['relogio', 'etiqueta', 'balao'];
const SLOTS = ['hero', 'preview'];
const RAW_PERMITIDOS = new Set(['csp', 'abInline', 'accentStyle', 'fontPreload', 'cfgJson']);
// Fredoka (títulos, h1 = LCP) recebe preload; Nunito (texto) carrega pelo @font-face do styles.css.
const FONTE_H1 = 'fredoka-latin-wght-normal.woff2';
const FONTES = [FONTE_H1, 'nunito-latin-wght-normal.woff2'];
const LICENCA_FONTE_RE = /^OFL.*\.txt$/;
const PLACEHOLDER_RE = /\[[^\[\]\n]+\]/;
const SCRIPT_PERIGOSO_RE = /<\/script|<!--/i;

// ---------------------------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------------------------
export function escapeHtml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function linhaDe(texto, pos) {
  return texto.slice(0, pos).split('\n').length;
}

// Filhos de um {{#if}} depois de {{else}} vão para `senao`.
function filhosAtuais(no) {
  return no.emSenao ? no.senao : no.filhos;
}

function analisarComElse(template, nomeArquivo) {
  const re = /\{\{\{\s*([^{}]*?)\s*\}\}\}|\{\{\s*([^{}]*?)\s*\}\}/g;
  const raiz = { tipo: 'bloco', filhos: [] };
  const pilha = [raiz];
  let ultimo = 0;
  let m;
  const erro = (msg, pos) => new Error(`${nomeArquivo}:${linhaDe(template, pos)}: ${msg}`);
  const alvo = () => filhosAtuais(pilha[pilha.length - 1]);
  while ((m = re.exec(template))) {
    if (m.index > ultimo) alvo().push({ tipo: 'texto', valor: template.slice(ultimo, m.index) });
    ultimo = m.index + m[0].length;
    const bruto = m[1] !== undefined;
    const corpo = bruto ? m[1] : m[2];
    const atual = pilha[pilha.length - 1];
    if (bruto) {
      if (!corpo) throw erro('{{{ }}} vazio', m.index);
      alvo().push({ tipo: 'var', caminho: corpo, bruto: true, pos: m.index });
    } else if (corpo.startsWith('#each ') || corpo.startsWith('#if ')) {
      const [kw, ...resto] = corpo.split(/\s+/);
      if (resto.length !== 1) throw erro(`sintaxe inválida em {{${corpo}}}`, m.index);
      const no = { tipo: kw === '#each' ? 'each' : 'if', caminho: resto[0], filhos: [], senao: null, pos: m.index };
      alvo().push(no);
      pilha.push(no);
    } else if (corpo === 'else') {
      if (atual.tipo !== 'if' || atual.senao) throw erro('{{else}} fora de {{#if}}', m.index);
      atual.senao = [];
      atual.emSenao = true;
    } else if (corpo === '/each' || corpo === '/if') {
      const esperado = corpo === '/each' ? 'each' : 'if';
      if (pilha.length === 1 || atual.tipo !== esperado) throw erro(`{{${corpo}}} sem abertura correspondente`, m.index);
      delete atual.emSenao;
      pilha.pop();
    } else if (!corpo) {
      throw erro('{{ }} vazio', m.index);
    } else if (corpo.startsWith('#') || corpo.startsWith('/')) {
      throw erro(`bloco desconhecido {{${corpo}}}`, m.index);
    } else {
      alvo().push({ tipo: 'var', caminho: corpo, bruto: false, pos: m.index });
    }
  }
  if (ultimo < template.length) alvo().push({ tipo: 'texto', valor: template.slice(ultimo) });
  if (pilha.length > 1) {
    const aberto = pilha[pilha.length - 1];
    throw erro(`bloco {{#${aberto.tipo} ${aberto.caminho}}} não foi fechado`, aberto.pos);
  }
  return raiz;
}

// escopos: [{ dados, indice? }], do mais externo (raiz) ao mais interno.
function resolver(caminho, escopos, { permitirVazio }) {
  const partes = caminho.split('.');
  const topo = escopos[escopos.length - 1];
  let atual;
  let resto = partes;
  if (partes[0] === '@index' || partes[0] === '@index1') {
    if (topo.indice === undefined) throw new Error(`{{${caminho}}} usado fora de {{#each}}`);
    if (partes.length > 1) throw new Error(`{{${caminho}}} inválido`);
    return partes[0] === '@index' ? topo.indice : topo.indice + 1;
  }
  if (partes[0] === 'this') {
    if (topo.indice === undefined) throw new Error(`{{${caminho}}} usado fora de {{#each}}`);
    atual = topo.dados;
    resto = partes.slice(1);
  } else {
    let achou = false;
    for (let i = escopos.length - 1; i >= 0; i--) {
      const d = escopos[i].dados;
      if (d !== null && typeof d === 'object' && Object.prototype.hasOwnProperty.call(d, partes[0])) {
        atual = d[partes[0]];
        achou = true;
        break;
      }
    }
    if (!achou) throw new Error(`variável não encontrada: {{${caminho}}}`);
    resto = partes.slice(1);
  }
  for (const p of resto) {
    if (atual === null || atual === undefined || typeof atual !== 'object') {
      atual = undefined;
      break;
    }
    atual = Object.prototype.hasOwnProperty.call(atual, p) ? atual[p] : undefined;
  }
  if (atual === undefined && !permitirVazio) throw new Error(`variável não encontrada: {{${caminho}}}`);
  return atual;
}

function verdadeiro(v) {
  if (Array.isArray(v)) return v.length > 0;
  return !(v === undefined || v === null || v === false || v === '' || v === 0);
}

function executar(no, escopos, saida, nomeArquivo, template) {
  for (const f of no) {
    if (f.tipo === 'texto') { saida.push(f.valor); continue; }
    try {
      if (f.tipo === 'var') {
        const rawAuto = RAW_PERMITIDOS.has(f.caminho);
        if (f.bruto && !rawAuto) {
          throw new Error(`{{{${f.caminho}}}}} não é permitido: só ${[...RAW_PERMITIDOS].join(', ')} aceitam saída sem escape`);
        }
        const v = resolver(f.caminho, escopos, { permitirVazio: false });
        if (v === null || typeof v === 'object') throw new Error(`{{${f.caminho}}} não é texto (objeto, lista ou null)`);
        saida.push(rawAuto ? String(v) : escapeHtml(v));
      } else if (f.tipo === 'if') {
        const v = resolver(f.caminho, escopos, { permitirVazio: true });
        executar(verdadeiro(v) ? f.filhos : (f.senao || []), escopos, saida, nomeArquivo, template);
      } else if (f.tipo === 'each') {
        const v = resolver(f.caminho, escopos, { permitirVazio: true });
        if (v === undefined || v === null) continue;
        if (!Array.isArray(v)) throw new Error(`{{#each ${f.caminho}}} exige lista`);
        v.forEach((item, indice) => {
          executar(f.filhos, [...escopos, { dados: item, indice }], saida, nomeArquivo, template);
        });
      }
    } catch (e) {
      if (e.location) throw e;
      const err = new Error(`${nomeArquivo}:${linhaDe(template, f.pos)}: ${e.message}`);
      err.location = true;
      throw err;
    }
  }
}

export function render(template, contexto, nomeArquivo = 'template') {
  const arvore = analisarComElse(template, nomeArquivo);
  const saida = [];
  executar(arvore.filhos, [{ dados: contexto }], saida, nomeArquivo, template);
  return saida.join('');
}

// ---------------------------------------------------------------------------------------------
// Validação do content
// ---------------------------------------------------------------------------------------------
export function ehPlaceholder(v) {
  return typeof v === 'string' && /^\s*\[.*\]\s*$/s.test(v);
}

function percorrer(valor, caminho, visitar, pular) {
  if (pular && pular(caminho, valor)) return;
  if (typeof valor === 'string') visitar(caminho, valor);
  else if (Array.isArray(valor)) valor.forEach((v, i) => percorrer(v, `${caminho}[${i}]`, visitar, pular));
  else if (valor && typeof valor === 'object') {
    for (const [k, v] of Object.entries(valor)) percorrer(v, caminho ? `${caminho}.${k}` : k, visitar, pular);
  }
}

function urlHttps(v) {
  try { return new URL(v).protocol === 'https:'; } catch { return false; }
}

const naoVazio = (v) => typeof v === 'string' && v.trim() !== '';
const ARQUIVO_IMG_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;
const arquivoImgValido = (v) => typeof v === 'string' && ARQUIVO_IMG_RE.test(v) && !v.split('/').includes('..');

export function validarContent(c, { release = false, nomeArquivo = null } = {}) {
  const erros = [];
  const avisos = [];
  const pendencias = [];
  const e = (m) => erros.push(m);
  if (!c || typeof c !== 'object' || Array.isArray(c)) return { erros: ['content deve ser um objeto JSON'], avisos, pendencias };

  if (!naoVazio(c.nicho) || !NICHO_RE.test(c.nicho)) e('nicho: obrigatório, só [a-z0-9-]');
  else if (nomeArquivo && c.nicho !== nomeArquivo) e(`nicho "${c.nicho}" difere do nome do arquivo "${nomeArquivo}"`);

  for (const k of ['nomeGrupo', 'subtitulo', 'microcopy']) if (!naoVazio(c[k])) e(`${k}: texto obrigatório`);

  // convite (CA10): sem encurtador, sem redirecionamento
  if (!naoVazio(c.convite)) e('convite: obrigatório');
  else if (!ehPlaceholder(c.convite) && !CONVITE_RE.test(c.convite)) {
    e('convite: deve casar com ^https://chat\\.whatsapp\\.com/[A-Za-z0-9]+$ (sem encurtador nem parâmetros)');
  }

  // URLs https
  if (!naoVazio(c.siteUrl)) e('siteUrl: obrigatório');
  else if (!ehPlaceholder(c.siteUrl)) {
    if (!urlHttps(c.siteUrl)) e('siteUrl: deve ser https://…');
    else if (/[?#]/.test(c.siteUrl)) e('siteUrl: sem query nem fragmento');
  }
  if (!naoVazio(c.politicaPrivacidade)) e('politicaPrivacidade: obrigatório');
  else if (!ehPlaceholder(c.politicaPrivacidade) && !urlHttps(c.politicaPrivacidade)) e('politicaPrivacidade: deve ser https://…');

  // cor
  if (!c.corDestaque || !HEX_RE.test(c.corDestaque.accent || '') || !HEX_RE.test(c.corDestaque.onAccent || '')) {
    e('corDestaque: {accent, onAccent} em #RRGGBB');
  }

  // meta
  if (!c.meta || !naoVazio(c.meta.title) || !naoVazio(c.meta.description)) e('meta: {title, description} obrigatórios');

  // A/B (CA16)
  const ab = c.ab;
  if (!ab || typeof ab !== 'object') e('ab: obrigatório');
  else {
    for (const k of ['headlines', 'ctas']) {
      if (!Array.isArray(ab[k]) || ab[k].length < 1 || ab[k].length > 3 || !ab[k].every(naoVazio)) {
        e(`ab.${k}: lista de 1 a 3 textos não vazios`);
      }
    }
    const p = ab.padrao;
    if (!p || typeof p !== 'object' || Array.isArray(p) || !Number.isInteger(p.h) || !Number.isInteger(p.c)) e('ab.padrao: {h, c} inteiros');
    else if (Object.keys(p).some((k) => k !== 'h' && k !== 'c')) e('ab.padrao: só as chaves h e c');
    else {
      if (Array.isArray(ab.headlines) && (p.h < 1 || p.h > ab.headlines.length)) e('ab.padrao.h fora da lista de headlines');
      if (Array.isArray(ab.ctas) && (p.c < 1 || p.c > ab.ctas.length)) e('ab.padrao.c fora da lista de CTAs');
    }
  }

  // listas de 3
  for (const [k, campos] of [['beneficios', ['titulo', 'texto', 'icone']], ['passos', ['titulo', 'texto']]]) {
    if (!Array.isArray(c[k]) || c[k].length !== 3) e(`${k}: exatamente 3 itens`);
    else c[k].forEach((it, i) => {
      for (const f of campos) if (!it || !naoVazio(it[f])) e(`${k}[${i}].${f}: obrigatório`);
      if (k === 'beneficios' && it && !ICONES.includes(it.icone)) e(`beneficios[${i}].icone: um de ${ICONES.join(', ')}`);
    });
  }

  // exemplo de oferta
  const ex = c.exemploOferta;
  if (!ex || typeof ex.ativo !== 'boolean') e('exemploOferta: {ativo: boolean, …} obrigatório');
  else if (ex.ativo) {
    if (!naoVazio(ex.texto)) e('exemploOferta.texto: obrigatório');
  }

  // confiança
  if (!c.confianca || !Array.isArray(c.confianca.pontos) || c.confianca.pontos.length < 1 || !c.confianca.pontos.every(naoVazio)) {
    e('confianca.pontos: lista de textos');
  }
  if (!c.confianca || !Array.isArray(c.confianca.detalhes) || !c.confianca.detalhes.every((d) => d && naoVazio(d.pergunta) && naoVazio(d.resposta))) {
    e('confianca.detalhes: lista de {pergunta, resposta}');
  }

  // prova social (CA6): sem dado real, sem bloco
  if (c.provaSocial !== null && c.provaSocial !== undefined) {
    if (typeof c.provaSocial !== 'object' || Array.isArray(c.provaSocial) || !naoVazio(c.provaSocial.fonte)) {
      e('provaSocial: use null ou um objeto com "fonte" preenchida (dado real fornecido pelo dono)');
    }
  }

  // imagens
  if (!Array.isArray(c.imagens)) e('imagens: lista (pode ser vazia)');
  else c.imagens.forEach((im, i) => {
    if (!im || !SLOTS.includes(im.slot)) { e(`imagens[${i}].slot: um de ${SLOTS.join(', ')}`); return; }
    if (typeof im.src !== 'string' || !im.src) { e(`imagens[${i}].src: obrigatório`); return; }
    if (im.src.startsWith('[IMAGEM:')) { pendencias.push(`imagens[${i}] (${im.slot}): ${im.src}`); return; }
    if (!arquivoImgValido(im.src)) e(`imagens[${i}].src: nome de arquivo inválido`);
    if (typeof im.alt !== 'string') e(`imagens[${i}].alt: obrigatório (use "" se decorativa)`);
    if (!Number.isInteger(im.width) || !Number.isInteger(im.height) || im.width <= 0 || im.height <= 0) e(`imagens[${i}]: width/height inteiros positivos`);
  });

  // logo (opcional)
  const lg = c.logo;
  if (lg !== null && lg !== undefined) {
    if (typeof lg !== 'object' || Array.isArray(lg)) e('logo: objeto {src, alt, width, height, favicon, appleTouchIcon} ou ausente');
    else {
      if (!arquivoImgValido(lg.src) || !/\.webp$/i.test(lg.src)) e('logo.src: arquivo .webp de src/img/');
      if (!arquivoImgValido(lg.favicon) || !/\.png$/i.test(lg.favicon)) e('logo.favicon: arquivo .png de src/img/');
      if (!arquivoImgValido(lg.appleTouchIcon) || !/\.png$/i.test(lg.appleTouchIcon)) e('logo.appleTouchIcon: arquivo .png de src/img/');
      if (typeof lg.alt !== 'string') e('logo.alt: obrigatório (use "" quando o nome do grupo está ao lado)');
      if (!Number.isInteger(lg.width) || !Number.isInteger(lg.height) || lg.width <= 0 || lg.height <= 0) e('logo: width/height inteiros positivos');
    }
  }

  // analytics
  const an = c.analytics;
  if (!an || typeof an !== 'object') e('analytics: {ga4, clarity} obrigatório ("" desliga)');
  else {
    for (const [k, re] of [['ga4', GA4_RE], ['clarity', CLARITY_RE]]) {
      if (typeof an[k] !== 'string') e(`analytics.${k}: texto ("" desliga)`);
      else if (an[k] !== '' && !ehPlaceholder(an[k]) && !re.test(an[k])) e(`analytics.${k}: formato inválido (${re})`);
    }
  }

  for (const [k, campos] of [
    ['ui', ['beneficiosTitulo', 'passosTitulo', 'confiancaTitulo', 'ctaFinalTitulo', 'previaLegenda', 'previaBadge', 'linkPolitica', 'preferenciasCookies', 'ariaAtalho', 'ariaCookies']],
    ['ui.banner', ['texto', 'aceitar', 'recusar', 'salvo']],
    ['rodape', ['avisoAfiliados']],
  ]) {
    for (const f of campos) if (!naoVazio(k.split('.').reduce((o, p) => (o ? o[p] : undefined), c)?.[f])) e(`${k}.${f}: obrigatório`);
  }
  if (c.ui && typeof c.ui === 'object' && c.ui.heroEtiqueta !== undefined) {
    const et = c.ui.heroEtiqueta;
    if (typeof et !== 'string') e('ui.heroEtiqueta: texto (opcional; ausente ou "" não renderiza)');
    else if (et !== '' && et.trim() === '') e('ui.heroEtiqueta: só espaços (use "" ou remova a chave para não renderizar)');
  }

  // placeholders
  const placeholders = [];
  percorrer(c, '', (caminho, v) => {
    if (v.startsWith('[IMAGEM:')) return;
    if (PLACEHOLDER_RE.test(v)) placeholders.push(caminho);
  }, (caminho, v) => caminho === 'exemploOferta' && v && v.ativo === false);
  for (const p of placeholders) {
    if (release) e(`placeholder pendente em ${p} (--release exige valor real)`);
    else avisos.push(`placeholder em ${p}`);
  }

  return { erros, avisos, pendencias };
}

// ---------------------------------------------------------------------------------------------
// Peças geradas
// ---------------------------------------------------------------------------------------------
const sha = (texto) => `'sha256-${crypto.createHash('sha256').update(texto, 'utf8').digest('base64')}'`;

/** Hash (hex) do og.html usado para gerar o og.png; scripts/og.mjs grava em og.png.sha256 e o --release confere. */
export const hashOgHtml = (texto) => crypto.createHash('sha256').update(texto, 'utf8').digest('hex');

export function montarCsp({ hashScript, hashStyle, ga4, clarity }) {
  const script = ["'self'", hashScript];
  const connect = ["'self'"];
  const img = ["'self'", 'data:'];
  if (ga4) {
    script.push('https://www.googletagmanager.com');
    connect.push('https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com');
    img.push('https://*.google-analytics.com', 'https://www.googletagmanager.com');
  }
  if (clarity) {
    script.push('https://*.clarity.ms');
    connect.push('https://*.clarity.ms', 'https://c.bing.com');
    img.push('https://*.clarity.ms', 'https://c.bing.com');
  }
  return [
    "default-src 'self'",
    `script-src ${script.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    `img-src ${img.join(' ')}`,
    `style-src 'self' ${hashStyle}`,
    "font-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

// JSON seguro dentro de <script>: nunca fecha a tag nem quebra linha unicode.
export function jsonSeguro(obj) {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function gerarFavicon(accent, onAccent) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${accent}"/><g fill="${onAccent}"><ellipse cx="20" cy="26" rx="5" ry="6.5"/><ellipse cx="44" cy="26" rx="5" ry="6.5"/><ellipse cx="29" cy="16" rx="4.5" ry="6"/><ellipse cx="35" cy="16" rx="4.5" ry="6"/><path d="M32 30c-8 0-15 8-15 14 0 4 3 6 7 6 3 0 5-1 8-1s5 1 8 1c4 0 7-2 7-6 0-6-7-14-15-14z"/></g></svg>\n`;
}

export function gerarOgHtml(c, headline, temFonte) {
  // Identidade laranja: fundo creme, texto marrom, Fredoka no título e Nunito no nome; sem faixa lateral.
  const fonte = temFonte
    ? `@font-face{font-family:Fredoka;src:url("../assets/fonts/${FONTES[0]}") format("woff2");font-weight:300 700}`
      + `@font-face{font-family:Nunito;src:url("../assets/fonts/${FONTES[1]}") format("woff2");font-weight:200 1000}`
    : '';
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>OG ${escapeHtml(c.nicho)}</title>
<style>${fonte}
html,body{margin:0;width:1200px;height:630px}
body{background:#FFF4E8;color:#2B1408;font-family:Nunito,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;display:flex;flex-direction:column;justify-content:center;padding:0 80px;box-sizing:border-box;position:relative;overflow:hidden}
.nome{display:flex;align-items:center;gap:20px;font-size:40px;font-weight:800;margin-bottom:40px}
.nome svg,.nome img{width:72px;height:72px;flex:none;border-radius:16px}
h1{font-family:Fredoka,Nunito,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:80px;line-height:1.1;margin:0;font-weight:700;max-width:1000px}
</style></head><body>
<div class="nome">${c.logo ? '<img src="apple-touch-icon.png" alt="" width="72" height="72">' : gerarFavicon(c.corDestaque.accent, c.corDestaque.onAccent).trim()}<span>${escapeHtml(c.nomeGrupo)}</span></div>
<h1>${escapeHtml(headline)}</h1>
</body></html>
`;
}

// ---------------------------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------------------------
function copiarPasta(origem, destino, filtro = () => true) {
  if (!fs.existsSync(origem)) return [];
  fs.mkdirSync(destino, { recursive: true });
  const copiados = [];
  for (const nome of fs.readdirSync(origem)) {
    const de = path.join(origem, nome);
    if (!fs.statSync(de).isFile() || !filtro(nome)) continue;
    fs.copyFileSync(de, path.join(destino, nome));
    copiados.push(nome);
  }
  return copiados;
}

/**
 * Constrói um ou todos os nichos. Não lança por erro de conteúdo: devolve { ok, erros, avisos, pendencias, nichos }.
 * opcoes: { raiz, nicho, release, saida, templatePath, jsDir, fontsDir, imgDir, stylesPath, contentDir }
 */
export function construir(opcoes = {}) {
  const raiz = opcoes.raiz || RAIZ_PADRAO;
  const contentDir = opcoes.contentDir || path.join(raiz, 'content');
  const saida = opcoes.saida || path.join(raiz, 'dist');
  const templatePath = opcoes.templatePath || path.join(raiz, 'src', 'template.html');
  const stylesPath = opcoes.stylesPath || path.join(raiz, 'src', 'styles.css');
  const jsDir = opcoes.jsDir || path.join(raiz, 'src', 'js');
  const fontsDir = opcoes.fontsDir || path.join(raiz, 'src', 'fonts');
  const imgDir = opcoes.imgDir || path.join(raiz, 'src', 'img');
  const release = !!opcoes.release;
  const res = { ok: false, erros: [], avisos: [], pendencias: [], nichos: [] };
  const falha = (m) => { res.erros.push(m); return res; };

  if (!fs.existsSync(templatePath)) {
    return falha(`template não encontrado: ${path.relative(raiz, templatePath)} (é entregue pela etapa 5 do plano; sem ele não há como renderizar)`);
  }
  const abInlinePath = path.join(jsDir, 'ab-inline.js');
  if (!fs.existsSync(abInlinePath)) return falha(`script inline não encontrado: ${path.relative(raiz, abInlinePath)} (etapa 6 do plano)`);
  if (!fs.existsSync(contentDir)) return falha(`pasta de conteúdo não encontrada: ${path.relative(raiz, contentDir)}`);

  let arquivos = fs.readdirSync(contentDir).filter((f) => f.endsWith('.json')).sort();
  if (opcoes.nicho) {
    if (!NICHO_RE.test(opcoes.nicho)) return falha(`nicho inválido: "${opcoes.nicho}"`);
    if (!arquivos.includes(`${opcoes.nicho}.json`)) return falha(`content/${opcoes.nicho}.json não existe`);
    arquivos = [`${opcoes.nicho}.json`];
  }
  if (arquivos.length === 0) return falha('nenhum content/*.json encontrado');

  const template = fs.readFileSync(templatePath, 'utf8');
  const abInlineJs = fs.readFileSync(abInlinePath, 'utf8');
  if (abInlineJs.split('__AB__').length !== 2) return falha('ab-inline.js deve conter o marcador __AB__ exatamente uma vez');
  if (SCRIPT_PERIGOSO_RE.test(abInlineJs)) return falha('ab-inline.js não pode conter "</script" nem "<!--"');
  const fontesFaltando = FONTES.filter((f) => !fs.existsSync(path.join(fontsDir, f)));
  const temFonte = fontesFaltando.length === 0;
  if (!temFonte) res.avisos.push(`fonte(s) ${fontesFaltando.join(', ')} ausente(s) em ${path.relative(raiz, fontsDir)}: sem fontes nem preload, a página usa a pilha de sistema`);

  // Valida tudo antes de escrever qualquer coisa.
  const preparados = [];
  for (const arq of arquivos) {
    const nome = arq.replace(/\.json$/, '');
    let c;
    try { c = JSON.parse(fs.readFileSync(path.join(contentDir, arq), 'utf8')); } catch (err) { res.erros.push(`content/${arq}: JSON inválido (${err.message})`); continue; }
    const v = validarContent(c, { release, nomeArquivo: nome });
    res.erros.push(...v.erros.map((m) => `content/${arq}: ${m}`));
    res.avisos.push(...v.avisos.map((m) => `content/${arq}: ${m}`));
    res.pendencias.push(...v.pendencias.map((m) => `content/${arq}: ${m}`));
    if (v.erros.length !== 0) continue;
    const ogHtml = gerarOgHtml(c, c.ab.headlines[c.ab.padrao.h - 1], temFonte);
    if (release) {
      // R5: o og.png publicado tem de ter sido gerado a partir deste og.html.
      const png = path.join(saida, nome, 'og.png');
      const marca = path.join(saida, nome, 'og.png.sha256');
      if (!fs.existsSync(png)) res.erros.push(`dist/${nome}/og.png ausente: rode \`node build.mjs ${nome} && node scripts/og.mjs ${nome}\` antes do --release`);
      else if (!fs.existsSync(marca) || fs.readFileSync(marca, 'utf8').trim() !== hashOgHtml(ogHtml)) {
        res.erros.push(`dist/${nome}/og.png desatualizado (não corresponde ao og.html atual): rode \`node build.mjs ${nome} && node scripts/og.mjs ${nome}\``);
      }
    }
    preparados.push({ nome, c, ogHtml });
  }
  if (res.erros.length) return res;

  const raizAssets = path.join(saida, 'assets');
  try {
    // Ativos compartilhados são recriados; img/ só no build de todos os nichos (R3).
    for (const sub of ['js', 'fonts', 'styles.css']) fs.rmSync(path.join(raizAssets, sub), { recursive: true, force: true });
    if (!opcoes.nicho) fs.rmSync(path.join(raizAssets, 'img'), { recursive: true, force: true });
    fs.mkdirSync(path.join(raizAssets, 'js'), { recursive: true });
    if (fs.existsSync(stylesPath)) fs.copyFileSync(stylesPath, path.join(raizAssets, 'styles.css'));
    else res.avisos.push(`${path.relative(raiz, stylesPath)} não existe: dist/assets/styles.css não gerado`);
    copiarPasta(jsDir, path.join(raizAssets, 'js'), (n) => n.endsWith('.js') && n !== 'ab-inline.js');
    if (temFonte) {
      copiarPasta(fontsDir, path.join(raizAssets, 'fonts'), (n) => FONTES.includes(n) || LICENCA_FONTE_RE.test(n));
    }

    for (const { nome, c, ogHtml } of preparados) {
      const nH = c.ab.headlines.length;
      const nC = c.ab.ctas.length;
      const ga4 = !ehPlaceholder(c.analytics.ga4) && c.analytics.ga4 ? c.analytics.ga4 : '';
      const clarity = !ehPlaceholder(c.analytics.clarity) && c.analytics.clarity ? c.analytics.clarity : '';

      // S2: só h/c (inteiros já validados), serializado com jsonSeguro; trava final contra fechar o <script>.
      const padrao = { h: c.ab.padrao.h, c: c.ab.padrao.c };
      const abTexto = abInlineJs.replace('__AB__', () => jsonSeguro({ h: nH, c: nC, padrao }));
      if (SCRIPT_PERIGOSO_RE.test(abTexto)) { res.erros.push('script inline de A/B não pode conter "</script" nem "<!--"'); continue; }
      const accentTexto = `:root{--c-accent:${c.corDestaque.accent};--c-on-accent:${c.corDestaque.onAccent}}`;
      const csp = montarCsp({ hashScript: sha(abTexto), hashStyle: sha(accentTexto), ga4, clarity });

      const img = {};
      for (const im of c.imagens) {
        if (im.src.startsWith('[IMAGEM:')) continue;
        const origem = path.join(imgDir, im.src);
        if (!fs.existsSync(origem)) { res.erros.push(`content/${nome}.json: imagem ${im.src} não existe em ${path.relative(raiz, imgDir)}`); continue; }
        const destino = path.join(raizAssets, 'img', im.src);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(origem, destino);
        img[im.slot] = { src: `../assets/img/${im.src}`, alt: im.alt, width: im.width, height: im.height };
      }
      let logo = null;
      if (c.logo) {
        for (const arq of [c.logo.src, c.logo.favicon, c.logo.appleTouchIcon]) {
          if (!fs.existsSync(path.join(imgDir, arq))) res.erros.push(`content/${nome}.json: logo ${arq} não existe em ${path.relative(raiz, imgDir)}`);
        }
        if (res.erros.length) continue;
        const destino = path.join(raizAssets, 'img', c.logo.src);
        fs.mkdirSync(path.dirname(destino), { recursive: true });
        fs.copyFileSync(path.join(imgDir, c.logo.src), destino);
        logo = { src: `../assets/img/${c.logo.src}`, alt: c.logo.alt, width: c.logo.width, height: c.logo.height };
      }
      if (res.erros.length) continue;

      const base = ehPlaceholder(c.siteUrl) ? c.siteUrl : c.siteUrl.replace(/\/+$/, '');
      const contexto = {
        ...c,
        beneficios: c.beneficios.map((b) => ({ ...b, ico: { [b.icone]: true } })),
        assets: '../assets',
        csp,
        abInline: abTexto,
        accentStyle: `<style>${accentTexto}</style>`,
        fontPreload: temFonte ? `<link rel="preload" href="../assets/fonts/${FONTE_H1}" as="font" type="font/woff2" crossorigin>` : '',
        cfgJson: jsonSeguro({ ga4, clarity, niche: c.nicho }),
        abH: padrao.h,
        abC: padrao.c,
        ano: String(new Date().getFullYear()),
        canonical: `${base}/${c.nicho}/`,
        ogUrl: `${base}/${c.nicho}/`,
        ogImage: `${base}/${c.nicho}/og.png`,
        img,
        logo,
      };

      let html;
      try { html = render(template, contexto, path.relative(raiz, templatePath)); } catch (err) { res.erros.push(err.message); continue; }

      const dir = path.join(saida, nome);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), html);
      fs.writeFileSync(path.join(dir, 'favicon.svg'), gerarFavicon(c.corDestaque.accent, c.corDestaque.onAccent));
      fs.writeFileSync(path.join(dir, 'og.html'), ogHtml);
      // Com logo, os ícones vêm prontos de src/img/ (o og.mjs não sobrescreve); sem logo, some o favicon.png antigo.
      if (c.logo) {
        fs.copyFileSync(path.join(imgDir, c.logo.favicon), path.join(dir, 'favicon.png'));
        fs.copyFileSync(path.join(imgDir, c.logo.appleTouchIcon), path.join(dir, 'apple-touch-icon.png'));
      } else fs.rmSync(path.join(dir, 'favicon.png'), { force: true });
      res.nichos.push(nome);
    }
  } catch (err) {
    res.erros.push(`falha ao gravar a saída: ${err.message}`);
  }
  res.ok = res.erros.length === 0;
  return res;
}

function main() {
  const args = process.argv.slice(2);
  const release = args.includes('--release');
  const nicho = args.find((a) => !a.startsWith('--'));
  const desconhecidas = args.filter((a) => a.startsWith('--') && a !== '--release');
  if (desconhecidas.length) { console.error(`Opção desconhecida: ${desconhecidas.join(' ')}`); process.exit(2); }
  const r = construir({ nicho, release });
  for (const a of r.avisos) console.warn(`AVISO: ${a}`);
  if (r.pendencias.length) {
    console.warn('PENDÊNCIAS (não bloqueiam):');
    for (const p of r.pendencias) console.warn(`  - ${p}`);
  }
  if (!r.ok) {
    for (const e of r.erros) console.error(`ERRO: ${e}`);
    process.exit(1);
  }
  console.log(`Build ${release ? 'de release ' : ''}ok: ${r.nichos.map((n) => `dist/${n}/`).join(', ')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
