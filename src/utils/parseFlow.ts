import dagre from 'dagre'
import type { Edge, Node } from '@xyflow/react'
import type {
  BotFlowJson, BotIntent, Condition, Action,
  ButtonOption, BulkUpdateItem, FlowNodeData, NodeKind, ConditionInfo,
} from '../types'

const NODE_SIZES: Record<NodeKind, { w: number; h: number }> = {
  startNode:       { w: 180, h: 56 },
  choiceNode:      { w: 260, h: 200 },
  captureNode:     { w: 260, h: 160 },
  transferNode:    { w: 260, h: 140 },
  waitNode:        { w: 260, h: 130 },
  setDataNode:     { w: 260, h: 130 },
  externalBotNode: { w: 260, h: 150 },
  defaultNode:     { w: 260, h: 130 },
}

const GENERIC_CONDITION_NAMES = new Set([
  'Condição Padrão', 'Condição padrão', 'Condição 2', 'Condição 3', 'Condição 4', 'Start',
])

// ─── Intent data helpers ───────────────────────────────────────────────────

function getNodeKind(intent: BotIntent): NodeKind {
  if (intent.category === 'start') return 'startNode'
  for (const c of intent.conditions) if (c.action.type === 'transfer') return 'transferNode'
  for (const c of intent.conditions) if (c.action.type === 'waitForInteraction') return 'waitNode'
  for (const c of intent.conditions) if (c.action.type === 'choice') return 'choiceNode'
  for (const c of intent.conditions) if (c.action.type === 'captureData') return 'captureNode'
  for (const c of intent.conditions) if (c.action.type === 'setData') return 'setDataNode'
  return 'defaultNode'
}

function getChoices(action: Action): string[] {
  if (!Array.isArray(action.choices)) return []
  const seen = new Set<string>()
  return action.choices.filter(id => { if (!id || seen.has(id)) return false; seen.add(id); return true })
}

function getMessagePreview(intent: BotIntent): string {
  for (const cond of intent.conditions)
    for (const say of cond.assistant_says)
      for (const msg of say.messages) {
        if (msg.type === 'TEXT' && msg.content) return msg.content.slice(0, 120)
        if ((msg.type === 'BUTTON' || msg.type === 'LIST') && msg.messageConfig?.body)
          return msg.messageConfig.body.slice(0, 120)
      }
  return ''
}

function getAllMessages(intent: BotIntent): string[] {
  const seen = new Set<string>(); const result: string[] = []
  for (const cond of intent.conditions)
    for (const say of cond.assistant_says)
      for (const msg of say.messages) {
        let text = ''
        if (msg.type === 'TEXT' && msg.content) text = msg.content
        else if ((msg.type === 'BUTTON' || msg.type === 'LIST') && msg.messageConfig?.body)
          text = msg.messageConfig.body
        if (text && !seen.has(text)) { seen.add(text); result.push(text) }
      }
  return result
}

function getButtons(intent: BotIntent): ButtonOption[] {
  for (const cond of intent.conditions)
    for (const say of cond.assistant_says)
      for (const msg of say.messages)
        if ((msg.type === 'BUTTON' || msg.type === 'LIST') && msg.messageConfig?.buttons?.length)
          return msg.messageConfig.buttons
  return []
}

function getCaptureDataType(intent: BotIntent): string | null {
  for (const c of intent.conditions) if (c.action.captureDataType) return c.action.captureDataType
  return null
}

function getTransferType(intent: BotIntent): string | null {
  for (const c of intent.conditions) if (c.action.transferType) return c.action.transferType
  return null
}

function getTransferValue(intent: BotIntent): string | null {
  for (const c of intent.conditions)
    if (c.action.type === 'transfer' && c.action.value) return c.action.value
  return null
}

function getConditionInfos(intent: BotIntent): ConditionInfo[] {
  return intent.conditions
    .filter(c => c.variable || !GENERIC_CONDITION_NAMES.has(c.name))
    .map(c => ({ name: c.name, type: c.type, variable: c.variable ?? null }))
}

function getSetDataItems(intent: BotIntent): BulkUpdateItem[] {
  for (const cond of intent.conditions)
    if (cond.action.type === 'setData' && Array.isArray(cond.action.bulkUpdate))
      return cond.action.bulkUpdate as BulkUpdateItem[]
  return []
}

function getButtonLabel(cond: Condition, idx: number): string {
  for (const say of cond.assistant_says)
    for (const msg of say.messages)
      if ((msg.type === 'BUTTON' || msg.type === 'LIST') && msg.messageConfig?.buttons?.[idx])
        return msg.messageConfig.buttons[idx].text
  return `Opção ${idx + 1}`
}

function getEdgeLabel(cond: Condition, choiceIdx?: number): string {
  if (choiceIdx !== undefined) return getButtonLabel(cond, choiceIdx)
  if (cond.type === 'equals' && cond.value && cond.value !== 'any') return `= ${cond.value}`
  if (cond.type === 'else') return 'senão'
  if (cond.type === 'exists') return cond.variable ? `existe: ${cond.variable}` : 'existe'
  return GENERIC_CONDITION_NAMES.has(cond.name) ? '' : cond.name
}

function getNextRef(next: Condition['next']): { id: string; botId: string } | null {
  if (!next?.intent || typeof next.intent !== 'object') return null
  const { id, botId } = next.intent as { id: string; botId: string }
  return id ? { id, botId: botId ?? '' } : null
}

function edgeStyle(external: boolean) {
  return {
    type: 'smoothstep' as const,
    animated: external,
    // Apenas a ponta de destino é editável: mover a origem mudaria de qual
    // condição a aresta nasce, o que é ambíguo. Arestas externas apontam para
    // nós sintéticos (outro bot) e não são editáveis.
    reconnectable: external ? false : ('target' as const),
    style: { stroke: external ? '#f59e0b' : '#94a3b8' },
    labelStyle: { fontSize: 11, fill: '#475569' },
    labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 4,
  }
}

// ─── Layout ────────────────────────────────────────────────────────────────

const LAYOUT_COLS = 4   // columns in the bin-pack grid
const COL_GAP     = 80  // horizontal gap between columns (px)
const ROW_GAP     = 80  // vertical gap between components in the same column (px)

function findComponents(nodes: Node<FlowNodeData>[], edges: Edge[]): Node<FlowNodeData>[][] {
  const adj = new Map<string, Set<string>>()
  nodes.forEach(n => adj.set(n.id, new Set()))
  edges.forEach(e => {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  })
  const visited = new Set<string>()
  const byId = new Map(nodes.map(n => [n.id, n]))
  const components: Node<FlowNodeData>[][] = []
  for (const node of nodes) {
    if (visited.has(node.id)) continue
    const comp: Node<FlowNodeData>[] = []
    const queue = [node.id]
    while (queue.length) {
      const id = queue.shift()!
      if (visited.has(id)) continue
      visited.add(id)
      const n = byId.get(id)
      if (n) comp.push(n)
      adj.get(id)?.forEach(nb => { if (!visited.has(nb)) queue.push(nb) })
    }
    components.push(comp)
  }
  return components
}

function layoutSingle(nodes: Node<FlowNodeData>[], edges: Edge[], ranksep: number, nodesep: number): Node<FlowNodeData>[] {
  const ids = new Set(nodes.map(n => n.id))
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep, nodesep })
  nodes.forEach(n => {
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    g.setNode(n.id, { width: s.w, height: s.h })
  })
  edges.filter(e => ids.has(e.source) && ids.has(e.target))
       .forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    return { ...n, position: { x: pos.x - s.w / 2, y: pos.y - s.h / 2 } }
  })
}

function bbox(nodes: Node<FlowNodeData>[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) {
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    x0 = Math.min(x0, n.position.x)
    y0 = Math.min(y0, n.position.y)
    x1 = Math.max(x1, n.position.x + s.w)
    y1 = Math.max(y1, n.position.y + s.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

function dagreLayout(nodes: Node<FlowNodeData>[], edges: Edge[], ranksep: number, nodesep: number): Node<FlowNodeData>[] {
  if (!nodes.length) return []

  // 1. Find connected components, sort largest first
  const components = findComponents(nodes, edges).sort((a, b) => b.length - a.length)

  // 2. Run Dagre on each component, normalize to origin (0,0)
  const laid = components.map(comp => {
    const laidNodes = layoutSingle(comp, edges, ranksep, nodesep)
    const bb = bbox(laidNodes)
    return {
      nodes: laidNodes.map(n => ({
        ...n,
        position: { x: n.position.x - bb.x, y: n.position.y - bb.y },
      })),
      w: bb.w,
      h: bb.h,
    }
  })

  // 3. Bin-pack: each component goes into the shortest column
  const colHeights   = new Array(LAYOUT_COLS).fill(0)
  const colMaxWidths = new Array(LAYOUT_COLS).fill(0)
  const placed: { colIdx: number; yOff: number; nodes: Node<FlowNodeData>[] }[] = []

  for (const comp of laid) {
    const colIdx = colHeights.indexOf(Math.min(...colHeights))
    placed.push({ colIdx, yOff: colHeights[colIdx], nodes: comp.nodes })
    colHeights[colIdx]   += comp.h + ROW_GAP
    colMaxWidths[colIdx]  = Math.max(colMaxWidths[colIdx], comp.w)
  }

  // 4. Compute x start for each column based on max widths
  const colX = new Array(LAYOUT_COLS).fill(0)
  for (let i = 1; i < LAYOUT_COLS; i++) colX[i] = colX[i - 1] + colMaxWidths[i - 1] + COL_GAP

  // 5. Apply final offsets
  return placed.flatMap(({ colIdx, yOff, nodes: compNodes }) =>
    compNodes.map(n => ({
      ...n,
      position: { x: n.position.x + colX[colIdx], y: n.position.y + yOff },
    }))
  )
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Constrói o view-model (FlowNodeData) exibido no nó a partir da intenção crua. */
export function intentToNodeData(intent: BotIntent): FlowNodeData {
  return {
    name:            intent.name,
    category:        intent.category,
    messagePreview:  getMessagePreview(intent),
    buttons:         getButtons(intent),
    actionType:      intent.conditions[0]?.action.type ?? 'none',
    captureDataType: getCaptureDataType(intent),
    transferType:    getTransferType(intent),
    transferValue:   getTransferValue(intent),
    allMessages:     getAllMessages(intent),
    setDataItems:    getSetDataItems(intent),
    keywords:        intent.keywords ?? [],
    conditions:      getConditionInfos(intent),
  }
}

/**
 * Constrói a aresta `-next` de uma condição a partir do modelo, com o mesmo ID
 * e estilo que o parseFlow geraria — usado ao conectar nós manualmente.
 * Retorna null se a condição não existir ou não tiver destino interno.
 */
export function buildNextEdge(json: BotFlowJson, sourceId: string, condIdx: number): Edge | null {
  const intent = json.list.find(i => i.id === sourceId)
  const cond = intent?.conditions[condIdx]
  if (!cond) return null
  const ref = getNextRef(cond.next)
  if (!ref || !json.list.some(i => i.id === ref.id)) return null
  return {
    id: `${sourceId}-c${condIdx}-next`,
    source: sourceId,
    target: ref.id,
    label: getEdgeLabel(cond),
    ...edgeStyle(false),
  }
}

/**
 * Constrói todas as arestas (e os nós sintéticos de bots externos) a partir
 * do modelo. Exportado para o App reconstruir labels após edição de conteúdo
 * sem refazer o layout.
 */
export function buildEdges(json: BotFlowJson): { edges: Edge[]; externalNodes: Node<FlowNodeData>[] } {
  const intents   = json.list
  const mainBotId = intents.find(i => i.category === 'start')?.botId ?? intents[0]?.botId ?? ''
  const intentIds = new Set(intents.map(i => i.id))

  const externalNodeMap = new Map<string, Node<FlowNodeData>>()
  const edges: Edge[] = []

  for (const intent of intents) {
    for (let ci = 0; ci < intent.conditions.length; ci++) {
      const cond    = intent.conditions[ci]
      const choices = getChoices(cond.action)

      if (cond.action.type === 'choice' && choices.length > 0) {
        choices.forEach((choiceId, idx) => {
          if (!intentIds.has(choiceId)) return
          edges.push({
            id: `${intent.id}-c${ci}-ch${idx}`,
            source: intent.id,
            target: choiceId,
            label: getEdgeLabel(cond, idx),
            ...edgeStyle(false),
          })
        })
        continue
      }

      const ref = getNextRef(cond.next)
      if (!ref) continue

      const isExternal = cond.next.action === 'bot' || (!!ref.botId && ref.botId !== mainBotId)

      if (isExternal) {
        const extId = `ext-${intent.id}-c${ci}`
        externalNodeMap.set(extId, {
          id: extId, type: 'externalBotNode', position: { x: 0, y: 0 },
          data: {
            name: 'Outro Bot', category: 'Redirecionamento externo',
            messagePreview: '', buttons: [], actionType: 'none',
            captureDataType: null, transferType: null, transferValue: null,
            allMessages: [], setDataItems: [], keywords: [], conditions: [],
            externalBotId: ref.botId, externalIntentId: ref.id,
          },
        })
        edges.push({
          id: `${intent.id}-c${ci}-ext`,
          source: intent.id, target: extId,
          label: getEdgeLabel(cond),
          ...edgeStyle(true),
        })
      } else if (intentIds.has(ref.id)) {
        edges.push({
          id: `${intent.id}-c${ci}-next`,
          source: intent.id, target: ref.id,
          label: getEdgeLabel(cond),
          ...edgeStyle(false),
        })
      }
    }
  }

  return { edges, externalNodes: Array.from(externalNodeMap.values()) }
}

export function parseFlow(json: BotFlowJson, spacing?: { ranksep?: number; nodesep?: number }): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const internalNodes: Node<FlowNodeData>[] = json.list.map(intent => ({
    id:   intent.id,
    type: getNodeKind(intent),
    position: { x: 0, y: 0 },
    data: intentToNodeData(intent),
  }))

  const { edges, externalNodes } = buildEdges(json)
  const { ranksep = 60, nodesep = 40 } = spacing ?? {}
  return { nodes: dagreLayout([...internalNodes, ...externalNodes], edges, ranksep, nodesep), edges }
}
