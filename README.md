# Landing de achadinhos (WhatsApp)

Landing pages estáticas, uma por nicho (a primeira é `pet`), com um único objetivo: levar o visitante ao convite do grupo de WhatsApp. Todo texto, cor, convite e ID de analytics fica em `content/<nicho>.json`; `src/template.html` + `src/styles.css` + `src/js/` são compartilhados. HTML pré-renderizado, CSS e JS vanilla, build em Node 22 sem dependências (não há `npm install`). O que se publica é `dist/`.

Documentos: brief `docs/produto/briefs/landing-achadinhos-pet.md`, plano `docs/produto/planos/landing-achadinhos-pet.md`, spec `docs/produto/specs/landing-achadinhos-pet.md`, decisões do dono `docs/produto/decisoes.md`.

## Como rodar

Requisitos: Node 22 e Google Chrome (os checks de navegador usam `/usr/bin/google-chrome`; outro caminho em `CHROME_BIN`).

| Comando | O que faz |
|---|---|
| `node build.mjs [nicho]` | Gera `dist/<nicho>/` e `dist/assets/`. Placeholders `[...]` viram avisos. |
| `node build.mjs --release` | Build de publicação: falha se restar placeholder, se o convite não casar com `^https://chat\.whatsapp\.com/[A-Za-z0-9]+$`, se `siteUrl`, política ou IDs forem placeholder, ou se `dist/<nicho>/og.png` não existir ou não tiver sido gerado a partir do `og.html` atual. |
| `node scripts/og.mjs <nicho>` | Gera `dist/<nicho>/og.png` (1200x630), `og.png.sha256` (hash do `og.html` usado, conferido pelo `--release`) e `apple-touch-icon.png` (180x180; com `logo` no content o build já copia o do logo e o `og.mjs` não o sobrescreve). Rode depois do build e sempre que nome do grupo, headline padrão ou cor mudarem. |
| `node --test` | Testes unitários (`test/*.test.mjs`). |
| `node scripts/check.mjs [nicho]` | Checks estáticos (CAs do plano: estrutura, metas, contraste WCAG, peso, termos proibidos, PNG do OG). |
| `node scripts/browser-check.mjs [nicho]` | Checks em Chrome headless via CDP (larguras, dobra 360x640, sem JS, barra fixa, foco, CLS/LCP, rede e consentimento). Toda requisição externa é interceptada e respondida localmente (também em `shots` e `og`): nenhum hit sai para GA4/Clarity, mesmo com IDs reais. |
| `node scripts/shots.mjs` | Screenshots em `.shots/` para revisão visual. |
| `node scripts/serve.mjs` | Serve `dist/` em `http://localhost:8080/` (ex.: `/pet/`). |
| `npm run verify` | `build` + `test` + `check` + `browser-check`. Tem de ficar verde antes de publicar. |

Lighthouse (opcional, precisa de rede para o `npx`): `node scripts/serve.mjs &` e depois `npx -y lighthouse@12 http://localhost:8080/pet/ --form-factor=mobile --only-categories=performance,accessibility,seo --chrome-flags="--headless=new"`.

## Placeholders a preencher

`content/pet.json` já tem `siteUrl` (`https://white-hornet-181851.hostingersite.com`), `nomeGrupo` (Garimpo Pet), `convite`, `meta.title`, `rodape.avisoAfiliados` e `logo` reais. Ainda faltam política, lojas e IDs de analytics. Lista completa dos campos (os placeholders restantes são os que `node build.mjs` mostra):

| Campo | O que colocar |
|---|---|
| `siteUrl` | `https://dominio`, **sem** `/<nicho>/` (barra final é ignorada; o build acrescenta `/<nicho>/` e gera canonical/`og:url` `…/<nicho>/` e `og:image` `…/<nicho>/og.png`) |
| `nomeGrupo` | Nome do grupo (também em `meta.title`, `rodape.avisoAfiliados`, no `og.png` e no rodapé "© ano nome") |
| `convite` | `https://chat.whatsapp.com/CODIGO` (sem colchetes) |
| `politicaPrivacidade` | URL `https` da política; precisa citar GA4 e Clarity |
| `meta.title` | Título da página (com o nome do grupo) |
| `exemploOferta.texto` | Exemplo ilustrativo de oferta, uma informação por linha (`\n`): produto, preço na loja e "Preços e estoque mudam. Confirme na loja."; o rótulo "Exemplo ilustrativo" vem de `ui.previaBadge` |
| `confianca.pontos[1]` | Lojas reais no lugar de `[LOJAS]` |
| `analytics.ga4` | ID do GA4, `G-XXXXXXXXXX` |
| `analytics.clarity` | ID do projeto do Clarity (`^[a-z0-9]{4,20}$`) |
| `rodape.avisoAfiliados` | Aviso de afiliados com o nome do grupo |
| `ui.heroEtiqueta` (opcional) | Etiqueta curta acima do `<h1>` (no pet: "Grupo gratuito no WhatsApp"); ausente ou `""` não aparece |

Imagens (não bloqueiam o build):
- `imagens[1]` (preview: produto pet, 128x128 exibida em 64x64, até 8 KB): coloque o arquivo em `src/img/` e troque o `src` pelo nome do arquivo; o thumb da prévia passa a ser esse `<img>` (com `width`/`height`, `loading="lazy"` e o `alt` do content). Com `[IMAGEM: ...]` aparece uma caixa neutra no lugar, sem texto. Pode apontar para o próprio logo (no pet hoje: `pet/logo.webp`, 128x128 exibido em 64x64).
- `logo` (opcional): `{src, alt, width, height, favicon, appleTouchIcon}`, os três arquivos em `src/img/` (no pet: `src/img/pet/logo.webp` 128x128 (3x para telas densas) exibido em 40x40, `favicon.png` 48x48 e `apple-touch-icon.png` 180x180, gerados do PNG 640x640 do dono com Pillow). O `src` aparece no cabeçalho à esquerda do nome (`alt=""`, `loading="eager"`, sem `fetchpriority`: o LCP continua o `<h1>`); `width`/`height` são o tamanho exibido (o CSS fixa 40px; se mudar, a dobra em 320x568 com o banner aberto tem só ~12 px de folga). O build copia `favicon` para `dist/<nicho>/favicon.png` (vira o `<link rel="icon">`) e `appleTouchIcon` para `dist/<nicho>/apple-touch-icon.png`, que também é o ícone do `og.html`/`og.png`. Sem `logo` (ou `null`), tudo como antes: só o nome em texto, `favicon.svg` gerado pela cor de destaque e `apple-touch-icon.png` pelo `og.mjs`.
- `imagens[0]` (hero): **fica fora desta entrega.** O template não renderiza imagem no hero (o `<h1>` é o LCP); preencher o slot só copia o arquivo para `dist/assets/img/`.

`provaSocial` fica `null` até haver dado real com `fonte`; não invente número nem depoimento.

Deixar `analytics.ga4` e `analytics.clarity` vazios (ou placeholder) desliga o banner e todo analytics. Depois de preencher: `node build.mjs && node scripts/og.mjs pet && npm run verify && node build.mjs --release`.

## Como criar outro nicho

1. `cp content/pet.json content/<nicho>.json` (nome `^[a-z0-9-]+$`).
2. Troque `nicho`, textos, `corDestaque {accent, onAccent}` (confira contraste >= 4,5:1), `convite`, `siteUrl` e IDs. Para o logo, ponha os três arquivos em `src/img/<nicho>/` e ajuste `logo` (ou apague o campo para usar só o nome).
3. `node build.mjs <nicho> && node scripts/og.mjs <nicho>` gera `dist/<nicho>/`.
4. `node scripts/check.mjs <nicho> && node scripts/browser-check.mjs <nicho>`.
5. Template, CSS e JS são compartilhados em `dist/assets/`; esquema do content no comentário do topo de `build.mjs`.

## A/B de headline e CTA

- Até 3 headlines e 3 CTAs em `content.ab.headlines[]` e `content.ab.ctas[]`; `content.ab.padrao = {h, c}` diz qual aparece sem parâmetro (e sem JS).
- Na URL do anúncio: `.../pet/?h=2&c=3` escolhe headline 2 e CTA 3. Valor inválido ou fora da lista cai no padrão; o parâmetro nunca vira texto da página.
- Todas as variantes estão no HTML; um script inline no `<head>` só troca `data-h`/`data-c` no `<html>`, antes da primeira pintura (sem flash nem CLS).
- Não há sorteio no site: a divisão de tráfego é feita nos anúncios (uma URL por conjunto). O evento do GA4 leva `variant` = `h{N}c{M}`.

## Medição: o que os números significam

- **Mede-se clique no CTA, não ingresso no grupo.** O evento `click_whatsapp_cta` (parâmetros `cta_location` = hero/sticky/final, `niche`, `variant`) conta quem tocou no botão. Quem toca e não entra, ou entra por outro caminho, não aparece como ingresso. O site não vê o WhatsApp.
- **Sem consentimento não há evento.** GA4 e Clarity só carregam depois de "Aceitar", e só depois do `load`. Quem recusa (ou ignora o banner) não gera dado nenhum: o número do GA4 é um piso, não o total de cliques.
- **A contagem real de ingressos vem de link/grupo por campanha.** Use um grupo (ou um link de convite) por campanha de anúncio e compare os ingressos que o próprio WhatsApp mostra com os cliques do Meta Ads e do GA4. Para A/B, use uma URL com `?h=&c=` por conjunto de anúncios.
- Nada de dado pessoal: a escolha de consentimento fica só no `localStorage` do visitante (`consent.v1`, vale 12 meses); o evento leva só valores de listas fechadas.
- Revogar: o botão "Preferências de cookies" no rodapé reabre o banner; "Recusar" depois de ter aceitado nega o consentimento, apaga `_ga*`, `_clck`, `_clsk` e recarrega.

## Resultados medidos (2026-11-02, build com placeholders)

- Lighthouse 12.8.2, mobile, contra `scripts/serve.mjs` (medido antes da identidade laranja, 2026-11-02; remedir): Desempenho 100, Acessibilidade 100, SEO 100; FCP 1,1 s, LCP 1,4 s, TBT 0 ms, CLS 0; 67 KiB transferidos.
- Peso inicial sem analytics (identidade laranja, `scripts/check.mjs` CA18): HTML 13,5 KB + CSS 17,9 KB + JS 16,0 KB (`consent.js` 12,5 + `ui.js` 3,5) + fontes 67,2 KB (Fredoka 29,0 + Nunito 38,2), 114,6 KB (82,8 KB com gzip; limite do plano: 200 KB). As licenças `OFL-*.txt` não contam.
- Fontes: Fredoka (títulos; `<h1>` = LCP, única com `preload`) e Nunito (texto), woff2 variáveis, subset latino, locais em `src/fonts/` com as licenças `OFL-fredoka.txt` e `OFL-nunito.txt` (o build copia só essas quatro para `dist/assets/fonts/` e recria a pasta, sem fonte órfã). Faltando qualquer uma das duas woff2, o build avisa, não faz preload e a página usa as famílias de fallback calibradas do `styles.css`.
- CLS com as fontes atrasadas 1,5 s (fallback calibrado, medido em Chrome headless com proxy local que segura os `.woff2`): 0 em 320 e 390 px; 0,031 em 360 px; 0,005 em 768 px; 0,022 em 1280 px (limite 0,1); afirmado em `test/qa-navegador.test.mjs` ("CLS <= 0,1 com as fontes atrasadas"). Com o banner abrindo depois de um load lento, o CLS fica ≤ 0,1 em 320, 360, 390 e 1280 px: o `.consent` é `position: absolute` dentro do `.dock` e não muda a geometria dele (teste "CLS <= 0,1 com banner abrindo depois de load lento"). Folga do CTA do hero sobre o banner aberto em 320x568: ~12 px com a fonte e 11,6 px no fallback (teste `test/qa-navegador.test.mjs`, "fonte atrasada (1,5 s) ou ausente").
- INP de campo: não medido (ver checklist).

## Publicação

Ordem: `node build.mjs && node scripts/og.mjs <nicho> && npm run verify && node build.mjs --release`, depois publique `dist/`.

**Cabeçalhos HTTP no host** (a `<meta>` CSP não cobre tudo; `frame-ancestors` só vale como cabeçalho):

| Cabeçalho | Valor |
|---|---|
| `Content-Security-Policy` | `frame-ancestors 'none'` (a CSP completa continua na `<meta>` gerada pelo build) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (só com HTTPS já funcionando em todos os subdomínios) |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()` |

**Política de privacidade** (URL em `politicaPrivacidade`; o texto é do dono e deve dizer):
- que a página usa **Google Analytics 4** (Google) e **Microsoft Clarity** (Microsoft), só depois de "Aceitar";
- que o Clarity faz **gravação de sessão** (cliques, rolagem e movimentos, com mascaramento de texto) e mapas de calor;
- que os dados vão para servidores fora do Brasil (**transferência internacional**, art. 33 da LGPD) e quem são os operadores;
- a **base legal**: consentimento (art. 7º, I, LGPD);
- a **retenção**: prazo configurado no GA4 (ex.: 2 ou 14 meses) e no Clarity; a escolha no navegador vale 12 meses e depois o banner volta;
- **como revogar**: botão "Preferências de cookies" no rodapé → "Recusar" (apaga os cookies `_ga*`, `_clck`, `_clsk`), e um contato do responsável para os demais direitos do titular.

## Checklist de teste manual

O que o `browser-check` não cobre. Marque no dispositivo real com o build de release.

- [ ] Safari iOS: hero e CTA na primeira dobra, toque abre o app do WhatsApp, banner de consentimento, barra fixa.
- [ ] Chrome Android: idem; CTA abre o WhatsApp.
- [ ] Samsung Internet: idem.
- [ ] Navegador in-app do Instagram e do TikTok: o link `chat.whatsapp.com` abre o convite (ou o WhatsApp) a partir do CTA do hero, da barra fixa e do CTA final.
- [ ] GA4 DebugView: depois de "Aceitar", o clique gera `click_whatsapp_cta` com `cta_location`, `niche` e `variant`; com `?h=2&c=3` o `variant` é `h2c3`; depois de "Recusar" nada chega.
- [ ] Revogação: aceitar, depois "Preferências de cookies" e "Recusar": cookies `_ga*`, `_clck`, `_clsk` somem e a página recarrega sem analytics.
- [ ] Leitor de tela (VoiceOver e TalkBack): um `<h1>`, ordem de leitura, banner de cookies anunciado, barra fixa oculta fora da ordem de foco, CTAs com nome claro.
- [ ] Safe area em iPhone com notch: a barra fixa e o banner respeitam a área inferior (`env(safe-area-inset-bottom)`) e não cobrem o rodapé.
- [ ] INP de campo: depois de publicar, ver o relatório Core Web Vitals do Search Console ou o CrUX; meta <= 200 ms.
- [ ] Prévia de compartilhamento: colar a URL no WhatsApp e no Facebook Sharing Debugger e conferir `og.png` e título.

## Pendências conhecidas

- **Domínios do Clarity a confirmar com ID real.** A CSP libera `https://*.clarity.ms`, `https://c.bing.com` e `https://www.googletagmanager.com`/`*.google-analytics.com`, mas o `browser-check` intercepta a rede com IDs de teste (nada sai de verdade), então só viu `www.googletagmanager.com` e `www.clarity.ms`. Com ID real, abra o DevTools após "Aceitar" e confira se algum domínio é bloqueado pela CSP.
- **Formato dos IDs:** GA4 `^G-[A-Z0-9]{4,20}$` e Clarity `^[a-z0-9]{4,20}$`, definidos uma vez em `src/js/consent.js` (`GA4_RE`, `CLARITY_RE`) e importados pelo `build.mjs`. Um ID fora do formato é erro de build; se um ID real legítimo fugir disso, ajuste só ali.
- Pixels de anúncio (Meta etc.) não estão implementados; entrariam depois em `src/js/consent.js`.
- Texto da política de privacidade é do dono (ver "Publicação" abaixo).
- Hospedagem não definida: a CSP está em `<meta>` para não depender de cabeçalhos do host. Se o pet ficar na raiz do domínio, o build ainda não gera `dist/index.html`.
- `dist/pet/og.png` mostra o logo e "Garimpo Pet" na identidade laranja (fundo creme `#FFF4E8`, texto `#2B1408`, título em Fredoka, nome em Nunito); regenerar com `node scripts/og.mjs pet` sempre que nome, headline padrão, cor ou logo mudarem.
