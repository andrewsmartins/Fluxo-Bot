import { describe, it, expect } from 'vitest'
import { createIntentTemplate, createStartIntent, createConditionForKind, CREATABLE_KINDS, isCreatableKind } from './intentTemplates'
import { validateFlow } from './validateFlow'
import { applyConnect, applyEdgeDelete, serializeFlow, parseEdgeId } from './editFlow'
import { addButton, addButtonsMessage } from './editIntent'
import { parseFlow, buildNextEdge } from './parseFlow'
import type { BotFlowJson } from '../types'

const BOT_ID = '8df3c1e7-a8c9-4bad-ac5a-2855462da840'

/** Campos do action no payload canônico capturado do POST da plataforma. */
const CANONICAL_ACTION_KEYS = [
  'type', 'bulkUpdate', 'variable', 'value', 'choices', 'entity', 'transferType',
  'captureDataType', 'captureDataTypesCategory', 'multipleFields', 'conversationType',
  'storeType', 'orderType', 'lastMessageTextParams', 'external',
]

describe('createIntentTemplate', () => {
  it.each(CREATABLE_KINDS)('%s: gera intenção válida que renderiza como o próprio tipo', kind => {
    const intent = createIntentTemplate(kind, BOT_ID, `teste_${kind}`)
    expect(intent.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(intent.botId).toBe(BOT_ID)
    expect(intent.advanced).toEqual({ active: false, endpointId: null })
    expect(intent.conditions).toHaveLength(1)

    // O parseFlow deve classificar o nó com o mesmo tipo pedido na paleta
    const { nodes } = parseFlow({ list: [intent] })
    expect(nodes[0].type).toBe(kind)
  })

  it.each(CREATABLE_KINDS)('%s: action tem todos os campos canônicos do POST', kind => {
    const action = createIntentTemplate(kind, BOT_ID, 'x').conditions[0].action
    for (const key of CANONICAL_ACTION_KEYS) {
      expect(action, `campo ${key}`).toHaveProperty(key)
    }
  })

  it('transfer e captureData incluem caminho de erro apontando para o start', () => {
    for (const kind of ['transferNode', 'captureNode'] as const) {
      const action = createIntentTemplate(kind, BOT_ID, 'x').conditions[0].action
      expect(action.error?.next).toEqual({
        redirect: 'waitInteraction',
        type: 'error',
        intent: `${BOT_ID}-start`,
        intentBot: BOT_ID,
        action: 'intent',
      })
    }
  })

  it('IDs são únicos entre chamadas', () => {
    const a = createIntentTemplate('defaultNode', BOT_ID, 'a')
    const b = createIntentTemplate('defaultNode', BOT_ID, 'b')
    expect(a.id).not.toBe(b.id)
  })

  it('createStartIntent: ID especial, categoria start e renderiza como startNode', () => {
    const start = createStartIntent(BOT_ID)
    expect(start.id).toBe(`${BOT_ID}-start`)
    expect(start.category).toBe('start')
    expect(start.conditions[0].name).toBe('Start')

    const json = { list: [start] }
    expect(parseFlow(json).nodes[0].type).toBe('startNode')
    const report = validateFlow(json)
    expect(report.errors).toEqual([])
    expect(report.warnings.some(w => w.includes('início'))).toBe(false)
  })

  it('isCreatableKind rejeita tipos não criáveis', () => {
    expect(isCreatableKind('startNode')).toBe(false)
    expect(isCreatableKind('externalBotNode')).toBe(false)
    expect(isCreatableKind('')).toBe(false)
    expect(isCreatableKind('defaultNode')).toBe(true)
  })
})

describe('Marco D — criação dos 11 ActionTypes (Modelo B)', () => {
  it('há exatamente 11 tipos criáveis (os 11 ActionTypes; start e externalBot não)', () => {
    expect(CREATABLE_KINDS).toHaveLength(11)
    expect(isCreatableKind('endNode')).toBe(true)
    expect(isCreatableKind('apiCallNode')).toBe(true)
    expect(isCreatableKind('orderNode')).toBe(true)
    expect(isCreatableKind('csatNode')).toBe(true)
    expect(isCreatableKind('storeNode')).toBe(true)
  })

  it.each(CREATABLE_KINDS)('%s: nasce como nó SOLTO (1 condição, sem grupo)', kind => {
    const intent = createIntentTemplate(kind, BOT_ID, `solo_${kind}`)
    expect(intent.conditions).toHaveLength(1)
    const { nodes } = parseFlow({ list: [intent] })
    // Um único nó-macro, tipado pela ação — nunca um intentGroupNode (sem filhos).
    expect(nodes).toHaveLength(1)
    expect(nodes[0].type).toBe(kind)
    expect(nodes[0].parentId).toBeUndefined()
  })

  it('defaults embasados no spec: order → generateOrder, csat → supportRate', () => {
    expect(createIntentTemplate('orderNode', BOT_ID, 'p').conditions[0].action.orderType).toBe('generateOrder')
    expect(createIntentTemplate('csatNode', BOT_ID, 'c').conditions[0].action.captureDataType).toBe('supportRate')
  })

  it('capture nasce com captureDataType "free" (repouso push-safe; o painel exibe placeholder)', () => {
    const action = createIntentTemplate('captureNode', BOT_ID, 'c').conditions[0].action
    expect(action.captureDataType).toBe('free')
    expect(action.captureDataTypesCategory).toBe('singleField')
    expect(action.multipleFields).toEqual([])
  })

  it('store/external/end nascem sem subtipo presumido (enum desconhecido / terminal)', () => {
    const store = createIntentTemplate('storeNode', BOT_ID, 's').conditions[0].action
    expect(store.storeType).toBeNull()
    const api = createIntentTemplate('apiCallNode', BOT_ID, 'a').conditions[0].action
    expect(api.external).toEqual({ type: [], apiName: [] })
    const end = createIntentTemplate('endNode', BOT_ID, 'e').conditions[0].action
    expect(end.error).toBeUndefined()  // só transfer/capture têm caminho de erro
  })

  it('caminho infeliz: nó terminal (end) não introduz referência quebrada — export liberado', () => {
    const start = createStartIntent(BOT_ID)
    const end = createIntentTemplate('endNode', BOT_ID, 'fim')
    const report = validateFlow({ list: [start, end] })
    expect(report.errors).toEqual([])
  })

  it('caminho infeliz: choice recém-criado (sem botão) recusa conexão com mensagem útil', () => {
    const choice = createIntentTemplate('choiceNode', BOT_ID, 'menu')
    const target = createIntentTemplate('endNode', BOT_ID, 'fim')
    const result = applyConnect({ list: [choice, target] }, choice.id, target.id)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('botão')
  })

  it('caminho feliz: adicionar mensagem + botão ao choice criado e conectar preenche o slot', () => {
    const choice = createIntentTemplate('choiceNode', BOT_ID, 'menu')
    const target = createIntentTemplate('endNode', BOT_ID, 'fim')
    expect(addButtonsMessage(choice, 'Escolha uma opção').ok).toBe(true)  // mensagem BUTTON canônica
    expect(addButton(choice, 'Opção A', null).ok).toBe(true)              // cria o slot vazio
    const json: BotFlowJson = { list: [choice, target] }
    const result = applyConnect(json, choice.id, target.id)
    expect(result).toEqual({ ok: true, kind: 'choice', condIdx: 0 })
    expect(json.list[0].conditions[0].action.choices).toContain(target.id)
  })

  it.each(CREATABLE_KINDS)('createConditionForKind(%s) bate com a condição da intenção criada', kind => {
    const cond = createConditionForKind(kind, BOT_ID)
    const fromIntent = createIntentTemplate(kind, BOT_ID, 'x').conditions[0]
    // Mesma forma de action (defaults por tipo idênticos aos da criação de nó).
    expect(cond.action).toEqual(fromIntent.action)
  })

  it('estrutura grupo+filhos: serializar fluxo agrupado NÃO vaza filhos como intenções', () => {
    // Intenção com 2 condições (choice + capture) → vira grupo com 2 filhos no canvas.
    const grouped = createIntentTemplate('choiceNode', BOT_ID, 'multi')
    grouped.conditions.push(createIntentTemplate('captureNode', BOT_ID, 'multi').conditions[0])
    const start = createStartIntent(BOT_ID)
    const json: BotFlowJson = { list: [start, grouped] }

    // No canvas: grupo (1) + 2 filhos = 3 nós para 1 intenção agrupada.
    const { nodes } = parseFlow(json)
    expect(nodes.filter(n => n.type === 'intentGroupNode')).toHaveLength(1)
    expect(nodes.filter(n => n.parentId === grouped.id)).toHaveLength(2)

    // No JSON: só as 2 intenções do modelo (os filhos `::c{idx}` não existem).
    const reparsed = JSON.parse(serializeFlow(json)) as BotFlowJson
    expect(reparsed.list).toHaveLength(2)
    expect(reparsed.list.some(i => i.id.includes('::c'))).toBe(false)
    expect(reparsed.list.find(i => i.id === grouped.id)?.conditions).toHaveLength(2)
  })
})

describe('applyConnect', () => {
  function freshPair(): { json: BotFlowJson; sourceId: string; targetId: string } {
    const source = createIntentTemplate('defaultNode', BOT_ID, 'origem')
    const target = createIntentTemplate('waitNode', BOT_ID, 'destino')
    return { json: { list: [source, target] }, sourceId: source.id, targetId: target.id }
  }

  it('preenche next.intent na primeira condição livre', () => {
    const { json, sourceId, targetId } = freshPair()
    const result = applyConnect(json, sourceId, targetId)
    expect(result).toEqual({ ok: true, kind: 'next', condIdx: 0 })
    expect(json.list[0].conditions[0].next).toEqual({
      redirect: 'continueFlow',
      action: 'intent',
      type: 'context',
      intent: { botId: BOT_ID, id: targetId },
    })
  })

  it('a aresta construída após conectar é decodificável e renderizável', () => {
    const { json, sourceId, targetId } = freshPair()
    const result = applyConnect(json, sourceId, targetId)
    if (!result.ok) throw new Error('connect falhou')
    const edge = buildNextEdge(json, sourceId, result.condIdx)
    expect(edge).not.toBeNull()
    expect(edge!.target).toBe(targetId)
    expect(parseEdgeId(edge!.id)).toEqual({ kind: 'next', intentId: sourceId, condIdx: 0 })
    expect(parseFlow(json).edges.some(e => e.id === edge!.id)).toBe(true)
  })

  it('rejeita quando todas as condições já têm destino', () => {
    const { json, sourceId, targetId } = freshPair()
    expect(applyConnect(json, sourceId, targetId).ok).toBe(true)
    const again = applyConnect(json, sourceId, targetId)
    expect(again.ok).toBe(false)
    if (!again.ok) expect(again.reason).toContain('vaga livre')
  })

  it('rejeita origem ou destino inexistentes', () => {
    const { json, sourceId } = freshPair()
    expect(applyConnect(json, 'nao-existe', sourceId).ok).toBe(false)
    expect(applyConnect(json, sourceId, 'nao-existe').ok).toBe(false)
    expect(applyConnect({ list: [] }, 'a', 'b').ok).toBe(false)
  })

  it('round-trip: fluxo com nó criado e conectado continua serializável', () => {
    const { json, sourceId, targetId } = freshPair()
    applyConnect(json, sourceId, targetId)
    const reparsed = JSON.parse(serializeFlow(json)) as BotFlowJson
    expect(reparsed.list).toHaveLength(2)
    expect(parseFlow(reparsed).edges).toHaveLength(1)
  })
})

describe('applyEdgeDelete', () => {
  function connectedPair(): { json: BotFlowJson; edgeId: string } {
    const source = createIntentTemplate('defaultNode', BOT_ID, 'origem')
    const target = createIntentTemplate('waitNode', BOT_ID, 'destino')
    const json: BotFlowJson = { list: [source, target] }
    applyConnect(json, source.id, target.id)
    return { json, edgeId: `${source.id}-c0-next` }
  }

  it('remove o destino e restaura a forma canônica sem referência', () => {
    const { json, edgeId } = connectedPair()
    expect(applyEdgeDelete(json, edgeId)).toEqual({ ok: true })
    expect(json.list[0].conditions[0].next).toEqual({ redirect: 'waitInteraction', type: 'context' })
    expect(parseFlow(json).edges).toHaveLength(0)
  })

  it('rejeita arestas de escolha e externas', () => {
    const { json } = connectedPair()
    const id = json.list[0].id
    expect(applyEdgeDelete(json, `${id}-c0-ch0`).ok).toBe(false)
    expect(applyEdgeDelete(json, `${id}-c0-ext`).ok).toBe(false)
  })

  it('rejeita condição sem destino (deletar duas vezes)', () => {
    const { json, edgeId } = connectedPair()
    applyEdgeDelete(json, edgeId)
    expect(applyEdgeDelete(json, edgeId).ok).toBe(false)
  })
})
