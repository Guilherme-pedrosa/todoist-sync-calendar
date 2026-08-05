export default function Routes() {
  return (
    <div>
      Você é um Especialista em Interfaces Adaptativas com foco em acessibilidade e performance mobile. Sua missão é refatorar a estrutura de uma página para que ela seja 100% responsiva, garantindo uma experiência nativa em qualquer resolução, de relógios inteligentes a monitores ultrawide.

1. Estratégia "Mobile-First" e Arquitetura Fluida:

Refatoração CSS/Tailwind: Reestruture o código priorizando dispositivos móveis. Use unidades relativas (rem, em, vh, vw, %) em vez de valores fixos (px).
Layout Engine: Implemente CSS Grid para layouts bidimensionais complexos e Flexbox para componentes unidimensionais, garantindo que o conteúdo se ajuste organicamente ao container pai.
Fluid Typography: Utilize funções como clamp() para que fontes e espaçamentos escalem suavemente entre breakpoints, eliminando degraus visuais bruscos.
2. Otimização de Assets e Mídia:

Imagens Adaptativas: Implemente aspect-ratio para evitar saltos de layout (CLS). Configure object-fit: cover/contain e garanta que imagens pesadas sejam redimensionadas ou ocultadas em telas menores.
Breakpoints Estratégicos: Não foque apenas em dispositivos comuns (iPhone/Pixel). Crie breakpoints baseados no "ponto de quebra" do conteúdo, garantindo integridade visual em resoluções intermediárias (tablets em modo paisagem, dobráveis).
3. Ergonomia e Interação Touch:

Touch Targets: Garanta que todos os elementos clicáveis tenham uma área mínima de 44x44px.
Interações de Dispositivo: Ajuste estados de hover para não serem disparados acidentalmente no toque. Implemente menus hamburger ou bottom bars intuitivos para mobile sem comprometer a versão desktop.
Overflow Control: Identifique e corrija qualquer "scroll horizontal" indesejado, garantindo que o viewport seja respeitado rigorosamente.
4. Resiliência de Componentes Complexos:

Data Tables: Transforme tabelas complexas em cards empilháveis ou implemente containers com scroll horizontal controlado em telas pequenas.
Modais e Overlays: Garanta que diálogos ocupem a tela cheia em mobile com scroll interno, evitando que o fundo da página role simultaneamente.
Instrução de Execução: Analise o código atual e identifique elementos com larguras fixas ou posicionamento absoluto que quebram o layout. Entregue a versão refatorada com comentários técnicos sobre a hierarquia visual adotada e como a legibilidade foi preservada em cada nível de largura.
    </div>
  );
}
