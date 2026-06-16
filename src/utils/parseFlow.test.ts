import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { parseFlow, intentToNodeData } from './parseFlow'
import { actionToNodeKind } from './nodeMeta'
import type { BotFlowJson, BotIntent, Condition, Action, BotMessage } from '../types'

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../samples')
const BOT = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'

// IDs reais em samples/sample01-v2.json
const CONFIRMAR_NOME = '0138d0b0-74c8-432d-b33a-5553456c2195' // 2 condições: [choice, captureData]
const CONFIRMAR_CAD  = '28616bc1-1df5-48b9-b88e-1c800f1c5953' // 1 condição: choice
const NOME_CORRETO   = 'a732362a-79fd-47a4-883d-d2fef912e435'

function loadSample(name: string): BotFlowJson {
  return JSON.parse(readFileSync(join(samplesDir, name), 'utf-8'))
}

// ─── Builders mínimos para casos sintéticos determinísticos ──────────────────

function makeAction(type: string, extra: Partial<Action> = {}): Action {
  return {
    type, choices: null, captureDataType: null, transferType: null, value: null,
    variable: null, conversationType: null, storeType: null, entity: null,
    external: { type: null, apiName: null }, ...extra,
  }
}

function makeCond(opts: {
  name?: string; type?: string; action?: Action; messages?: BotMessage[]; next?: Condition['next']
} = {}): Condition {
  return {
    name: opts.name ?? 'Condição Padrão',
    type: opts.type ?? 'any',
    variable: null, intent: null, value: 'any', valueNumber: null,
    fallbackIntents: [], values: null, context: null,
    action: opts.action ?? makeAction('none'),
    assistant_says: [{ channel: 'any', messages: opts.messages ?? [] }],
    next: opts.next ?? { type: 'context' },
  }
}

function makeIntent(id: string, conditions: Condition[], extra: Partial<BotIntent> = {}): BotIntent {
  return {
    id, name: id, category: 'cat', botId: BOT, keywords: [], context: null,
    priority: 0, conditions, ...extra,
  }
}

// ─── Mapeamento ActionType → NodeKind ────────────────────────────────────────

describe('actionToNodeKind — os 11 ActionTypes', () => {
  it.each([
    ['none', 'defaultNode'],
    ['choice', 'choiceNode'],
    ['captureData', 'captureNode'],
    ['setData', 'setDataNode'],
    ['transfer', 'transferNode'],
    ['waitForInteraction', 'waitNode'],
    ['endConversation', 'endNode'],
    ['external', 'apiCallNode'],
    ['order', 'orderNode'],
    ['captureCsat', 'csatNode'],
    ['store', 'storeNode'],
  ])('%s → %s', (type, kind) => {
    expect(actionToNodeKind(makeAction(type))).toBe(kind)
  })

  it('action ausente/desconhecida cai em defaultNode', () => {
    expect(actionToNodeKind(null)).toBe('defaultNode')
    expect(actionToNodeKind(undefined)).toBe('defaultNode')
    expect(actionToNodeKind(makeAction('inventado'))).toBe('defaultNode')
  })

  it('external (API) é apiCallNode, NÃO externalBotNode', () => {
    expect(actionToNodeKind(makeAction('external'))).toBe('apiCallNode')
  })
})

describe('os 5 novos tipos de nó isolados renderizam como nó solto tipado', () => {
  it.each([
    ['endConversation', 'endNode'],
    ['external', 'apiCallNode'],
    ['order', 'orderNode'],
    ['captureCsat', 'csatNode'],
    ['store', 'storeNode'],
  ])('%s → %s', (type, kind) => {
    const intent = makeIntent(type, [makeCond({ action: makeAction(type) })])
    const { nodes } = parseFlow({ list: [intent] })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe(kind)
    expect(nodes[0].parentId).toBeUndefined()
  })
})

// ─── Agrupamento por intenção (Modelo B) ─────────────────────────────────────

describe('agrupamento: 2+ condições viram grupo + filhos tipados', () => {
  it('Confirmar_nome (choice + captureData) → 1 grupo + 2 filhos', () => {
    const json = loadSample('sample01-v2.json')
    const { nodes } = parseFlow(json)

    const group = nodes.find(n => n.id === CONFIRMAR_NOME)
    expect(group?.type).toBe('intentGroupNode')
    expect(group?.style).toMatchObject({ width: expect.any(Number), height: expect.any(Number) })

    const children = nodes.filter(n => n.parentId === CONFIRMAR_NOME)
    expect(children).toHaveLength(2)
    expect(children.map(c => c.id)).toEqual([`${CONFIRMAR_NOME}::c0`, `${CONFIRMAR_NOME}::c1`])
    expect(children.map(c => c.type)).toEqual(['choiceNode', 'captureNode'])
    // todos os filhos usam parentId + extent 'parent'
    children.forEach(c => expect(c.extent).toBe('parent'))
  })

  it('o nó-pai aparece ANTES dos filhos no array (exigência do React Flow)', () => {
    const json = loadSample('sample01-v2.json')
    const { nodes } = parseFlow(json)
    const groupIdx = nodes.findIndex(n => n.id === CONFIRMAR_NOME)
    const children = nodes.filter(n => n.parentId === CONFIRMAR_NOME)
    children.forEach(c => expect(nodes.indexOf(c)).toBeGreaterThan(groupIdx))
  })

  it('cabeçalho do grupo carrega prioridade, keywords, contexto e contagem', () => {
    const grouped = makeIntent('g', [
      makeCond({ action: makeAction('none') }),
      makeCond({ action: makeAction('none') }),
    ], { priority: 0.75, keywords: ['oi', 'menu'], context: 'alguma-intencao' })
    const { nodes } = parseFlow({ list: [grouped] })
    const g = nodes.find(n => n.id === 'g')!
    expect(g.type).toBe('intentGroupNode')
    expect(g.data.priority).toBe(0.75)
    expect(g.data.keywords).toEqual(['oi', 'menu'])
    expect(g.data.hasContext).toBe(true)
    expect(g.data.conditionCount).toBe(2)
  })

  it('filhos carregam dados POR CONDIÇÃO (rótulo do gatilho como título)', () => {
    const json = loadSample('sample01-v2.json')
    const { nodes } = parseFlow(json)
    const children = nodes.filter(n => n.parentId === CONFIRMAR_NOME)
    // c0 = exists → "Valor existe"; c1 = else → "Senão"
    expect(children[0].data.triggerLabel).toBe('Valor existe')
    expect(children[0].data.name).toBe('Valor existe')
    expect(children[1].data.triggerLabel).toBe('Senão')
  })
})

describe('intenção com 1 condição vira nó solto (sem container)', () => {
  it('confirmar_cadastro (1 choice) → nó solto choiceNode, sem grupo', () => {
    const json = loadSample('sample01-v2.json')
    const { nodes } = parseFlow(json)
    const solo = nodes.find(n => n.id === CONFIRMAR_CAD)
    expect(solo?.type).toBe('choiceNode')
    expect(solo?.parentId).toBeUndefined()
    // nenhum filho aponta para essa intenção como pai
    expect(nodes.some(n => n.parentId === CONFIRMAR_CAD)).toBe(false)
  })

  it('start (1 condição) é sempre startNode, nunca agrupa', () => {
    const json = loadSample('sample01-v2.json')
    const { nodes } = parseFlow(json)
    const start = nodes.find(n => n.id === `${BOT}-start`)
    expect(start?.type).toBe('startNode')
    expect(start?.parentId).toBeUndefined()
  })
})

// ─── Arestas saem do nó-condição (filho) e chegam na entrada da intenção ──────

describe('arestas no Modelo B', () => {
  it('saem do handle do filho ({id}::c{idx}) e mantêm o ID posicional', () => {
    const json = loadSample('sample01-v2.json')
    const { edges } = parseFlow(json)

    const choiceEdges = edges.filter(e => e.source === `${CONFIRMAR_NOME}::c0`)
    expect(choiceEdges).toHaveLength(2) // duas escolhas
    expect(edges.some(e => e.id === `${CONFIRMAR_NOME}-c0-ch0`)).toBe(true)

    const nextEdge = edges.find(e => e.source === `${CONFIRMAR_NOME}::c1`)
    expect(nextEdge).toBeDefined()
    expect(nextEdge!.target).toBe(NOME_CORRETO) // entrada da intenção = ID cru
    expect(nextEdge!.id).toBe(`${CONFIRMAR_NOME}-c1-next`)
  })

  it('a origem de um nó solto é o próprio ID cru (sem ::c)', () => {
    const target = makeIntent('alvo', [makeCond({})])
    const src = makeIntent('origem', [makeCond({
      action: makeAction('none'),
      next: { action: 'intent', type: 'context', intent: { botId: BOT, id: 'alvo' } },
    })])
    const { edges } = parseFlow({ list: [src, target] })
    expect(edges).toHaveLength(1)
    expect(edges[0].source).toBe('origem')
    expect(edges[0].target).toBe('alvo')
  })

  it('arestas de fluxo internas são do tipo "deletable" (botão remover); externas não', () => {
    const target = makeIntent('alvo', [makeCond({})])
    const internal = makeIntent('origem', [makeCond({
      next: { action: 'intent', type: 'context', intent: { botId: BOT, id: 'alvo' } },
    })])
    // next para outro bot → nó externo sintético, aresta não removível
    const external = makeIntent('externa', [makeCond({
      next: { action: 'bot', type: 'context', intent: { botId: 'outro-bot', id: 'qq' } },
    })])
    const { edges } = parseFlow({ list: [internal, target, external] })
    expect(edges.find(e => e.id === 'origem-c0-next')?.type).toBe('deletable')
    expect(edges.find(e => e.id === 'externa-c0-ext')?.type).toBe('smoothstep')
  })

  it('aresta de contexto NÃO é deletable (segue smoothstep, sem botão)', () => {
    const ctx = makeIntent('menu', [makeCond({})])
    const sub = makeIntent('sub', [makeCond({})], { context: 'menu' })
    const ctxEdge = parseFlow({ list: [ctx, sub] }).edges.find(e => e.id === 'ctx-sub')
    expect(ctxEdge?.type).toBe('smoothstep')
  })
})

// ─── Aresta de Contexto (Modelo B, Marco B) ──────────────────────────────────

describe('aresta de contexto', () => {
  it('intenção com context válido desenha aresta tracejada (contexto → esta intenção)', () => {
    const ctx = makeIntent('menu', [makeCond({})])
    const sub = makeIntent('sub', [makeCond({})], { context: 'menu' })
    const { edges } = parseFlow({ list: [ctx, sub] })

    const ctxEdge = edges.find(e => e.id === 'ctx-sub')
    expect(ctxEdge).toBeDefined()
    expect(ctxEdge!.source).toBe('menu')   // intenção-de-contexto = origem
    expect(ctxEdge!.target).toBe('sub')    // esta intenção = destino
    expect(ctxEdge!.label).toBe('contexto')
    expect((ctxEdge!.data as { kind?: string }).kind).toBe('context')
    expect(ctxEdge!.deletable).toBe(false)
    expect(ctxEdge!.reconnectable).toBe(false)
    expect(ctxEdge!.style?.strokeDasharray).toBeDefined() // tracejada
  })

  it('a origem pode ser uma intenção AGRUPADA (usa o ID cru do container)', () => {
    const grupo = makeIntent('g', [makeCond({}), makeCond({})]) // 2 condições → grupo
    const sub = makeIntent('sub', [makeCond({})], { context: 'g' })
    const { nodes, edges } = parseFlow({ list: [grupo, sub] })

    expect(nodes.find(n => n.id === 'g')?.type).toBe('intentGroupNode')
    expect(edges.find(e => e.id === 'ctx-sub')?.source).toBe('g')
  })

  it('auto-referência (context === próprio id) não desenha aresta', () => {
    const intent = makeIntent('x', [makeCond({})], { context: 'x' })
    const { edges } = parseFlow({ list: [intent] })
    expect(edges.some(e => e.id === 'ctx-x')).toBe(false)
  })

  it('intenção start com context não desenha aresta (start não tem entrada)', () => {
    const start = makeIntent(`${BOT}-start`, [makeCond({})], { category: 'start', context: 'menu' })
    const menu = makeIntent('menu', [makeCond({})])
    const { edges } = parseFlow({ list: [start, menu] })
    expect(edges.some(e => e.id?.startsWith('ctx-'))).toBe(false)
  })

  it('arestas de contexto NÃO entram no layout (não viram aresta de fluxo)', () => {
    // Duas intenções sem fluxo entre si, só ligadas por contexto: cada uma fica
    // no seu componente — o context não as funde no dagre.
    const a = makeIntent('a', [makeCond({})])
    const b = makeIntent('b', [makeCond({})], { context: 'a' })
    const { edges } = parseFlow({ list: [a, b] })
    // só a aresta de contexto existe; nenhuma aresta de fluxo foi inventada
    expect(edges).toHaveLength(1)
    expect(edges[0].id).toBe('ctx-b')
  })

  it('sample real: uma aresta de contexto por intenção com context apontando p/ intenção existente', () => {
    const json = loadSample('sample02.json')
    const ids = new Set(json.list.map(i => i.id))
    const expected = json.list.filter(
      i => typeof i.context === 'string' && i.context && ids.has(i.context)
           && i.context !== i.id && i.category !== 'start',
    ).length
    const { edges } = parseFlow(json)
    const ctxEdges = edges.filter(e => (e.data as { kind?: string } | undefined)?.kind === 'context')
    expect(ctxEdges).toHaveLength(expected)
    expect(expected).toBeGreaterThan(0) // sample02 tem contextos reais
  })
})

// ─── Caminhos infelizes ──────────────────────────────────────────────────────

describe('caminhos infelizes', () => {
  it('intenção sem condições: 1 nó defaultNode, sem arestas, sem crash', () => {
    const { nodes, edges } = parseFlow({ list: [makeIntent('vazia', [])] })
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe('defaultNode')
    expect(edges).toHaveLength(0)
  })

  it('intenção com 0 mensagens: preview e allMessages vazios', () => {
    const { nodes } = parseFlow({ list: [makeIntent('semmsg', [makeCond({ action: makeAction('none') })])] })
    expect(nodes[0].data.messagePreview).toBe('')
    expect(nodes[0].data.allMessages).toEqual([])
  })

  it('choice com slot de escolha vazio: o slot vazio não vira aresta', () => {
    const target = makeIntent('tgt', [makeCond({})])
    const choice = makeIntent('ch', [makeCond({
      action: makeAction('choice', { choices: ['', 'tgt', ''] }),
    })])
    const { edges } = parseFlow({ list: [choice, target] })
    const chEdges = edges.filter(e => e.source === 'ch')
    expect(chEdges).toHaveLength(1)
    expect(chEdges[0].target).toBe('tgt')
  })

  it('next ausente (waitForInteraction / endConversation) não gera aresta', () => {
    const wait = makeIntent('w', [makeCond({
      action: makeAction('waitForInteraction'),
      next: { redirect: 'waitInteraction', type: 'context' },
    })])
    const end = makeIntent('e', [makeCond({ action: makeAction('endConversation') })])
    const { nodes, edges } = parseFlow({ list: [wait, end] })
    expect(nodes.find(n => n.id === 'w')?.type).toBe('waitNode')
    expect(nodes.find(n => n.id === 'e')?.type).toBe('endNode')
    expect(edges).toHaveLength(0)
  })

  it('context apontando para intenção inexistente não desenha aresta órfã', () => {
    const intent = makeIntent('c', [makeCond({})], { context: 'nao-existe' })
    const { nodes, edges } = parseFlow({ list: [intent] })
    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0) // destino do contexto não existe → sem aresta
  })

  it('choice apontando para destino fora do fluxo é ignorado', () => {
    const choice = makeIntent('ch', [makeCond({
      action: makeAction('choice', { choices: ['fantasma'] }),
    })])
    const { edges } = parseFlow({ list: [choice] })
    expect(edges).toHaveLength(0)
  })

  it('fluxo vazio não quebra', () => {
    expect(parseFlow({ list: [] })).toEqual({ nodes: [], edges: [] })
  })
})

// ─── intentToNodeData (nó solto, usado pelo App após criar/editar) ────────────

describe('intentToNodeData delega ao view-model da condição 0 (solo)', () => {
  it('reflete nome da intenção e campos da ação', () => {
    const intent = makeIntent('s', [makeCond({
      action: makeAction('transfer', { transferType: 'direct4group', value: 'GRP' }),
    })])
    const data = intentToNodeData(intent)
    expect(data.name).toBe('s')
    expect(data.actionType).toBe('transfer')
    expect(data.transferType).toBe('direct4group')
    expect(data.transferValue).toBe('GRP')
  })

  it('intenção sem condições não quebra', () => {
    const data = intentToNodeData(makeIntent('vazia', []))
    expect(data.actionType).toBe('none')
    expect(data.allMessages).toEqual([])
  })
})
