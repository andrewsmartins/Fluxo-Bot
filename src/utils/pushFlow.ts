/**
 * Núcleo testável do push de fluxo para a OmniChat — Fase 4b (UI).
 *
 * É a versão de browser do `scripts/push-flow.mjs` (CLI, Fase 4a, já validado
 * ponta a ponta). O CLI continua sendo a fonte canônica para uso em lote/Node;
 * este módulo é o que a UI consome. A lógica de remapeamento foi portada
 * fielmente do CLI (push-flow.mjs:114-130) para não regredir o que já passou no
 * bot de testes real.
 *
 * Comportamento da API que justifica as 2 passadas (Etapa 1, 2026-06-12):
 *   - POST /v1/{botId}/intents/{id} com ID desconhecido CRIA a intenção, mas o
 *     servidor IGNORA o ID enviado e gera outro (devolvido no corpo).
 *   - POST com ID já existente ATUALIZA in-place.
 * Por isso: 1ª passada cria e captura os IDs reais; 2ª passada remapeia todas as
 * referências (next.intent, choices, error.next, fallbackIntents) e reenvia.
 *
 * Diferenças deliberadas do CLI (e só estas — ver PLANS.md, Fase 4b):
 *   - Sem filesystem: o backup vira um callback (`onBackup`) que a UI usa para
 *     baixar um .json ANTES do primeiro POST.
 *   - O `fetch` é injetado (deps) para os testes rodarem sem rede.
 *
 * Segurança: o token chega por parâmetro, é usado só nos headers e NUNCA é
 * logado nem incluído no relatório devolvido.
 */
import type { BotFlowJson, BotIntent } from '../types'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'

/** Resposta mínima que precisamos do fetch — facilita o mock nos testes. */
export interface FetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
  json(): Promise<unknown>
}

/** fetch injetável: o browser passa `window.fetch`; os testes passam um mock. */
export type FetchLike = (
  url: string,
  init: { method?: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>

/** Uma operação do push, já sanitizada (sem token, sem headers). */
export interface PushResultItem {
  op: 'criar' | 'remap' | 'atualizar'
  name: string
  /** ID enviado no POST (para criações, o ID-cliente antes do remap). */
  sent: string
  /** ID que o servidor devolveu (criações) ou o mesmo `sent` (atualizações). */
  got: string | null
  status: number
  /** Início do corpo da resposta — útil só quando há erro. Sem dados sensíveis. */
  excerpt: string
}

export interface PushReport {
  /** true quando nada falhou e todas as operações voltaram 2xx. */
  ok: boolean
  /** true se o push parou no primeiro erro (stop-on-first-error). */
  failed: boolean
  results: PushResultItem[]
  /** Quantas operações voltaram 2xx. */
  okCount: number
  /** Mapa ID-cliente → ID-servidor das criações (para auditoria/relatório). */
  idMap: Record<string, string>
}

export interface PushPlan {
  /** Intenções ausentes no servidor — serão criadas (servidor gera IDs novos). */
  creates: BotIntent[]
  /** Intenções já existentes no servidor — serão atualizadas in-place. */
  updates: BotIntent[]
}

export interface PushProgressEvent {
  op: 'criar' | 'remap' | 'atualizar'
  name: string
  status: number
}

export interface PushOptions {
  fetch: FetchLike
  token: string
  botId: string
  /** Chamado a cada operação concluída — para a UI mostrar progresso. */
  onProgress?: (event: PushProgressEvent) => void
  /**
   * Chamado UMA vez com o estado atual do servidor, ANTES de qualquer escrita.
   * A UI usa para baixar o backup .json. É aguardado: o push só escreve depois.
   */
  onBackup?: (backup: BotFlowJson) => void | Promise<void>
}

/**
 * Decide quem é criação e quem é atualização pela presença do ID no servidor.
 * Função pura — base do dry-run/preview da UI.
 */
export function planPush(flowList: BotIntent[], serverIntents: BotIntent[]): PushPlan {
  const serverIds = new Set(serverIntents.map(i => i.id))
  return {
    creates: flowList.filter(i => !serverIds.has(i.id)),
    updates: flowList.filter(i => serverIds.has(i.id)),
  }
}

/**
 * Reaponta todas as referências de uma intenção usando o mapa ID-cliente →
 * ID-servidor. Mutates `intent` e devolve `true` se trocou algo (portado de
 * push-flow.mjs:114-130). As referências cobertas: `next.intent.id` (objeto),
 * `action.choices` (array de IDs), `action.error.next.intent` (string),
 * `condition.fallbackIntents`, `condition.intent` (string — tipos
 * `context`/`lastIntent`), `condition.context` (string) e `intent.context`
 * (raiz, string). Refs que não estão no mapa ficam intactas — preservar, não
 * reconstruir.
 */
export function remapRefs(intent: BotIntent, idMap: Map<string, string>): boolean {
  let changed = false
  const swap = (id: string): string => {
    if (idMap.has(id)) {
      changed = true
      return idMap.get(id)!
    }
    return id
  }
  for (const cond of intent.conditions ?? []) {
    const ref = cond.next?.intent
    if (ref && typeof ref === 'object' && ref.id) ref.id = swap(ref.id)
    if (Array.isArray(cond.action?.choices)) {
      cond.action.choices = cond.action.choices.map(swap)
    }
    const errNext = cond.action?.error?.next
    if (errNext && typeof errNext.intent === 'string') errNext.intent = swap(errNext.intent)
    if (Array.isArray(cond.fallbackIntents)) {
      cond.fallbackIntents = cond.fallbackIntents.map(swap)
    }
    // Refs por id no nível da condição (tipos context/lastIntent usam `intent`).
    if (typeof cond.intent === 'string') cond.intent = swap(cond.intent)
    if (typeof cond.context === 'string') cond.context = swap(cond.context)
  }
  // Contexto no nível da intenção (uma vez por intenção, fora do laço).
  if (typeof intent.context === 'string') intent.context = swap(intent.context)
  return changed
}

/**
 * GET read-only do estado atual do bot. Usado pelo preview/dry-run da UI para
 * montar o `planPush` (criar vs. atualizar) sem escrever nada. Lança se a
 * leitura falhar (token inválido/botId alheio → 403).
 */
export async function fetchServerIntents(deps: {
  fetch: FetchLike
  token: string
  botId: string
}): Promise<BotIntent[]> {
  const res = await deps.fetch(`${API}/v1/${deps.botId}/intents?fullObject=true`, {
    headers: buildHeaders(deps.token),
  })
  if (!res.ok) {
    throw new Error(`não foi possível ler o estado atual do bot (status ${res.status})`)
  }
  const data = (await res.json()) as BotFlowJson
  return Array.isArray(data.list) ? data.list : []
}

/**
 * DELETE de uma intenção. Usado pelo restore (rollback) da UI. Devolve só o
 * status — a remoção da plataforma é de consistência EVENTUAL (responde 200 mas
 * um GET logo depois ainda pode listá-la), então quem chama precisa reverificar
 * em laço (ver `restoreBackup` em restoreFlow.ts).
 */
export async function deleteIntent(
  deps: { fetch: FetchLike; token: string; botId: string },
  intentId: string,
): Promise<{ status: number }> {
  const res = await deps.fetch(`${API}/v1/${deps.botId}/intents/${intentId}`, {
    method: 'DELETE',
    headers: buildHeaders(deps.token),
  })
  return { status: res.status }
}

function buildHeaders(token: string): Record<string, string> {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-omnichat-platform': 'web',
    'x-parse-application-id': APP_ID,
    'x-parse-session-token': token,
  }
}

/**
 * Empurra o fluxo para o RASCUNHO do bot, em 2 passadas com remapeamento de IDs.
 * Sequencial e com parada no primeiro erro (não deixa o servidor meio-aplicado
 * sem reportar). NÃO muta o `flow` recebido — clona antes de remapear, então o
 * modelo do App permanece intacto. NUNCA publica (só rascunho).
 *
 * Lança erro (pré-flight) se o fluxo estiver vazio, misturar botIds, não bater
 * com `botId` ou se a leitura do estado atual falhar. Erros HTTP no meio do push
 * não lançam — viram `failed: true` no relatório, com o que entrou até parar.
 */
export async function pushFlow(flow: BotFlowJson, options: PushOptions): Promise<PushReport> {
  const { fetch, token, botId, onProgress, onBackup } = options

  if (!Array.isArray(flow.list) || flow.list.length === 0) {
    throw new Error('o fluxo não tem intenções para enviar')
  }
  const botIds = [...new Set(flow.list.map(i => i.botId))]
  if (botIds.length !== 1) {
    throw new Error(`o fluxo mistura botIds (${botIds.join(', ')}) — push cancelado`)
  }
  if (botIds[0] !== botId) {
    throw new Error(`o botId do fluxo (${botIds[0]}) não bate com o alvo (${botId})`)
  }

  const headers = buildHeaders(token)

  // 1) Estado atual do servidor — também é o backup pré-escrita.
  const backupRes = await fetch(`${API}/v1/${botId}/intents?fullObject=true`, { headers })
  if (!backupRes.ok) {
    throw new Error(`leitura do estado atual falhou (status ${backupRes.status}) — push cancelado por segurança`)
  }
  const backupData = (await backupRes.json()) as BotFlowJson
  const serverIntents = Array.isArray(backupData.list) ? backupData.list : []

  // Backup ANTES de qualquer escrita (na UI, vira download .json).
  if (onBackup) await onBackup(backupData)

  // Clona o que vamos enviar — nunca mutar o modelo do chamador.
  const toPush: BotIntent[] = structuredClone(flow.list)
  const { creates, updates } = planPush(toPush, serverIntents)

  const post = async (intent: BotIntent) => {
    const res = await fetch(`${API}/v1/${botId}/intents/${intent.id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(intent),
    })
    const text = await res.text()
    let body: { id?: string } | null = null
    try {
      body = JSON.parse(text)
    } catch {
      // corpo não-JSON: fica só no excerpt do relatório, sem quebrar o push
    }
    return { res, body, text }
  }

  const idMap = new Map<string, string>()
  const results: PushResultItem[] = []
  let failed = false

  // 1ª passada — criações (captura os IDs reais que o servidor gera).
  for (const intent of creates) {
    const { res, body, text } = await post(intent)
    results.push({
      op: 'criar',
      name: intent.name,
      sent: intent.id,
      got: body?.id ?? null,
      status: res.status,
      excerpt: text.slice(0, 300),
    })
    onProgress?.({ op: 'criar', name: intent.name, status: res.status })
    if (!res.ok || !body?.id) {
      failed = true
      break
    }
    idMap.set(intent.id, body.id)
    intent.id = body.id
  }

  // 2ª passada — remapeia as refs para os IDs reais e envia atualizações.
  if (!failed) {
    for (const intent of toPush) {
      const remapped = remapRefs(intent, idMap)
      const isUpdate = updates.includes(intent)
      // Criação sem refs a remapear já está correta no servidor — não reenvia.
      if (!isUpdate && !remapped) continue
      const op = remapped ? 'remap' : 'atualizar'
      const { res, text } = await post(intent)
      results.push({
        op,
        name: intent.name,
        sent: intent.id,
        got: intent.id,
        status: res.status,
        excerpt: text.slice(0, 300),
      })
      onProgress?.({ op, name: intent.name, status: res.status })
      if (!res.ok) {
        failed = true
        break
      }
    }
  }

  const okCount = results.filter(r => r.status >= 200 && r.status < 300).length
  return {
    ok: !failed && okCount === results.length,
    failed,
    results,
    okCount,
    idMap: Object.fromEntries(idMap),
  }
}
