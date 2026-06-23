import { describe, it, expect } from 'vitest'
import { fetchBotEndpoints } from './endpoints'
import type { FetchLike } from './pushFlow'

const TOKEN = 'r:fake-session-token'
const BOT = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'

interface RecordedCall {
  url: string
  headers: Record<string, string>
}

/** fetch mockado: grava as chamadas e responde via `responder`. Sem rede. */
function recordingFetch(
  responder: (call: RecordedCall, index: number) => { status: number; body: unknown },
): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = { url, headers: init.headers }
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

describe('fetchBotEndpoints — lista os endpoints (APIs) do bot', () => {
  // Shape real da API (sonda 2026-06-22): { id, name, type, method, url, ... }.
  const endpointsBody = {
    list: [
      { id: '0af2957e-204b-44d0-9236-261dfab4bc43', name: 'Pokemon', type: 'custom', method: 'GET' },
      { id: 'a1b2c3', name: 'Estoque', type: 'custom', method: 'POST' },
    ],
  }

  it('mapeia para {id, name, type}, ordena por nome e bate no endpoint por botId com fullObject', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: endpointsBody }))
    const endpoints = await fetchBotEndpoints({ fetch, token: TOKEN, botId: BOT })
    expect(endpoints).toEqual([
      { id: 'a1b2c3', name: 'Estoque', type: 'custom' },
      { id: '0af2957e-204b-44d0-9236-261dfab4bc43', name: 'Pokemon', type: 'custom' },
    ])
    // endpoint por botId direto (sem passo retailerId) + fullObject (fidelidade à sonda).
    expect(calls[0].url).toContain(`/v1/${BOT}/endpoints?fullObject=true`)
    // token só nos headers de sessão (Bearer + x-parse-session-token)
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].headers['x-parse-session-token']).toBe(TOKEN)
  })

  it('usa o id como rótulo quando o endpoint não tem name e type vazio quando ausente', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ id: 'sem-nome' }] } }))
    expect(await fetchBotEndpoints({ fetch, token: TOKEN, botId: BOT })).toEqual([
      { id: 'sem-nome', name: 'sem-nome', type: '' },
    ])
  })

  it('ignora entradas sem id e trata lista ausente como vazia', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ name: 'sem id' }, { id: 'ok', name: 'Ok', type: 'custom' }] } }))
    expect(await fetchBotEndpoints({ fetch, token: TOKEN, botId: BOT })).toEqual([
      { id: 'ok', name: 'Ok', type: 'custom' },
    ])
    const empty = recordingFetch(() => ({ status: 200, body: {} }))
    expect(await fetchBotEndpoints({ fetch: empty.fetch, token: TOKEN, botId: BOT })).toEqual([])
  })

  it('lança quando a leitura falha (status != 2xx), sem expor o token', async () => {
    const { fetch } = recordingFetch(() => ({ status: 403, body: { error: 'denied' } }))
    const promise = fetchBotEndpoints({ fetch, token: TOKEN, botId: BOT })
    await expect(promise).rejects.toThrow(/status 403/)
    await expect(promise).rejects.not.toThrow(new RegExp(TOKEN))
  })
})
