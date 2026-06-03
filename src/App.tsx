import { useState, useCallback, useMemo } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { FlowCanvas }  from './components/FlowCanvas'
import { JsonInput }   from './components/JsonInput'
import { DetailPanel } from './components/DetailPanel'
import { parseFlow, layoutFlow } from './utils/parseFlow'
import type { BotFlowJson, FlowNodeData } from './types'

export default function App() {
  const [jsonText, setJsonText]       = useState('')
  const [rawNodes, setRawNodes]       = useState<Node<FlowNodeData>[]>([])
  const [rawEdges, setRawEdges]       = useState<Edge[]>([])
  const [layoutMode, setLayoutMode]   = useState<'bottom' | 'left'>('bottom')
  const [error, setError]             = useState<string | null>(null)
  const [hasFlow, setHasFlow]         = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)

  const { nodes, mainFlowNodeIds } = useMemo(() => {
    if (!rawNodes.length) return { nodes: [], mainFlowNodeIds: [] }
    return layoutFlow(rawNodes, rawEdges, layoutMode)
  }, [rawNodes, rawEdges, layoutMode])

  function handleGenerate() {
    if (!jsonText.trim()) {
      setError('Cole ou importe um JSON antes de gerar o fluxo.')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(jsonText)
    } catch {
      setError('JSON inválido. Verifique a sintaxe e tente novamente.')
      return
    }
    const data = parsed as BotFlowJson
    if (!data?.list || !Array.isArray(data.list)) {
      setError('O JSON deve conter uma propriedade "list" com o array de intents.')
      return
    }
    if (data.list.length === 0) {
      setError('A lista de intents está vazia.')
      return
    }
    try {
      const result = parseFlow(data)
      setRawNodes(result.nodes)
      setRawEdges(result.edges)
      setError(null)
      setHasFlow(true)
      setSelectedNode(null)
    } catch (e) {
      setError(`Erro ao processar o fluxo: ${e instanceof Error ? e.message : 'desconhecido'}`)
    }
  }

  function handleJsonChange(value: string) {
    setJsonText(value)
    setError(null)
  }

  const handleNodeClick = useCallback((node: Node<FlowNodeData>) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  const handleClosePanel = useCallback(() => setSelectedNode(null), [])

  const handleToggleLayout = useCallback(() => {
    setLayoutMode(prev => prev === 'bottom' ? 'left' : 'bottom')
  }, [])

  return (
    <div className="flex h-screen bg-slate-100">
      <aside className="w-72 flex-shrink-0 bg-white border-r border-slate-200 flex flex-col shadow-sm">
        <JsonInput
          value={jsonText}
          onChange={handleJsonChange}
          onSubmit={handleGenerate}
          error={error}
        />
      </aside>

      <main className="flex-1 relative overflow-hidden">
        {hasFlow ? (
          <>
            <FlowCanvas
              nodes={nodes}
              edges={rawEdges}
              onNodeClick={handleNodeClick}
              layoutMode={layoutMode}
              onToggleLayout={handleToggleLayout}
              mainFlowNodeIds={mainFlowNodeIds}
            />
            {selectedNode && (
              <DetailPanel node={selectedNode} onClose={handleClosePanel} />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="7" height="4" rx="1" />
              <rect x="14" y="3" width="7" height="4" rx="1" />
              <rect x="8" y="17" width="8" height="4" rx="1" />
              <line x1="6.5" y1="7" x2="6.5" y2="10" />
              <line x1="17.5" y1="7" x2="17.5" y2="10" />
              <line x1="6.5" y1="10" x2="17.5" y2="10" />
              <line x1="12" y1="10" x2="12" y2="17" />
            </svg>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-500">Nenhum fluxo carregado</p>
              <p className="text-xs text-slate-400 mt-1">Cole o JSON no painel e clique em Gerar Fluxo</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
