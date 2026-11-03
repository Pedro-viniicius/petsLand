# Brief: landing page do grupo de achadinhos pet

Origem: pedido do dono em 2026-11-02, colado abaixo sem alterações. Nicho escolhido pelo dono: **PET** ("lande page para achadinhos de pets"). Campos entre colchetes que o dono não preencheu continuam como placeholder; a regra do pedido é não perguntar e seguir com placeholders.

Decisão já tomada pelo dono (não reabrir): a stack está definida no próprio pedido (HTML estático pré-renderizado, CSS e JS vanilla, content.json + build em Node sem dependências).

---

# PAPEL E TAREFA
Você é um designer de produto e desenvolvedor front-end sênior, especialista em landing pages mobile-first e CRO para o público brasileiro.

Crie a landing page do grupo de WhatsApp de achadinhos "[NOME DO GRUPO]". A página tem um único objetivo: fazer o visitante entrar no grupo, tocando no CTA e abrindo o convite do WhatsApp, com o menor atrito possível.

# CONTEXTO (substitua os campos entre colchetes)
- Nicho: PET
- Link do convite: [https://chat.whatsapp.com/CODIGO]
- O que o grupo entrega: [ex.: ofertas selecionadas de lojas online, postadas com link de afiliado]
- Lojas/programas de afiliados: [ex.: Amazon, Shopee, Mercado Livre]
- Público e origem do tráfego: [ex.: quem quer economizar em compras online, vindo de Instagram/TikTok/anúncios, quase todo mobile]
- Tom de voz: próximo, simples e direto, sem exageros
- Identidade: [logo e cores, se houver; sem logo, use só o nome em texto]
- Política de privacidade: [URL]
- Idioma: português do Brasil

# PRIORIDADES
Inegociáveis: acessibilidade (WCAG 2.2 AA), transparência (nenhuma alegação falsa) e privacidade (LGPD).
Em qualquer outro conflito entre regras, siga esta ordem e registre a decisão: clareza e conversão > performance > estética.
Teste final para toda decisão de UX, UI, conteúdo, animação ou tecnologia: "Este elemento ajuda o visitante a entender o valor da oferta, confiar na proposta ou entrar no grupo com mais facilidade?" Se não ajuda, remova.

# STACK E REUSO
- HTML estático pré-renderizado (nenhum conteúdo montado só por JavaScript), CSS moderno e JavaScript vanilla mínimo, sem frameworks, pronto para hospedagem estática.
- Um único styles.css com design tokens e um único template. Tudo que varia por nicho ou campanha (textos, imagens, cor de destaque, link do convite, IDs de analytics) fica em um só lugar, fácil de trocar quando o grupo lotar (ex.: content.json + script de build em Node sem dependências). Entregue também os HTMLs já gerados, prontos para publicar.

# ESTRUTURA (nesta ordem, sem seções extras)
1. Hero: headline orientada a benefício (até 12 palavras), subtítulo (até 20), CTA principal e microcopy de segurança logo abaixo.
2. Benefícios: no máximo 3, cada um com título curto e uma linha (ângulos: economia de tempo, ofertas selecionadas, praticidade no WhatsApp).
3. Como funciona: 3 passos (toque no botão > entre no grupo > receba as ofertas e compre direto na loja). Opcional: mini-prévia de uma mensagem de oferta, rotulada "exemplo ilustrativo".
4. Confiança: os pontos de transparência abaixo; detalhes secundários em <details>.
5. CTA final: mesmo texto, mesmo destino.
6. Rodapé mínimo: aviso de afiliados e política de privacidade. Sem menu.
A página inteira deve caber em cerca de 5 telas no celular e ser fácil de escanear.

# CTA E CONVERSÃO
- Uma única decisão para o visitante: entrar ou não no grupo (Lei de Hick).
- Texto específico: "Entrar no grupo grátis" ou "Receber ofertas no WhatsApp".
- No máximo 3 CTAs (hero, barra fixa no mobile, final), todos com o mesmo destino.
- O CTA é um <a> com href direto para o convite: funciona sem JavaScript, sem encurtadores, redirecionamentos ou páginas intermediárias.
- Em 360x640 px, headline e CTA principal aparecem inteiros, sem rolagem.
- Barra fixa inferior no mobile: surge quando o CTA do hero sai da tela e some quando o CTA final aparece (IntersectionObserver); usa viewport-fit=cover e env(safe-area-inset-bottom); não cobre conteúdo nem rodapé.
- Área de toque >= 48x48 px no CTA principal (>= 44x44 nos demais), com estados hover, focus-visible e active e feedback imediato.
- Cor: verde WhatsApp (#25D366) com texto escuro (ex.: #0B141A). Texto branco sobre #25D366 dá contraste de ~2:1 e reprova; se usar um verde mais escuro com texto branco, valide >= 4,5:1.

# COPY
- Benefício antes da ação. Em vez de "Participe do nosso grupo de WhatsApp", algo como "Receba achadinhos selecionados e descubra ofertas direto no seu WhatsApp".
- Frases curtas, linguagem natural, sem jargão e sem superlativos vazios.
- Microcopy junto ao CTA que remova dúvidas, ex.: "Grátis • Não pedimos senha nem PIX • Saia quando quiser".
- Adapte benefícios e exemplos ao nicho definido no arquivo de conteúdo.

# CONFIANÇA E TRANSPARÊNCIA
- Declare: o grupo é gratuito; as compras são feitas direto nas lojas; pagamento, entrega e garantia são responsabilidade do vendedor/plataforma; o grupo nunca pede senha nem PIX; os links podem ser de afiliados (pode haver comissão, sem custo extra para quem compra); preços e estoque mudam, então confirme na loja.
- Prova social (nº de membros, depoimentos, prints) só com dados reais que eu fornecer. Sem dados, omita.
- LGPD: link para a política de privacidade e, se usar cookies de analytics, banner de consentimento leve, sem layout shift e sem cobrir o CTA.

# DESIGN
- Minimalismo premium: neutros sofisticados e uma única cor de destaque, reservada às ações.
- Inter ou Manrope (variável, hospedada localmente, subset latino, font-display: swap, fallback de sistema). Corpo 16-18 px, line-height >= 1.5, headline fluida com clamp().
- Tokens em CSS custom properties: cores, espaçamento (escala de 8 px), raio (12-16 px, um padrão só), no máximo 2 níveis de sombra discreta.
- Um único <h1>; hierarquia título > subtítulo > CTA; proximidade e alinhamento (Gestalt); bastante espaço em branco.
- Cards leves; grid estilo bento no desktop só se simplificar a leitura.
- Ícones e ilustrações em SVG inline. Fotos do nicho como slots no arquivo de conteúdo, com placeholders marcados ([IMAGEM: descrição]); sem imagens externas.
- Microinterações sutis (<= 300 ms), respeitando prefers-reduced-motion.
- Mobile-first (360-430 px), adaptado para tablet e desktop, com componentes e estados consistentes.

# PERFORMANCE, ACESSIBILIDADE E SEO
- Metas no mobile: LCP <= 2,5 s, INP <= 200 ms, CLS <= 0,1; Lighthouse/PageSpeed Insights >= 95 em Desempenho, Acessibilidade e SEO; peso inicial <= 200 KB sem analytics.
- Elemento LCP: o <h1> ou uma imagem <= 60 KB em AVIF/WebP. Imagens com width/height; fetchpriority="high" só no LCP; loading="lazy" nas demais; scripts com defer.
- WCAG 2.2 AA: HTML semântico, contraste >= 4,5:1 (texto) e >= 3:1 (componentes), foco visível, navegação por teclado, alt nas imagens, lang="pt-BR", nada comunicado só por cor.
- Compartilhamento: title, meta description, Open Graph/Twitter card (1200x630), favicon e theme-color.

# MEDIÇÃO
- GA4 e Microsoft Clarity (IDs no arquivo de conteúdo; pixels de anúncios, se houver), carregados após o load e respeitando o consentimento, para não prejudicar LCP e INP.
- Evento click_whatsapp_cta com cta_location (hero | sticky | final), niche e variante, disparado sem atrasar a navegação (ex.: transport_type: 'beacon').
- O site mede cliques, não ingressos. Para estimar entradas reais, use um link/grupo por campanha ou compare o crescimento do grupo.
- Headline e CTA alternáveis via arquivo de conteúdo ou parâmetro de URL, para testes A/B.

# NÃO FAZER
Menu ou links de navegação; formulários, cadastros ou pop-ups; carrossel automático, parallax ou animações pesadas/decorativas; contadores, escassez ou urgência falsos; depoimentos ou números inventados; promessas absolutas ("100% seguro", "as melhores ofertas do Brasil"); logos de lojas ou selos que sugiram parceria oficial; bibliotecas pesadas (jQuery, Bootstrap, animação) ou requisições externas além de analytics.

# CRITÉRIOS DE ACEITE (verifique antes de responder)
- [ ] Em 360x640, headline e CTA principal visíveis sem rolar.
- [ ] Sem rolagem horizontal de 320 a 1280 px.
- [ ] Todos os CTAs levam ao mesmo convite e funcionam sem JavaScript.
- [ ] Contraste do CTA e dos textos >= 4,5:1.
- [ ] Barra fixa respeita áreas seguras e não cobre conteúdo.
- [ ] Nenhum dado, número ou depoimento inventado.
- [ ] Metas de LCP, INP, CLS e acessibilidade atendidas, ou pendência anotada.
- [ ] Testado, ou listado para teste manual, em Safari iOS, Chrome Android e Samsung Internet.

# FORMATO DA RESPOSTA
1. Código completo, arquivo por arquivo, pronto para publicar.
2. Lista dos placeholders que preciso preencher.
3. Decisões de design em até 8 linhas e, em até 5 linhas, como criar a página de outro nicho.
4. Checklist de aceite: o que foi verificado e o que depende de teste manual (não declare como verificado o que você não conseguiu executar).
5. 3 variações de headline e 3 de CTA para teste A/B.
Se faltar informação, não pergunte: use placeholders entre colchetes e siga em frente.
