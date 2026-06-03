import { useState, useCallback, useRef } from 'react'
import type { Node, Edge } from '@xyflow/react'
import { FlowCanvas }  from './components/FlowCanvas'
import { JsonInput }   from './components/JsonInput'
import { DetailPanel } from './components/DetailPanel'
import { parseFlow } from './utils/parseFlow'
import type { BotFlowJson, FlowNodeData } from './types'
import { useDarkMode } from './hooks/useDarkMode'

const SPACING_STEP = 60
const SPACING_MIN  = 20
const SPACING_MAX  = 300

export default function App() {
  const { dark, toggle: toggleDark }    = useDarkMode()
  const [jsonText, setJsonText]         = useState('')
  const [nodes, setNodes]               = useState<Node<FlowNodeData>[]>([])
  const [edges, setEdges]               = useState<Edge[]>([])
  const [error, setError]               = useState<string | null>(null)
  const [hasFlow, setHasFlow]           = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)
  const parsedDataRef                   = useRef<BotFlowJson | null>(null)
  const spacingRef                      = useRef({ ranksep: 60, nodesep: 40 })

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
      parsedDataRef.current = data
      const result = parseFlow(data, spacingRef.current)
      setNodes(result.nodes)
      setEdges(result.edges)
      setError(null)
      setHasFlow(true)
      setSelectedNode(null)
    } catch (e) {
      setError(`Erro ao processar o fluxo: ${e instanceof Error ? e.message : 'desconhecido'}`)
    }
  }

  const handleSpacingChange = useCallback((delta: number) => {
    if (!parsedDataRef.current) return
    const prev = spacingRef.current
    const next = {
      ranksep: Math.min(SPACING_MAX, Math.max(SPACING_MIN, prev.ranksep + delta)),
      nodesep: Math.min(SPACING_MAX, Math.max(SPACING_MIN, prev.nodesep + delta)),
    }
    spacingRef.current = next
    const result = parseFlow(parsedDataRef.current, next)
    setNodes(result.nodes)
    setEdges(result.edges)
  }, [])

  function handleJsonChange(value: string) {
    setJsonText(value)
    setError(null)
  }

  const handleNodeClick = useCallback((node: Node<FlowNodeData>) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  const handleClosePanel = useCallback(() => setSelectedNode(null), [])

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950">
      <aside className="w-72 flex-shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col shadow-sm">
        <JsonInput
          value={jsonText}
          onChange={handleJsonChange}
          onSubmit={handleGenerate}
          error={error}
          isDark={dark}
          onToggleDark={toggleDark}
        />
      </aside>

      <main className="flex-1 relative overflow-hidden">
        {hasFlow ? (
          <>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              onNodeClick={handleNodeClick}
              onSpacingIncrease={() => handleSpacingChange(SPACING_STEP)}
              onSpacingDecrease={() => handleSpacingChange(-SPACING_STEP)}
              isDark={dark}
            />
            {selectedNode && (
              <DetailPanel node={selectedNode} onClose={handleClosePanel} />
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 gap-3">
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
              <p className="text-sm font-medium text-slate-500 dark:text-slate-500">Nenhum fluxo carregado</p>
              <p className="text-xs text-slate-400 dark:text-slate-600 mt-1">Cole o JSON no painel e clique em Gerar Fluxo</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
