/*
 * Consentimento (LGPD) e analytics — plano, Decisões 5 e 6. ÁREA SENSÍVEL.
 *
 * Regras:
 * - Nada de Google/Microsoft carrega, nem é pré-conectado, antes de "Aceitar".
 *   "Recusar" nunca carrega GA4 nem Clarity.
 * - Com consentimento: depois do `load` e em tempo ocioso, injeta gtag.js
 *   (GA4) e a tag do Clarity. GA4 só com analytics_storage; anúncios negados.
 * - A escolha fica só no localStorage do visitante: `consent.v1` =
 *   {"v":"granted"|"denied","t":"<ISO>"}. Sem dado pessoal. Escolha com
 *   mais de 12 meses (ou sem data válida) conta como ausente: pergunta de novo.
 * - Foco: ao escolher, volta ao botão do rodapé (se a abertura veio dele),
 *   senão ao último elemento focado fora do banner, senão ao <main tabindex=-1>.
 *   Reabrir pelo rodapé foca o primeiro botão do banner.
 * - Revogar (Aceitou e depois "Recusar"): consent update negado no gtag,
 *   apagamento dos cookies do Clarity, remoção dos cookies _ga*, _clck, _clsk
 *   e recarga da página (os scripts já carregados só somem com a recarga).
 * - Evento `click_whatsapp_cta` só com cta_location, niche e variant (listas
 *   fechadas), transport_type 'beacon', sem preventDefault. Mede CLIQUES no
 *   CTA, não ingressos no grupo; sem consentimento nada é enviado, então o
 *   número do GA4 é um piso (contagem real: link/grupo por campanha).
 *
 * Ganchos do template: #cfg (JSON {ga4, clarity, niche}), #consent (hidden),
 * [data-consent="accept|deny|open"], [data-consent-status][data-saved],
 * a[data-cta="hero|sticky|final"], <html data-h data-c>, <body data-niche>, <main tabindex="-1">.
 *
 * GA4_RE e CLARITY_RE são a fonte única do formato dos IDs: o build.mjs importa daqui.
 */

export const STORAGE_KEY = 'consent.v1';
/** Validade da escolha: 12 meses (365 dias). */
export const CHOICE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;
export const GA4_RE = /^G-[A-Z0-9]{4,20}$/;
export const CLARITY_RE = /^[a-z0-9]{4,20}$/;
export const NICHE_RE = /^[a-z0-9-]{1,40}$/;
export const CTA_LOCATIONS = ['hero', 'sticky', 'final'];
export const GA4_SRC = 'https://www.googletagmanager.com/gtag/js?id=';
export const CLARITY_SRC = 'https://www.clarity.ms/tag/';
export const ANALYTICS_COOKIE_RE = /^(_ga(_[A-Za-z0-9]+)?|_gid|_gat(_[A-Za-z0-9]+)?|_clck|_clsk)$/;

const DENIED_ALL = {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
};

/** Lê e valida o JSON de #cfg. IDs inválidos ou placeholder viram ''. */
export function parseConfig(text) {
  let raw = {};
  try {
    raw = JSON.parse(text || '{}') || {};
  } catch (e) {
    raw = {};
  }
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const ga4 = str(raw.ga4);
  const clarity = str(raw.clarity);
  const niche = str(raw.niche);
  return {
    ga4: GA4_RE.test(ga4) ? ga4 : '',
    clarity: CLARITY_RE.test(clarity) ? clarity : '',
    niche: NICHE_RE.test(niche) ? niche : '',
  };
}

/** Acesso ao localStorage que nunca lança (modo privado, bloqueio, in-app). */
export function safeStorage(win) {
  try {
    const s = win.localStorage;
    return s || null;
  } catch (e) {
    return null;
  }
}

/**
 * Escolha salva, se válida e com menos de 12 meses.
 * @returns {'granted'|'denied'|null}
 */
export function readChoice(storage, now = Date.now()) {
  if (!storage) return null;
  try {
    const o = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
    if (!o || (o.v !== 'granted' && o.v !== 'denied') || typeof o.t !== 'string') return null;
    const t = Date.parse(o.t);
    // Sem data válida, expirada ou no futuro (relógio adulterado): pergunta de novo.
    if (!Number.isFinite(t) || now - t > CHOICE_MAX_AGE_MS || t - now > CHOICE_MAX_AGE_MS / 365) return null;
    return o.v;
  } catch (e) {
    return null;
  }
}

/** Grava só a escolha e a data. @returns {boolean} se gravou. */
export function saveChoice(storage, v, now = new Date()) {
  if (!storage || (v !== 'granted' && v !== 'denied')) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify({ v, t: now.toISOString() }));
    return true;
  } catch (e) {
    return false;
  }
}

/** `h{N}c{M}` a partir de <html data-h data-c>; 'nd' se fora da lista. */
export function variantOf(root) {
  const h = root && root.getAttribute ? root.getAttribute('data-h') : null;
  const c = root && root.getAttribute ? root.getAttribute('data-c') : null;
  return /^[1-3]$/.test(h || '') && /^[1-3]$/.test(c || '') ? `h${h}c${c}` : 'nd';
}

/**
 * Parâmetros do evento. Só valores de listas fechadas: nada do visitante.
 * @returns {null | {cta_location: string, niche: string, variant: string, transport_type: 'beacon'}}
 */
export function ctaEventParams(link, doc, cfg) {
  const loc = link && link.getAttribute ? link.getAttribute('data-cta') : null;
  if (!CTA_LOCATIONS.includes(loc)) return null;
  let niche = cfg && cfg.niche;
  if (!niche) {
    const b = doc.body && doc.body.getAttribute ? doc.body.getAttribute('data-niche') : '';
    niche = NICHE_RE.test(b || '') ? b : 'nd';
  }
  return {
    cta_location: loc,
    niche,
    variant: variantOf(doc.documentElement),
    transport_type: 'beacon',
  };
}

/** Envia o evento se houver consentimento e gtag. Nunca lança nem bloqueia. */
export function trackCtaClick(win, params, choice) {
  if (choice !== 'granted' || !params || typeof win.gtag !== 'function') return false;
  try {
    win.gtag('event', 'click_whatsapp_cta', params);
    return true;
  } catch (e) {
    return false;
  }
}

function addScript(doc, src) {
  const s = doc.createElement('script');
  s.async = true;
  s.src = src;
  (doc.head || doc.body).appendChild(s);
  return s;
}

/** Define gtag com consentimento só de análise e injeta gtag.js. */
export function loadGa4(win, doc, id) {
  if (!GA4_RE.test(id || '')) return false;
  win.dataLayer = win.dataLayer || [];
  win.gtag = function gtag() {
    // gtag.js exige o objeto `arguments`, não um array.
    win.dataLayer.push(arguments); // eslint-disable-line prefer-rest-params
  };
  win.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  });
  win.gtag('js', new Date());
  win.gtag('config', id, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
  });
  addScript(doc, GA4_SRC + encodeURIComponent(id));
  return true;
}

/** Fila do Clarity (como o snippet oficial), sinal consentv2 e tag. */
export function loadClarity(win, doc, id) {
  if (!CLARITY_RE.test(id || '')) return false;
  win.clarity =
    win.clarity ||
    function clarity() {
      (win.clarity.q = win.clarity.q || []).push(arguments); // eslint-disable-line prefer-rest-params
    };
  win.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
  addScript(doc, CLARITY_SRC + encodeURIComponent(id));
  return true;
}

/** Nomes de cookies de analytics presentes em `document.cookie`. */
export function analyticsCookieNames(cookieStr) {
  return String(cookieStr || '')
    .split(';')
    .map((p) => p.split('=')[0].trim())
    .filter((n) => ANALYTICS_COOKIE_RE.test(n));
}

/** Domínios onde o cookie pode ter sido gravado (GA usa o domínio mais alto). */
export function cookieDomains(hostname) {
  const out = [''];
  const h = String(hostname || '');
  if (!h || /^[\d.]+$/.test(h) || h.includes(':') || !h.includes('.')) return out;
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const d = parts.slice(i).join('.');
    out.push(d, '.' + d);
  }
  return out;
}

/** Expira os cookies de analytics em todos os domínios possíveis. */
export function clearAnalyticsCookies(doc, hostname) {
  const names = analyticsCookieNames(doc.cookie);
  for (const n of names) {
    for (const d of cookieDomains(hostname)) {
      doc.cookie = `${n}=; Max-Age=0; Path=/${d ? '; Domain=' + d : ''}`;
    }
  }
  return names;
}

/** Revogação efetiva do que já rodou nesta página. */
export function revokeAnalytics(win, doc) {
  try {
    if (typeof win.gtag === 'function') win.gtag('consent', 'update', DENIED_ALL);
  } catch (e) {
    /* segue para apagar cookies */
  }
  try {
    if (typeof win.clarity === 'function') {
      win.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
      win.clarity('consent', false); // apaga _clck/_clsk e encerra a sessão
    }
  } catch (e) {
    /* segue para apagar cookies */
  }
  const host = win.location && win.location.hostname;
  return clearAnalyticsCookies(doc, host);
}

/** Roda `fn` depois do `load`. */
export function afterLoad(win, doc, fn) {
  if (doc.readyState === 'complete') fn();
  else win.addEventListener('load', () => fn(), { once: true });
}

/** Roda `fn` em tempo ocioso (fallback setTimeout). */
export function whenIdle(win, fn) {
  if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(() => fn(), { timeout: 3000 });
  else win.setTimeout(() => fn(), 1);
}

/**
 * Liga banner, botão do rodapé, carga de analytics e evento de clique.
 * @returns {null | {choose: (v: string) => void, state: () => object}}
 */
export function initConsent(win, doc) {
  const cfgEl = doc.getElementById('cfg');
  const cfg = parseConfig(cfgEl ? cfgEl.textContent : '');
  // Sem IDs válidos: banner, botão e analytics não existem.
  if (!cfg.ga4 && !cfg.clarity) return null;

  const banner = doc.getElementById('consent');
  const openBtn = doc.querySelector('[data-consent="open"]');
  const status = doc.querySelector('[data-consent-status]');
  const main = doc.querySelector('main');
  let openedFromFooter = false;
  let lastOutside = null; // último elemento focado fora do banner
  const storage = safeStorage(win);
  let choice = readChoice(storage);
  let started = false;

  const startAnalytics = () => {
    if (started) return;
    started = true;
    afterLoad(win, doc, () =>
      whenIdle(win, () => {
        if (choice !== 'granted') return; // revogado no meio do caminho
        if (cfg.ga4) loadGa4(win, doc, cfg.ga4);
        if (cfg.clarity) loadClarity(win, doc, cfg.clarity);
      }),
    );
  };

  const show = () => banner && banner.removeAttribute('hidden');
  const hide = () => banner && banner.setAttribute('hidden', '');

  const focar = (el) => {
    if (!el || typeof el.focus !== 'function') return false;
    try {
      el.focus({ preventScroll: true });
    } catch (e) {
      return false;
    }
    return doc.activeElement === el;
  };
  // Foco não pode sumir com o banner (botão escondido = foco no <body>).
  const restoreFocus = () => {
    const alvo = openedFromFooter ? openBtn : lastOutside;
    openedFromFooter = false;
    if (!focar(alvo)) focar(main);
  };
  doc.addEventListener('focusin', (e) => {
    const t = e.target;
    if (t && t !== main && banner && typeof banner.contains === 'function' && !banner.contains(t)) lastOutside = t;
  });

  const choose = (v) => {
    if (v !== 'granted' && v !== 'denied') return;
    const prev = choice;
    choice = v;
    saveChoice(storage, v); // se falhar, o banner volta na próxima visita
    hide();
    restoreFocus();
    if (status) status.textContent = status.getAttribute('data-saved') || 'Preferência salva.';
    if (v === 'granted') {
      startAnalytics();
    } else if (prev === 'granted' || started) {
      revokeAnalytics(win, doc);
      if (win.location && typeof win.location.reload === 'function') win.location.reload();
    }
  };

  if (banner) {
    banner.addEventListener('click', (e) => {
      const btn = e.target && e.target.closest ? e.target.closest('[data-consent]') : null;
      const act = btn && btn.getAttribute('data-consent');
      if (act === 'accept') choose('granted');
      else if (act === 'deny') choose('denied');
    });
  }
  if (openBtn) {
    openBtn.removeAttribute('hidden');
    openBtn.addEventListener('click', () => {
      if (status) status.textContent = '';
      openedFromFooter = true;
      show();
      focar(banner && banner.querySelector ? banner.querySelector('button') : null);
    });
  }

  // Evento do CTA: delegado, sem preventDefault, sem await.
  doc.addEventListener('click', (e) => {
    const link = e.target && e.target.closest ? e.target.closest('a[data-cta]') : null;
    if (!link) return;
    trackCtaClick(win, ctaEventParams(link, doc, cfg), choice);
  });

  if (choice === 'granted') startAnalytics();
  else if (choice === null) afterLoad(win, doc, show);

  return { choose, state: () => ({ choice, started }) };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    initConsent(window, document);
  } catch (e) {
    /* sem consentimento funcional = sem analytics; a página segue */
  }
}
