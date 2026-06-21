import { describe, it, expect } from 'vitest'
import {
  fetchMessageTemplates, fetchStoreMessageTemplates,
  templateVarCount, templateBody, distinctPlaceholders,
} from './messageTemplates'
import type { FetchLike } from './pushFlow'

const TOKEN = 'r:fake-session-token'
const BOT = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'
const RETAILER = '5rFc8fXg1G'

interface RecordedCall {
  url: string
  method?: string
  headers: Record<string, string>
  body?: string
}

/** fetch mockado: grava as chamadas (incl. method/body do POST) e responde via `responder`. Sem rede. */
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

const botsBody = {
  list: [
    { botId: 'outro-bot', retailerId: 'XXXXXX' },
    { botId: BOT, retailerId: RETAILER },
  ],
}

/** Modelo cru COM botão Flow (entra na lista). */
function flowTemplate(objectId: string, title: string, text: string, examples: string[] = []) {
  return {
    objectId, title, text, status: 'READY', type: 'CUSTOM', userVisible: true,
    components: [
      { type: 'BODY', text, examples },
      { type: 'BUTTONS', buttons: [{ text: 'Abrir formulário', type: 'FLOW', flow_id: 'f1', flow_action: 'navigate' }] },
    ],
  }
}

/** Modelo cru SEM Flow (botões comuns) — filtrado fora pelo client-side. */
function plainTemplate(objectId: string, title: string) {
  return {
    objectId, title, text: 'Olá {{1}}', status: 'READY', type: 'MARKETING', userVisible: true,
    components: [
      { type: 'BODY', text: 'Olá {{1}}', examples: ['João'] },
      { type: 'BUTTONS', buttons: [{ text: 'Ver site', type: 'URL', url: 'https://x' }] },
    ],
  }
}

describe('distinctPlaceholders / templateVarCount / templateBody', () => {
  it('conta variáveis {{n}} distintas, em ordem, ignorando duplicatas e fora de ordem', () => {
    expect(distinctPlaceholders('a {{2}} b {{1}} c {{1}}')).toEqual([1, 2])
    expect(distinctPlaceholders('sem variáveis')).toEqual([])
    expect(distinctPlaceholders('Pedido {{ 3 }}')).toEqual([3]) // tolera espaços
  })

  it('templateVarCount usa o corpo; templateBody devolve o corpo', () => {
    const t = { objectId: 'x', title: 'T', body: 'Olá {{1}}, seu pedido {{2}}', examples: [], flowButtonText: 'Abrir' }
    expect(templateVarCount(t)).toBe(2)
    expect(templateBody(t)).toBe('Olá {{1}}, seu pedido {{2}}')
  })
})

describe('fetchMessageTemplates — lista modelos com Flow pelo retailerId', () => {
  it('monta o where da plataforma (POST), filtra Flow client-side e ordena por título', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: {
      result: [
        flowTemplate('t2', 'Zebra Flow', 'Oi {{1}}', ['Maria']),
        plainTemplate('p1', 'Promo sem flow'),
        flowTemplate('t1', 'Abacaxi Flow', 'Olá'),
      ],
    } }))
    const list = await fetchMessageTemplates({ fetch, token: TOKEN, retailerId: RETAILER })
    // Só os 2 com Flow, ordenados por título
    expect(list.map(t => t.objectId)).toEqual(['t1', 't2'])
    expect(list[1]).toMatchObject({ objectId: 't2', title: 'Zebra Flow', body: 'Oi {{1}}', examples: ['Maria'], flowButtonText: 'Abrir formulário' })
    // POST no endpoint correto (api-private, sem o "2") com a Cloud Function
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toContain('/parse/functions/findMessageTemplates')
    // Corpo: where com pointer do retailer, status READY, userVisible e os 4 tipos
    const sent = JSON.parse(calls[0].body!)
    expect(sent.where.retailer).toEqual({ __type: 'Pointer', className: 'Retailer', objectId: RETAILER })
    expect(sent.where.status).toBe('READY')
    expect(sent.where.userVisible).toBe(true)
    expect(sent.where.title).toEqual({ $regex: '', $options: 'i' })
    expect(sent.where.type.$in).toEqual(['NEW_CHAT', 'CUSTOM', 'MARKETING', 'ACCOUNT_UPDATE'])
    expect(sent.limit).toBe(1000)
    // headers de sessão (token nos dois headers)
    expect(calls[0].headers.authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0].headers['x-parse-session-token']).toBe(TOKEN)
  })

  it('aplica o filtro de busca no $regex do título', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: { result: [] } }))
    await fetchMessageTemplates({ fetch, token: TOKEN, retailerId: RETAILER, search: 'pedido' })
    expect(JSON.parse(calls[0].body!).where.title).toEqual({ $regex: 'pedido', $options: 'i' })
  })

  it('estado vazio: nenhum modelo com Flow → lista vazia', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { result: [
      plainTemplate('p1', 'A'), plainTemplate('p2', 'B'),
    ] } }))
    expect(await fetchMessageTemplates({ fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
  })

  it('usa o objectId como título quando o modelo não tem title', async () => {
    const raw = flowTemplate('abc123', '', 'Oi')
    const { fetch } = recordingFetch(() => ({ status: 200, body: { result: [raw] } }))
    const list = await fetchMessageTemplates({ fetch, token: TOKEN, retailerId: RETAILER })
    expect(list[0].title).toBe('abc123')
  })

  it('ignora entradas sem objectId e trata result ausente', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { result: [{ title: 'sem id', components: [{ type: 'BUTTONS', buttons: [{ type: 'FLOW', text: 'x' }] }] }] } }))
    expect(await fetchMessageTemplates({ fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
    const empty = recordingFetch(() => ({ status: 200, body: {} }))
    expect(await fetchMessageTemplates({ fetch: empty.fetch, token: TOKEN, retailerId: RETAILER })).toEqual([])
  })

  it('lança quando a leitura falha (status != 2xx) sem vazar o token', async () => {
    const { fetch } = recordingFetch(() => ({ status: 401, body: { error: 'expired' } }))
    const err = await fetchMessageTemplates({ fetch, token: TOKEN, retailerId: RETAILER }).catch(e => e as Error)
    expect((err as Error).message).toMatch(/status 401/)
    expect((err as Error).message).not.toContain(TOKEN)
  })
})

describe('fetchStoreMessageTemplates — compõe os 2 passos (botId → retailerId → modelos)', () => {
  it('faz bots primeiro, depois findMessageTemplates, e devolve os modelos com Flow', async () => {
    const { fetch, calls } = recordingFetch((call) =>
      call.url.includes('/v2/bots')
        ? { status: 200, body: botsBody }
        : { status: 200, body: { result: [flowTemplate('t1', 'Pedido', 'Oi {{1}}', ['João'])] } },
    )
    const list = await fetchStoreMessageTemplates({ fetch, token: TOKEN, botId: BOT })
    expect(list.map(t => t.objectId)).toEqual(['t1'])
    expect(calls).toHaveLength(2)
    expect(calls[0].url).toContain('/v2/bots')
    expect(calls[1].url).toContain('/parse/functions/findMessageTemplates')
    expect(JSON.parse(calls[1].body!).where.retailer.objectId).toBe(RETAILER)
  })

  it('propaga falha de fetchRetailerId (bot não está na conta)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: { list: [{ botId: 'outro', retailerId: 'Z' }] } }))
    await expect(fetchStoreMessageTemplates({ fetch, token: TOKEN, botId: BOT })).rejects.toThrow(/não está na lista/)
  })
})
