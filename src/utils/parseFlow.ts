import dagre from '@dagrejs/dagre'
import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type {
  BotFlowJson, BotIntent, Condition, Action,
  ButtonOption, BulkUpdateItem, FlowNodeData, NodeKind, ConditionInfo,
} from '../types'
import { actionToNodeKind, triggerLabel, hasExecutionDelay } from './nodeMeta'

const NODE_SIZES: Record<NodeKind, { w: number; h: number }> = {
  startNode:       { w: 180, h: 56 },
  choiceNode:      { w: 240, h: 200 },
  captureNode:     { w: 240, h: 150 },
  transferNode:    { w: 240, h: 130 },
  waitNode:        { w: 240, h: 130 },
  setDataNode:     { w: 240, h: 140 },
  externalBotNode: { w: 240, h: 150 },
  defaultNode:     { w: 240, h: 120 },
  endNode:         { w: 240, h: 96 },
  apiCallNode:     { w: 240, h: 120 },
  orderNode:       { w: 240, h: 110 },
  csatNode:        { w: 240, h: 110 },
  storeNode:       { w: 240, h: 110 },
  // Tamanho real do grupo é calculado a partir dos filhos; este é só fallback.
  intentGroupNode: { w: 280, h: 220 },
}

// Layout do container de grupo (Modelo B): header + linha de filhos.
const GROUP_HEADER_H = 76  // altura reservada ao cabeçalho da intenção
const GROUP_PAD      = 14  // respiro interno do container
const CHILD_GAP      = 20  // espaço horizontal entre condições-filhas

const GENERIC_CONDITION_NAMES = new Set([
  'Condição Padrão', 'Condição padrão', 'Condição 2', 'Condição 3', 'Condição 4', 'Start',
])

/**
 * Uma intenção vira um GRUPO (container + filhos) quando tem 2+ condições.
 * Com 1 condição (ou 0) vira um nó solto, sem container. O start nunca agrupa:
 * é sempre o nó de início.
 */
function isGrouped(intent: BotIntent): boolean {
  return intent.category !== 'start' && intent.conditions.length >= 2
}

/** ID do nó da condição de origem (filho no grupo, ou o próprio nó solto). */
function sourceNodeId(intent: BotIntent, condIdx: number): string {
  return isGrouped(intent) ? `${intent.id}::c${condIdx}` : intent.id
}

/** Tipo do nó solto de uma intenção (start, ou o ActionType da 1ª condição). */
function soloKind(intent: BotIntent): NodeKind {
  if (intent.category === 'start') return 'startNode'
  return actionToNodeKind(intent.conditions[0]?.action)
}

// ─── Intent / condition data helpers ────────────────────────────────────────

function getChoices(action: Action): string[] {
  if (!Array.isArray(action.choices)) return []
  const seen = new Set<string>()
  return action.choices.filter(id => { if (!id || seen.has(id)) return false; seen.add(id); return true })
}

/** Primeira mensagem (texto ou corpo de botões) de UMA condição, truncada. */
function condMessagePreview(cond: Condition): string {
  for (const say of cond.assistant_says)
    for (const msg of say.messages) {
      if (msg.type === 'TEXT' && msg.content) return msg.content.slice(0, 120)
      if ((msg.type === 'BUTTON' || msg.type === 'LIST') && msg.messageConfig?.body)
        return msg.messageConfig.body.slice(0, 120)
    }
  return ''
}

/** Todas as mensagens (deduplicadas) de UMA condição. */
function condAllMessages(cond: Condition): string[] {
  const seen = new Set<string>(); const result: string[] = []
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

/** Botões (BUTTON/LIST) de UMA condição. */
function condButtons(cond: Condition): ButtonOption[] {
  for (const say of cond.assistant_says)
    for (const msg of say.messages)
      if ((msg.type === 'BUTTON' || msg.type === 'LIST') && msg.messageConfig?.buttons?.length)
        return msg.messageConfig.buttons
  return []
}

/** Itens de bulkUpdate de UMA condição (setData). */
function condSetDataItems(cond: Condition): BulkUpdateItem[] {
  return cond.action.type === 'setData' && Array.isArray(cond.action.bulkUpdate)
    ? (cond.action.bulkUpdate as BulkUpdateItem[])
    : []
}

/** Nome da API chamada em `action.external` (pode vir como array, string ou null). */
function extractApiName(action: Action): string | null {
  const api = action.external?.apiName
  if (Array.isArray(api)) return api.length ? String(api[0]) : null
  if (typeof api === 'string') return api || null
  return null
}

function getConditionInfos(intent: BotIntent): ConditionInfo[] {
  return intent.conditions
    .filter(c => c.variable || !GENERIC_CONDITION_NAMES.has(c.name))
    .map(c => ({ name: c.name, type: c.type, variable: c.variable ?? null }))
}

/**
 * View-model de UMA condição. Em `solo` o nó representa a intenção inteira
 * (mostra nome/categoria/keywords da intenção); em `child` representa só a
 * condição dentro do grupo (título = rótulo do gatilho, subtítulo = nome da
 * condição). Defensivo a intenção sem condições.
 */
function conditionNodeData(intent: BotIntent, condIdx: number, mode: 'solo' | 'child'): FlowNodeData {
  const cond = intent.conditions[condIdx]
  if (!cond) {
    return {
      name: intent.name, category: intent.category, messagePreview: '', buttons: [],
      actionType: 'none', captureDataType: null, transferType: null, transferValue: null,
      allMessages: [], setDataItems: [], keywords: intent.keywords ?? [], conditions: [],
    }
  }
  const action = cond.action
  const trigger = triggerLabel(cond.type)
  return {
    name:            mode === 'solo' ? intent.name : trigger,
    category:        mode === 'solo' ? intent.category : (cond.name || ''),
    messagePreview:  condMessagePreview(cond),
    buttons:         condButtons(cond),
    actionType:      action.type,
    captureDataType: action.captureDataType ?? null,
    captureMultipleFields: action.captureDataTypesCategory === 'multipleFields' && Array.isArray(action.multipleFields)
      ? action.multipleFields
      : [],
    transferType:    action.transferType ?? null,
    transferValue:   action.type === 'transfer' ? (action.value ?? null) : null,
    allMessages:     condAllMessages(cond),
    setDataItems:    condSetDataItems(cond),
    keywords:        mode === 'solo' ? (intent.keywords ?? []) : [],
    conditions:      mode === 'solo' ? getConditionInfos(intent) : [],
    triggerLabel:    trigger,
    orderType:       action.orderType ?? null,
    storeType:       action.storeType ?? null,
    apiName:         extractApiName(action),
  }
}

/** View-model do cabeçalho do grupo (nome/categoria/prioridade/keywords/ícones). */
function groupNodeData(intent: BotIntent): FlowNodeData {
  return {
    name: intent.name, category: intent.category, messagePreview: '', buttons: [],
    actionType: 'group', captureDataType: null, transferType: null, transferValue: null,
    allMessages: [], setDataItems: [], keywords: intent.keywords ?? [],
    conditions: getConditionInfos(intent),
    priority: intent.priority,
    conditionCount: intent.conditions.length,
    hasContext: !!intent.context,
    hasDelay: hasExecutionDelay(intent),
  }
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
    // Arestas de fluxo internas usam a aresta customizada com botão "×" (remover
    // conexão); as externas (outro bot) seguem smoothstep simples e não removíveis.
    type: external ? 'smoothstep' : 'deletable',
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

// ─── Aresta de Contexto (Modelo B, Marco B) ─────────────────────────────────

/** Cinza claro (slate-300) — discreto, distinto do fluxo (cinza `#94a3b8`) e do
 * redirect externo (âmbar `#f59e0b`); o movimento (marching ants) é que a destaca. */
const CONTEXT_EDGE_COLOR = '#cbd5e1'

/**
 * Estilo da aresta de CONTEXTO: tracejada e ANIMADA (marching ants via `animated`
 * do React Flow — anima o `stroke-dashoffset` preservando nosso `strokeDasharray`),
 * com seta, NÃO editável e NÃO deletável nesta fase (a edição de contexto é o
 * Marco C). O `data.kind` marca a aresta para que o `collapseEdges` a exclua do
 * layout — contexto é uma anotação cruzada entre intenções, não a hierarquia
 * principal do fluxo.
 */
function contextEdgeStyle() {
  return {
    type: 'smoothstep' as const,
    animated: true,
    reconnectable: false as const,
    deletable: false,
    data: { kind: 'context' as const },
    markerEnd: { type: MarkerType.ArrowClosed, color: CONTEXT_EDGE_COLOR, width: 16, height: 16 },
    style: { stroke: CONTEXT_EDGE_COLOR, strokeDasharray: '6 4', strokeWidth: 1.5 },
    labelStyle: { fontSize: 10, fill: '#94a3b8', fontWeight: 600 },
    labelBgStyle: { fill: '#f8fafc', fillOpacity: 0.9 },
    labelBgPadding: [3, 5] as [number, number],
    labelBgBorderRadius: 4,
  }
}

/**
 * Constrói as arestas de contexto: para cada intenção com `intent.context`
 * apontando para outra intenção EXISTENTE, uma aresta tracejada
 * (contexto → esta intenção), indicando que esta intenção só ativa quando se
 * chega vinda da intenção de contexto. Tanto origem quanto destino usam o ID
 * cru da intenção (container do grupo ou nó solto), igual à entrada de fluxo.
 *
 * Guardas (caminhos infelizes): ignora `context` vazio, auto-referência,
 * destino inexistente (não desenha aresta órfã) e intenção-alvo `start` (o nó
 * de início não tem handle de entrada).
 */
function buildContextEdges(intents: BotIntent[], intentIds: Set<string>): Edge[] {
  const edges: Edge[] = []
  for (const intent of intents) {
    const ctxId = intent.context
    if (typeof ctxId !== 'string' || !ctxId) continue
    if (ctxId === intent.id) continue
    if (!intentIds.has(ctxId)) continue
    if (intent.category === 'start') continue
    edges.push({
      id: `ctx-${intent.id}`,
      source: ctxId,
      target: intent.id,
      // Handles laterais dedicados (saída à direita do contexto → entrada à
      // esquerda desta intenção), separando visualmente o contexto do fluxo
      // (topo/base). Os ids casam com os <Handle> de NodeShell/IntentGroupNode.
      sourceHandle: 'ctx-source',
      targetHandle: 'ctx-target',
      label: 'contexto',
      ...contextEdgeStyle(),
    })
  }
  return edges
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

/** Tamanho de um nó-macro: grupos têm tamanho dinâmico (em sizeById), os demais por tipo. */
function sizeOf(node: Node<FlowNodeData>, sizeById: Map<string, { w: number; h: number }>): { w: number; h: number } {
  return sizeById.get(node.id) ?? NODE_SIZES[node.type as NodeKind] ?? NODE_SIZES.defaultNode
}

function layoutSingle(nodes: Node<FlowNodeData>[], edges: Edge[], ranksep: number, nodesep: number, sizeById: Map<string, { w: number; h: number }>): Node<FlowNodeData>[] {
  const ids = new Set(nodes.map(n => n.id))
  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: 'TB', ranksep, nodesep })
  nodes.forEach(n => {
    const s = sizeOf(n, sizeById)
    g.setNode(n.id, { width: s.w, height: s.h })
  })
  edges.filter(e => ids.has(e.source) && ids.has(e.target))
       .forEach(e => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map(n => {
    const pos = g.node(n.id)
    const s = sizeOf(n, sizeById)
    return { ...n, position: { x: pos.x - s.w / 2, y: pos.y - s.h / 2 } }
  })
}

function bbox(nodes: Node<FlowNodeData>[], sizeById: Map<string, { w: number; h: number }>): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const n of nodes) {
    const s = sizeOf(n, sizeById)
    x0 = Math.min(x0, n.position.x)
    y0 = Math.min(y0, n.position.y)
    x1 = Math.max(x1, n.position.x + s.w)
    y1 = Math.max(y1, n.position.y + s.h)
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

/**
 * Posiciona os nós-macro (grupos, nós soltos e bots externos) via Dagre por
 * componente conexo + bin-pack. Recebe os tamanhos já calculados em `sizeById`
 * (os grupos têm tamanho dinâmico) e arestas já colapsadas a intent→intent.
 */
function dagreLayout(nodes: Node<FlowNodeData>[], edges: Edge[], ranksep: number, nodesep: number, sizeById: Map<string, { w: number; h: number }>): Node<FlowNodeData>[] {
  if (!nodes.length) return []

  // 1. Find connected components, sort largest first
  const components = findComponents(nodes, edges).sort((a, b) => b.length - a.length)

  // 2. Run Dagre on each component, normalize to origin (0,0)
  const laid = components.map(comp => {
    const laidNodes = layoutSingle(comp, edges, ranksep, nodesep, sizeById)
    const bb = bbox(laidNodes, sizeById)
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

/**
 * View-model do nó SOLTO de uma intenção (caso de 1 condição). Mantido para o
 * App reconstruir o nó após edição/criação. No Modelo B um nó solto representa
 * a condição 0 com os campos de cabeçalho da intenção.
 */
export function intentToNodeData(intent: BotIntent): FlowNodeData {
  return conditionNodeData(intent, 0, 'solo')
}

/**
 * Constrói a aresta `-next` de uma condição a partir do modelo, com o mesmo ID
 * e estilo que o parseFlow geraria — usado ao conectar nós manualmente. A origem
 * é o nó da condição (filho no grupo, ou o nó solto); o destino é a entrada da
 * intenção alvo (ID cru). Retorna null se a condição não existir ou não tiver
 * destino interno.
 */
export function buildNextEdge(json: BotFlowJson, sourceId: string, condIdx: number): Edge | null {
  const intent = json.list.find(i => i.id === sourceId)
  const cond = intent?.conditions[condIdx]
  if (!intent || !cond) return null
  const ref = getNextRef(cond.next)
  if (!ref || !json.list.some(i => i.id === ref.id)) return null
  return {
    id: `${sourceId}-c${condIdx}-next`,
    source: sourceNodeId(intent, condIdx),
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
            source: sourceNodeId(intent, ci),
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
          source: sourceNodeId(intent, ci), target: extId,
          label: getEdgeLabel(cond),
          ...edgeStyle(true),
        })
      } else if (intentIds.has(ref.id)) {
        edges.push({
          id: `${intent.id}-c${ci}-next`,
          source: sourceNodeId(intent, ci), target: ref.id,
          label: getEdgeLabel(cond),
          ...edgeStyle(false),
        })
      }
    }
  }

  edges.push(...buildContextEdges(intents, intentIds))

  return { edges, externalNodes: Array.from(externalNodeMap.values()) }
}

/**
 * Resultado intermediário do Modelo B para cada intenção: o nó-macro (grupo ou
 * nó solto) que entra no layout, mais os filhos-condição (vazio se solto) já
 * posicionados em linha relativos ao grupo.
 */
interface BuiltIntent {
  macro: Node<FlowNodeData>
  children: Node<FlowNodeData>[]
  size: { w: number; h: number }
}

/**
 * Constrói o nó-macro de uma intenção. 1 condição (ou 0) → nó solto; 2+ → um
 * `intentGroupNode` com os filhos-condição em linha (posições relativas ao grupo,
 * `parentId` + `extent: 'parent'`). O tamanho do grupo deriva da linha de filhos.
 */
function buildIntentNodes(intent: BotIntent): BuiltIntent {
  if (!isGrouped(intent)) {
    const kind = soloKind(intent)
    return {
      macro: { id: intent.id, type: kind, position: { x: 0, y: 0 }, data: conditionNodeData(intent, 0, 'solo') },
      children: [],
      size: NODE_SIZES[kind] ?? NODE_SIZES.defaultNode,
    }
  }

  const children: Node<FlowNodeData>[] = []
  let x = GROUP_PAD
  let maxChildH = 0
  intent.conditions.forEach((cond, ci) => {
    const kind = actionToNodeKind(cond.action)
    const s = NODE_SIZES[kind] ?? NODE_SIZES.defaultNode
    children.push({
      id: `${intent.id}::c${ci}`,
      type: kind,
      parentId: intent.id,
      extent: 'parent',
      position: { x, y: GROUP_HEADER_H },
      data: conditionNodeData(intent, ci, 'child'),
    })
    x += s.w + CHILD_GAP
    maxChildH = Math.max(maxChildH, s.h)
  })

  const width  = x - CHILD_GAP + GROUP_PAD
  const height = GROUP_HEADER_H + maxChildH + GROUP_PAD
  return {
    macro: {
      id: intent.id,
      type: 'intentGroupNode',
      position: { x: 0, y: 0 },
      data: groupNodeData(intent),
      style: { width, height },
    },
    children,
    size: { w: width, h: height },
  }
}

/**
 * Colapsa as arestas renderizadas (origem = nó-condição) para o nível da
 * intenção (origem = ID cru), deduplicando — usado só para posicionar os grupos
 * no Dagre, sem distorcer o layout com várias arestas paralelas entre 2 grupos.
 */
function collapseEdges(edges: Edge[]): Edge[] {
  const seen = new Set<string>()
  const collapsed: Edge[] = []
  for (const e of edges) {
    // Arestas de contexto não entram no layout (anotação cruzada, não fluxo).
    if ((e.data as { kind?: string } | undefined)?.kind === 'context') continue
    const source = e.source.replace(/::c\d+$/, '')
    const key = `${source}->${e.target}`
    if (seen.has(key)) continue
    seen.add(key)
    collapsed.push({ id: key, source, target: e.target })
  }
  return collapsed
}

export function parseFlow(json: BotFlowJson, spacing?: { ranksep?: number; nodesep?: number }): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const built = json.list.map(buildIntentNodes)
  const { edges, externalNodes } = buildEdges(json)

  // Layout só sobre os nós-macro (grupos, soltos e bots externos).
  const sizeById = new Map<string, { w: number; h: number }>()
  built.forEach(b => sizeById.set(b.macro.id, b.size))
  externalNodes.forEach(n => sizeById.set(n.id, NODE_SIZES.externalBotNode))

  const macroNodes = [...built.map(b => b.macro), ...externalNodes]
  const { ranksep = 60, nodesep = 40 } = spacing ?? {}
  const positioned = dagreLayout(macroNodes, collapseEdges(edges), ranksep, nodesep, sizeById)
  const posById = new Map(positioned.map(n => [n.id, n.position]))

  // Remonta: cada grupo seguido dos seus filhos (parent antes do filho, exigência
  // do React Flow); filhos mantêm a posição RELATIVA ao grupo. Externos por último.
  const nodes: Node<FlowNodeData>[] = []
  for (const b of built) {
    nodes.push({ ...b.macro, position: posById.get(b.macro.id) ?? { x: 0, y: 0 } })
    for (const child of b.children) nodes.push(child)
  }
  for (const ext of externalNodes) {
    nodes.push({ ...ext, position: posById.get(ext.id) ?? { x: 0, y: 0 } })
  }

  return { nodes, edges }
}
