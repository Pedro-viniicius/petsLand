/*
 * A/B de headline e CTA (plano, Decisão 3). Script CLÁSSICO, inlinado pelo
 * build.mjs dentro do <head> (antes da 1ª pintura): sem import/export.
 *
 * Contrato com o build: o build substitui o marcador de A/B (o 3º argumento
 * da chamada no fim do arquivo; ocorre uma só vez no texto) por um objeto
 * JSON com o tamanho das listas e a variante padrão, por exemplo
 * {"h":3,"c":3,"padrao":{"h":1,"c":1}}. O hash sha256 da CSP é calculado
 * sobre o texto já substituído.
 *
 * Lê ?h=N&c=M da URL e só aceita inteiros de 1 ao tamanho da lista; qualquer
 * outro valor cai na variante padrão. O parâmetro nunca vai ao DOM como texto:
 * só escolhe um índice, gravado em <html data-h data-c>, e o CSS mostra a
 * variante ativa. Nada é sorteado nem salvo (sem gravar antes do consentimento).
 */
(function (d, l, ab) {
  function pick(raw, n, def) {
    var max = Math.min(Number(n) || 0, 3);
    if (typeof raw === 'string' && /^[1-9]$/.test(raw) && Number(raw) <= max) return raw;
    return String(def);
  }
  try {
    var q = new URLSearchParams(l.search);
    var p = ab.padrao || {};
    var root = d.documentElement;
    root.setAttribute('data-h', pick(q.get('h'), ab.h, p.h || 1));
    root.setAttribute('data-c', pick(q.get('c'), ab.c, p.c || 1));
  } catch (e) {
    /* sem A/B: fica a variante padrão já pré-renderizada no <html> */
  }
})(document, location, __AB__);
