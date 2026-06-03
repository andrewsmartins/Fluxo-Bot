import { useState, useCallback, useEffect, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, applyNodeChanges, type Node, type Edge, type NodeMouseHandler, type MiniMapNodeProps, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { relayout } from '../utils/parseFlow'
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
  spacing: { ranksep: number; nodesep: number }
  onNodeClick: (node: Node<FlowNodeData>) => void
  onSpacingIncrease: () => void
  onSpacingDecrease: () => void
}

export function FlowCanvas({ nodes: propNodes, edges, spacing, onNodeClick, onSpacingIncrease, onSpacingDecrease }: FlowCanvasProps) {
  const [nodes, setNodes] = useState<Node<FlowNodeData>[]>(propNodes)
  const measuredRef = useRef(false)
  const spacingRef  = useRef(spacing)
  spacingRef.current = spacing

  // When prop nodes change (new JSON or spacing adjustment), sync and relayout with measured sizes
  useEffect(() => {
    measuredRef.current = false
    setNodes(current => {
      // Preserve measured sizes from current state, apply them to new node positions
      const merged = propNodes.map(pn => {
        const existing = current.find(n => n.id === pn.id)
        return existing?.measured ? { ...pn, measured: existing.measured } : pn
      })
      if (merged.every(n => n.measured?.width && n.measured?.height)) {
        measuredRef.current = true
        return relayout(merged as Node<FlowNodeData>[], edges, spacingRef.current)
      }
      return propNodes
    })
  }, [propNodes, edges])

  const handleNodesChange = useCallback((changes: NodeChange<Node<FlowNodeData>>[]) => {
    setNodes(current => {
      const updated = applyNodeChanges(changes, current) as Node<FlowNodeData>[]
      // After all nodes are measured for the first time, relayout with actual sizes
      if (
        !measuredRef.current &&
        changes.some(c => c.type === 'dimensions') &&
        updated.every(n => n.measured?.width && n.measured?.height)
      ) {
        measuredRef.current = true
        return relayout(updated, edges, spacingRef.current)
      }
      return updated
    })
  }, [edges])

  const handleNodeClick: NodeMouseHandler = useCallback(
    (_, node) => onNodeClick(node as Node<FlowNodeData>),
    [onNodeClick]
  )

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodeClick={handleNodeClick}
      onNodesChange={handleNodesChange}
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls />
      <MiniMap
        nodeColor={node => NODE_COLORS[node.type ?? 'defaultNode'] ?? '#64748b'}
        maskColor="rgba(248,250,252,0.7)"
        nodeComponent={MiniMapNodeRect}
      />
      <LayoutFitter nodeCount={propNodes.length} />
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
