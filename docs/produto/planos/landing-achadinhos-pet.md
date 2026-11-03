# Plano técnico: landing page do grupo de WhatsApp de achadinhos pet
- Brief: docs/produto/briefs/landing-achadinhos-pet.md
- Data: 2026-11-02
- Spec visual (em paralelo, não verificada por este plano): docs/produto/specs/landing-achadinhos-pet.md

## Objetivo e critérios de aceite
Gerar, a partir de um `content/<nicho>.json` e de um único template + `styles.css`, HTML estático pronto para publicar cujo único objetivo é levar o visitante ao convite do WhatsApp (brief:12), com analytics só após consentimento e A/B de headline/CTA sem JS montando conteúdo.

| CA | Origem (brief) | Critério | Como verificar |
|---|---|---|---|
| CA1 | :90, :48 | Em 360x640, `<h1>` e CTA do hero inteiros sem rolar (também com o banner de consentimento aberto) | `browser-check`: `getBoundingClientRect().bottom <= 640` do h1 e de `[data-cta=hero]`, com e sem banner; screenshot `shots` 360x640 |
| CA2 | :91 | Sem rolagem horizontal de 320 a 1280 px | `browser-check`: `scrollWidth <= innerWidth` em 320, 360, 390, 430, 768, 1024, 1280 |
| CA3 | :92, :47 | Todos os CTAs com o mesmo `href` do convite e funcionando sem JS | `check`: todos os `a[data-cta]` com `href === content.convite`; `browser-check` com `Emulation.setScriptExecutionDisabled` confirma hero e final visíveis com `href` |
| CA4 | :93 | Contraste do CTA e dos textos >= 4,5:1 | `check`: fórmula WCAG sobre os pares de tokens de `src/styles.css` (ver Contratos) |
| CA5 | :94, :49 | Barra fixa respeita safe area e não cobre conteúdo nem rodapé | `check`: `viewport-fit=cover` e `env(safe-area-inset-bottom)` presentes; `browser-check`: no fim da página o último elemento do rodapé não intercepta a barra; safe area real = manual (iPhone com notch) |
| CA6 | :95, :61 | Nenhum dado, número ou depoimento inventado | `check`: sem bloco de prova social se `provaSocial` for `null`; regex de números + "membros/pessoas/mil" e de "depoimento" no HTML; revisão humana do `content/pet.json` |
| CA7 | :96, :75 | LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1 e a11y atendidos ou pendência anotada | `browser-check` mede CLS (PerformanceObserver `layout-shift`) e LCP local; Lighthouse via `npx` (exige rede); INP de campo = manual/pendência no README |
| CA8 | :97 | Safari iOS, Chrome Android, Samsung Internet testados ou listados | Manual: checklist no README (inclui navegador in-app do Instagram/TikTok abrindo `chat.whatsapp.com`) |
| CA9 | :44-46, :45 | Uma decisão; no máximo 3 CTAs (hero, sticky, final); texto específico | `check`: `a[data-cta]` <= 3 com valores `hero|sticky|final`; textos de CTA vêm só de `content.ctas` |
| CA10 | :47 | CTA é `<a>` com href direto, sem encurtador/redirecionamento | `build` valida `convite` com `^https://chat\.whatsapp\.com/[A-Za-z0-9]+$` (placeholder só com aviso; `--release` falha) |
| CA11 | :49 | Barra surge quando o CTA do hero sai e some quando o final aparece (IntersectionObserver) | `node --test test/ui.test.mjs` (função pura de estado) + `browser-check` rolando para 3 posições |
| CA12 | :50 | Área de toque >= 48x48 (principal) e >= 44x44 (demais); hover, focus-visible, active | `browser-check`: tamanhos dos `a[data-cta]` e do botão do banner; estados = screenshot com `:focus-visible` forçado via CDP + revisão do `designer` |
| CA13 | :51 | `#25D366` com texto escuro (`#0B141A` dá ~9,3:1) ou verde escuro validado | `check` (mesmo cálculo do CA4 sobre `--c-accent`/`--c-on-accent`) |
| CA14 | :81, :62 | GA4 e Clarity com IDs no content, carregados após `load` e só com consentimento; banner leve sem CLS e sem cobrir o CTA | `node --test test/consent.test.mjs`; `browser-check`: sem consentimento, zero requisições fora da origem (`Network.requestWillBeSent`); após aceitar, só domínios de analytics; CLS do banner = 0 |
| CA15 | :82 | `click_whatsapp_cta` com `cta_location`, `niche`, `variant`, `transport_type: 'beacon'`, sem `preventDefault` | `test/consent.test.mjs` (parâmetros do evento); `browser-check` confirma que o clique navega; recebimento no GA4 DebugView = manual |
| CA16 | :84 | Headline e CTA alternáveis por content.json e por `?h=N&c=N` | `test/ab.test.mjs` + `browser-check` com `?h=2&c=3`: texto visível muda e CLS = 0 |
| CA17 | :83 | Deixar claro que se medem cliques, não ingressos | README (seção Medição) — revisão |
| CA18 | :75 | Lighthouse >= 95 em Desempenho/Acessibilidade/SEO; peso inicial <= 200 KB sem analytics | `check` soma HTML+CSS+JS+fonte do nicho; Lighthouse via `npx` (com rede) ou pendência anotada |
| CA19 | :76 | LCP = `<h1>` (ou imagem <= 60 KB AVIF/WebP); imagens com width/height; `fetchpriority` só no LCP; `loading="lazy"` nas demais; scripts `defer`/`module` | `check` (atributos e tamanho das imagens); `browser-check` registra o elemento LCP |
| CA20 | :77 | WCAG 2.2 AA: semântica, um único `<h1>`, foco visível, teclado, alt, `lang="pt-BR"`, nada só por cor | `check` (h1 único, lang, alt, landmarks); `browser-check` navega com Tab e confere foco visível; Lighthouse a11y; leitor de tela = manual |
| CA21 | :78 | title, description, OG/Twitter 1200x630, favicon, theme-color | `check` (metas, `og:image` absoluto, PNG 1200x630 lido do cabeçalho IHDR, <= 300 KB) |
| CA22 | :87 | Sem menu/nav, formulários, pop-ups, carrossel, parallax, animação pesada | `check`: sem `<nav>`, `<form>`, `<input>`, `<dialog>`, `<iframe>`; `prefers-reduced-motion` presente no CSS |
| CA23 | :87 | Sem contador/escassez/urgência falsos nem promessas absolutas | `check`: lista de termos proibidos ("100% seguro", "melhores ofertas", "últimas vagas", "restam", "só hoje", "vagas limitadas") |
| CA24 | :87 | Sem logos de lojas ou selos de parceria | `check`: nenhuma `<img>`/SVG com nome de loja no `alt`/`aria-label`/`id`; revisão do `designer` |
| CA25 | :87 | Sem bibliotecas pesadas nem requisições externas além de analytics | `check`: nenhum `src`/`href` externo além de convite, política de privacidade e URLs absolutas de `og:`; `browser-check` (rede, ver CA14) |

## Contexto atual
- Projeto vazio: só `CLAUDE.md` (seção "Contexto do projeto" "a definir", CLAUDE.md:3), `.claude/agents/*` e o brief. Sem git, sem código, sem `docs/produto/decisoes.md` (não existe). `docs/produto/specs/` vazio no momento desta leitura.
- Stack decidida pelo dono (brief:5, :31-32): HTML estático pré-renderizado, CSS e JS vanilla, `content.json` + build em Node sem dependências. Não reaberta.
- Ambiente verificado: Node v22.23.0 (com `fetch` e `WebSocket` globais), Google Chrome 156 em `/usr/bin/google-chrome`, rede até o registry npm disponível hoje. `@fontsource-variable/manrope@5.3.0` traz `files/manrope-latin-wght-normal.woff2` (24.836 B) e `@fontsource-variable/inter@5.3.0` traz `files/inter-latin-wght-normal.woff2` (48.256 B), ambos OFL-1.1.

## Abordagens consideradas
A/B (ponto 3):

| Abordagem | Prós | Contras | Risco |
|---|---|---|---|
| A. Um HTML por variante no build (`/pet/h2c1/`) | Zero JS | Não atende `?h=` sem regra no host; 9 arquivos; links de anúncio por caminho | Médio (divergência entre arquivos) |
| B. Todas as variantes (até 3+3) no HTML; `<html data-h data-c>` com default do content.json; script inline de ~10 linhas no `<head>` troca o atributo pelo `?h=&c=`; CSS mostra só a ativa | Conteúdo todo pré-renderizado; troca antes da 1ª pintura (sem CLS, sem flash); sem JS = variante default | Texto duplicado no HTML (~1 KB) | Baixo |
| C. JS troca `textContent` depois do load | Simples | Flash e CLS; contraria brief:31 | Alto |

**B** é a escolha. Não há sorteio no site: a divisão de tráfego é feita nos anúncios (uma URL com `?h=&c=` por conjunto), o que evita gravar nada antes do consentimento.

Fonte (ponto 1): Manrope por padrão (metade do peso da Inter); se a spec do `designer` escolher Inter, troca-se só o nome do pacote no comando e a família no `styles.css`.

## Decisão
1. **Estrutura** (apresentação × lógica):

| Arquivo | Tipo | Dono sugerido |
|---|---|---|
| `src/template.html` | apresentação (marcação, SVG inline, banner, barra) | designer/dev conforme spec |
| `src/styles.css` | apresentação (tokens, layout, estados, reduced-motion) | designer/dev conforme spec |
| `content/pet.json` (textos, cor de destaque, imagens) | apresentação/conteúdo | dev + designer (copy) |
| `build.mjs` | lógica (render, validação, escape, CSP, favicon, og.html) | dev |
| `src/js/ab-inline.js` (inlinado no `<head>`) | lógica | dev |
| `src/js/ui.js` (barra fixa) | lógica | dev |
| `src/js/consent.js` (banner, GA4, Clarity, evento) | lógica **sensível** | dev (opus) |
| `scripts/check.mjs`, `scripts/browser-check.mjs`, `scripts/shots.mjs`, `scripts/og.mjs`, `scripts/serve.mjs`, `test/*.test.mjs` | verificação | dev/qa |
| `src/fonts/manrope-latin-wght-normal.woff2`, `src/fonts/OFL.txt` | ativo vendorizado | dev |
| `dist/` (gerado e versionado, é o que se publica) | saída | build |

2. **Build** (`node build.mjs [nicho] [--release]`): lê todo `content/*.json` (ou só o nicho), valida, renderiza `src/template.html` com mini-engine própria (`{{a.b}}` com escape HTML, `{{#each lista}}…{{/each}}` e `{{#if chave}}…{{/if}}`, sem aninhar o mesmo bloco), grava `dist/<nicho>/index.html`, copia `styles.css`, `js/*.js` e a fonte para `dist/assets/` (caminhos relativos `../assets/`), gera `dist/<nicho>/favicon.svg` (SVG inline com a cor de destaque, sem imagem externa) e `dist/<nicho>/og.html`. Calcula o `sha256` do script inline e o põe na CSP (`<meta http-equiv="Content-Security-Policy">`). Cor de destaque do nicho entra como `<style>:root{--c-accent:…;--c-on-accent:…}</style>` inline (também com hash). Placeholders `[…]` geram aviso listado no console; com `--release` o build falha se restar algum, se o convite não casar com o regex ou se `siteUrl` for placeholder. Slot de imagem cujo `src` começa com `[IMAGEM:` não é renderizado (fica na lista de pendências), nunca vai texto de placeholder visível ao público — exceto os do convite/política, que precisam estar no `href`.
3. **A/B**: abordagem B. `content.ab = { "headlines": [≤3], "ctas": [≤3], "padrao": { "h": 1, "c": 1 } }`. `ab-inline.js` lê `URLSearchParams`, aceita só inteiros de 1 ao tamanho da lista (lista embutida pelo build) e faz `document.documentElement.dataset.h = …`. `styles.css` traz `.ab{display:none}` e `html[data-h="1"] .ab[data-h="1"], …` até 3 (6 regras fixas). `variant` do evento = `h{N}c{M}` lido do `<html>`.
4. **Fonte**: vendorizada uma vez no repositório (não há dependência de runtime nem de build). Comando, rodado na raiz:
   `cd "$(mktemp -d)" && npm pack @fontsource-variable/manrope@5.3.0 && tar xzf fontsource-variable-manrope-5.3.0.tgz && cp package/files/manrope-latin-wght-normal.woff2 /home/ufla/Documentos/petsLand/src/fonts/ && cp package/LICENSE /home/ufla/Documentos/petsLand/src/fonts/OFL.txt`
   `@font-face` com `font-weight: 200 800`, `font-display: swap`, `unicode-range` latino, `<link rel="preload" as="font" type="font/woff2" crossorigin>`, e família fallback com `size-adjust`/`ascent-override` sobre Arial para reduzir CLS no swap (valores a calibrar pelo `browser-check`). **Sem rede**: o build detecta a ausência do arquivo, avisa, omite `@font-face`/preload e a página fica na pilha de sistema (`system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`); nada quebra. Alternativa sem npm: baixar o woff2 do repositório oficial (github.com/sharanda/manrope) — não verificado.
5. **Consentimento e analytics** (`src/js/consent.js`, `type="module"`): IDs em `content.analytics.{ga4,clarity}`; se ambos vazios/placeholder, banner e analytics não existem. O banner está pré-renderizado no template com `hidden`; o JS só tira o `hidden` se não houver escolha salva. Posição `fixed` no rodapé (fora do fluxo, sem CLS), dois botões de mesmo peso ("Aceitar" / "Recusar") + link para a política; enquanto aberto a barra fixa fica suprimida (um elemento inferior por vez) e o `body` ganha `padding-bottom` reservado em CSS para não cobrir o rodapé. Escolha em `localStorage` (`consent.v1` = `{v:'granted'|'denied', t:<ISO>}`), com `try/catch`. Botão "Preferências de cookies" no rodapé (pré-renderizado `hidden`, JS revela) reabre o banner; revogar faz `gtag('consent','update', denied)`, apaga cookies `_ga*`, `_clck`, `_clsk` e recarrega. Com consentimento: `window.addEventListener('load')` (ou imediato se `document.readyState==='complete'`) → `requestIdleCallback` (fallback `setTimeout`) → injeta `https://www.googletagmanager.com/gtag/js?id=…` e o snippet do Clarity; GA com `ad_storage`/`ad_user_data`/`ad_personalization` `denied` e `analytics_storage` `granted`; Clarity com sinal de consentimento (API `consentv2` — não verificado, conferir doc atual). **Proibido** `preconnect`/`dns-prefetch` para domínios de analytics (vaza IP antes do consentimento).
6. **Evento**: listener delegado de `click` em `a[data-cta]`; se `window.gtag` existir, `gtag('event','click_whatsapp_cta',{cta_location, niche, variant, transport_type:'beacon'})`; nunca `preventDefault`, sem `target="_blank"`, sem `await`. Sem consentimento não se envia nada (aceito: o site subconta cliques; a contagem real vem dos links/grupos por campanha — CA17).
7. **Barra fixa** (`src/js/ui.js`): `IntersectionObserver` em `[data-cta=hero]` e `[data-cta=final]`; função pura `stickyVisible({heroVisible, heroAbove, finalVisible, consentOpen})` exportada e testada. Aparece por `transform` (sem layout); oculta com `inert` + `aria-hidden` para não receber foco. Só abaixo de 768 px (CSS). Espaço da barra reservado no `body` via CSS (`calc(altura + env(safe-area-inset-bottom))`), então surgir não desloca nada.
8. **OG e favicon** (ponto 5): `og.html` 1200x630 gerado pelo build (nome do grupo, headline padrão, cor de destaque, ícone SVG inline, fonte local). `node scripts/og.mjs` roda `google-chrome --headless=new --screenshot=… --window-size=1200,630 file://…/og.html` e também gera `apple-touch-icon.png` 180x180 (WhatsApp/Facebook não aceitam SVG como `og:image`; iOS usa o PNG). PNGs ficam versionados em `dist/<nicho>/`; só se regeneram quando o content muda. `og:image` usa URL absoluta `content.siteUrl + /<nicho>/og.png`.
9. **Outro nicho** (ponto 4): copiar `content/pet.json` para `content/<nicho>.json`, trocar textos/cor/convite/IDs, `node build.mjs <nicho> && node scripts/og.mjs <nicho>` → `dist/<nicho>/`. Template, CSS e JS são compartilhados em `dist/assets/`.

## Esquema e contratos
- `content/<nicho>.json` (chaves em português, conforme o brief): `nicho`, `siteUrl`, `nomeGrupo`, `convite`, `politicaPrivacidade`, `corDestaque {accent, onAccent}`, `meta {title, description}`, `ab {headlines[], ctas[], padrao{h,c}}`, `subtitulo`, `microcopy`, `beneficios[3]{titulo, texto, icone}`, `passos[3]`, `exemploOferta {ativo, texto}` (rótulo "exemplo ilustrativo" fixo no template), `confianca {pontos[], detalhes[]}`, `provaSocial` (`null` até o dono fornecer dado real com `fonte`), `imagens[] {src, alt, width, height}`, `analytics {ga4, clarity}`, `rodape {avisoAfiliados}`.
- Template (ganchos que o JS e os checks usam — a spec decide o resto): `<html lang="pt-BR" data-h data-c>`; `<body data-niche>`; `a[data-cta="hero|sticky|final"]` com `href` do convite; `.ab[data-h="N"]` dentro do `<h1>` e `.ab[data-c="N"]` dentro de cada CTA; `#sticky` (barra); `#consent` com `[data-consent="accept|deny"]`; `[data-consent="open"]` no rodapé; `<script type="application/json" id="cfg">{ga4, clarity, niche}</script>`; scripts `type="module"`.
- Tokens obrigatórios em `:root` de `styles.css` (nomes usados pelo `check` de contraste; a spec escolhe os valores): `--c-bg`, `--c-surface`, `--c-text`, `--c-text-muted`, `--c-accent`, `--c-on-accent`, `--c-border`, `--c-focus`. Pares checados: text/bg, text/surface, text-muted/bg, text-muted/surface, on-accent/accent (>= 4,5); focus/bg, border-de-componente/bg (>= 3). Se a spec usar outros nomes, o `dev` ajusta só a tabela de pares em `scripts/check.mjs`.

## Etapas
| # | Etapa | Arquivos | Verificação | Responsável | Grupo | Sensível | CAs |
|---|---|---|---|---|---|---|---|
| 0 | `git init` + `.gitignore` (`node_modules/`, `.shots/`) com aprovação do dono | `.gitignore` | `git status` | lead | — | não | — |
| 1 | `package.json` sem dependências (`"type":"module"`, scripts `build`, `test`, `check`, `browser`, `shots`, `og`, `verify`) e servidor estático mínimo | `package.json`, `scripts/serve.mjs` | `node scripts/serve.mjs` responde 200 em `/pet/` após o build | dev | A | não | CA25 |
| 2 | Vendorizar a fonte (comando da Decisão 4) | `src/fonts/manrope-latin-wght-normal.woff2`, `src/fonts/OFL.txt` | `ls -l src/fonts` (~24,8 KB) | dev | A | não | CA18 |
| 3 | `content/pet.json` só com placeholders e copy da spec; `provaSocial: null`; 3 headlines e 3 CTAs | `content/pet.json` | `node -e "JSON.parse(require('fs').readFileSync('content/pet.json'))"` | dev (copy do designer) | A | não | CA6, CA9, CA16, CA23 |
| 4 | Build: engine, escape, validações, `--release`, CSP com hash, cópia de assets, favicon.svg, og.html, multi-nicho; testes | `build.mjs`, `test/build.test.mjs` | `node --test test/build.test.mjs && node build.mjs` | dev | B | sim (entrada → HTML, CSP) | CA3, CA6, CA10, CA16, CA21, CA25 |
| 5 | Template + CSS conforme spec e contratos (banner e barra pré-renderizados, estados, reduced-motion, safe area, sem nav/form) | `src/template.html`, `src/styles.css` | `node build.mjs && node scripts/shots.mjs` (revisão das imagens em `.shots/`) | designer ou dev | B | não | CA1, CA2, CA4, CA5, CA9, CA12, CA13, CA19, CA20, CA22, CA24 |
| 6 | A/B inline + barra fixa, com funções puras testadas | `src/js/ab-inline.js`, `src/js/ui.js`, `test/ab.test.mjs`, `test/ui.test.mjs` | `node --test test/ab.test.mjs test/ui.test.mjs` | dev | B | não | CA11, CA16 |
| 7 | Consentimento, carga de GA4/Clarity após load, revogação e evento `click_whatsapp_cta` | `src/js/consent.js`, `test/consent.test.mjs` | `node --test test/consent.test.mjs` | dev (opus) | B | **sim** | CA14, CA15, CA17 |
| 8 | Check estático (estrutura, metas, links, termos proibidos, peso, imagens, contraste WCAG, PNG OG) | `scripts/check.mjs`, `test/check.test.mjs` | `node --test test/check.test.mjs && node scripts/check.mjs` | dev | B | não | CA3-6, CA9, CA13, CA18-25 |
| 9 | Checagem em navegador via CDP (Chrome headless + `WebSocket` do Node): larguras, 360x640, sem JS, rolagem da barra, Tab/foco, alvos de toque, CLS/LCP, requisições de rede antes/depois do consentimento, `?h=2&c=3`; e screenshots | `scripts/browser-check.mjs`, `scripts/shots.mjs` | `node scripts/browser-check.mjs` (sai ≠ 0 se falhar) | dev ou qa | B | não | CA1, CA2, CA3, CA5, CA7, CA11, CA12, CA14, CA16, CA19, CA20, CA25 |
| 10 | OG PNG 1200x630 e apple-touch-icon via Chrome | `scripts/og.mjs`, `dist/pet/og.png`, `dist/pet/apple-touch-icon.png` | `node scripts/og.mjs pet && node scripts/check.mjs` | dev | C | não | CA21 |
| 11 | Integração: `npm run verify`, calibrar fallback da fonte, Lighthouse mobile se houver rede: `node scripts/serve.mjs & npx -y lighthouse@12 http://localhost:8080/pet/ --form-factor=mobile --only-categories=performance,accessibility,seo --chrome-flags="--headless=new"` | `dist/**`, `src/styles.css` (só `@font-face` fallback) | `npm run verify` verde; notas Lighthouse anotadas | dev | C (depois do 10) | não | CA7, CA18 |
| 12 | README: placeholders a preencher, como criar nicho, medição (cliques ≠ ingressos, link por campanha), checklist manual (Safari iOS, Chrome Android, Samsung Internet, in-app Instagram/TikTok, GA4 DebugView, leitor de tela), pendências | `README.md` | revisão | dev | C | não | CA8, CA17 |

- Grupo B: 4, 5, 6, 7, 8 e 9 não compartilham arquivos e podem rodar em paralelo, desde que todos sigam a seção Contratos; 9 só passa de fato depois de 4-7. Grupo A também é paralelo. 10 → 11 → 12 em sequência (11 mexe em `styles.css`, então não roda junto de 5).
- `verify` = `node build.mjs && node --test && node scripts/check.mjs && node scripts/browser-check.mjs`.

## Pontos para o seguranca
- Etapa 7: nenhuma requisição a Google/Microsoft (nem `preconnect`) antes do "Aceitar"; "Recusar" com o mesmo peso visual; revogação efetiva (consent update + remoção de cookies); `localStorage` guarda só a escolha; evento sem dado pessoal (só `cta_location`, `niche`, `variant`).
- Etapa 4: todo valor do content passa por escape HTML (exceto SVG de ícone de lista fechada no template); `convite`, `politicaPrivacidade`, `siteUrl` validados como `https:`; IDs com `^G-[A-Z0-9]+$` e `^[a-z0-9]+$`; CSP em meta: `default-src 'self'; script-src 'self' 'sha256-…' https://www.googletagmanager.com https://*.clarity.ms; connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.clarity.ms https://c.bing.com; img-src 'self' data: https://*.google-analytics.com https://*.clarity.ms https://c.bing.com; style-src 'self' 'sha256-…'; font-src 'self'; base-uri 'none'; form-action 'none'` (domínios do Clarity não verificados — confirmar no `browser-check` após aceitar).
- Etapa 6: `?h`/`?c` nunca chegam ao DOM como texto; só selecionam índice de uma lista fechada.
- Política de privacidade precisa citar GA4 e Clarity (conteúdo é do dono).

## Riscos e como reverter
- Banner de consentimento cobrindo o CTA do hero em 360x640: CA1 checa com banner aberto; se falhar, a spec reduz o banner ou ele passa a ficar no fluxo no fim da página.
- CLS por troca de fonte no `<h1>`: fallback com `size-adjust`; em último caso remover `@font-face` (sistema).
- API de consentimento do Clarity mudar: Clarity é desligável deixando `analytics.clarity` vazio e rodando o build.
- Navegador in-app pode não abrir o app do WhatsApp: só teste manual (CA8).
- Reverter qualquer coisa: site estático versionado; `git revert` + republicar `dist/`. Desligar analytics = esvaziar IDs no content e rodar `node build.mjs`.

## Perguntas em aberto e premissas adotadas
1. Domínio e caminho: premissa `dist/pet/index.html` publicado em `[SITE_URL]/pet/`. Se o pet ficar na raiz do domínio, o build ganha `"raiz": true` no content (gera também `dist/index.html`).
2. Pixels de anúncio (brief:81 "se houver"): não implementados nesta entrega; entram depois no mesmo `consent.js`.
3. Fonte final: Manrope (premissa) até a spec dizer o contrário.
4. Hospedagem: não definida; CSP vai em meta para não depender de cabeçalhos do host.
5. Sem consentimento não há contagem de cliques: aceito pela LGPD; contagem sem cookies exigiria servidor (fora da stack).
6. `git init` (etapa 0) depende de aprovação do dono.

## ADR
**ADR-001 — Build estático com engine própria, A/B por atributo no `<html>` e analytics só após consentimento.** Contexto: brief:31-32, :81-84. Decisão: Decisão 2, 3 e 5 acima. Consequências: zero dependências de runtime e de build; HTML carrega até 3+3 variantes de texto; ferramentas de verificação usam o Chrome do sistema e o `WebSocket` nativo do Node 22, e o Lighthouse é opcional (rede via `npx`).

## Texto para "Contexto do projeto" do CLAUDE.md (após aprovação)
- **Produto:** landing pages estáticas de grupos de WhatsApp de achadinhos, uma por nicho (a primeira é pet). Brief: `docs/produto/briefs/landing-achadinhos-pet.md`.
- **Stack:** HTML estático pré-renderizado, CSS e JS vanilla (ES modules), build em Node 22 sem dependências. Sem framework, sem `npm install`.
- **Camadas e pastas:** `content/<nicho>.json` (todo texto, cor, convite, IDs); `src/template.html` e `src/styles.css` (apresentação; o `designer` pode tocar); `src/js/` e `build.mjs` (lógica; o `designer` não toca); `scripts/` (verificação); `test/` (`node --test`); `dist/` (gerado, versionado, é o que se publica; não editar à mão).
- **Verificação:** `npm run verify` (= `node build.mjs && node --test && node scripts/check.mjs && node scripts/browser-check.mjs`). Arquivo isolado: `node --test test/<arquivo>.test.mjs`. Screenshots: `node scripts/shots.mjs` → `.shots/`. OG: `node scripts/og.mjs <nicho>`. Publicação: `node build.mjs --release` (falha com placeholder).
- **Dados de teste:** nenhum serviço externo; `content/pet.json` com placeholders basta. Lighthouse opcional: `npx -y lighthouse@12 …` (exige rede).
- **Dado pessoal (LGPD):** o site não coleta dado pessoal; GA4/Clarity só após consentimento (`src/js/consent.js`, área sensível). Escolha de consentimento só no `localStorage` do visitante.
- **Docs que acompanham a mudança:** `README.md` (placeholders, novo nicho, checklist manual).
