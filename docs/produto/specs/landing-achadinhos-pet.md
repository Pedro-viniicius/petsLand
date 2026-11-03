# Especificação de UI/UX: landing do grupo de achadinhos pet

Brief: `docs/produto/briefs/landing-achadinhos-pet.md`. Não há `docs/produto/visao.md`; o público vem do brief. Textos de interface ficam no `content.json` (nunca no template). Valores marcados "estim." são estimativas de projeto e devem ser medidos pelo dev.

## Objetivo e usuário

- **Objetivo:** fazer o visitante tocar em um `<a>` e abrir o convite do grupo de WhatsApp. Uma decisão só: entrar ou não.
- **Usuário:** brasileiro que quer gastar menos com produtos pet, vindo de Instagram, TikTok ou anúncio, quase sempre no celular (360 a 430 px), com pressa, 4G irregular e sem paciência para texto longo. Desconfia de grupo de oferta (golpe de "senha e PIX"), então a confiança vem antes da insistência.
- **Critérios de aceite (numerados a partir do brief):**
  - CA1 Em 360x640, headline e CTA principal inteiros, sem rolar.
  - CA2 Sem rolagem horizontal de 320 a 1280 px.
  - CA3 Todos os CTAs levam ao mesmo convite e funcionam sem JavaScript.
  - CA4 Contraste do CTA e dos textos >= 4,5:1.
  - CA5 Barra fixa respeita áreas seguras e não cobre conteúdo.
  - CA6 Nenhum dado, número ou depoimento inventado.
  - CA7 LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1, acessibilidade >= 95 (ou pendência anotada).
  - CA8 Teste (ou lista de teste manual) em Safari iOS, Chrome Android e Samsung Internet.
  - CA9 (CTA) Uma só ação; no máximo 3 CTAs (hero, barra fixa, final), mesmo destino, `<a href>` direto, sem encurtador.
  - CA10 (CTA) Alvo >= 48x48 no CTA principal e >= 44x44 nos demais, com hover, focus-visible e active.
  - CA11 (CTA) Laranja de ação #C2410C com texto #FFFFFF (5,18:1). Era verde #25D366 até a troca de identidade de 2026-11-02 (`docs/produto/decisoes.md`).
  - CA12 (Design) Uma só cor de destaque, reservada às ações; um só `<h1>`; microinterações <= 300 ms com `prefers-reduced-motion`.
  - CA13 (Design) Fredoka (títulos) e Nunito (texto) variáveis locais, corpo 16-17 px, line-height >= 1.5, headline com `clamp()`. (Antes: Inter, depois Manrope; ver `decisoes.md`.)
  - CA14 (Copy) Headline <= 12 palavras, subtítulo <= 20, benefício antes da ação, microcopy de segurança junto ao CTA.
  - CA15 (Copy/Confiança) Todos os pontos de transparência e o aviso de afiliados presentes; prova social omitida.
  - CA16 (LGPD) Link da política e banner leve, sem layout shift, que não cobre o CTA.
  - CA17 A página inteira cabe em cerca de 5 telas.

## Fluxo

Chega pelo anúncio, lê headline e subtítulo, toca em "Entrar no grupo grátis", o WhatsApp abre o convite. Quem hesita rola: benefícios, como funciona, confiança. A barra fixa mantém o CTA à mão depois que o do hero sai da tela; o CTA final fecha. Sem menu, sem formulário, sem pop-up. Sem JS: hero e final funcionam; a barra e o banner simplesmente não aparecem (e nenhum analytics carrega).

## Tokens (viram custom properties em `styles.css`)

**Cores** (só tema claro, `color-scheme: light`; `theme-color` #FFF4E8). Fonte: guia `docs/produto/identidade-visual-laranja.png` (2026-11-02).

| Token | Valor | Uso |
|---|---|---|
| `--bg` / `--surface` | #FFFFFF | fundo geral, cards, barra fixa, banner, balão da prévia |
| `--surface-2` | #FFF4E8 | topo (cabeçalho + hero), seções alternadas (Como funciona, CTA final), caixas de ícone |
| `--surface-3` | #FCE9D6 | badge da prévia, active do `<summary>` e dos botões do banner |
| `--divider` | #F1DCC8 | divisores e contorno decorativo de card |
| `--border` | #9C7F6C | borda de componente (`<details>`), >= 3:1 |
| `--text` / `--focus` | #2B1408 | títulos, texto principal, anel de foco |
| `--text-muted` | #6B5446 | subtítulo, descrições, legendas, avisos |
| `--brand` / `--on-brand` | #E85D10 / #FFFFFF | ícones, círculo dos passos (número 22 px bold = texto grande). Nunca texto pequeno |
| `--highlight` / `--on-highlight` | #FFD45C / #2B1408 | etiqueta "Grupo gratuito no WhatsApp" sobre o h1 |
| `--accent` / `--accent-hover` / `--accent-active` | #C2410C / mix 88% e 77% com preto | só CTAs; `--link` = `--accent` (links do rodapé e do banner) |
| `--on-accent` | #FFFFFF | texto dos botões |

Sem faixa escura: o CTA final usa `--surface-2` (#FFF4E8), como o hero. Motivo: o guia não define superfície escura; o fundo claro alternado é a regra dele; o botão contrasta mais com #FFF4E8 (4,77:1) do que com #2B1408 (3,36:1); e o fechamento repete o topo, o que ajuda o reconhecimento.

**Contraste calculado (WCAG):**

| Par | Razão | Meta |
|---|---|---|
| `--text` sobre #FFFFFF / #FFF4E8 / #FCE9D6 | 17,41 / 16,05 / 14,73:1 | 4,5 ok |
| `--text-muted` sobre #FFFFFF / #FFF4E8 / #FCE9D6 | 7,04 / 6,49 / 5,96:1 | 4,5 ok |
| `--on-accent` sobre `--accent` (hover e active são mais escuros, só sobem) | 5,18:1 | 4,5 ok |
| Botão `--accent` sobre #FFFFFF / #FFF4E8 (limite do componente) | 5,18 / 4,77:1 | 3,0 ok |
| Link `--accent` 14 px sobre #FFFFFF | 5,18:1 | 4,5 ok |
| Anel de foco `--focus` sobre #FFFFFF / #FFF4E8 | 17,41 / 16,05:1 | 3,0 ok |
| `--on-highlight` sobre `--highlight` | 12,29:1 | ok |
| Número branco sobre `--brand` (22 px bold, texto grande) | 3,50:1 | 3,0 ok |
| Ícone `--brand` sobre #FFF4E8 / #FFFFFF | 3,22 / 3,50:1 | 3,0 ok |
| `--border` sobre #FFFFFF / #FFF4E8 | 3,71 / 3,42:1 | 3,0 ok |
| `--brand` como texto pequeno sobre branco (proibido) | 3,50:1 | reprova |

**Espaçamento (escala de 8 px):** `--s-0` 4 (só microespaço), `--s-1` 8, `--s-2` 16, `--s-3` 24, `--s-4` 32, `--s-5` 48, `--s-6` 64, `--s-7` 96. Gutter lateral: 16 px (<768), 24 px (>=768), container máx. 1080 px.
**Raio:** `--radius` 16 px (cards, balão, summary); `--radius-pill` 999 px (botões CTA e do banner, etiqueta, badge).
**Sombras:** `--shadow-1` (cards, balão), `--shadow-btn` (CTA, leve brilho laranja), `--shadow-2` (barra fixa, banner), todas no marrom #2B1408.
**Tipografia:** Fredoka (títulos e números, `wght` 300-700) e Nunito (texto e botões, `wght` 200-1000), woff2 variáveis, subset latino, locais em `src/fonts/` (licenças `OFL-fredoka.txt`, `OFL-nunito.txt`), `font-display: swap`, preload só da Fredoka (fonte do h1 = LCP). Fallbacks calibrados com fontTools sobre o texto da página: `Fredoka Fallback` (Arial Bold, `size-adjust` 94,1%, ascent 103,5%, descent 25,1%) e `Nunito Fallback` (Arial 101,7% para peso < 650; Arial Bold 97,7% para 650+). Peso das fontes: 29 + 38 KB.

| Token | Valor (360 → 1280 px) | Família / peso | Line-height |
|---|---|---|---|
| `--fs-h1` | `clamp(2rem, 1.22rem + 3.48vw, 4rem)` (32 → 64; 30 abaixo de 360) | Fredoka 700 | 1.05 |
| `--fs-h2` | `clamp(2rem, 1.7065rem + 1.304vw, 2.75rem)` (32 → 44) | Fredoka 700 | 1.1 |
| `--fs-h3` | `clamp(1.375rem, 1.228rem + 0.652vw, 1.75rem)` (22 → 28) | Fredoka 600 | 1.2 |
| `--fs-lead` | `clamp(1.125rem, 1.076rem + 0.217vw, 1.25rem)` (18 → 20) | Nunito 600 | 1.6 |
| `--fs-body` | `clamp(1rem, 0.9755rem + 0.109vw, 1.0625rem)` (16 → 17) | Nunito 600 | 1.6 |
| `--fs-small` | 0.875rem (14) microcopy, legenda, rodapé, banner | Nunito 700 | 1.5 |
| `--fs-btn` | 1.125rem (18), altura mín. 52 (56 no hero/final) | Nunito 800 | 1.2 |
| `--fs-tag` | 0.875rem (14), maiúsculas, `letter-spacing: 2px` | Nunito 800 | 1.5 |

Desvio consciente do guia: h1 de 32 px no celular (guia: 40), para h1 + CTA caberem em 360x640 e 320x568 com o banner de cookies aberto. Abaixo de 360 px a etiqueta some e o h1 vai a 30 px.

Linhas de texto limitadas a `max-width: 65ch` (45-75 caracteres).

## Layout (mobile 360 e desktop)

Estrutura semântica: `<header>` (logo + nome do grupo, Fredoka 22 px/600, não é link) · `<main>` com 5 `<section>` · `<footer>` · `.dock` fixo. Fundos: cabeçalho e hero #FFF4E8 · benefícios #FFFFFF · como funciona #FFF4E8 · confiança #FFFFFF · CTA final #FFF4E8 · rodapé #FFFFFF. Padding vertical de seção: `--s-5` (48) mobile, `--s-7` (96) desktop.

**Breakpoints:** 768 px (tablet: grids de 3 colunas, barra fixa some) e 1024 px (desktop: duas colunas onde simplifica). Entre 600 e 767 o conteúdo fica em coluna única, centralizado, `max-width: 36rem`.

| # | Seção | Mobile 360 | Tablet/desktop |
|---|---|---|---|
| 1 | Hero | Coluna, alinhado à esquerda: etiqueta amarela (>= 360 px), `<h1>`, subtítulo, CTA pill largura total (56 px, ícone de balão à esquerda), microcopy. Sem imagem. | Centralizado, texto `max-width: 44rem`, CTA com largura automática (mín. 320 px) |
| 2 | Benefícios | `<h2>` + 3 cards empilhados (ícone 40 px à esquerda, título e 1 linha) | 3 colunas a partir de 768 px, cards de mesma altura |
| 3 | Como funciona | `<h2>`, 3 passos em lista ordenada `<ol>` (número em círculo 40 px), depois a mini-prévia | 3 passos em coluna à esquerda e prévia à direita (>=1024); 3 colunas e prévia abaixo (768-1023) |
| 4 | Confiança | `<h2>`, 3 pontos visíveis com check, depois 4 `<details>` | Duas colunas (>=1024): pontos à esquerda, `<details>` à direita |
| 5 | CTA final | Faixa `--surface-2`: `<h2>`, CTA largura total, microcopy | Centralizada, CTA automático |
| 6 | Rodapé | Aviso, link da política, botão "Preferências de cookies", copyright | Em linha única centralizada |

### Estimativa de altura em 360x640 (CA1 e CA17)

> Medido em 2026-11-02 com Fredoka/Nunito (Chrome): 360x640 com etiqueta, h1 termina em 218 e CTA em 400 (banner começa em 464); 320x568 sem etiqueta, CTA em 380 (banner em 392). A tabela abaixo é a estimativa original (Inter) e fica como histórico.

Largura útil 328 px. Inter 700 a 28,6 px ~16 px/caractere (~20 por linha); subtítulo a 17,1 px ~38 por linha; microcopy a 14 px ~43 por linha.

| Bloco do hero | Típico (px) | Pior caso (px) |
|---|---|---|
| Padding superior | 24 | 24 |
| Nome do grupo + margem | 24+16 | 24+16 |
| `<h1>` (4 linhas x 32,9; pior caso 5 linhas, headline C) | 131 | 164 |
| Margem | 16 | 16 |
| Subtítulo (3 linhas x 25,7; pior 4) | 77 | 103 |
| Margem | 24 | 24 |
| CTA | 56 | 56 |
| Margem + microcopy (2 linhas; pior 3) | 12+40 | 12+60 |
| **CTA termina em** | **~420** | **~479** |
| Padding inferior | 40 | 40 |

CTA e microcopy terminam em y <= 479 de 640 (folga >= 160 px), inclusive em 320x568 (~494 < 568). Com o banner de consentimento aberto (~133 px, y >= 507) o CTA e a microcopy continuam livres. O hero **não** tem `min-height: 100vh`: sobra espaço para o topo dos benefícios aparecer e sugerir rolagem.

Altura da página em 360 px (estim.): hero 460 (pior 519) + benefícios 485 + como funciona 630 + confiança 542 + CTA final 290 + rodapé 214 + reserva da barra 64 = **~2.685 px (pior ~2.744), cerca de 4,2 a 4,3 telas de 640 px**; em tela de 812 px, ~3,3. Abaixo das 5 telas.

## Componentes

| Componente | Existente ou novo | Onde fica |
|---|---|---|
| Botão CTA (`.btn`, variantes hero/final/sticky) | novo | `styles.css`, template |
| Card de benefício | novo | idem |
| Passo numerado | novo | idem |
| Mini-prévia (`.preview`: badge + balão + slot de imagem) | novo | seção 3 |
| Lista de confiança com check | novo | seção 4 |
| `<details>` estilizado (`.faq`) | novo | seção 4 |
| Barra fixa (`.sticky`) e banner (`.consent`) dentro de `.dock` | novo | fim do `<body>` |
| Ícones SVG inline | novo | template, sem pacote |

Nenhum design system existente; tudo acima nasce dos tokens.

## Textos da interface (vão para `content.json`)

Placeholders entre colchetes são do dono. Nada de números, depoimentos ou promessas.

**Meta:** `<title>` "[NOME DO GRUPO] | Achadinhos pet no WhatsApp"; description "Grupo gratuito com ofertas selecionadas para o seu pet, direto no WhatsApp. Você compra na loja, sem senha nem PIX." (OG e Twitter iguais.)

**Hero**
- Nome: `[NOME DO GRUPO]`
- `<h1>` (A, 8 palavras): "Receba achadinhos pet selecionados direto no seu WhatsApp"
- Subtítulo (14 palavras): "Ofertas de ração, brinquedos e acessórios garimpadas pra você. Você compra direto na loja."
- CTA: "Entrar no grupo grátis"
- Microcopy: "Grátis • Não pedimos senha nem PIX • Saia quando quiser"

**Benefícios** (`<h2>`: "Por que entrar")
1. Ícone relógio. "Menos tempo procurando" / "A gente separa as ofertas pet. Você só abre e confere."
2. Ícone etiqueta. "Ofertas selecionadas" / "Ração, petiscos, brinquedos, caminhas e acessórios, com link direto da loja."
3. Ícone balão. "Tudo no WhatsApp" / "Sem app novo e sem cadastro. As ofertas chegam onde você já conversa."

**Como funciona** (`<h2>`: "Como funciona")
1. "Toque no botão" / "O convite abre no seu WhatsApp."
2. "Entre no grupo" / "É grátis e você sai quando quiser."
3. "Receba as ofertas" / "Veja os achados e compre direto na loja."
- Mini-prévia: badge "Exemplo ilustrativo". Balão: "Achadinho: [NOME DO PRODUTO PET]" / "[PREÇO] na [LOJA]" / "[link da loja]" / "Preços e estoque mudam. Confirme na loja." Legenda: "Exemplo ilustrativo de como as ofertas aparecem. Não é uma oferta real."

**Confiança** (`<h2>`: "O que você precisa saber")
- Visíveis: "O grupo é gratuito." · "Você compra direto nas lojas ([LOJAS]), não com a gente." · "Nunca pedimos senha nem PIX."
- `<details>` 1: "Quem cuida do pagamento, da entrega e da garantia?" → "O vendedor ou a plataforma onde você compra. Para dúvidas sobre o pedido, fale com a loja."
- `<details>` 2: "Os links são de afiliados?" → "Alguns podem ser. Se você comprar por eles, podemos receber uma comissão, sem custo extra para você."
- `<details>` 3: "Preço e estoque mudam?" → "Sim, a qualquer momento. Confirme o preço, o frete e o estoque na loja antes de comprar."
- `<details>` 4: "Posso sair do grupo?" → "Pode, quando quiser, pelas opções do próprio WhatsApp."

**CTA final:** `<h2>` "Pronto para receber achadinhos pet no WhatsApp?" · CTA "Entrar no grupo grátis" · microcopy igual ao do hero.

**Rodapé:** "Alguns links deste grupo são de afiliados: podemos receber comissão se você comprar, sem custo extra para você. [NOME DO GRUPO] é um grupo independente; nomes de lojas e marcas pertencem aos seus donos. Preços e estoque podem mudar: confirme na loja." · link "Política de privacidade" ([URL]) · botão "Preferências de cookies" · "© [ANO] [NOME DO GRUPO]".

**Barra fixa:** só o CTA "Entrar no grupo grátis" (mesmo texto e href).

**Banner:** "Usamos cookies de análise para entender como a página é usada. A página funciona igual sem eles." + link "Política de privacidade" + botões "Aceitar" e "Recusar". Confirmação (`role="status"`, só leitor de tela): "Preferência salva."

**A/B (via `content.json` ou `?v=`; `variante` vai no evento `click_whatsapp_cta`)**
- Headline: A "Receba achadinhos pet selecionados direto no seu WhatsApp" (8) · B "Ofertas para seu pet, selecionadas e direto no WhatsApp" (9) · C "Pare de caçar ofertas pet: a gente garimpa e avisa no WhatsApp" (12).
- CTA: A "Entrar no grupo grátis" · B "Receber ofertas no WhatsApp" · C "Quero receber achadinhos pet".

## Ícones (SVG inline, `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, traço 2 px, pontas e junções redondas, `aria-hidden="true" focusable="false"`)

| Ícone | Tamanho | Paths |
|---|---|---|
| relógio | 24 em caixa 40 | `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>` |
| etiqueta | 24 em caixa 40 | `<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.2"/>` |
| balão | 24 em caixa 40; 20 nos botões CTA, à esquerda do texto (como no guia) | `<path d="M4 5h16v11H9l-5 4z"/>` |
| check (pontos de confiança) | 20 em círculo 28 `--surface-2`, traço `--brand` | `<path d="M5 12.5l4.5 4.5L19 7.5"/>` |
| chevron (`<summary>`) | 24 | `<path d="M6 9l6 6 6-6"/>` |
| info (badge "Exemplo ilustrativo") | 16 | `<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>` |

Caixa dos ícones de benefício: 40x40, `--surface-2`, raio 12, ícone em `--brand`. Não usar logo de WhatsApp nem de loja.

## Imagens

Padrão: **nenhuma imagem no hero; o `<h1>` é o LCP.** Razões: o texto renderiza antes de qualquer arquivo (LCP e peso <= 200 KB mais fáceis), a imagem não ajuda a entender a oferta nem a entrar no grupo, e em 360x640 ocuparia o espaço do CTA. Slots (todos com `width`/`height`, `loading="lazy"`, sem `fetchpriority`, exceto se o dono ativar o hero):
- `hero.imagem` (desligado): [IMAGEM: cachorro e gato juntos, luz natural, fundo neutro, 4:3, <= 60 KB AVIF/WebP]. Só se o dono pedir; então só em >= 1024 px, e o dev refaz a medição de LCP.
- `preview.thumb`: logo do grupo (`pet/logo.webp`, 128x128 exibido em 64x64, 2 KB, `alt=""`), a pedido do dono em 2026-11-02; texto do exemplo: "Achadinho: Caminha pet redonda, tamanho M / R$ 59,90 na loja / Preços e estoque mudam. Confirme na loja." (sem loja real). Sem arquivo, caixa `--surface-2` vazia.
- `og.imagem`: [IMAGEM: card 1200x630 com o nome do grupo em texto grande sobre fundo neutro e um pet].
- `favicon`: [IMAGEM: ícone simples de patinha, SVG + PNG 180].

## Estados

**CTA (`.btn`, `<a>`):**
- Padrão: fundo `--accent` #C2410C, texto `--on-accent` #FFFFFF Nunito 18/800, pill, `--shadow-btn`, altura 56 (hero e final) ou 52 (barra), padding horizontal 24 (32 a partir de 768), ícone de balão 20 px + texto.
- Hover (só `@media (hover: hover)`): fundo `--accent-hover`, `translateY(-1px)`, 150 ms.
- Focus-visible: `outline: 3px solid var(--focus); outline-offset: 3px` (#2B1408 sobre fundo claro, >= 16:1). Nunca remover o foco.
- Active: fundo `--accent-active`, `translateY(0) scale(.98)`, 100 ms: feedback imediato ao toque. `:visited` igual ao padrão.
- Sem estados de desabilitado ou carregando: é um link; a navegação não pode ser atrasada.
- Texto longo ou zoom 200%: o botão cresce em altura, sem cortar; `text-wrap: balance`.

**`<details>`:** `<summary>` com altura mín. 56, padding 12x16, raio 14, `--surface`, `--border`, chevron à direita; marcador nativo oculto (`list-style: none` e `::-webkit-details-marker`). Hover: `--surface-2`. Active: `--surface-3`. Foco: mesmo anel. Aberto: chevron gira 180 graus em 200 ms; o conteúdo aparece sem animação de altura. Todos fechados no carregamento. Funciona sem JS.

**Banner (`.consent`):** oculto (`hidden`) até o JS decidir; mostrado depois do `load` se não há escolha salva. Fixo no `.dock`, então não causa layout shift. Entra com `translateY` de 200 ms. "Aceitar" e "Recusar" iguais: pill, fundo `--surface`, borda 2 px `--text`, texto `--text` Nunito 800. Mesmo tamanho (48 px, 50% cada), mesmo peso visual. O laranja de ação não é usado aqui para não competir com o CTA; o link da política usa `--link`. Não prende foco, não recebe foco automático, não é modal. Depois de escolher: sai (200 ms), grava a escolha em `localStorage` dentro de try/catch (se falhar, volta a perguntar na próxima visita) e anuncia "Preferência salva.". "Recusar" nunca carrega GA4 nem Clarity. O botão "Preferências de cookies" do rodapé reabre o banner.

**Microinterações (todas <= 300 ms):** hover/active do CTA, chevron, entrada e saída da barra e do banner. Nada decorativo. Com `prefers-reduced-motion: reduce`: `transition-duration: 0.01ms`, sem `transform` em hover/active (a troca de cor permanece), barra e banner aparecem e somem sem deslizar, chevron troca sem girar.

## Barra fixa mobile (`.sticky`, dentro de `.dock`)

- **Aparece** quando o CTA do hero (`#cta-hero`) sai da tela por cima: `IntersectionObserver`, `isIntersecting === false` e `boundingClientRect.top < 0`.
- **Some** quando o CTA final (`#cta-final`) entra na tela (qualquer pixel visível, `rootMargin: 0`), e **continua escondida** enquanto ele estiver acima do viewport (`top < 0`), para a barra não voltar sobre o rodapé. Regra: `visível = heroSaiuPorCima && !finalVisivelOuJaPassou`.
- Só em < 768 px (`display: none` acima disso). Sem JS ou sem `IntersectionObserver`: fica oculta (`visibility: hidden` por padrão); sobram os dois CTAs.
- Estado oculto = `transform: translateY(100%)` + `visibility: hidden` (transição de 200 ms; a visibilidade muda no fim), para o link duplicado não ser focável nem lido por leitor de tela quando invisível.
- **Visual:** `--surface`, `--shadow-2`, padding 8 16, botão 52 de altura, largura total. Altura total = 68 px + `env(safe-area-inset-bottom)`. `padding-bottom` da barra: `calc(8px + env(safe-area-inset-bottom))`; `viewport-fit=cover` no meta viewport; laterais com `env(safe-area-inset-left/right)`.
- **Não cobrir conteúdo:** (1) a barra só aparece depois do CTA do hero e some antes do CTA final e do rodapé, então não esconde nenhum CTA; (2) o `<footer>` reserva no mobile `padding-bottom: calc(var(--s-4) + 64px + env(safe-area-inset-bottom))`, sempre, para não haver salto de layout; (3) `html { scroll-padding-bottom: 92px }` e `scroll-margin-bottom` nos focáveis, para o foco por teclado (WCAG 2.4.11) nunca ficar sob a barra; (4) `position: fixed` não altera o fluxo, CLS = 0.
- **`.dock`:** `position: fixed; inset: auto 0 0; z-index: 50`. Ordem vertical: barra acima, banner abaixo (encostado na borda). Com banner aberto, a barra sobe junto, sem sobreposição.
- Evento: `cta_location` = `hero`, `sticky` ou `final` (um `data-cta-location` por link); disparo com beacon, sem `preventDefault`.

## Acessibilidade

- `lang="pt-BR"`, um `<h1>`, `<h2>` por seção, landmarks `header/main/footer`, sem menu (não precisa de skip link).
- CTA: `<a href>` com texto visível igual ao nome acessível; sem `target="_blank"` (abre o app direto); sem `aria-label` divergente.
- A prévia usa `<figure>`/`<figcaption>`; o badge é texto + ícone, nunca só cor.
- Contrastes na tabela acima; alvo >= 44 px em todos os controles (summary 56, botões do banner 48, links do rodapé 44).
- Reflow em 320 px e zoom 200% sem rolagem horizontal; `overflow-wrap: anywhere` em textos longos; espaçamento de texto ajustável sem perda.
- Banner e barra: `role="region"` com `aria-label` ("Preferências de cookies", "Atalho para entrar no grupo"); mudança de estado anunciada só no banner (`role="status"`).
- `prefers-reduced-motion` respeitado; nada se move sozinho.

## O que o dev precisa implementar

1. Tokens e componentes acima em `styles.css` (mobile-first, 2 media queries: 768 e 1024).
2. Template com as seis seções na ordem, ícones inline, slots de imagem lidos do `content.json` (sem imagem = não renderiza `<img>`).
3. `content.json`: todos os textos desta spec, variantes de headline e CTA, `?v=` para escolher, link do convite único, IDs de analytics, URL da política.
4. JS mínimo com `defer`: IntersectionObserver da barra, banner (localStorage), carga de GA4 e Clarity só após aceite e depois do `load`, evento `click_whatsapp_cta`.
5. Fontes Fredoka e Nunito locais, preload só da Fredoka, fallbacks ajustados; medir CLS.
6. Teste manual: Safari iOS (safe-area, `<details>`), Chrome Android, Samsung Internet; 320, 360, 390, 430, 768, 1280 px; zoom 200%; teclado.

## Arquivos de presentação afetados

Todos novos (a stack está no plano do `arquiteto`): `styles.css`, template HTML, `content.json` (textos e slots), fonte WOFF2, ícones inline no template, JS da barra e do banner (apenas a parte de interface).

## Perguntas em aberto

1. Confirmar "grupo independente" no rodapé e a lista de lojas ([LOJAS]); o dono não preencheu.
2. Aceita só tema claro nesta versão? (Modo escuro fica de fora.)
3. O dono quer imagem no hero? Padrão é não ter, por LCP e foco no CTA.
4. Critério de seleção das ofertas: sem dado do dono, o texto diz apenas "selecionadas", sem descrever como.
