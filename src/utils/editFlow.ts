import type { BotFlowJson, BotIntent, Condition } from '../types'

/**
 * Referência decodificada de um ID de aresta gerado pelo parseFlow.
 * O ID codifica a posição exata no modelo que originou a aresta:
 * `{intentId}-c{condIdx}-next` | `{intentId}-c{condIdx}-ch{choiceIdx}` | `{intentId}-c{condIdx}-ext`
 */
export type EdgeRef =
  | { kind: 'next'; intentId: string; condIdx: number }
  | { kind: 'choice'; intentId: string; condIdx: number; choiceIdx: number }
  | { kind: 'ext'; intentId: string; condIdx: number }

export type EditResult = { ok: true } | { ok: false; reason: string }

const EDGE_ID_RE = /^(.+)-c(\d+)-(next|ext|ch(\d+))$/

/**
 * Decodifica o ID de uma aresta de volta para a posição (intenção + condição)
 * que a originou no modelo. IDs de intenção contêm hífens (UUIDs e `{botId}-start`),
 * por isso o sufixo é ancorado no fim. Retorna null para IDs fora do padrão.
 */
export function parseEdgeId(edgeId: string): EdgeRef | null {
  const m = EDGE_ID_RE.exec(edgeId)
  if (!m) return null
  const [, intentId, condIdxStr, suffix, choiceIdxStr] = m
  const condIdx = Number(condIdxStr)
  if (suffix === 'next') return { kind: 'next', intentId, condIdx }
  if (suffix === 'ext') return { kind: 'ext', intentId, condIdx }
  return { kind: 'choice', intentId, condIdx, choiceIdx: Number(choiceIdxStr) }
}

function findCondition(json: BotFlowJson, ref: EdgeRef): { intent: BotIntent; cond: Condition } | null {
  const intent = json.list.find(i => i.id === ref.intentId)
  const cond = intent?.conditions[ref.condIdx]
  return intent && cond ? { intent, cond } : null
}

function reconnectNext(cond: Condition, target: BotIntent): EditResult {
  if (!cond.next || typeof cond.next.intent === 'string' || !cond.next.intent) {
    return { ok: false, reason: 'a condição não possui um destino editável' }
  }
  cond.next.intent = { botId: target.botId, id: target.id }
  return { ok: true }
}

function reconnectChoice(cond: Condition, oldTargetId: string, newTargetId: string): EditResult {
  if (!Array.isArray(cond.action.choices)) {
    return { ok: false, reason: 'a ação não possui lista de escolhas' }
  }
  // Arestas de escolha são deduplicadas na renderização, então um destino pode
  // aparecer em mais de uma posição de `choices` — substitui todas por valor.
  let replaced = false
  cond.action.choices = cond.action.choices.map(id => {
    if (id !== oldTargetId) return id
    replaced = true
    return newTargetId
  })
  return replaced ? { ok: true } : { ok: false, reason: 'destino original não encontrado nas escolhas' }
}

/**
 * Aplica no modelo a reconexão de uma aresta para um novo destino, mutando o
 * JSON original em memória (fonte de verdade preservada para exportação).
 * Arestas externas (`-ext`) apontam para nós sintéticos de outro bot e não são
 * editáveis nesta fase.
 */
export function applyEdgeReconnect(
  json: BotFlowJson,
  edgeId: string,
  oldTargetId: string,
  newTargetId: string,
): EditResult {
  const ref = parseEdgeId(edgeId)
  if (!ref) return { ok: false, reason: `aresta com ID desconhecido (${edgeId})` }
  if (ref.kind === 'ext') return { ok: false, reason: 'conexões para outros bots não são editáveis' }

  const found = findCondition(json, ref)
  if (!found) return { ok: false, reason: 'intenção ou condição de origem não encontrada no modelo' }

  const target = json.list.find(i => i.id === newTargetId)
  if (!target) return { ok: false, reason: 'o novo destino não é uma intenção deste fluxo' }

  return ref.kind === 'next'
    ? reconnectNext(found.cond, target)
    : reconnectChoice(found.cond, oldTargetId, newTargetId)
}

function hasNextRef(cond: Condition): boolean {
  return !!cond.next?.intent && typeof cond.next.intent === 'object' && !!cond.next.intent.id
}

/** Réplica da deduplicação de escolhas usada na renderização (parseFlow.getChoices). */
function dedupedChoices(choices: unknown): string[] {
  if (!Array.isArray(choices)) return []
  const seen = new Set<string>()
  return choices.filter((id): id is string => {
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * Conecta a origem a um novo destino, na primeira vaga em ordem de documento:
 * slot de escolha vazio (botão criado e ainda não conectado) ou condição
 * não-choice sem referência `next`. Retorna a posição usada — mas o App
 * reconstrói todas as arestas do modelo após o patch.
 */
export function applyConnect(
  json: BotFlowJson,
  sourceId: string,
  targetId: string,
): { ok: true; kind: 'next' | 'choice'; condIdx: number } | { ok: false; reason: string } {
  const source = json.list.find(i => i.id === sourceId)
  if (!source) return { ok: false, reason: 'intenção de origem não encontrada no modelo' }

  const target = json.list.find(i => i.id === targetId)
  if (!target) return { ok: false, reason: 'o destino não é uma intenção deste fluxo' }

  for (let condIdx = 0; condIdx < source.conditions.length; condIdx++) {
    const cond = source.conditions[condIdx]

    if (cond.action.type === 'choice' && Array.isArray(cond.action.choices)) {
      const slot = cond.action.choices.findIndex(c => !c)
      if (slot !== -1) {
        cond.action.choices[slot] = targetId
        return { ok: true, kind: 'choice', condIdx }
      }
      continue
    }

    if (cond.action.type !== 'choice' && !hasNextRef(cond)) {
      cond.next = {
        ...cond.next,
        redirect: 'continueFlow',
        action: 'intent',
        type: cond.next?.type ?? 'context',
        intent: { botId: target.botId, id: target.id },
      }
      return { ok: true, kind: 'next', condIdx }
    }
  }

  return { ok: false, reason: 'a origem não tem vaga livre (adicione um botão ou reconecte uma aresta existente)' }
}

/**
 * Remove o destino de uma aresta. Para `-next`, restaura a forma canônica sem
 * referência; para escolhas, esvazia o slot em `action.choices` mantendo o
 * botão (que pode ser reconectado depois). Externas não são editáveis.
 */
export function applyEdgeDelete(json: BotFlowJson, edgeId: string): EditResult {
  const ref = parseEdgeId(edgeId)
  if (!ref) return { ok: false, reason: `aresta com ID desconhecido (${edgeId})` }
  if (ref.kind === 'ext') return { ok: false, reason: 'conexões para outros bots não são editáveis' }

  const found = findCondition(json, ref)
  if (!found) return { ok: false, reason: 'intenção ou condição de origem não encontrada no modelo' }

  if (ref.kind === 'choice') {
    // O índice da aresta refere-se à lista deduplicada — esvazia por valor
    const targetId = dedupedChoices(found.cond.action.choices)[ref.choiceIdx]
    if (!targetId || !Array.isArray(found.cond.action.choices)) {
      return { ok: false, reason: 'escolha não encontrada na condição' }
    }
    found.cond.action.choices = found.cond.action.choices.map(c => c === targetId ? '' : c)
    return { ok: true }
  }

  if (!hasNextRef(found.cond)) return { ok: false, reason: 'a condição não possui destino para remover' }
  found.cond.next = { redirect: 'waitInteraction', type: found.cond.next.type ?? 'context' }
  return { ok: true }
}

/**
 * Exclui uma intenção e limpa todas as referências de entrada nas demais:
 * `next` volta à forma sem destino, escolhas removem botão+slot na mesma
 * posição, `error.next` reaponta para o start e fallbacks são filtrados.
 * A intenção de início não é excluível.
 */
export function applyNodeDelete(json: BotFlowJson, nodeId: string): EditResult {
  const idx = json.list.findIndex(i => i.id === nodeId)
  if (idx === -1) return { ok: false, reason: 'apenas intenções deste fluxo podem ser excluídas' }

  const intent = json.list[idx]
  if (intent.category === 'start' || intent.id.endsWith('-start')) {
    return { ok: false, reason: 'a intenção de início não pode ser excluída' }
  }

  json.list.splice(idx, 1)

  for (const other of json.list) {
    for (const cond of other.conditions) {
      if (cond.next?.intent && typeof cond.next.intent === 'object' && cond.next.intent.id === nodeId) {
        cond.next = { redirect: 'waitInteraction', type: cond.next.type ?? 'context' }
      }

      if (Array.isArray(cond.action.choices)) {
        const buttons = cond.assistant_says
          .flatMap(s => s.messages)
          .find(m => m.messageConfig?.buttons?.length)?.messageConfig?.buttons
        for (let i = cond.action.choices.length - 1; i >= 0; i--) {
          if (cond.action.choices[i] !== nodeId) continue
          cond.action.choices.splice(i, 1)
          buttons?.splice(i, 1)
        }
      }

      const errNext = cond.action.error?.next
      if (errNext && typeof errNext.intent === 'string' && errNext.intent === nodeId) {
        errNext.intent = `${other.botId}-start`
        errNext.intentBot = other.botId
      }

      if (Array.isArray(cond.fallbackIntents) && cond.fallbackIntents.includes(nodeId)) {
        cond.fallbackIntents = cond.fallbackIntents.filter(id => id !== nodeId)
      }
    }
  }

  return { ok: true }
}

/**
 * Serializa o modelo de volta para o JSON aceito pela plataforma (`{ list: [...] }`).
 * Não normaliza nem reconstrói nada: o objeto original é preservado e apenas os
 * patches aplicados pelas edições aparecem na saída (estratégia preserve-and-patch).
 */
export function serializeFlow(json: BotFlowJson): string {
  return JSON.stringify(json, null, 2)
}
