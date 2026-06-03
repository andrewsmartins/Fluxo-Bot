import { useCallback, useEffect, useRef } from 'react'
import { ReactFlow, Background, Controls, MiniMap, useReactFlow, type Node, type Edge, type NodeMouseHandler } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { StartNode }       from './nodes/StartNode'
import { ChoiceNode }      from './nodes/ChoiceNode'
import { CaptureNode }     from './nodes/CaptureNode'
import { TransferNode }    from './nodes/TransferNode'
import { DefaultNode }     from './nodes/DefaultNode'
import { WaitNode }        from './nodes/WaitNode'
import { SetDataNode }     from './nodes/SetDataNode'
import { ExternalBotNode } from './nodes/ExternalBotNode'
import { ExportControls }  from './ExportControls'
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

interface FlowCanvasProps {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  onNodeClick: (node: Node<FlowNodeData>) => void
  layoutMode: 'bottom' | 'left'
  onToggleLayout: () => void
  mainFlowNodeIds: string[]
}

export function FlowCanvas({ nodes, edges, onNodeClick, layoutMode, onToggleLayout, mainFlowNodeIds }: FlowCanvasProps) {
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
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} color="#e2e8f0" />
      <Controls />
      <MiniMap
        nodeColor={node => NODE_COLORS[node.type ?? 'defaultNode'] ?? '#64748b'}
        maskColor="rgba(248,250,252,0.7)"
      />
      <LayoutFitter nodeCount={nodes.length} layoutMode={layoutMode} mainFlowNodeIds={mainFlowNodeIds} />
      <ExportControls layoutMode={layoutMode} onToggleLayout={onToggleLayout} mainFlowNodeIds={mainFlowNodeIds} />
    </ReactFlow>
  )
}

function LayoutFitter({ nodeCount, layoutMode, mainFlowNodeIds }: {
  nodeCount: number
  layoutMode: string
  mainFlowNodeIds: string[]
}) {
  const { fitView } = useReactFlow()
  const prevKey = useRef('')

  useEffect(() => {
    const key = `${nodeCount}:${layoutMode}`
    if (!nodeCount || key === prevKey.current) return
    prevKey.current = key
    const nodesToFit = mainFlowNodeIds.length ? mainFlowNodeIds.map(id => ({ id })) : undefined
    const timer = setTimeout(() => fitView({ nodes: nodesToFit, padding: 0.2, duration: 350 }), 60)
    return () => clearTimeout(timer)
  }, [nodeCount, layoutMode])

  return null
}
