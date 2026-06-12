import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import { applyConnect, applyEdgeDelete, applyNodeDelete } from './editFlow'
import { addButton, removeButton, addButtonsMessage, updateCondition, addCondition, removeCondition } from './editIntent'
import { createIntentTemplate } from './intentTemplates'
import { parseFlow } from './parseFlow'
import type { BotFlowJson, BotIntent } from '../types'

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../samples')
const BOT_ID = '8df3c1e7-a8c9-4bad-ac5a-2855462da840'

function loadSample(): BotFlowJson {
  return JSON.parse(readFileSync(join(samplesDir, 'sample01.json'), 'utf-8'))
}

function choiceFlow(): { json: BotFlowJson; choice: BotIntent; target: BotIntent } {
  const choice = createIntentTemplate('choiceNode', BOT_ID, 'menu')
  const target = createIntentTemplate('defaultNode', BOT_ID, 'destino')
  return { json: { list: [choice, target] }, choice, target }
}

describe('fluxo completo de escolhas: mensagem → botão → conectar → deletar', () => {
  it('cria mensagem de botões, adiciona botão e conecta preenchendo o slot', () => {
    const { json, choice, target } = choiceFlow()

    expect(addButtonsMessage(choice, 'Escolha uma opção:')).toEqual({ ok: true })
    expect(addButton(choice, 'Opção A', null)).toEqual({ ok: true })

    const cond = choice.conditions[0]
    expect(cond.action.choices).toEqual([''])

    const result = applyConnect(json, choice.id, target.id)
    expect(result).toEqual({ ok: true, kind: 'choice', condIdx: 0 })
    expect(cond.action.choices).toEqual([target.id])

    // A aresta renderiza com o label do botão
    const { edges } = parseFlow(json)
    expect(edges).toHaveLength(1)
    expect(edges[0].label).toBe('Opção A')
    expect(edges[0].id).toBe(`${choice.id}-c0-ch0`)
  })

  it('deletar aresta de escolha esvazia o slot mantendo o botão', () => {
    const { json, choice, target } = choiceFlow()
    addButtonsMessage(choice, 'menu')
    addButton(choice, 'Opção A', null)
    applyConnect(json, choice.id, target.id)

    expect(applyEdgeDelete(json, `${choice.id}-c0-ch0`)).toEqual({ ok: true })
    expect(choice.conditions[0].action.choices).toEqual([''])
    // botão preservado
    const buttons = choice.conditions[0].assistant_says[0].messages[0].messageConfig!.buttons
    expect(buttons).toHaveLength(1)
    expect(parseFlow(json).edges).toHaveLength(0)
  })

  it('removeButton remove botão e escolha na mesma posição', () => {
    const { json, choice, target } = choiceFlow()
    addButtonsMessage(choice, 'menu')
    addButton(choice, 'A', null)
    addButton(choice, 'B', null)
    applyConnect(json, choice.id, target.id) // preenche slot 0 (A)

    expect(removeButton(choice, 0)).toEqual({ ok: true })
    const buttons = choice.conditions[0].assistant_says[0].messages[0].messageConfig!.buttons
    expect(buttons.map(b => b.text)).toEqual(['B'])
    expect(choice.conditions[0].action.choices).toEqual([''])
  })

  it('addButton exige mensagem de botões; addButtonsMessage não duplica', () => {
    const { choice } = choiceFlow()
    expect(addButton(choice, 'X', null).ok).toBe(false)
    expect(addButtonsMessage(choice, 'menu')).toEqual({ ok: true })
    expect(addButtonsMessage(choice, 'outra').ok).toBe(false)
  })
})

describe('edição de condições', () => {
  it('atualiza, adiciona e remove condições', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(updateCondition(intent, 0, { name: 'tem cpf', type: 'exists', variable: 'customer.cpf', value: '' }))
      .toEqual({ ok: true })
    expect(intent.conditions[0]).toMatchObject({ name: 'tem cpf', type: 'exists', variable: 'customer.cpf', value: null })

    expect(addCondition(intent)).toEqual({ ok: true })
    expect(intent.conditions).toHaveLength(2)
    expect(intent.conditions[1].action.type).toBe('none')

    expect(removeCondition(intent, 0)).toEqual({ ok: true })
    expect(intent.conditions).toHaveLength(1)
  })

  it('não remove a última condição nem aceita nome vazio', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(removeCondition(intent, 0).ok).toBe(false)
    expect(updateCondition(intent, 0, { name: ' ', type: 'any', variable: '', value: '' }).ok).toBe(false)
  })
})

describe('applyNodeDelete', () => {
  it('remove a intenção e limpa next refs de entrada', () => {
    const json = loadSample()
    const { edges } = parseFlow(json)
    const targetEdge = edges.find(e => e.id.endsWith('-next'))!
    const victim = targetEdge.target

    const before = parseFlow(json).edges.filter(e => e.target === victim).length
    expect(before).toBeGreaterThan(0)

    expect(applyNodeDelete(json, victim)).toEqual({ ok: true })
    expect(json.list.some(i => i.id === victim)).toBe(false)

    // nenhuma referência interna restante para o excluído
    const dump = JSON.stringify(json)
    expect(dump.includes(`"id":"${victim}"`)).toBe(false)
    expect(parseFlow(json).edges.some(e => e.target === victim || e.source === victim)).toBe(false)
  })

  it('remove botão+escolha quando o nó deletado era destino de uma choice', () => {
    const { json, choice, target } = choiceFlow()
    addButtonsMessage(choice, 'menu')
    addButton(choice, 'A', null)
    applyConnect(json, choice.id, target.id)

    expect(applyNodeDelete(json, target.id)).toEqual({ ok: true })
    expect(choice.conditions[0].action.choices).toEqual([])
    expect(choice.conditions[0].assistant_says[0].messages[0].messageConfig!.buttons).toHaveLength(0)
  })

  it('reaponta error.next para o start quando apontava para o excluído', () => {
    const json = loadSample()
    const transfer = createIntentTemplate('transferNode', BOT_ID, 'transf')
    const victim = createIntentTemplate('defaultNode', BOT_ID, 'vitima')
    transfer.conditions[0].action.error!.next.intent = victim.id
    json.list.push(transfer, victim)

    expect(applyNodeDelete(json, victim.id)).toEqual({ ok: true })
    expect(transfer.conditions[0].action.error!.next.intent).toBe(`${BOT_ID}-start`)
  })

  it('bloqueia excluir o start e nós inexistentes', () => {
    const json = loadSample()
    const start = json.list.find(i => i.category === 'start')!
    expect(applyNodeDelete(json, start.id).ok).toBe(false)
    expect(applyNodeDelete(json, 'ext-qualquer').ok).toBe(false)
  })
})
