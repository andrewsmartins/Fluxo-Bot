export interface BotFlowJson {
  list: BotIntent[]
}

export interface BotIntent {
  id: string
  name: string
  category: string
  botId: string
  keywords: string[]
  context: string | null
  priority: number
  conditions: Condition[]
  createdAt?: string
  updatedAt?: string
  executionDelay?: unknown
  advanced?: { active: boolean; endpointId: string | null }
}

export interface Condition {
  name: string
  type: string
  variable: string | null
  intent: string | null
  value: string | null
  valueNumber: unknown
  fallbackIntents: string[]
  values: unknown
  context: unknown
  action: Action
  assistant_says: AssistantSay[]
  next: Next
}

export interface BulkUpdateItem {
  variable: string
  value: string
}

export interface Action {
  type: string
  choices: string[] | string | null
  captureDataType: string | null
  transferType: string | null
  value: string | null
  variable: string | null
  conversationType: string | null
  orderType?: string | null
  storeType: string | null
  entity: unknown
  bulkUpdate?: BulkUpdateItem[] | string
  external?: { type: unknown; apiName: unknown }
  error?: ErrorAction
  captureDataTypesCategory?: string
  multipleFields?: string
  lastMessageTextParams?: { position: unknown; pattern: unknown }
}

export interface ErrorAction {
  next: Next
  assistant_says: AssistantSay[]
}

export interface Next {
  type: string
  redirect?: string
  action?: string
  intent?: { botId: string; id: string } | string
  intentBot?: string
}

export interface AssistantSay {
  channel: string
  messages: BotMessage[]
}

export interface BotMessage {
  type: string
  content?: string | null
  fileName?: string
  messageConfig?: ButtonMessageConfig
}

export interface ButtonMessageConfig {
  header: string | null
  title: string | null
  body: string | null
  footer: string | null
  type: string
  buttons: ButtonOption[]
}

export interface ButtonOption {
  id: string
  text: string
  description: string | null
}

export type NodeKind =
  | 'startNode'
  | 'choiceNode'
  | 'captureNode'
  | 'transferNode'
  | 'waitNode'
  | 'setDataNode'
  | 'externalBotNode'
  | 'defaultNode'
  // Modelo B (Fase 6) — novos tipos mapeando os 11 ActionTypes da plataforma
  | 'endNode'         // action.type = endConversation (Terminar conversa)
  | 'apiCallNode'     // action.type = external      (Chamada externa / API; ≠ externalBotNode)
  | 'orderNode'       // action.type = order         (Pedido)
  | 'csatNode'        // action.type = captureCsat   (Captura CSAT)
  | 'storeNode'       // action.type = store         (Ações sobre a loja física)
  // Container de agrupamento por intenção (intenções com 2+ condições)
  | 'intentGroupNode'

export interface ConditionInfo {
  name: string
  type: string
  variable: string | null
}

/**
 * View-model exibido em cada nó. No Modelo B (Fase 6) representa **uma condição**
 * (filho de um grupo ou nó solto); o grupo (`intentGroupNode`) reusa a mesma forma
 * para os campos de cabeçalho da intenção (nome, categoria, prioridade, keywords).
 */
export interface FlowNodeData extends Record<string, unknown> {
  name: string
  category: string
  messagePreview: string
  buttons: ButtonOption[]
  actionType: string
  captureDataType: string | null
  transferType: string | null
  transferValue: string | null
  allMessages: string[]
  setDataItems: BulkUpdateItem[]
  keywords: string[]
  conditions: ConditionInfo[]
  externalBotId?: string
  externalIntentId?: string
  // ─── Campos do Modelo B (Fase 6) ───────────────────────────────────────
  /** Rótulo do gatilho da condição (ConditionType), ex.: "Valor contém", "Senão". */
  triggerLabel?: string
  /** Prioridade da intenção (0/0.25/0.5/0.75/1) — exibida no cabeçalho do grupo. */
  priority?: number
  /** Nº de condições da intenção — usado pelo cabeçalho do grupo. */
  conditionCount?: number
  /** A intenção tem `context` (ativa apenas vinda de outra intenção). */
  hasContext?: boolean
  /** O `executionDelay` está ativo (bot espera antes de responder). */
  hasDelay?: boolean
  /** action.order → tipo do pedido (generateOrder / addToCart). */
  orderType?: string | null
  /** action.store → tipo da ação sobre a loja física. */
  storeType?: string | null
  /** action.external → nome da API chamada. */
  apiName?: string | null
}
