import { describe, it, expect } from 'vitest'
import { Resolvers } from './resolvers'
import { FlowStore } from './flowStore'
import type { BotFlowJson, BotIntent } from '../types'
import type { FetchLike } from '../utils/pushFlow'

/**
 * Testes da camada de resolvers (Fase 4) com `fetch` injetado — sem rede, igual a
 * `teams.test`/`users.test`. Cobrem o contrato de cada resolver: match exato único
 * / candidatos (contains) / ambíguo / vazio / 401-AUTH (sem retry) / cache, e os
 * gates de token ausente e fluxo sem botId.
 */

const TOKEN = 'r:fake-session-token'
const BOT = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'
const RETAILER = '5rFc8fXg1G'

interface RecordedCall {
  url: string
  method?: string
  body?: string
}

/** fetch mockado por URL: grava as chamadas e responde via `responder`. Sem rede. */
function recordingFetch(
  responder: (call: RecordedCall) => { status: number; body: unknown },
): { fetch: FetchLike; calls: RecordedCall[] } {
  const calls: RecordedCall[] = []
  const fetch: FetchLike = async (url, init) => {
    const call: RecordedCall = { url, method: init.method, body: init.body }
    calls.push(call)
    const { status, body } = responder(call)
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

/** Intenção mínima válida (só os campos que o resolver/store tocam). */
function intent(partial: Partial<BotIntent> & Pick<BotIntent, 'id' | 'name'>): BotIntent {
  return {
    category: 'default', botId: BOT, keywords: [], context: null, priority: 0, conditions: [],
    ...partial,
  }
}

/** Store com uma intenção de início → `mainBotId` resolve para BOT. */
function storeWithStart(): FlowStore {
  const flow: BotFlowJson = {
    list: [intent({ id: `${BOT}-start`, name: 'start', category: 'start' })],
  } as BotFlowJson
  return FlowStore.fromObject(flow)
}

/** Store vazia → `mainBotId` = '' (fluxo sem início). */
function emptyStore(): FlowStore {
  return FlowStore.fromObject({ list: [] } as BotFlowJson)
}

// Corpo de /v2/bots?status=active (passo 1 do fetch de times + find_bot/list_bots).
const botsBody = {
  list: [
    { botId: BOT, name: 'Bot de Testes', retailerId: RETAILER },
    { botId: 'outro-bot-id', name: 'Cadastro de Clientes', retailerId: RETAILER },
  ],
}

/** Responder que serve bots e times conforme a URL. */
function teamsResponder(teams: Array<{ objectId: string; name: string }>) {
  return (call: RecordedCall) => {
    if (call.url.includes('/v2/bots')) return { status: 200, body: botsBody }
    if (call.url.includes('/classes/Team')) return { status: 200, body: { results: teams } }
    return { status: 404, body: {} }
  }
}

describe('find_team — resolve nome de time → objectId', () => {
  it('match exato único devolve o id', async () => {
    const { fetch } = recordingFetch(teamsResponder([
      { objectId: 'S1Cl3fbnFG', name: 'Financeiro' },
      { objectId: 'UrAnEmtASL', name: 'Andrews Teste 1' },
    ]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.findTeam('financeiro')).toBe('time "Financeiro" → id S1Cl3fbnFG')
  })

  it('sem exato, devolve candidatos que CONTÊM a busca (sem auto-escolher)', async () => {
    const { fetch } = recordingFetch(teamsResponder([
      { objectId: 'A1', name: 'Suporte N1' },
      { objectId: 'A2', name: 'Suporte N2' },
    ]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    const out = await r.findTeam('suporte')
    expect(out).toContain('candidatos que contêm')
    expect(out).toContain('Suporte N1 (A1)')
    expect(out).toContain('Suporte N2 (A2)')
    expect(out).toContain('confirme qual com o humano')
  })

  it('nome ambíguo (>1 exato) manda PARAR e confirmar', async () => {
    const { fetch } = recordingFetch(teamsResponder([
      { objectId: 'A1', name: 'Vendas' },
      { objectId: 'A2', name: 'vendas' }, // mesmo nome normalizado
    ]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    const out = await r.findTeam('vendas')
    expect(out).toContain('nome ambíguo')
    expect(out).toContain('PARE')
    expect(out).toContain('A1')
    expect(out).toContain('A2')
  })

  it('nenhum correspondente devolve mensagem com a contagem (singular)', async () => {
    const { fetch } = recordingFetch(teamsResponder([{ objectId: 'A1', name: 'Financeiro' }]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.findTeam('marketing')).toBe('nenhum time corresponde a "marketing" (1 time disponível)')
  })

  it('plural correto na contagem (>1 time)', async () => {
    const { fetch } = recordingFetch(teamsResponder([
      { objectId: 'A1', name: 'Financeiro' }, { objectId: 'A2', name: 'Vendas' },
    ]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.findTeam('marketing')).toBe('nenhum time corresponde a "marketing" (2 times disponíveis)')
  })

  it('token ausente → mensagem de configuração, sem nem chamar a API', async () => {
    const { fetch, calls } = recordingFetch(teamsResponder([]))
    const r = new Resolvers(storeWithStart(), { fetch, token: '' })
    expect(await r.findTeam('x')).toMatch(/configure OMNI_TOKEN/)
    expect(calls.length).toBe(0)
  })

  it('fluxo sem início → mensagem clara de botId ausente, sem chamar a API', async () => {
    const { fetch, calls } = recordingFetch(teamsResponder([]))
    const r = new Resolvers(emptyStore(), { fetch, token: TOKEN })
    expect(await r.findTeam('x')).toMatch(/sem botId/)
    expect(calls.length).toBe(0)
  })

  it('401/403 → mensagem AUTH e NÃO faz retry', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 403, body: { error: 'denied' } }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    const out = await r.findTeam('x')
    expect(out).toMatch(/autenticação falhou/)
    expect(out).toMatch(/renove o OMNI_TOKEN/)
    expect(calls.length).toBe(1) // falhou no GET /v2/bots; nenhuma tentativa extra
  })

  it('400 com "token" no body (endpoint Parse de times) → mensagem AUTH, não mensagem crua', async () => {
    // O endpoint /classes/Team retorna 400 (não 401) quando o token expirou.
    const { fetch } = recordingFetch(call => {
      if (call.url.includes('/v2/bots')) return { status: 200, body: botsBody }
      // Parse retorna 400 com body de erro em texto plano
      return { status: 400, body: 'A sessão de times está com token inválido (o token inserido é válido, verifique se está sendo usado corretamente)' }
    })
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    const out = await r.findTeam('x')
    expect(out).toMatch(/autenticação falhou/)
    expect(out).toMatch(/renove o OMNI_TOKEN/)
    // NÃO deve vazar o body cru do servidor
    expect(out).not.toContain('sessão de times')
  })

  it('cacheia por sessão: 2 chamadas = 1 ida à API (2 fetches só na 1ª)', async () => {
    const { fetch, calls } = recordingFetch(teamsResponder([{ objectId: 'A1', name: 'Financeiro' }]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    await r.findTeam('financeiro')
    expect(calls.length).toBe(2) // GET /v2/bots + GET /classes/Team
    await r.findTeam('financeiro')
    expect(calls.length).toBe(2) // 2ª chamada não bate mais na API
  })
})

describe('list_teams — mapa compacto dos times', () => {
  it('lista nome | id, uma linha por time', async () => {
    const { fetch } = recordingFetch(teamsResponder([
      { objectId: 'A1', name: 'Financeiro' },
      { objectId: 'A2', name: 'Andrews Teste 1' },
    ]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    const out = await r.listTeams()
    // ordenado por nome (pt-BR): "Andrews Teste 1" antes de "Financeiro"
    expect(out).toBe('Andrews Teste 1 | A2\nFinanceiro | A1')
  })

  it('loja sem times → mensagem clara', async () => {
    const { fetch } = recordingFetch(teamsResponder([]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listTeams()).toBe('nenhum time na loja')
  })
})

describe('find_user — busca server-side + cache por query (decisão 6)', () => {
  function usersResponder(users: Array<{ objectId: string; name?: string; lastName?: string }>) {
    return () => ({ status: 200, body: { result: users } })
  }

  it('manda o nome no body como `search` (filtro no servidor) e resolve o id', async () => {
    const { fetch, calls } = recordingFetch(usersResponder([
      { objectId: 'H8eCHFdDdc', name: 'João', lastName: 'Silva' },
    ]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.findUser('joão silva')).toBe('usuário "João Silva" → id H8eCHFdDdc')
    expect(JSON.parse(calls[0].body!).search).toBe('joão silva')
  })

  it('cacheia por query normalizada: mesma busca = 1 fetch', async () => {
    const { fetch, calls } = recordingFetch(usersResponder([{ objectId: 'A1', name: 'Maria' }]))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    await r.findUser('Maria')
    await r.findUser('maria') // normaliza para a mesma chave
    expect(calls.length).toBe(1)
  })

  it('não usa botId (funciona mesmo em fluxo sem início)', async () => {
    const { fetch } = recordingFetch(usersResponder([{ objectId: 'A1', name: 'Maria' }]))
    const r = new Resolvers(emptyStore(), { fetch, token: TOKEN })
    expect(await r.findUser('Maria')).toBe('usuário "Maria" → id A1')
  })
})

describe('find_bot / list_bots — bots ativos da conta', () => {
  it('find_bot resolve nome → botId', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: botsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.findBot('cadastro de clientes')).toBe('bot "Cadastro de Clientes" → id outro-bot-id')
  })

  it('list_bots lista nome | botId ordenado', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: botsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listBots()).toBe('Bot de Testes | ' + BOT + '\nCadastro de Clientes | outro-bot-id')
  })
})

describe('list_api_integrations / list_entities', () => {
  it('list_api_integrations lista nome | id | tipo (ou aviso de vazio)', async () => {
    const { fetch } = recordingFetch(call =>
      call.url.includes('/endpoints')
        ? { status: 200, body: { list: [{ id: 'ep1', name: 'CEP API', type: 'custom' }] } }
        : { status: 404, body: {} })
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listApiIntegrations()).toBe('CEP API | ep1 | custom')
  })

  it('list_entities lista nome | id | tipo', async () => {
    const { fetch } = recordingFetch(call =>
      call.url.includes('/entities')
        ? { status: 200, body: { list: [{ id: 'en1', name: 'Lojas SP', type: 'store' }] } }
        : { status: 404, body: {} })
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listEntities()).toBe('Lojas SP | en1 | store')
  })
})

describe('list_intents — intenções de outro bot (cross-bot, decisão 7)', () => {
  const intentsBody = {
    list: [
      { id: 'i1', name: 'Boas-vindas' },
      { id: 'i2', name: 'Encerrar' },
    ],
  }

  it('sem nome, lista nome | id ordenado', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: intentsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listIntents('outro-bot-id')).toBe('Boas-vindas | i1\nEncerrar | i2')
  })

  it('com nome, resolve via match exato', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: intentsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listIntents('outro-bot-id', 'encerrar')).toBe('intenção "Encerrar" → id i2')
  })

  it('sem match usa concordância feminina (nenhuma intenção / intenções)', async () => {
    const { fetch } = recordingFetch(() => ({ status: 200, body: intentsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listIntents('outro-bot-id', 'inexistente'))
      .toBe('nenhuma intenção corresponde a "inexistente" (2 intenções disponíveis)')
  })

  it('sem botId informado, pede o botId', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: intentsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    expect(await r.listIntents('')).toMatch(/informe o botId/)
    expect(calls.length).toBe(0)
  })

  it('cacheia por botId', async () => {
    const { fetch, calls } = recordingFetch(() => ({ status: 200, body: intentsBody }))
    const r = new Resolvers(storeWithStart(), { fetch, token: TOKEN })
    await r.listIntents('outro-bot-id')
    await r.listIntents('outro-bot-id', 'encerrar')
    expect(calls.length).toBe(1)
  })
})
