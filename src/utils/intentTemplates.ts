import type { Action, BotIntent, Condition, ErrorAction } from '../types'

/**
 * Templates canônicos de BotIntent para criação de nós na paleta.
 *
 * A forma segue exatamente o payload que a tela oficial da OmniChat envia no
 * POST /v1/{botId}/intents/{id} (capturado em 2026-06-11): todos os campos
 * presentes, com null/[]/'' como defaults explícitos. Ver PLANS.md.
 */

/**
 * Tipos de nó que podem ser criados pela paleta — um para cada um dos 11
 * ActionTypes da plataforma (Modelo B). `externalBotNode` (redirect p/ outro bot)
 * e `startNode` (início do fluxo) NÃO são criáveis. Os 5 últimos foram somados
 * na Fase 6: endConversation, external (API), order, captureCsat e store.
 */
export const CREATABLE_KINDS = [
  'defaultNode', 'choiceNode', 'captureNode', 'transferNode', 'waitNode', 'setDataNode',
  'endNode', 'apiCallNode', 'orderNode', 'csatNode', 'storeNode',
] as const

export type CreatableKind = (typeof CREATABLE_KINDS)[number]

/**
 * Rótulos amigáveis dos tipos criáveis. Fonte única — consumido pela paleta
 * (NodePalette) e pelo seletor de tipo ao adicionar condição (DetailPanel).
 */
export const CREATABLE_KIND_LABELS: Record<CreatableKind, string> = {
  defaultNode:  'Mensagem',
  choiceNode:   'Escolha',
  captureNode:  'Captura',
  transferNode: 'Transferência',
  waitNode:     'Aguardar interação',
  setDataNode:  'Editar informação',
  endNode:      'Encerrar conversa',
  apiCallNode:  'Chamada de API',
  orderNode:    'Pedido',
  csatNode:     'Captura CSAT',
  storeNode:    'Loja física',
}

const ACTION_TYPE_BY_KIND: Record<CreatableKind, string> = {
  defaultNode:  'none',
  choiceNode:   'choice',
  captureNode:  'captureData',
  transferNode: 'transfer',
  waitNode:     'waitForInteraction',
  setDataNode:  'setData',
  endNode:      'endConversation',
  apiCallNode:  'external',          // chamada de API (≠ externalBotNode, que é outro bot)
  orderNode:    'order',
  csatNode:     'captureCsat',
  storeNode:    'store',
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
    multipleFields: [],
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

/**
 * Monta o `action` canônico de um NodeKind criável, com os defaults específicos
 * do tipo (transfer → direct4userPrevious + erro p/ start; capture → free + erro; choice
 * → choices vazio; order → generateOrder; csat → supportRate). Compartilhado pela
 * criação de intenção (paleta) e pela criação de condição tipada (painel/merge),
 * para os dois caminhos nascerem idênticos.
 */
function buildKindAction(kind: CreatableKind, botId: string): Action {
  const action = canonicalAction(ACTION_TYPE_BY_KIND[kind])
  if (kind === 'choiceNode') action.choices = []
  // Editar informação nasce com uma linha vazia: o gate de save (DetailPanel)
  // obriga a preencher variável e valor antes de aplicar.
  if (kind === 'setDataNode') action.bulkUpdate = [{ variable: '', value: '' }]
  if (kind === 'transferNode') {
    // 'direct4userPrevious' ("Devolver ao vendedor") é o único destino SEM campo,
    // então o nó recém-criado nasce VÁLIDO (não força abrir picker/preencher valor).
    action.transferType = 'direct4userPrevious'
    action.error = canonicalError(botId)
  }
  if (kind === 'captureNode') {
    // `free` = estado de repouso "texto livre": serializa valor válido se o nó for
    // criado e nunca configurado (evita captureDataType null no push). No painel
    // aparece como "— Selecione —" e o gate de save ainda exige escolher um dado.
    action.captureDataType = 'free'
    action.error = canonicalError(botId)
  }
  // Defaults dos tipos novos da Fase 6 (mínimos embasados no spec — ver
  // docs/MODELO-INTENCAO-OMNICHAT.md §4). `endConversation`/`external`/`store`
  // não têm subtipo a presumir: end é terminal, external já nasce com o objeto
  // `{ type: [], apiName: [] }` canônico e o enum de storeType é desconhecido.
  if (kind === 'orderNode') action.orderType = 'generateOrder'
  if (kind === 'csatNode') action.captureDataType = 'supportRate'
  return action
}

/**
 * Condição canônica já TIPADA pela ação de um NodeKind criável — usada ao
 * adicionar uma condição pelo painel ou ao arrastar um tipo da paleta sobre um
 * nó (merge na mesma intenção). Reusa exatamente os defaults da criação de nó.
 */
export function createConditionForKind(kind: CreatableKind, botId: string): Condition {
  return canonicalCondition(buildKindAction(kind, botId))
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
  const now = new Date().toUTCString()
  return {
    id: crypto.randomUUID(),
    botId,
    name,
    category: 'Sem Categoria',
    keywords: [],
    context: null,
    priority: 0,
    conditions: [canonicalCondition(buildKindAction(kind, botId))],
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
