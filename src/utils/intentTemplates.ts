import type { Action, BotIntent, Condition, ErrorAction } from '../types'

/**
 * Templates canônicos de BotIntent para criação de nós na paleta.
 *
 * A forma segue exatamente o payload que a tela oficial da OmniChat envia no
 * POST /v1/{botId}/intents/{id} (capturado em 2026-06-11): todos os campos
 * presentes, com null/[]/'' como defaults explícitos. Ver PLANS.md.
 */

/** Tipos de nó que podem ser criados pela paleta (externalBot e start não). */
export const CREATABLE_KINDS = [
  'defaultNode', 'choiceNode', 'captureNode', 'transferNode', 'waitNode', 'setDataNode',
] as const

export type CreatableKind = (typeof CREATABLE_KINDS)[number]

const ACTION_TYPE_BY_KIND: Record<CreatableKind, string> = {
  defaultNode:  'none',
  choiceNode:   'choice',
  captureNode:  'captureData',
  transferNode: 'transfer',
  waitNode:     'waitForInteraction',
  setDataNode:  'setData',
}

function canonicalAction(type: string): Action {
  return {
    type,
    bulkUpdate: [],
    variable: null,
    value: null,
    choices: null,
    entity: null,
    transferType: null,
    captureDataType: null,
    captureDataTypesCategory: 'singleField',
    multipleFields: '',
    conversationType: null,
    storeType: null,
    orderType: null,
    lastMessageTextParams: { position: null, pattern: null },
    external: { type: [], apiName: [] },
  }
}

/** Caminho de erro padrão: volta para a intenção inicial ({botId}-start, em string). */
function canonicalError(botId: string): ErrorAction {
  return {
    assistant_says: [{ channel: 'any', messages: [] }],
    next: {
      redirect: 'waitInteraction',
      type: 'error',
      intent: `${botId}-start`,
      intentBot: botId,
      action: 'intent',
    },
  }
}

/** Condição canônica mínima (action `none` por padrão) — também usada ao adicionar condições no painel. */
export function createConditionTemplate(actionType = 'none'): Condition {
  return canonicalCondition(canonicalAction(actionType))
}

function canonicalCondition(action: Action): Condition {
  return {
    type: 'any',
    name: 'Condição Padrão',
    variable: null,
    value: 'any',
    valueNumber: null,
    values: null,
    intent: null,
    context: null,
    assistant_says: [{ channel: 'any', messages: [] }],
    action,
    fallbackIntents: [],
    next: { redirect: 'waitInteraction', type: 'context' },
  }
}

/**
 * Cria uma intenção mínima válida para o tipo de nó informado.
 * O ID é um UUID v4 novo; campos específicos do tipo recebem o default mais
 * comum observado nos bots reais (ex.: transfer → direct4group).
 */
export function createIntentTemplate(kind: CreatableKind, botId: string, name: string): BotIntent {
  const action = canonicalAction(ACTION_TYPE_BY_KIND[kind])

  if (kind === 'choiceNode') action.choices = []
  if (kind === 'transferNode') {
    action.transferType = 'direct4group'
    action.error = canonicalError(botId)
  }
  if (kind === 'captureNode') {
    action.captureDataType = 'free'
    action.error = canonicalError(botId)
  }

  const now = new Date().toUTCString()
  return {
    id: crypto.randomUUID(),
    botId,
    name,
    category: 'Sem Categoria',
    keywords: [],
    context: null,
    priority: 0,
    conditions: [canonicalCondition(action)],
    createdAt: now,
    updatedAt: now,
    advanced: { active: false, endpointId: null },
  }
}

/** Verifica se um tipo de nó vindo da paleta é criável. */
export function isCreatableKind(kind: string): kind is CreatableKind {
  return (CREATABLE_KINDS as readonly string[]).includes(kind)
}

/**
 * Intenção inicial de um fluxo novo, na forma observada nos bots reais:
 * ID especial `{botId}-start`, categoria `start` e condição "Start" sem ação.
 */
export function createStartIntent(botId: string): BotIntent {
  const cond = createConditionTemplate()
  cond.name = 'Start'
  const now = new Date().toUTCString()
  return {
    id: `${botId}-start`,
    botId,
    name: 'start',
    category: 'start',
    keywords: [],
    context: null,
    priority: 0,
    conditions: [cond],
    createdAt: now,
    updatedAt: now,
    advanced: { active: false, endpointId: null },
  }
}
