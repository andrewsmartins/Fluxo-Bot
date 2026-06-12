import { useCallback, useEffect, useRef, type DragEvent } from 'react'
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, useReactFlow, type Node, type Edge, type NodeMouseHandler, type MiniMapNodeProps, type NodeChange, type EdgeChange, type Connection, type XYPosition } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { NodePalette, PALETTE_DRAG_TYPE } from './NodePalette'
import { isCreatableKind, type CreatableKind } from '../utils/intentTemplates'
import { StartNode }       from './nodes/StartNode'
import { ChoiceNode }      from './nodes/ChoiceNode'
import { CaptureNode }     from './nodes/CaptureNode'
import { TransferNode }    from './nodes/TransferNode'
import { DefaultNode }     from './nodes/DefaultNode'
import { WaitNode }        from './nodes/WaitNode'
import { SetDataNode }     from './nodes/SetDataNode'
import { ExternalBotNode } from './nodes/ExternalBotNode'
import type { FlowNodeData } from '../types'

const nodeTypes = {
  startNode:       StartNode,
  choiceNode:      ChoiceNode,
  captureNode:     CaptureNode,
  transferNode:    TransferNode,
  defaultNode:     DefaultNode,
  waitNode:        WaitNode,
  setDataNode:     SetDataNode,
  externalBotNode: ExternalBotNode,
}

const NODE_COLORS: Record<string, string> = {
  startNode:       '#10b981',
  choiceNode:      '#3b82f6',
  captureNode:     '#8b5cf6',
  transferNode:    '#f43f5e',
  waitNode:        '#06b6d4',
  setDataNode:     '#6366f1',
  externalBotNode: '#f59e0b',
  defaultNode:     '#64748b',
}

function MiniMapNodeRect({ x, y, width, height, color }: MiniMapNodeProps) {
  return <rect x={x} y={y} width={width} height={height} fill={color} rx={6} ry={6} />
}

interface FlowCanvasProps {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  /** Incrementado a cada relayout (gerar fluxo / espaçamento) para disparar fitView. */
  layoutVersion: number
  isDark: boolean
  onNodeClick: (node: Node<FlowNodeData>) => void
  onNodesChange: (changes: NodeChange<Node<FlowNodeData>>[]) => void
  onReconnect: (oldEdge: Edge, connection: Connection) => void
  onConnect: (connection: Connection) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  onCreateNode: (kind: CreatableKind, position: XYPosition) => void
}

export function FlowCanvas(props: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner {...props} />
    </ReactFlowProvider>
  )
}

function FlowCanvasInner({ nodes, edges, layoutVersion, isDark, onNodeClick, onNodesChange, onReconnect, onConnect, onEdgesChange, onCreateNode }: FlowCanvasProps) {
  const { screenToFlowPosition } = useReactFlow()

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => onNodeClick(node as Node<FlowNodeData>),
    [onNodeClick]
  )

  const handleDragOver = useCallback((e: DragEvent) => {
    if (!e.dataTransfer.types.includes(PALETTE_DRAG_TYPE)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleDrop = useCallback((e: DragEvent) => {
    const kind = e.dataTransfer.getData(PALETTE_DRAG_TYPE)
    if (!isCreatableKind(kind)) return
    e.preventDefault()
    onCreateNode(kind, screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }, [onCreateNode, screenToFlowPosition])

  return (
    <div className="w-full h-full" onDragOver={handleDragOver} onDrop={handleDrop}>
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onReconnect={onReconnect}
      onConnect={onConnect}
      deleteKeyCode={['Backspace', 'Delete']}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      // Tolerância de drop ao reconectar: sem isso o usuário precisa acertar
      // exatamente o handle (~6px) no topo do nó e o gesto parece "não pegar"
      connectionRadius={80}
      reconnectRadius={16}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} color={isDark ? '#1e293b' : '#e2e8f0'} />
      <Controls />
      <MiniMap
        nodeColor={node => NODE_COLORS[node.type ?? 'defaultNode'] ?? '#64748b'}
        maskColor={isDark ? 'rgba(15,23,42,0.75)' : 'rgba(248,250,252,0.7)'}
        nodeComponent={MiniMapNodeRect}
      />
      <LayoutFitter layoutVersion={layoutVersion} />
      <NodePalette />
    </ReactFlow>
    </div>
  )
}

/**
 * Reenquadra a viewport quando um novo layout é calculado (gerar fluxo ou
 * mudar espaçamento). Não reage à criação de nós individuais — re-zoom no
 * meio de uma edição desorienta e invalida o gesto em andamento.
 */
function LayoutFitter({ layoutVersion }: { layoutVersion: number }) {
  const { fitView } = useReactFlow()
  const prevVersion = useRef(0)

  useEffect(() => {
    if (!layoutVersion || layoutVersion === prevVersion.current) return
    prevVersion.current = layoutVersion
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 60)
    return () => clearTimeout(timer)
  }, [layoutVersion])

  return null
}
