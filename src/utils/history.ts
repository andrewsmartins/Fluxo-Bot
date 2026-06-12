import type { Edge, Node } from '@xyflow/react'
import type { BotFlowJson, FlowNodeData } from '../types'

/** Estado completo do editor num instante: modelo + projeção visual. */
export interface FlowSnapshot {
  model: BotFlowJson
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
}

const MAX_HISTORY = 30

/** Clona o estado para um snapshot independente de mutações futuras. */
export function takeSnapshot(model: BotFlowJson, nodes: Node<FlowNodeData>[], edges: Edge[]): FlowSnapshot {
  return structuredClone({ model, nodes, edges })
}

/**
 * Histórico de undo/redo por snapshot. O chamador captura o snapshot ANTES
 * da mutação e só o registra se ela tiver sucesso. Cap de 30 passos para não
 * acumular memória com modelos grandes (~1 MB por snapshot em bots de 300
 * intenções).
 */
export class FlowHistory {
  private past: FlowSnapshot[] = []
  private future: FlowSnapshot[] = []

  get canUndo(): boolean { return this.past.length > 0 }
  get canRedo(): boolean { return this.future.length > 0 }

  /** Registra o estado pré-mutação; qualquer mutação nova invalida o redo. */
  push(snapshot: FlowSnapshot): void {
    this.past.push(snapshot)
    if (this.past.length > MAX_HISTORY) this.past.shift()
    this.future = []
  }

  /** Devolve o estado anterior, guardando o atual para redo. */
  undo(current: FlowSnapshot): FlowSnapshot | null {
    const snapshot = this.past.pop()
    if (!snapshot) return null
    this.future.push(current)
    return snapshot
  }

  /** Devolve o estado desfeito, guardando o atual para undo. */
  redo(current: FlowSnapshot): FlowSnapshot | null {
    const snapshot = this.future.pop()
    if (!snapshot) return null
    this.past.push(current)
    return snapshot
  }

  /** Esvazia o histórico (novo fluxo ou importação). */
  clear(): void {
    this.past = []
    this.future = []
  }
}
