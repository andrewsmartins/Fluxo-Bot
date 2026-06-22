import { describe, it, expect } from 'vitest'
import { fetchActiveBots, fetchRetailerId, fetchTeams, fetchStoreTeams } from './teams'
import type { FetchLike } from './pushFlow'

const TOKEN = 'r:fake-session-token'
const BOT = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'
const RETAILER = '5rFc8fXg1G'

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

const botsBody = {
  list: [
    { botId: 'outro-bot', retailerId: 'XXXXXX' },
    { botId: BOT, retailerId: RETAILER },
  ],
}

describe('fetchRetailerId — casa o botId do fluxo com a lista de bots', () => {
  it('devolve o retailerId do bot certo e envia headers de sessão', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: botsBody }))
    const retailerId = await fetchRetailerId({ fetch, token: TOKEN, botId: BOT })
    expect(retailerId).toBe(RETAILER)
    expect(calls[0].url).toContain('/v2/bots?status=active')
    // token vai nos dois headers de sessão (Bearer + x-parse-session-token)
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].headers['x-parse-session-token']).toBe(TOKEN)
  })

  it('lança quando o bot não está na lista (caminho infeliz)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ botId: 'outro', retailerId: 'Y' }] } }))
    await expect(fetchRetailerId({ fetch, token: TOKEN, botId: BOT })).rejects.toThrow(/não está na lista/)
  })

  it('lança quando a leitura falha (status != 2xx)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 403, body: { error: 'denied' } }))
    await expect(fetchRetailerId({ fetch, token: TOKEN, botId: BOT })).rejects.toThrow(/status 403/)
  })

  it('lança quando o bot existe mas não tem retailerId', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ botId: BOT }] } }))
    await expect(fetchRetailerId({ fetch, token: TOKEN, botId: BOT })).rejects.toThrow(/não tem retailerId/)
  })
})

describe('fetchActiveBots — lista os bots ativos da conta (picker Próximo Fluxo)', () => {
  it('mapeia para {botId, name, retailerId} e ordena por nome', async () => {
    const body = { list: [
      { botId: 'b2', name: 'Zeta', retailerId: 'R2' },
      { botId: 'b1', name: 'Alfa', retailerId: 'R1' },
    ] }
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body }))
    const bots = await fetchActiveBots({ fetch, token: TOKEN })
    expect(bots).toEqual([
      { botId: 'b1', name: 'Alfa', retailerId: 'R1' },
      { botId: 'b2', name: 'Zeta', retailerId: 'R2' },
    ])
    expect(calls[0].url).toContain('/v2/bots?status=active')
    expect(calls[0].headers['x-parse-session-token']).toBe(TOKEN)
  })

  it('usa o botId como rótulo quando o bot não tem name e tolera lista vazia', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ botId: 'b9' }] } }))
    expect(await fetchActiveBots({ fetch, token: TOKEN })).toEqual([{ botId: 'b9', name: 'b9', retailerId: undefined }])
    const empty = recordingFetch(() => ({ status: 200, body: {} }))
    expect(await fetchActiveBots({ fetch: empty.fetch, token: TOKEN })).toEqual([])
  })

  it('ignora entradas sem botId', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ name: 'sem id' }, { botId: 'ok' }] } }))
    expect(await fetchActiveBots({ fetch, token: TOKEN })).toEqual([{ botId: 'ok', name: 'ok', retailerId: undefined }])
  })

  it('lança quando a leitura falha (status != 2xx)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 403, body: { error: 'denied' } }))
    await expect(fetchActiveBots({ fetch, token: TOKEN })).rejects.toThrow(/status 403/)
  })
})

describe('fetchTeams — lista os times da loja pelo retailerId', () => {
  const teamsBody = {
    results: [
      { objectId: 'fdI9crpRsB', name: 'Loja Centro' },
      { objectId: 'S1Cl3fbnFG', name: 'Atacado' },
    ],
  }

  it('mapeia para {objectId, name} e ordena por nome', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: teamsBody }))
    const teams = await fetchTeams({ fetch, token: TOKEN, retailerId: RETAILER })
    expect(teams).toEqual([
      { objectId: 'S1Cl3fbnFG', name: 'Atacado' },
      { objectId: 'fdI9crpRsB', name: 'Loja Centro' },
    ])
    // where carrega o pointer do retailer (URL-encoded)
    expect(decodeURIComponent(calls[0].url)).toContain(`"objectId":"${RETAILER}"`)
    expect(calls[0].url).toContain('/classes/Team?where=')
  })

  it('usa o objectId como rótulo quando o time não tem name', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { results: [{ objectId: 'abc123' }] } }))
    const teams = await fetchTeams({ fetch, token: TOKEN, retailerId: RETAILER })
    expect(teams).toEqual([{ objectId: 'abc123', name: 'abc123' }])
  })

  it('ignora entradas sem objectId e trata lista vazia', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { results: [{ name: 'sem id' }] } }))
    expect(await fetchTeams({ fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
    const empty = recordingFetch(() => ({ status: 200, body: {} }))
    expect(await fetchTeams({ fetch: empty.fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
  })

  it('lança quando a leitura falha (status != 2xx)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 401, body: { error: 'expired' } }))
    await expect(fetchTeams({ fetch, token: TOKEN, retailerId: RETAILER })).rejects.toThrow(/status 401/)
  })
})

describe('fetchStoreTeams — compõe os 2 passos (botId → retailerId → times)', () => {
  it('faz bots primeiro, depois Team, e devolve os times', async () => {
    const { fetch, calls } = recordingFetch((call) =>
      call.url.includes('/v2/bots')
        ? { status: 200, body: botsBody }
        : { status: 200, body: { results: [{ objectId: 'fdI9crpRsB', name: 'Loja Centro' }] } },
    )
    const teams = await fetchStoreTeams({ fetch, token: TOKEN, botId: BOT })
    expect(teams).toEqual([{ objectId: 'fdI9crpRsB', name: 'Loja Centro' }])
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain('/v2/bots')
    expect(decodeURIComponent(calls[1].url)).toContain(`"objectId":"${RETAILER}"`)
  })
})
