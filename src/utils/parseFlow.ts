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
    style: { stroke: external ? '#f59e0b' : '#94a3b8' },
    labelStyle: { fontSize: 11, fill: '#475569' },
    labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
    labelBgPadding: [4, 6] as [number, number],
    labelBgBorderRadius: 4,
  }
}

// ─── Layout helpers ────────────────────────────────────────────────────────

function bfsFromStart(startId: string, edges: Edge[], validIds: Set<string>): Set<string> {
  const visited = new Set<string>()
  if (!startId) return visited
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!validIds.has(e.source) || !validIds.has(e.target)) continue
    if (!adj.has(e.source)) adj.set(e.source, [])
    adj.get(e.source)!.push(e.target)
  }
  const queue = [startId]; visited.add(startId)
  while (queue.length) {
    const cur = queue.shift()!
    for (const next of adj.get(cur) ?? [])
      if (!visited.has(next)) { visited.add(next); queue.push(next) }
  }
  return visited
}

function dagreLayout(nodes: Node<FlowNodeData>[], edges: Edge[]): Node<FlowNodeData>[] {
  if (!nodes.length) return []
  const ids = new Set(nodes.map(n => n.id))
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep: 28, nodesep: 18 })
  nodes.forEach(n => {
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    g.setNode(n.id, { width: s.w, height: s.h })
  })
  edges.filter(e => ids.has(e.source) && ids.has(e.target)).forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    return { ...n, position: { x: pos.x - s.w / 2, y: pos.y - s.h / 2 } }
  })
}

// Groups isolated nodes into connected components using only internal edges.
// External bot nodes are NOT included — they are placed separately later.
function buildIsolatedComponents(
  isolatedNodes: Node<FlowNodeData>[],
  allEdges: Edge[],
): { nodes: Node<FlowNodeData>[]; edges: Edge[] }[] {
  const isoIds   = new Set(isolatedNodes.map(n => n.id))
  const intEdges = allEdges.filter(e => isoIds.has(e.source) && isoIds.has(e.target))
  const visited  = new Set<string>()

  return isolatedNodes
    .filter(n => !visited.has(n.id))
    .map(seed => {
      const compIds = new Set<string>([seed.id])
      const queue   = [seed.id]
      while (queue.length) {
        const cur = queue.shift()!
        for (const e of intEdges) {
          const a = e.source === cur ? e.target : null
          const b = e.target === cur ? e.source : null
          for (const neighbor of [a, b]) {
            if (neighbor && isoIds.has(neighbor) && !compIds.has(neighbor)) {
              compIds.add(neighbor); queue.push(neighbor)
            }
          }
        }
      }
      compIds.forEach(id => visited.add(id))
      return {
        nodes: isolatedNodes.filter(n => compIds.has(n.id)),
        edges: intEdges.filter(e => compIds.has(e.source) && compIds.has(e.target)),
      }
    })
}

interface CompLayout {
  laid:   Node<FlowNodeData>[]
  minX:   number
  minY:   number
  width:  number
  height: number
}

function measureComp(laid: Node<FlowNodeData>[]): CompLayout {
  if (!laid.length) return { laid, minX: 0, minY: 0, width: 0, height: 0 }
  const minX = Math.min(...laid.map(n => n.position.x))
  const minY = Math.min(...laid.map(n => n.position.y))
  const width = Math.max(...laid.map(n => {
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    return (n.position.x - minX) + s.w
  }))
  const height = Math.max(...laid.map(n => {
    const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
    return (n.position.y - minY) + s.h
  }))
  return { laid, minX, minY, width, height }
}

function placeComp(cl: CompLayout, offsetX: number, offsetY: number): Node<FlowNodeData>[] {
  return cl.laid.map(n => ({
    ...n,
    position: {
      x: n.position.x - cl.minX + offsetX,
      y: n.position.y - cl.minY + offsetY,
    },
  }))
}

// ─── Main layout ───────────────────────────────────────────────────────────

export function layoutFlow(
  nodes: Node<FlowNodeData>[],
  edges: Edge[],
  mode: 'bottom' | 'left' = 'bottom'
): { nodes: Node<FlowNodeData>[]; mainFlowNodeIds: string[] } {
  const intNodes = nodes.filter(n => n.type !== 'externalBotNode')
  const extNodes  = nodes.filter(n => n.type === 'externalBotNode')
  const intIds    = new Set(intNodes.map(n => n.id))
  const extMap    = new Map(extNodes.map(n => [n.id, n]))

  // 1. BFS from START to find reachable nodes
  const startId    = intNodes.find(n => n.type === 'startNode')?.id ?? ''
  const reachable  = bfsFromStart(startId, edges, intIds)
  const mainFlowIds = new Set(reachable)

  // 2. Reverse reachability: any node with a path INTO the main flow also belongs to it
  let changed = true
  while (changed) {
    changed = false
    for (const e of edges) {
      if (!intIds.has(e.source) || !intIds.has(e.target)) continue
      if (mainFlowIds.has(e.target) && !mainFlowIds.has(e.source)) {
        mainFlowIds.add(e.source); changed = true
      }
    }
  }

  const flowNodes     = intNodes.filter(n =>  mainFlowIds.has(n.id))
  const isolatedNodes = intNodes.filter(n => !mainFlowIds.has(n.id))

  // 3. Dagre for main flow.
  //    Normalize so the CENTER of the main flow is always at x = 0 and the top at y = 0.
  //    This keeps the main flow anchored to the center regardless of isolated component layout.
  const rawFlow = dagreLayout(flowNodes, edges)
  let laidFlow: Node<FlowNodeData>[] = rawFlow

  if (rawFlow.length) {
    const rawMinX  = Math.min(...rawFlow.map(n => n.position.x))
    const rawMaxXR = Math.max(...rawFlow.map(n => {
      const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
      return n.position.x + s.w
    }))
    const rawMinY  = Math.min(...rawFlow.map(n => n.position.y))
    const shiftX   = -((rawMinX + rawMaxXR) / 2) // shift center to x = 0
    const shiftY   = -rawMinY                      // shift top to y = 0
    laidFlow = rawFlow.map(n => ({
      ...n,
      position: { x: n.position.x + shiftX, y: n.position.y + shiftY },
    }))
  }

  // After normalization: flowMidX = 0, flowTop = 0 always
  const flowTop    = 0
  const flowBottom = laidFlow.length
    ? Math.max(...laidFlow.map(n => {
        const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
        return n.position.y + s.h
      }))
    : 0
  const flowLeft = laidFlow.length ? Math.min(...laidFlow.map(n => n.position.x)) : 0
  const flowRight = laidFlow.length
    ? Math.max(...laidFlow.map(n => {
        const s = NODE_SIZES[n.type as NodeKind] ?? NODE_SIZES.defaultNode
        return n.position.x + s.w
      }))
    : 0

  const EXT_H    = NODE_SIZES.externalBotNode.h
  const EXT_GAPX = 50
  const EXT_GAPY = 20
  const COMP_GAP = 16

  // 4. Isolated components — internal nodes only, heights are clean and predictable
  const components  = buildIsolatedComponents(isolatedNodes, edges)
  const compLayouts = components.map(comp => measureComp(dagreLayout(comp.nodes, comp.edges)))

  const laidIsolated: Node<FlowNodeData>[] = []

  if (mode === 'bottom') {
    // Single horizontal row, centered at x = 0 (= main flow center).
    const validComps = compLayouts.filter(c => c.laid.length > 0)
    const totalIsoW  = validComps.reduce((s, c) => s + c.width + COMP_GAP, -COMP_GAP)
    const isoBaseY   = flowBottom + 60
    let   curX       = -totalIsoW / 2  // centered at x = 0

    for (const cl of compLayouts) {
      if (!cl.laid.length) continue
      laidIsolated.push(...placeComp(cl, curX, isoBaseY))
      curX += cl.width + COMP_GAP
    }
  } else {
    // Vertical column to the LEFT of the main flow's left edge.
    // Column is vertically centered relative to the main flow's midpoint.
    const LEFT_GAP    = 60
    const maxIsoWidth = compLayouts.reduce((m, c) => Math.max(m, c.width), 0)
    const isoLeftX    = flowLeft - LEFT_GAP - maxIsoWidth

    const validComps = compLayouts.filter(c => c.laid.length > 0)
    const totalIsoH  = validComps.reduce((s, c) => s + c.height + COMP_GAP, -COMP_GAP)
    const flowMidY   = flowBottom / 2  // flowTop = 0, so midY = flowBottom / 2
    let   curY       = flowMidY - totalIsoH / 2

    for (const cl of compLayouts) {
      if (!cl.laid.length) continue
      // Center each component horizontally within the column
      const compX = isoLeftX + (maxIsoWidth - cl.width) / 2
      laidIsolated.push(...placeComp(cl, compX, curY))
      curY += cl.height + COMP_GAP
    }
  }

  // 5. Place ALL external nodes uniformly — anchored to the right of their source,
  //    whether the source is in the main flow or an isolated component.
  const laidAllMap = new Map<string, Node<FlowNodeData>>([
    ...laidFlow.map(n     => [n.id, n] as const),
    ...laidIsolated.map(n => [n.id, n] as const),
  ])

  const extBySource = new Map<string, string[]>()
  for (const e of edges) {
    if (!laidAllMap.has(e.source) || !extMap.has(e.target)) continue
    if (!extBySource.has(e.source)) extBySource.set(e.source, [])
    extBySource.get(e.source)!.push(e.target)
  }

  // Compute initial positions for all external nodes (centered on source)
  const extInitial: { extId: string; x: number; y: number }[] = []
  const placedExtIds = new Set<string>()
  for (const [srcId, extIds] of extBySource) {
    const srcNode = laidAllMap.get(srcId)!
    const srcSize = NODE_SIZES[srcNode.type as NodeKind] ?? NODE_SIZES.defaultNode
    const extX      = srcNode.position.x + srcSize.w + EXT_GAPX
    const totalExtH = extIds.length * EXT_H + (extIds.length - 1) * EXT_GAPY
    const extStartY = srcNode.position.y + srcSize.h / 2 - totalExtH / 2
    extIds.forEach((extId, i) => {
      if (placedExtIds.has(extId)) return
      placedExtIds.add(extId)
      extInitial.push({ extId, x: extX, y: extStartY + i * (EXT_H + EXT_GAPY) })
    })
  }

  // Group by X column and resolve vertical overlaps so no two external nodes
  // in the same column are closer than EXT_GAPY apart, even if they come from
  // different source nodes.
  const byX = new Map<number, { extId: string; x: number; y: number }[]>()
  for (const pos of extInitial) {
    const col = byX.get(pos.x) ?? []
    col.push(pos)
    byX.set(pos.x, col)
  }

  const laidExt: Node<FlowNodeData>[] = []
  for (const col of byX.values()) {
    col.sort((a, b) => a.y - b.y)
    let lastBottom = -Infinity
    for (const pos of col) {
      const y = Math.max(pos.y, lastBottom + EXT_GAPY)
      laidExt.push({ ...extMap.get(pos.extId)!, position: { x: pos.x, y } })
      lastBottom = y + EXT_H
    }
  }

  return {
    nodes: [...laidFlow, ...laidIsolated, ...laidExt],
    mainFlowNodeIds: laidFlow.map(n => n.id),
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export function parseFlow(json: BotFlowJson): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const intents   = json.list
  const mainBotId = intents.find(i => i.category === 'start')?.botId ?? intents[0]?.botId ?? ''
  const intentIds = new Set(intents.map(i => i.id))

  const externalNodeMap = new Map<string, Node<FlowNodeData>>()

  const internalNodes: Node<FlowNodeData>[] = intents.map(intent => ({
    id:   intent.id,
    type: getNodeKind(intent),
    position: { x: 0, y: 0 },
    data: {
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
    },
  }))

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

  const allNodes = [...internalNodes, ...Array.from(externalNodeMap.values())]
  return { nodes: allNodes, edges }
}
