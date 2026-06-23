import { describe, it, expect } from 'vitest'
import { fetchSupervisedUsers, USERS_PAGE_LIMIT } from './users'
import { PARSE } from './teams'
import type { FetchLike } from './pushFlow'

const TOKEN = 'r:fake-session-token'

interface RecordedCall {
  url: string
  method?: string
  headers: Record<string, string>
  body?: string
}

/** fetch mockado: grava as chamadas e responde via `responder`. Sem rede. */
function recordingFetch(
  responder: (call: RecordedCall, index: number) => { status: number; body: unknown },
): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = { url, method: init.method, headers: init.headers, body: init.body }
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

describe('fetchSupervisedUsers — lista os vendedores (usuários supervisionados)', () => {
  // Shape real da cloud function (sonda 2026-06-22): { result: [ { objectId, name, lastName, ... } ] }.
  const usersBody = {
    result: [
      { objectId: 'Kq1BchVtk9', name: 'Bruno', lastName: 'Zanetti' },
      { objectId: 'Aa9zZ', name: 'Ana', lastName: 'Lima' },
    ],
  }

  it('mapeia para {objectId, name}, compõe name+lastName, ordena por nome e faz POST com body+headers', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: usersBody }))
    const users = await fetchSupervisedUsers({ fetch, token: TOKEN })
    expect(users).toEqual([
      { objectId: 'Aa9zZ', name: 'Ana Lima' },
      { objectId: 'Kq1BchVtk9', name: 'Bruno Zanetti' },
    ])
    // cloud function Parse: POST na base do projeto (api-private2 = PARSE) com body de busca total
    expect(calls[0].url).toBe(`${PARSE}/functions/getSupervisedUsersV2`)
    expect(calls[0].method).toBe('POST')
    expect(JSON.parse(calls[0].body!)).toEqual({ offset: 0, limit: USERS_PAGE_LIMIT, search: '.*' })
    // token só nos headers de sessão (Bearer + x-parse-session-token)
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].headers['x-parse-session-token']).toBe(TOKEN)
  })

  it('cai para name sozinho sem lastName e para o objectId quando não há nome', async () => {
    const { fetch } = recordingFetch(() => ({
      status: 200,
      body: { result: [{ objectId: 'so-nome', name: 'Solo' }, { objectId: 'sem-nome' }] },
    }))
    expect(await fetchSupervisedUsers({ fetch, token: TOKEN })).toEqual([
      { objectId: 'sem-nome', name: 'sem-nome' },
      { objectId: 'so-nome', name: 'Solo' },
    ])
  })

  it('ignora entradas sem objectId e trata result ausente como vazio', async () => {
    const { fetch } = recordingFetch(() => ({
      status: 200,
      body: { result: [{ name: 'sem id' }, { objectId: 'ok', name: 'Ok' }] },
    }))
    expect(await fetchSupervisedUsers({ fetch, token: TOKEN })).toEqual([{ objectId: 'ok', name: 'Ok' }])
    const empty = recordingFetch(() => ({ status: 200, body: {} }))
    expect(await fetchSupervisedUsers({ fetch: empty.fetch, token: TOKEN })).toEqual([])
  })

  it('lança quando a leitura falha (status != 2xx), sem expor o token', async () => {
    const { fetch } = recordingFetch(() => ({ status: 403, body: { error: 'denied' } }))
    const promise = fetchSupervisedUsers({ fetch, token: TOKEN })
    await expect(promise).rejects.toThrow(/status 403/)
    await expect(promise).rejects.not.toThrow(new RegExp(TOKEN))
  })
})
