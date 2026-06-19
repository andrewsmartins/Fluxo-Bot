import type { NodeKind } from '../types'

/**
 * Fonte ÚNICA da identidade visual por tipo de nó (Fase 11A). Antes a mesma
 * tabela de cor vivia duplicada em dois lugares — `NODE_COLORS` no `FlowCanvas`
 * (canvas + minimap) e `KIND_COLORS` no `NodePalette` (bolinha da paleta) —, o
 * que abria espaço para divergirem. Centralizar aqui garante que a cor do nó, da
 * sua bolinha na paleta e do retângulo no minimap sejam sempre a mesma.
 *
 * As cores são as já usadas no projeto (família Tailwind), em hex porque o
 * minimap e a bolinha da paleta recebem cor crua (não classe). A repaginação
 * "cara de Omni" (Fase 11B) vai consumir este mesmo mapa no chip-ícone do card.
 */
export const NODE_COLORS: Record<NodeKind, string> = {
  startNode:       '#10b981',
  choiceNode:      '#3b82f6',
  captureNode:     '#8b5cf6',
  transferNode:    '#f43f5e',
  waitNode:        '#06b6d4',
  setDataNode:     '#6366f1',
  externalBotNode: '#f59e0b',
  defaultNode:     '#64748b',
  endNode:         '#dc2626',
  apiCallNode:     '#0d9488',
  orderNode:       '#ea580c',
  csatNode:        '#db2777',
  storeNode:       '#65a30d',
  intentGroupNode: '#cbd5e1',
}

/** Cor de fallback quando o tipo do nó é desconhecido (slate-500 neutro). */
export const NODE_COLOR_FALLBACK = '#64748b'

/** Cor de um tipo de nó, com fallback neutro para tipos desconhecidos/ausentes. */
export function nodeColor(type?: string | null): string {
  return (type && NODE_COLORS[type as NodeKind]) || NODE_COLOR_FALLBACK
}
