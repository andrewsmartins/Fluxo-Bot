/**
 * Posição horizontal do menu de variáveis (`@`) em cascata (ver Fase 13 no PLANS.md).
 *
 * Âncora pela borda ESQUERDA do campo: o menu cresce para a DIREITA conforme novas
 * colunas abrem e só desliza para a esquerda quando a largura ATUAL estouraria a
 * viewport (caixa MÓVEL, mas ancorada perto do campo). O alvo não "foge" do cursor
 * como na âncora antiga pela direita (que movia a borda esquerda a cada coluna);
 * combinado com o clique único da Fase 13, o pequeno reposicionamento ao caber na
 * tela não atrapalha. O `left` é recomputado com a largura REAL renderizada.
 */

/** Largura de uma coluna do menu (Tailwind `w-48` = 12rem = 192px). Fallback enquanto o painel ainda não mediu. */
export const MENU_COLUMN_WIDTH = 192
/** Máximo de colunas simultâneas: categorias → times → campos → dias → componentes. */
export const MENU_MAX_COLUMNS = 5
/** Folga mínima das bordas da viewport. */
export const MENU_MARGIN = 8
/** Largura máxima possível (todas as colunas abertas) — referência/limites. */
export const MENU_MAX_WIDTH = MENU_COLUMN_WIDTH * MENU_MAX_COLUMNS

/**
 * Calcula a coordenada `left` (px) do menu para que ele caiba na viewport. Caso
 * comum: alinha à esquerda do campo (cresce para a direita). Se a largura informada
 * estouraria a borda direita, empurra `left` para a esquerda só o necessário; nunca
 * antes da margem esquerda. Função PURA. Passe a largura REAL renderizada do menu
 * (móvel) — ou a máxima, se quiser uma posição fixa que comporte toda expansão.
 *
 * @param fieldRect retângulo do campo âncora (usa apenas `left`)
 * @param viewportWidth largura visível (`window.innerWidth`)
 * @param width largura atual do menu a ser acomodada
 * @param margin folga mínima das bordas
 */
export function computeMenuLeft(
  fieldRect: { left: number },
  viewportWidth: number,
  width: number,
  margin: number,
): number {
  const maxLeft = viewportWidth - margin - width
  const left = Math.min(fieldRect.left, maxLeft)
  return Math.max(margin, left)
}
