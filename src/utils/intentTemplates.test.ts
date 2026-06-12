import { describe, it, expect } from 'vitest'
import { createIntentTemplate, CREATABLE_KINDS, isCreatableKind } from './intentTemplates'
import { applyConnect, applyEdgeDelete, serializeFlow, parseEdgeId } from './editFlow'
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

  it('isCreatableKind rejeita tipos não criáveis', () => {
    expect(isCreatableKind('startNode')).toBe(false)
    expect(isCreatableKind('externalBotNode')).toBe(false)
    expect(isCreatableKind('')).toBe(false)
    expect(isCreatableKind('defaultNode')).toBe(true)
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
