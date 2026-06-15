import { describe, it, expect } from 'vitest'
import { planPush, remapRefs, pushFlow, fetchServerIntents } from './pushFlow'
import type { FetchLike } from './pushFlow'
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
      type: 'none',
      choices: null,
      captureDataType: null,
      transferType: null,
      value: null,
      variable: null,
      conversationType: null,
      storeType: null,
      entity: null,
    },
    assistant_says: [],
    next: { type: 'intent' },
    ...partial,
  }
}

function intent(id: string, name: string, conditions: Condition[] = [cond()]): BotIntent {
  return {
    id,
    name,
    category: 'default',
    botId: BOT,
    keywords: [],
    context: null,
    priority: 0,
    conditions,
  }
}

/** next.intent como OBJETO apontando para outra intenção interna. */
function nextTo(id: string): Condition {
  return cond({ next: { type: 'intent', redirect: 'continueFlow', intent: { botId: BOT, id } } })
}

interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** fetch mockado: grava as chamadas e responde via `responder`. Sem rede. */
function recordingFetch(
  responder: (call: RecordedCall, index: number) => { status: number; body: unknown },
): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = {
      url,
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body ? JSON.parse(init.body) : undefined,
    }
    const index = calls.length
    calls.push(call)
    const { status, body } = responder(call, index)
    const text = JSON.stringify(body)
    return {
      ok: status >= 200 && status < 300,
      status,
      text: async () => text,
      json: async () => JSON.parse(text),
    }
  }
  return { fetch, calls }
}

describe('planPush — quem é criação vs. atualização', () => {
  it('separa por presença do ID no servidor', () => {
    const a = intent('client-a', 'A')
    const b = intent('client-b', 'B')
    const start = intent(`${BOT}-start`, 'start')
    const serverIntents = [start]

    const plan = planPush([start, a, b], serverIntents)

    expect(plan.creates.map(i => i.name)).toEqual(['A', 'B'])
    expect(plan.updates.map(i => i.name)).toEqual(['start'])
  })

  it('lista vazia e servidor vazio: tudo é criação, nada a atualizar', () => {
    expect(planPush([], [])).toEqual({ creates: [], updates: [] })
    const plan = planPush([intent('x', 'X')], [])
    expect(plan.creates).toHaveLength(1)
    expect(plan.updates).toHaveLength(0)
  })
})

describe('remapRefs — reaponta as 4 formas de referência', () => {
  it('troca next.intent.id (objeto), choices, error.next.intent (string) e fallbackIntents', () => {
    const idMap = new Map([
      ['old-1', 'srv-1'],
      ['old-2', 'srv-2'],
      ['old-3', 'srv-3'],
      ['old-4', 'srv-4'],
    ])
    const i = intent('x', 'X', [
      cond({
        next: { type: 'intent', intent: { botId: BOT, id: 'old-1' } },
        fallbackIntents: ['old-4', 'mantem'],
        action: {
          ...cond().action,
          type: 'choice',
          choices: ['old-2', 'mantem-tambem'],
          error: { next: { type: 'intent', intent: 'old-3' }, assistant_says: [] },
        },
      }),
    ])

    const changed = remapRefs(i, idMap)

    const c = i.conditions[0]
    expect(changed).toBe(true)
    expect((c.next.intent as { id: string }).id).toBe('srv-1')
    expect(c.action.choices).toEqual(['srv-2', 'mantem-tambem'])
    expect((c.action.error!.next.intent as string)).toBe('srv-3')
    expect(c.fallbackIntents).toEqual(['srv-4', 'mantem'])
  })

  it('não muta e devolve false quando nada está no mapa (preserva refs)', () => {
    const i = intent('x', 'X', [nextTo('desconhecido')])
    const changed = remapRefs(i, new Map([['outro', 'srv']]))
    expect(changed).toBe(false)
    expect((i.conditions[0].next.intent as { id: string }).id).toBe('desconhecido')
  })
})

describe('pushFlow — 2 passadas com remapeamento (cerne da Fase 4)', () => {
  function chainedFlow(): BotFlowJson {
    // start → A → B (cadeia da Etapa 3)
    const start = intent(`${BOT}-start`, 'start', [nextTo('client-a')])
    const a = intent('client-a', 'A', [nextTo('client-b')])
    const b = intent('client-b', 'B')
    return { list: [start, a, b] }
  }

  it('cria A e B, captura IDs reais e remapeia start→A e A→B', async () => {
    const flow = chainedFlow()
    const serverStart = intent(`${BOT}-start`, 'start')
    const { fetch, calls } = recordingFetch(call => {
      if (call.method === 'GET') return { status: 200, body: { list: [serverStart] } }
      const name = (call.body as BotIntent).name
      const serverId = ({ A: 'srv-a', B: 'srv-b' } as Record<string, string>)[name]
      return { status: 200, body: serverId ? { id: serverId } : { ok: true } }
    })

    const report = await pushFlow(flow, { fetch, token: 'r:segredo', botId: BOT })

    // 4/4 operações OK: criar A, criar B, remap start, remap A. B não reenvia (sem refs).
    expect(report.ok).toBe(true)
    expect(report.failed).toBe(false)
    expect(report.okCount).toBe(4)
    expect(report.results.map(r => `${r.op}:${r.name}`)).toEqual([
      'criar:A',
      'criar:B',
      'remap:start',
      'remap:A',
    ])
    expect(report.idMap).toEqual({ 'client-a': 'srv-a', 'client-b': 'srv-b' })

    // start foi atualizado apontando para o ID REAL de A
    const startPost = calls.find(c => c.method === 'POST' && (c.body as BotIntent).name === 'start')!
    expect(((startPost.body as BotIntent).conditions[0].next.intent as { id: string }).id).toBe('srv-a')
  })

  it('NÃO muta o flow recebido (clona antes de remapear)', async () => {
    const flow = chainedFlow()
    const { fetch } = recordingFetch(call => {
      if (call.method === 'GET') return { status: 200, body: { list: [intent(`${BOT}-start`, 'start')] } }
      const name = (call.body as BotIntent).name
      const serverId = ({ A: 'srv-a', B: 'srv-b' } as Record<string, string>)[name]
      return { status: 200, body: serverId ? { id: serverId } : { ok: true } }
    })

    await pushFlow(flow, { fetch, token: 'r:x', botId: BOT })

    expect(flow.list[1].id).toBe('client-a')
    expect((flow.list[0].conditions[0].next.intent as { id: string }).id).toBe('client-a')
  })

  it('caminho infeliz: erro HTTP no meio para e reporta só o que entrou', async () => {
    const flow = chainedFlow()
    const { fetch, calls } = recordingFetch(call => {
      if (call.method === 'GET') return { status: 200, body: { list: [intent(`${BOT}-start`, 'start')] } }
      const name = (call.body as BotIntent).name
      if (name === 'A') return { status: 500, body: { error: 'boom' } }
      return { status: 200, body: { id: 'srv-b' } }
    })

    const report = await pushFlow(flow, { fetch, token: 'r:x', botId: BOT })

    expect(report.failed).toBe(true)
    expect(report.ok).toBe(false)
    expect(report.results).toHaveLength(1)
    expect(report.results[0]).toMatchObject({ op: 'criar', name: 'A', status: 500, got: null })
    expect(report.idMap).toEqual({})
    // só GET + 1 POST: nada além do ponto de falha foi enviado
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(1)
  })

  it('criação que volta 200 sem id no corpo conta como falha (servidor não confirmou)', async () => {
    const flow: BotFlowJson = { list: [intent('client-a', 'A')] }
    const { fetch } = recordingFetch(call =>
      call.method === 'GET' ? { status: 200, body: { list: [] } } : { status: 200, body: { ok: true } },
    )
    const report = await pushFlow(flow, { fetch, token: 'r:x', botId: BOT })
    expect(report.failed).toBe(true)
    expect(report.results[0].got).toBeNull()
  })

  it('chama onBackup com o estado do servidor ANTES de qualquer POST', async () => {
    const flow: BotFlowJson = { list: [intent('client-a', 'A')] }
    const serverState = { list: [intent(`${BOT}-start`, 'start')] }
    const order: string[] = []
    const { fetch } = recordingFetch(call =>
      call.method === 'GET' ? { status: 200, body: serverState } : { status: 200, body: { id: 'srv-a' } },
    )

    let backupArg: BotFlowJson | null = null
    await pushFlow(flow, {
      fetch,
      token: 'r:x',
      botId: BOT,
      onBackup: b => {
        backupArg = b
        order.push('backup')
      },
      onProgress: e => order.push(`post:${e.name}`),
    })

    expect(order[0]).toBe('backup')
    expect(order).toEqual(['backup', 'post:A'])
    expect(backupArg).toEqual(serverState)
  })

  it('nunca inclui o token no relatório, mas o usa nos headers', async () => {
    const token = 'r:token-ultra-secreto-123'
    const flow: BotFlowJson = { list: [intent('client-a', 'A')] }
    const { fetch, calls } = recordingFetch(call =>
      call.method === 'GET' ? { status: 200, body: { list: [] } } : { status: 200, body: { id: 'srv-a' } },
    )

    const report = await pushFlow(flow, { fetch, token, botId: BOT })

    expect(JSON.stringify(report)).not.toContain(token)
    expect(calls[0].headers.authorization).toBe(`Bearer ${token}`)
    expect(calls[0].headers['x-parse-session-token']).toBe(token)
  })
})

describe('fetchServerIntents — leitura read-only para o preview/dry-run', () => {
  it('devolve a lista do servidor num GET 200', async () => {
    const server = [intent(`${BOT}-start`, 'start'), intent('x', 'X')]
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: { list: server } }))
    const intents = await fetchServerIntents({ fetch, token: 'r:x', botId: BOT })
    expect(intents.map(i => i.name)).toEqual(['start', 'X'])
    expect(calls[0].method).toBe('GET')
    expect(calls[0].headers.authorization).toBe('Bearer r:x')
  })

  it('lança quando o GET falha (ex.: 403 token/botId)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 403, body: { code: 'access-denied' } }))
    await expect(fetchServerIntents({ fetch, token: 'r:x', botId: BOT })).rejects.toThrow(/não foi possível ler/)
  })
})

describe('pushFlow — guardas de pré-flight (lançam antes de escrever)', () => {
  const neverFetch: FetchLike = async () => {
    throw new Error('não deveria chamar fetch')
  }

  it('rejeita fluxo vazio', async () => {
    await expect(pushFlow({ list: [] }, { fetch: neverFetch, token: 'r:x', botId: BOT })).rejects.toThrow(
      /não tem intenções/,
    )
  })

  it('rejeita fluxo que mistura botIds', async () => {
    const flow: BotFlowJson = { list: [intent('a', 'A'), { ...intent('b', 'B'), botId: 'outro-bot' }] }
    await expect(pushFlow(flow, { fetch: neverFetch, token: 'r:x', botId: BOT })).rejects.toThrow(/mistura botIds/)
  })

  it('rejeita quando o botId do fluxo não bate com o alvo', async () => {
    const flow: BotFlowJson = { list: [intent('a', 'A')] }
    await expect(pushFlow(flow, { fetch: neverFetch, token: 'r:x', botId: 'bot-errado' })).rejects.toThrow(
      /não bate com o alvo/,
    )
  })

  it('aborta se a leitura do estado atual (backup) falhar — não escreve', async () => {
    const flow: BotFlowJson = { list: [intent('a', 'A')] }
    const { fetch, calls } = recordingFetch(() => ({ status: 403, body: { code: 'access-denied' } }))
    await expect(pushFlow(flow, { fetch, token: 'r:x', botId: BOT })).rejects.toThrow(/leitura do estado atual falhou/)
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(0)
  })
})
