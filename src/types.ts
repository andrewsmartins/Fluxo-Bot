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
  /**
   * Operando numérico dos gatilhos "Total é maior que" / "Total é igual a"
   * (`totalIsGreaterThan` / `totalIsEqual`). A plataforma guarda o número como
   * STRING aqui (ex.: `"1"`), mantendo `value` como placeholder (`"any"`). `null`
   * (ou `""` em fluxos legados) para os demais tipos.
   */
  valueNumber: string | null
  fallbackIntents: string[]
  /**
   * Lista de termos do gatilho "Valor contém" (`type === 'contains'`). A
   * plataforma guarda o conjunto de valores a casar AQUI (array), mantendo
   * `value` como placeholder (`"any"`). Para os demais tipos é `null`.
   */
  values: string[] | null
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
  /**
   * Referência da coleção/catálogo da resposta `COLLECTION` (Adicionar resposta →
   * Coleção). É o `objectId` da classe Parse `Collection`. A plataforma grava o
   * id AQUI (não em `content`) e manda `fileName: ""` junto.
   */
  collectionId?: string
  // ─── Modelo de mensagem com Flow (resposta TEMPLATE, Fase 12) ──────────────
  /** Título do modelo do WhatsApp (derivado do modelo selecionado; read-only na UI). */
  title?: string
  /** `objectId` do `MessageTemplate` no Parse — a plataforma resolve o Flow por ele. */
  messageTemplateId?: string
  /** Token da variável de cabeçalho — fixo `''` na v1 (nenhum modelo real usa header com variável). */
  messageTemplateHeaderToken?: string
  /** Valores das variáveis do corpo, posicionais: `messageTemplateTokens[i]` ↔ `{{i+1}}`. */
  messageTemplateTokens?: string[]
}

export interface ButtonMessageConfig {
  /** Opcionais: a resposta TEMPLATE (Fase 12) só emite `type`, `body` e `buttons`. */
  header?: string | null
  title?: string | null
  body: string | null
  footer?: string | null
  type: string
  buttons: ButtonOption[]
}

export interface ButtonOption {
  id: string
  text: string
  /** Opcional: o botão Flow do TEMPLATE não tem descrição (só `id`, `text`, `type`). */
  description?: string | null
  /** Tipo do botão (ex.: `'FLOW'` no modelo de mensagem); ausente em botões comuns. */
  type?: string
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
