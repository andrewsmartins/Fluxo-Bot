import type { Action, BotIntent, NodeKind } from '../types'

/**
 * Metadados compartilhados do Modelo B (Fase 6): mapeamento ActionType → NodeKind,
 * rótulos de gatilho (ConditionType) e de prioridade (PriorityType).
 * Fonte de verdade dos valores: docs/MODELO-INTENCAO-OMNICHAT.md.
 *
 * Mantido fora de parseFlow.ts porque também é consumido pelos componentes de nó
 * e pelo DetailPanel — evita duplicar os mesmos enums em vários lugares.
 */

/** Mapeia os 11 ActionTypes da plataforma para o tipo de nó do visualizador. */
export function actionToNodeKind(action?: Action | null): NodeKind {
  switch (action?.type) {
    case 'choice':             return 'choiceNode'
    case 'captureData':        return 'captureNode'
    case 'setData':            return 'setDataNode'
    case 'transfer':           return 'transferNode'
    case 'waitForInteraction': return 'waitNode'
    case 'endConversation':    return 'endNode'
    case 'external':           return 'apiCallNode'   // chamada de API (≠ outro bot)
    case 'order':              return 'orderNode'
    case 'captureCsat':        return 'csatNode'
    case 'store':              return 'storeNode'
    case 'none':
    default:                   return 'defaultNode'   // só mensagens / encadeamento
  }
}

/** Rótulos do enum ConditionType (gatilho da condição) exibidos na plataforma. */
export const CONDITION_TYPE_LABELS: Record<string, string> = {
  any:                'Sem condição',
  context:            'Contexto é igual a',
  lastIntent:         'Última intenção foi',
  empty:              'Valor está vazio',
  exists:             'Valor existe',
  equals:             'Valor é igual a',
  contains:           'Valor contém',
  totalIsGreaterThan: 'Total é maior que',
  totalIsEqual:       'Total é igual a',
  else:               'Senão',
}

/** Rótulo do gatilho de uma condição (com o tipo cru como fallback). */
export function triggerLabel(type: string): string {
  return CONDITION_TYPE_LABELS[type] ?? type
}

/** Mapa Prioridade (numérica fracionária) → rótulo da plataforma (PriorityType). */
const PRIORITY_LABELS: { value: number; label: string }[] = [
  { value: 0,    label: 'Nenhuma' },
  { value: 0.25, label: 'Baixa' },
  { value: 0.5,  label: 'Média' },
  { value: 0.75, label: 'Alta' },
  { value: 1,    label: 'Muita Alta' },
]

/** Converte a prioridade numérica para o rótulo mais próximo (defensivo a valores fora do enum). */
export function priorityLabel(priority: number | undefined | null): string {
  const p = typeof priority === 'number' ? priority : 0
  let best = PRIORITY_LABELS[0]
  for (const entry of PRIORITY_LABELS) {
    if (Math.abs(entry.value - p) < Math.abs(best.value - p)) best = entry
  }
  return best.label
}

/**
 * Indica se o `executionDelay` da intenção está ativo. O campo é opcional e de
 * forma variável (toggle + segundos); tratamos como ativo quando é um objeto
 * com `active === true` ou um número positivo.
 */
export function hasExecutionDelay(intent: BotIntent): boolean {
  const delay = intent.executionDelay
  if (typeof delay === 'number') return delay > 0
  if (delay && typeof delay === 'object') {
    const active = (delay as { active?: unknown }).active
    return active === true
  }
  return false
}
