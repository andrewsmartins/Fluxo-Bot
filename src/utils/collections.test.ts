import { describe, it, expect } from 'vitest'
import { fetchCollections, fetchStoreCollections } from './collections'
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

describe('fetchCollections — lista as coleções da loja pelo retailerId', () => {
  const body = {
    results: [
      { objectId: 'g5hRHfEmuWp3', name: 'Verão', image: { url: 'https://cdn/verao.jpg' } },
      { objectId: 'aB1cD2eF3g', name: 'Acessórios', image: 'https://cdn/acc.jpg' },
    ],
  }

  it('mapeia {objectId, name, image} e ordena por nome', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body }))
    const list = await fetchCollections({ fetch, token: TOKEN, retailerId: RETAILER })
    expect(list).toEqual([
      { objectId: 'aB1cD2eF3g', name: 'Acessórios', image: 'https://cdn/acc.jpg' },
      { objectId: 'g5hRHfEmuWp3', name: 'Verão', image: 'https://cdn/verao.jpg' },
    ])
    // where carrega o pointer do retailer e o regex de nome (URL-encoded)
    const decoded = decodeURIComponent(calls[0].url)
    expect(decoded).toContain(`"objectId":"${RETAILER}"`)
    expect(decoded).toContain('"$regex":""')
    expect(calls[0].url).toContain('/classes/Collection?where=')
    // headers de sessão (token nos dois headers)
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].headers['x-parse-session-token']).toBe(TOKEN)
  })

  it('aplica o filtro de busca no regex de nome', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: { results: [] } }))
    await fetchCollections({ fetch, token: TOKEN, retailerId: RETAILER, search: 'ver' })
    expect(decodeURIComponent(calls[0].url)).toContain('"$regex":"ver"')
  })

  it('extrai a imagem de Parse File, objeto {url} ou string; null quando ausente', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { results: [
      { objectId: 'a', name: 'A', image: { __type: 'File', url: 'https://f/a.png' } },
      { objectId: 'b', name: 'B', coverImage: 'https://f/b.png' },
      { objectId: 'c', name: 'C' },
    ] } }))
    const list = await fetchCollections({ fetch, token: TOKEN, retailerId: RETAILER })
    expect(list.map(c => c.image)).toEqual(['https://f/a.png', 'https://f/b.png', null])
  })

  it('usa o objectId como rótulo quando a coleção não tem name', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { results: [{ objectId: 'abc123' }] } }))
    expect(await fetchCollections({ fetch, token: TOKEN, retailerId: RETAILER }))
      .toEqual([{ objectId: 'abc123', name: 'abc123', image: null }])
  })

  it('ignora entradas sem objectId e trata lista vazia', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { results: [{ name: 'sem id' }] } }))
    expect(await fetchCollections({ fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
    const empty = recordingFetch(() => ({ status: 200, body: {} }))
    expect(await fetchCollections({ fetch: empty.fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
  })

  it('lança quando a leitura falha (status != 2xx)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 401, body: { error: 'expired' } }))
    await expect(fetchCollections({ fetch, token: TOKEN, retailerId: RETAILER })).rejects.toThrow(/status 401/)
  })
})

describe('fetchStoreCollections — compõe os 2 passos (botId → retailerId → coleções)', () => {
  it('faz bots primeiro, depois Collection, e devolve as coleções', async () => {
    const { fetch, calls } = recordingFetch((call) =>
      call.url.includes('/v2/bots')
        ? { status: 200, body: botsBody }
        : { status: 200, body: { results: [{ objectId: 'g5hRHfEmuWp3', name: 'Verão', image: null }] } },
    )
    const list = await fetchStoreCollections({ fetch, token: TOKEN, botId: BOT })
    expect(list).toEqual([{ objectId: 'g5hRHfEmuWp3', name: 'Verão', image: null }])
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain('/v2/bots')
    expect(decodeURIComponent(calls[1].url)).toContain(`"objectId":"${RETAILER}"`)
  })
})
