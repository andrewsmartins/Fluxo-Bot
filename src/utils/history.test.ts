import { describe, it, expect } from 'vitest'
import { FlowHistory, takeSnapshot, type FlowSnapshot } from './history'
import { createIntentTemplate } from './intentTemplates'
import type { BotFlowJson } from '../types'

const BOT_ID = '8df3c1e7-a8c9-4bad-ac5a-2855462da840'

function snap(label: string): FlowSnapshot {
  const intent = createIntentTemplate('defaultNode', BOT_ID, label)
  return takeSnapshot({ list: [intent] }, [], [])
}

function nameOf(s: FlowSnapshot): string {
  return s.model.list[0].name
}

describe('takeSnapshot', () => {
  it('clona o modelo — mutações posteriores não afetam o snapshot', () => {
    const model: BotFlowJson = { list: [createIntentTemplate('defaultNode', BOT_ID, 'original')] }
    const s = takeSnapshot(model, [], [])
    model.list[0].name = 'mutado'
    expect(nameOf(s)).toBe('original')
  })
})

describe('FlowHistory', () => {
  it('undo devolve o estado anterior e redo o repõe', () => {
    const h = new FlowHistory()
    expect(h.canUndo).toBe(false)

    h.push(snap('estado1'))
    expect(h.canUndo).toBe(true)

    const undone = h.undo(snap('estado2'))
    expect(undone && nameOf(undone)).toBe('estado1')
    expect(h.canRedo).toBe(true)

    const redone = h.redo(snap('estado1'))
    expect(redone && nameOf(redone)).toBe('estado2')
    expect(h.canUndo).toBe(true)
    expect(h.canRedo).toBe(false)
  })

  it('uma mutação nova invalida o redo', () => {
    const h = new FlowHistory()
    h.push(snap('a'))
    h.undo(snap('b'))
    expect(h.canRedo).toBe(true)
    h.push(snap('c'))
    expect(h.canRedo).toBe(false)
  })

  it('undo/redo em histórico vazio devolvem null sem quebrar', () => {
    const h = new FlowHistory()
    expect(h.undo(snap('x'))).toBeNull()
    expect(h.redo(snap('x'))).toBeNull()
  })

  it('respeita o cap de 30 passos descartando os mais antigos', () => {
    const h = new FlowHistory()
    for (let i = 0; i < 40; i++) h.push(snap(`s${i}`))
    let count = 0
    let last: FlowSnapshot | null
    while ((last = h.undo(snap('atual')))) count++
    expect(count).toBe(30)
  })

  it('clear esvazia past e future', () => {
    const h = new FlowHistory()
    h.push(snap('a'))
    h.undo(snap('b'))
    h.clear()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
  })
})
