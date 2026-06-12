import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { parseEdgeId, applyEdgeReconnect, serializeFlow } from './editFlow'
import { parseFlow } from './parseFlow'
import type { BotFlowJson } from '../types'

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../samples')

function loadSample(name: string): BotFlowJson {
  return JSON.parse(readFileSync(join(samplesDir, name), 'utf-8'))
}

describe('serializeFlow — round-trip com exports reais', () => {
  for (const sample of ['sample01.json', 'sample02.json', 'sample03.json']) {
    it(`importar → exportar ${sample} preserva o JSON integralmente`, () => {
      const original = JSON.parse(readFileSync(join(samplesDir, sample), 'utf-8'))
      const roundTripped = JSON.parse(serializeFlow(original))
      expect(roundTripped).toEqual(original)
    })
  }
})

describe('parseEdgeId', () => {
  it('decodifica aresta next com UUID (contém hífens)', () => {
    expect(parseEdgeId('8df3c1e7-a8c9-4bad-ac5a-2855462da840-c2-next'))
      .toEqual({ kind: 'next', intentId: '8df3c1e7-a8c9-4bad-ac5a-2855462da840', condIdx: 2 })
  })

  it('decodifica aresta de escolha', () => {
    expect(parseEdgeId('abc-c0-ch3'))
      .toEqual({ kind: 'choice', intentId: 'abc', condIdx: 0, choiceIdx: 3 })
  })

  it('decodifica aresta externa com ID especial {botId}-start', () => {
    expect(parseEdgeId('8df3c1e7-a8c9-4bad-ac5a-2855462da840-start-c0-ext'))
      .toEqual({ kind: 'ext', intentId: '8df3c1e7-a8c9-4bad-ac5a-2855462da840-start', condIdx: 0 })
  })

  it('retorna null para IDs fora do padrão', () => {
    expect(parseEdgeId('qualquer-coisa')).toBeNull()
    expect(parseEdgeId('')).toBeNull()
    expect(parseEdgeId('abc-c1-chx')).toBeNull()
  })

  it('todas as arestas geradas pelo parseFlow são decodificáveis', () => {
    const { edges } = parseFlow(loadSample('sample01.json'))
    expect(edges.length).toBeGreaterThan(0)
    for (const edge of edges) {
      expect(parseEdgeId(edge.id), `aresta ${edge.id}`).not.toBeNull()
    }
  })
})

describe('applyEdgeReconnect', () => {
  function findNextEdge(json: BotFlowJson) {
    const { edges } = parseFlow(json)
    const edge = edges.find(e => e.id.endsWith('-next'))!
    expect(edge).toBeDefined()
    return edge
  }

  function findChoiceEdge(json: BotFlowJson) {
    const { edges } = parseFlow(json)
    const edge = edges.find(e => /-ch\d+$/.test(e.id))!
    expect(edge).toBeDefined()
    return edge
  }

  it('reconecta aresta next e altera apenas next.intent', () => {
    const json = loadSample('sample01.json')
    const before = JSON.parse(JSON.stringify(json))
    const edge = findNextEdge(json)
    const newTarget = json.list.find(i => i.id !== edge.target && i.id !== edge.source)!

    const result = applyEdgeReconnect(json, edge.id, edge.target, newTarget.id)
    expect(result).toEqual({ ok: true })

    const ref = parseEdgeId(edge.id)!
    const cond = json.list.find(i => i.id === ref.intentId)!.conditions[ref.condIdx]
    expect(cond.next.intent).toEqual({ botId: newTarget.botId, id: newTarget.id })

    // restaura o campo alterado e garante que nada mais mudou
    const beforeCond = before.list.find((i: { id: string }) => i.id === ref.intentId)!.conditions[ref.condIdx]
    cond.next.intent = beforeCond.next.intent
    expect(json).toEqual(before)
  })

  it('reconecta aresta de escolha substituindo o destino em choices', () => {
    const json = loadSample('sample01.json')
    const edge = findChoiceEdge(json)
    const newTarget = json.list.find(i => i.id !== edge.target && i.id !== edge.source)!

    const result = applyEdgeReconnect(json, edge.id, edge.target, newTarget.id)
    expect(result).toEqual({ ok: true })

    const ref = parseEdgeId(edge.id)!
    const cond = json.list.find(i => i.id === ref.intentId)!.conditions[ref.condIdx]
    const choices = cond.action.choices as string[]
    expect(choices).toContain(newTarget.id)
    expect(choices).not.toContain(edge.target)
  })

  it('substitui todas as ocorrências quando o destino está duplicado em choices', () => {
    const json = loadSample('sample01.json')
    const edge = findChoiceEdge(json)
    const ref = parseEdgeId(edge.id)!
    const cond = json.list.find(i => i.id === ref.intentId)!.conditions[ref.condIdx]
    ;(cond.action.choices as string[]).push(edge.target) // força duplicata
    const newTarget = json.list.find(i => i.id !== edge.target && i.id !== edge.source)!

    expect(applyEdgeReconnect(json, edge.id, edge.target, newTarget.id)).toEqual({ ok: true })
    expect(cond.action.choices as string[]).not.toContain(edge.target)
  })

  it('rejeita reconexão de aresta externa', () => {
    const json = loadSample('sample01.json')
    const anyIntent = json.list[0]
    const result = applyEdgeReconnect(json, `${anyIntent.id}-c0-ext`, 'ext-x', json.list[1].id)
    expect(result.ok).toBe(false)
  })

  it('rejeita destino que não é intenção do fluxo', () => {
    const json = loadSample('sample01.json')
    const edge = findNextEdge(json)
    const result = applyEdgeReconnect(json, edge.id, edge.target, 'id-inexistente')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toContain('destino')
  })

  it('rejeita ID de aresta desconhecido sem alterar o modelo', () => {
    const json = loadSample('sample01.json')
    const before = JSON.parse(JSON.stringify(json))
    expect(applyEdgeReconnect(json, 'id-invalido', 'a', 'b').ok).toBe(false)
    expect(json).toEqual(before)
  })

  it('lista vazia: não quebra com fluxo sem intenções', () => {
    const result = applyEdgeReconnect({ list: [] }, 'x-c0-next', 'a', 'b')
    expect(result.ok).toBe(false)
  })
})
