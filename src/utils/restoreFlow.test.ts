import { describe, it, expect } from 'vitest'
import { planRestore, deleteExtras, restoreToBackup } from './restoreFlow'
import type { FetchLike, FetchResponse } from './pushFlow'
import type { BotFlowJson, BotIntent, Condition } from '../types'

const BOT = 'bot-uuid-0001'

function cond(partial: Partial<Condition> = {}): Condition {
  return {
    name: 'c',
    type: 'keywords',
    variable: null,
    intent: null,
    value: null,
    valueNumber: null,
    fallbackIntents: [],
    values: null,
    context: null,
    action: {
      type: 'none', choices: null, captureDataType: null, transferType: null, value: null,
      variable: null, conversationType: null, storeType: null, entity: null,
    },
    assistant_says: [],
    next: { type: 'intent' },
    ...partial,
  }
}

function intent(id: string, name: string, conditions: Condition[] = [cond()]): BotIntent {
  return { id, name, category: 'default', botId: BOT, keywords: [], context: null, priority: 0, conditions }
}

/** next.intent como objeto apontando para outra intenção interna. */
function nextTo(id: string): Condition {
  return cond({ next: { type: 'intent', redirect: 'continueFlow', intent: { botId: BOT, id } } })
}

function jsonResp(status: number, body: unknown): FetchResponse {
  const text = JSON.stringify(body)
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) }
}

const noWait = async () => {}

/**
 * Servidor falso com estado, exercitando GET/POST/DELETE juntos:
 *  - GET     → lista quem está vivo (reflete criações e exclusões);
 *  - POST id existente → atualiza in-place (devolve o mesmo id);
 *  - POST id novo      → IGNORA o id e gera outro (achado da Etapa 1);
 *  - DELETE  → remoção com consistência EVENTUAL: só some após `deleteLag` rodadas.
 */
function serverMock(initial: BotIntent[], deleteLag = 1) {
  const live = new Map<string, BotIntent>(initial.map(i => [i.id, i]))
  const deleteCount = new Map<string, number>()
  let idSeq = 0
  const calls: { method: string; url: string }[] = []
  const fetch: FetchLike = async (url, init) => {
    const method = init.method ?? 'GET'
    calls.push({ method, url })
    if (method === 'GET') {
      const list = [...live.values()].filter(i => (deleteCount.get(i.id) ?? 0) < deleteLag)
      return jsonResp(200, { list })
    }
    if (method === 'DELETE') {
      const id = url.split('/').pop()!
      const n = (deleteCount.get(id) ?? 0) + 1
      deleteCount.set(id, n)
      if (n >= deleteLag) live.delete(id)
      return jsonResp(200, {})
    }
    if (method === 'POST') {
      const id = url.split('/').pop()!
      const body = JSON.parse(init.body!) as BotIntent
      if (live.has(id)) {
        live.set(id, body)
        return jsonResp(200, { id })
      }
      const newId = `srv-${++idSeq}`
      live.set(newId, { ...body, id: newId })
      return jsonResp(200, { id: newId })
    }
    return jsonResp(200, {})
  }
  return { fetch, calls, live }
}

describe('planRestore — classifica em excluir/recriar/sobrescrever', () => {
  it('separa extras (excluir), missing (recriar) e comuns (sobrescrever)', () => {
    const start = intent(`${BOT}-start`, 'start')
    const server = [start, intent('extra', 'extra')]
    const backup = [start, intent('a', 'A')]
    const plan = planRestore(backup, server)
    expect(plan.extras.map(i => i.name)).toEqual(['extra'])
    expect(plan.creates.map(i => i.name)).toEqual(['A'])
    expect(plan.updates.map(i => i.name)).toEqual(['start'])
    expect(plan.serverTotal).toBe(2)
    expect(plan.keepCount).toBe(2)
  })
})

describe('deleteExtras — fase 1 (laço tolerante à consistência eventual)', () => {
  const backup: BotFlowJson = { list: [intent(`${BOT}-start`, 'start')] }

  it('remove o excedente em rodadas quando a remoção é eventual (lag 2)', async () => {
    const { fetch, calls } = serverMock([intent(`${BOT}-start`, 'start'), intent('x', 'X')], 2)
    const report = await deleteExtras({ fetch, token: 'r:x', botId: BOT, backup, sleep: noWait })
    expect(report.ok).toBe(true)
    expect(report.rounds).toBe(2)
    expect(report.deleted.filter(d => d.id === 'x')).toHaveLength(2)
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(3) // 1 inicial + 1 por rodada
  })

  it('para em maxRounds e reporta o que sobrou', async () => {
    const { fetch } = serverMock([intent(`${BOT}-start`, 'start'), intent('x', 'X'), intent('y', 'Y')], 99)
    const report = await deleteExtras({ fetch, token: 'r:x', botId: BOT, backup, sleep: noWait, maxRounds: 2 })
    expect(report.ok).toBe(false)
    expect(report.rounds).toBe(2)
    expect(report.remaining.map(i => i.name)).toEqual(['X', 'Y'])
    expect(report.deleted).toHaveLength(4) // 2 extras × 2 rodadas
  })
})

describe('restoreToBackup — restaura ao estado real do backup', () => {
  it('exclui extra, recria A→B com remap de IDs e sobrescreve o start', async () => {
    // backup: start → A → B (A e B sumiram do servidor; precisam ser recriados)
    const start = intent(`${BOT}-start`, 'start', [nextTo('a')])
    const A = intent('a', 'A', [nextTo('b')])
    const B = intent('b', 'B')
    const backup: BotFlowJson = { list: [start, A, B] }

    // servidor atual: só o start (igual) + um excedente
    const { fetch, calls } = serverMock([intent(`${BOT}-start`, 'start'), intent('extra', 'extra')], 1)

    let safety: BotFlowJson | null = null
    const report = await restoreToBackup({
      fetch, token: 'r:x', botId: BOT, backup, sleep: noWait,
      onSafetyBackup: s => { safety = s },
    })

    // Snapshot de segurança capturou o estado ANTES de destruir
    expect(safety!.list.map(i => i.name).sort()).toEqual(['extra', 'start'])

    // Fase 1: excedente removido
    expect(report.deletePhase.ok).toBe(true)
    expect(report.deletePhase.deleted.map(d => d.name)).toEqual(['extra'])

    // Fase 2: A e B recriados com IDs do servidor; refs remapeadas
    expect(report.pushPhase.ok).toBe(true)
    expect(report.pushPhase.idMap).toEqual({ a: 'srv-1', b: 'srv-2' })
    expect(report.ok).toBe(true)

    // PROVA DA ORDEM: os IDs recriados (srv-*) nunca foram deletados
    const deletedIds = calls.filter(c => c.method === 'DELETE').map(c => c.url.split('/').pop())
    expect(deletedIds).toEqual(['extra'])
    expect(deletedIds.some(id => id?.startsWith('srv-'))).toBe(false)
  })

  it('tolera consistência eventual na exclusão e ainda restaura (lag 2)', async () => {
    const start = intent(`${BOT}-start`, 'start')
    const backup: BotFlowJson = { list: [start] }
    const { fetch } = serverMock([intent(`${BOT}-start`, 'start'), intent('x', 'X')], 2)
    const report = await restoreToBackup({ fetch, token: 'r:x', botId: BOT, backup, sleep: noWait })
    expect(report.deletePhase.rounds).toBe(2)
    expect(report.ok).toBe(true)
  })

  it('reporta não-ok quando a exclusão não converge, mas ainda roda o push', async () => {
    const start = intent(`${BOT}-start`, 'start')
    const backup: BotFlowJson = { list: [start, intent('a', 'A')] }
    const { fetch, calls } = serverMock([intent(`${BOT}-start`, 'start'), intent('extra', 'extra')], 99)
    const report = await restoreToBackup({ fetch, token: 'r:x', botId: BOT, backup, sleep: noWait, maxRounds: 2 })
    expect(report.deletePhase.ok).toBe(false)
    expect(report.deletePhase.remaining.map(i => i.name)).toEqual(['extra'])
    // push rodou mesmo assim: A foi recriada
    expect(report.pushPhase.idMap).toEqual({ a: 'srv-1' })
    expect(report.ok).toBe(false)
    // POST de criação aconteceu apesar da exclusão pendente
    expect(calls.some(c => c.method === 'POST')).toBe(true)
  })

  it('emite progresso etiquetado por fase (delete/create/update)', async () => {
    const start = intent(`${BOT}-start`, 'start')
    const backup: BotFlowJson = { list: [start, intent('a', 'A')] }
    const { fetch } = serverMock([intent(`${BOT}-start`, 'start'), intent('extra', 'extra')], 1)
    const phases: string[] = []
    await restoreToBackup({
      fetch, token: 'r:x', botId: BOT, backup, sleep: noWait,
      onProgress: e => phases.push(e.phase),
    })
    expect(phases).toContain('delete')
    expect(phases).toContain('create')
    expect(phases).toContain('update')
    // ordem: deletes antes de creates/updates
    expect(phases.indexOf('delete')).toBeLessThan(phases.indexOf('create'))
  })
})

describe('restoreToBackup — guardas de pré-flight (antes de destruir)', () => {
  const neverCalled = serverMock([intent('x', 'X')])

  it('rejeita backup vazio', async () => {
    await expect(
      restoreToBackup({ fetch: neverCalled.fetch, token: 'r:x', botId: BOT, backup: { list: [] }, sleep: noWait }),
    ).rejects.toThrow(/backup não tem/)
  })

  it('rejeita backup que mistura botIds', async () => {
    const backup: BotFlowJson = { list: [intent('a', 'A'), { ...intent('b', 'B'), botId: 'outro' }] }
    const { fetch, calls } = serverMock([])
    await expect(restoreToBackup({ fetch, token: 'r:x', botId: BOT, backup, sleep: noWait })).rejects.toThrow(/mistura botIds/)
    expect(calls).toEqual([]) // nada foi tocado no servidor
  })

  it('rejeita quando o botId do backup não bate com o alvo', async () => {
    const backup: BotFlowJson = { list: [intent('a', 'A')] }
    const { fetch, calls } = serverMock([])
    await expect(restoreToBackup({ fetch, token: 'r:x', botId: 'bot-errado', backup, sleep: noWait })).rejects.toThrow(
      /não bate com o alvo/,
    )
    expect(calls).toEqual([])
  })
})
