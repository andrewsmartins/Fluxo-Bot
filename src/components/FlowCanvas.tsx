import { useCallback, useEffect, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, type Node, type Edge, type NodeMouseHandler, type MiniMapNodeProps } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StartNode }            from './nodes/StartNode'
import { ChoiceNode }           from './nodes/ChoiceNode'
import { CaptureNode }          from './nodes/CaptureNode'
import { TransferNode }         from './nodes/TransferNode'
import { DefaultNode }          from './nodes/DefaultNode'
import { WaitNode }             from './nodes/WaitNode'
import { SetDataNode }          from './nodes/SetDataNode'
import { ExternalBotNode }      from './nodes/ExternalBotNode'
import { EndConversationNode }  from './nodes/EndConversationNode'
import { ApiCallNode }          from './nodes/ApiCallNode'
import { ExportControls }       from './ExportControls'
import type { FlowNodeData } from '../types'

const nodeTypes = {
  startNode:           StartNode,
  choiceNode:          ChoiceNode,
  captureNode:         CaptureNode,
  transferNode:        TransferNode,
  defaultNode:         DefaultNode,
  waitNode:            WaitNode,
  setDataNode:         SetDataNode,
  externalBotNode:     ExternalBotNode,
  endConversationNode: EndConversationNode,
  apiCallNode:         ApiCallNode,
}

const NODE_COLORS: Record<string, string> = {
  startNode:           '#10b981',
  choiceNode:          '#3b82f6',
  captureNode:         '#8b5cf6',
  transferNode:        '#f43f5e',
  waitNode:            '#06b6d4',
  setDataNode:         '#6366f1',
  externalBotNode:     '#f59e0b',
  endConversationNode: '#f43f5e',
  apiCallNode:         '#0d9488',
  defaultNode:         '#64748b',
}

function MiniMapNodeRect({ x, y, width, height, color }: MiniMapNodeProps) {
  return <rect x={x} y={y} width={width} height={height} fill={color} rx={6} ry={6} />
}

interface FlowCanvasProps {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  onNodeClick: (node: Node<FlowNodeData>) => void
  onSpacingIncrease: () => void
  onSpacingDecrease: () => void
  isDark: boolean
}

export function FlowCanvas({ nodes, edges, onNodeClick, onSpacingIncrease, onSpacingDecrease, isDark }: FlowCanvasProps) {
  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => onNodeClick(node as Node<FlowNodeData>),
    [onNodeClick]
  )

  const bgColor      = isDark ? '#334155' : '#e2e8f0'
  const maskColor    = isDark ? 'rgba(15,23,42,0.75)' : 'rgba(248,250,252,0.7)'
  const minimapBg    = isDark ? '#1e293b' : '#f8fafc'

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      minZoom={0.1}
      maxZoom={2}
      colorMode={isDark ? 'dark' : 'light'}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} color={bgColor} />
      <Controls />
      <MiniMap
        nodeColor={node => NODE_COLORS[node.type ?? 'defaultNode'] ?? '#64748b'}
        maskColor={maskColor}
        style={{ background: minimapBg }}
        nodeComponent={MiniMapNodeRect}
      />
      <LayoutFitter nodeCount={nodes.length} />
      <ExportControls onSpacingIncrease={onSpacingIncrease} onSpacingDecrease={onSpacingDecrease} />
    </ReactFlow>
  )
}

function LayoutFitter({ nodeCount }: { nodeCount: number }) {
  const { fitView } = useReactFlow()
  const prevCount = useRef(0)

  useEffect(() => {
    if (!nodeCount || nodeCount === prevCount.current) return
    prevCount.current = nodeCount
    const timer = setTimeout(() => fitView({ padding: 0.2, duration: 350 }), 60)
    return () => clearTimeout(timer)
  }, [nodeCount])

  return null
}
