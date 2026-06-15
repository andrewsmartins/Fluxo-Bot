/**
 * Restore (rollback) de um backup pela UI — Fase 4b.
 *
 * Restaura o bot ao ESTADO REAL de um arquivo de backup. Como o push é só upsert
 * (POST cria/atualiza, nunca apaga), restaurar exige 3 operações:
 *   1. EXCLUIR  o que está no servidor e não no backup (extras);
 *   2. RECRIAR  o que está no backup e sumiu do servidor (missing);
 *   3. SOBRESCREVER o que existe nos dois, caso tenha sido editado (updates).
 *
 * Ordem OBRIGATÓRIA: deletar PRIMEIRO, recriar/atualizar DEPOIS. Recriar uma
 * intenção que sumiu cai no achado da Etapa 1 (POST com ID novo → servidor gera
 * outro ID), e a recriada ganha um ID que NÃO está no backup. Se o push rodasse
 * antes da exclusão, esse ID seria visto como "extra" e a recriada seria apagada.
 * Deletando antes, os conjuntos ficam disjuntos (extras nunca são do backup).
 *
 * A metade recriar+atualizar reusa o `pushFlow` (já validado, com remap de IDs em
 * 2 passadas). Esta camada só orquestra: snapshot de segurança → exclusão (laço
 * que tolera a consistência eventual do DELETE) → push do backup.
 *
 * Segurança: token por parâmetro, nunca logado nem incluído no relatório. Só
 * altera o RASCUNHO — nunca publica.
 */
import type { BotFlowJson, BotIntent } from '../types'
import { fetchServerIntents, deleteIntent, pushFlow, type FetchLike, type PushReport } from './pushFlow'

const DEFAULT_MAX_ROUNDS = 6
const DEFAULT_WAIT_MS = 4000

export interface RestorePlan {
  /** No servidor e não no backup → serão EXCLUÍDAS. */
  extras: BotIntent[]
  /** No backup e ausentes no servidor → serão RECRIADAS (com remap de IDs). */
  creates: BotIntent[]
  /** Presentes nos dois → serão SOBRESCRITAS in-place. */
  updates: BotIntent[]
  /** Total de intenções no servidor agora. */
  serverTotal: number
  /** Quantas intenções o backup define. */
  keepCount: number
}

/**
 * Compara backup × servidor e classifica cada intenção em excluir/recriar/
 * sobrescrever. Função pura — base do dry-run da UI e do orquestrador.
 */
export function planRestore(backupList: BotIntent[], serverIntents: BotIntent[]): RestorePlan {
  const backupIds = new Set(backupList.map(i => i.id))
  const serverIds = new Set(serverIntents.map(i => i.id))
  return {
    extras: serverIntents.filter(i => !backupIds.has(i.id)),
    creates: backupList.filter(i => !serverIds.has(i.id)),
    updates: backupList.filter(i => serverIds.has(i.id)),
    serverTotal: serverIntents.length,
    keepCount: backupIds.size,
  }
}

export interface RestoreDeleteItem {
  name: string
  id: string
  status: number
  round: number
}

export interface DeletePhaseReport {
  /** true quando o GET final confirma que nenhum extra restou. */
  ok: boolean
  rounds: number
  deleted: RestoreDeleteItem[]
  /** Excedente que sobrou após `maxRounds` (vazio se ok). */
  remaining: BotIntent[]
}

export type RestoreProgress =
  | { phase: 'delete'; name: string; status: number; round: number }
  | { phase: 'create' | 'update'; name: string; status: number }

interface DeleteExtrasOptions {
  fetch: FetchLike
  token: string
  botId: string
  backup: BotFlowJson
  onProgress?: (event: RestoreProgress) => void
  sleep?: (ms: number) => Promise<void>
  maxRounds?: number
  waitMs?: number
}

/**
 * Fase 1 do restore: remove o excedente do servidor em rodadas, reverificando
 * por GET entre elas, porque o DELETE da plataforma é de consistência EVENTUAL
 * (responde 200 mas a remoção propaga com atraso — Etapa 4 da Fase 4a).
 */
export async function deleteExtras(options: DeleteExtrasOptions): Promise<DeletePhaseReport> {
  const { fetch, token, botId, backup, onProgress } = options
  const sleep = options.sleep ?? (ms => new Promise(resolve => setTimeout(resolve, ms)))
  const maxRounds = options.maxRounds ?? DEFAULT_MAX_ROUNDS
  const waitMs = options.waitMs ?? DEFAULT_WAIT_MS

  const deps = { fetch, token, botId }
  const listExtras = async () => planRestore(backup.list, await fetchServerIntents(deps)).extras

  const deleted: RestoreDeleteItem[] = []
  let round = 0
  let extras = await listExtras()

  while (extras.length && round < maxRounds) {
    round++
    for (const intent of extras) {
      const { status } = await deleteIntent(deps, intent.id)
      deleted.push({ name: intent.name, id: intent.id, status, round })
      onProgress?.({ phase: 'delete', name: intent.name, status, round })
    }
    await sleep(waitMs)
    extras = await listExtras()
  }

  return { ok: extras.length === 0, rounds: round, deleted, remaining: extras }
}

export interface RestoreReport {
  /** true quando exclusão e push terminaram sem pendências. */
  ok: boolean
  deletePhase: DeletePhaseReport
  /** Relatório do push do backup (recriar + sobrescrever). */
  pushPhase: PushReport
}

export interface RestoreOptions {
  fetch: FetchLike
  token: string
  botId: string
  backup: BotFlowJson
  onProgress?: (event: RestoreProgress) => void
  /**
   * Chamado UMA vez com o estado ATUAL do servidor, ANTES de qualquer escrita.
   * A UI usa para baixar um snapshot de segurança (se o backup estiver errado,
   * o estado atual não se perde). É aguardado: o restore só age depois.
   */
  onSafetyBackup?: (snapshot: BotFlowJson) => void | Promise<void>
  sleep?: (ms: number) => Promise<void>
  maxRounds?: number
  waitMs?: number
}

/**
 * Restaura o bot ao conteúdo do backup. Ordem: snapshot de segurança → excluir
 * extras (Fase 1) → push do backup (Fase 2: recriar missing com remap +
 * sobrescrever updates). Lança se o backup for inválido, misturar botIds ou não
 * bater com o alvo (antes de qualquer exclusão). Só altera o rascunho.
 */
export async function restoreToBackup(options: RestoreOptions): Promise<RestoreReport> {
  const { fetch, token, botId, backup, onProgress, onSafetyBackup } = options

  if (!backup || !Array.isArray(backup.list) || backup.list.length === 0) {
    throw new Error('o backup não tem { list: [...] } com intenções a restaurar')
  }
  const botIds = [...new Set(backup.list.map(i => i.botId))]
  if (botIds.length !== 1) {
    throw new Error(`o backup mistura botIds (${botIds.join(', ')}) — restore cancelado`)
  }
  if (botIds[0] !== botId) {
    throw new Error(`o botId do backup (${botIds[0]}) não bate com o alvo (${botId})`)
  }

  // 0. Snapshot de segurança do estado atual ANTES de destruir.
  if (onSafetyBackup) {
    const current = await fetchServerIntents({ fetch, token, botId })
    await onSafetyBackup({ list: current })
  }

  // 1. Excluir o excedente (precisa convergir antes do push — ver doc do módulo).
  const deletePhase = await deleteExtras(options)

  // 2. Recriar o que falta (com remap) + sobrescrever o resto. Sem onBackup: o
  // snapshot de segurança já foi feito acima e não queremos baixar de novo.
  const pushPhase = await pushFlow(backup, {
    fetch,
    token,
    botId,
    onProgress: e => {
      const phase = e.op === 'criar' ? 'create' : 'update'
      onProgress?.({ phase, name: e.name, status: e.status })
    },
  })

  return { ok: deletePhase.ok && pushPhase.ok, deletePhase, pushPhase }
}
