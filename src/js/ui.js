/*
 * Barra fixa mobile (#sticky) — plano, Decisão 7; spec, "Barra fixa mobile".
 *
 * Regra: visível = CTA do hero saiu por cima && CTA final ainda não apareceu
 * nem passou && banner de consentimento fechado (um elemento inferior por vez).
 *
 * Estado no DOM (o CSS anima pela transform; a barra é position: fixed):
 * - visível: sem `inert`, sem `aria-hidden`, `data-visible="true"`;
 * - oculta:  `inert`, `aria-hidden="true"`, `data-visible="false"`.
 * Sem JS ou sem IntersectionObserver a barra fica como o template a entrega
 * (oculta, com `inert` e `aria-hidden`).
 */

/**
 * Decide se a barra fixa deve aparecer. Função pura.
 * @param {{heroVisible?: boolean, heroAbove?: boolean, finalVisible?: boolean,
 *          finalAbove?: boolean, consentOpen?: boolean}} s
 * @returns {boolean}
 */
export function stickyVisible(s) {
  const st = s || {};
  return (
    st.heroVisible !== true &&
    st.heroAbove === true &&
    st.finalVisible !== true &&
    st.finalAbove !== true &&
    st.consentOpen !== true
  );
}

/** Aplica o estado visível/oculto ao elemento da barra. */
export function applySticky(el, visible) {
  if (!el) return;
  if (visible) {
    el.removeAttribute('inert');
    el.removeAttribute('aria-hidden');
    el.setAttribute('data-visible', 'true');
  } else {
    el.setAttribute('inert', '');
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('data-visible', 'false');
  }
}

/** Traduz uma entrada do IntersectionObserver em {visible, above}. */
export function entryState(entry) {
  const visible = Boolean(entry && entry.isIntersecting);
  const top = entry && entry.boundingClientRect ? entry.boundingClientRect.top : 0;
  return { visible, above: !visible && top < 0 };
}

/**
 * Liga a barra ao IntersectionObserver. Recebe `win`/`doc` para ser testável.
 * @returns {null | {state: object, update: () => void}}
 */
export function initSticky(win, doc) {
  const bar = doc.getElementById('sticky');
  const hero = doc.querySelector('a[data-cta="hero"]');
  const fin = doc.querySelector('a[data-cta="final"]');
  if (!bar) return null;
  if (!hero || typeof win.IntersectionObserver !== 'function') {
    applySticky(bar, false);
    return null;
  }

  const banner = doc.getElementById('consent');
  const state = {
    heroVisible: true,
    heroAbove: false,
    finalVisible: false,
    finalAbove: false,
    consentOpen: Boolean(banner && !banner.hasAttribute('hidden')),
  };
  let last = null;
  const update = () => {
    const v = stickyVisible(state);
    if (v !== last) {
      last = v;
      applySticky(bar, v);
    }
  };

  const io = new win.IntersectionObserver((entries) => {
    for (const e of entries) {
      const { visible, above } = entryState(e);
      if (e.target === hero) {
        state.heroVisible = visible;
        state.heroAbove = above;
      } else if (e.target === fin) {
        state.finalVisible = visible;
        state.finalAbove = above;
      }
    }
    update();
  });
  io.observe(hero);
  if (fin) io.observe(fin);

  // O consent.js abre/fecha o banner pelo atributo `hidden`; a barra reage.
  if (banner && typeof win.MutationObserver === 'function') {
    new win.MutationObserver(() => {
      state.consentOpen = !banner.hasAttribute('hidden');
      update();
    }).observe(banner, { attributes: true, attributeFilter: ['hidden'] });
  }

  update();
  return { state, update };
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  try {
    initSticky(window, document);
  } catch (e) {
    /* falha da barra não pode afetar os CTAs do hero e final */
  }
}
