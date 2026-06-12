import { useState, useCallback, useRef, useEffect } from 'react'
import { reconnectEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Node, type Edge, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import { FlowCanvas }    from './components/FlowCanvas'
import { JsonInput }     from './components/JsonInput'
import { DetailPanel }   from './components/DetailPanel'
import { ThemeToggle }   from './components/ThemeToggle'
import { ThemeContext }  from './contexts/ThemeContext'
import { parseFlow, intentToNodeData, buildEdges } from './utils/parseFlow'
import { applyEdgeReconnect, applyConnect, applyEdgeDelete, applyNodeDelete, serializeFlow } from './utils/editFlow'
import { createIntentTemplate, type CreatableKind } from './utils/intentTemplates'
import { validateFlow } from './utils/validateFlow'
import type { BotFlowJson, FlowNodeData } from './types'

const SPACING_STEP = 60
const SPACING_MIN  = 20
const SPACING_MAX  = 600

export default function App() {
  const [isDark, setIsDark]             = useState(() => document.documentElement.classList.contains('dark'))
  const [jsonText, setJsonText]         = useState('')
  const [nodes, setNodes]               = useState<Node<FlowNodeData>[]>([])
  const [edges, setEdges]               = useState<Edge[]>([])
  const [error, setError]               = useState<string | null>(null)
  const [hasFlow, setHasFlow]           = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const parsedDataRef                   = useRef<BotFlowJson | null>(null)
  const spacingRef                      = useRef({ ranksep: 60, nodesep: 40 })

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('theme', 'light')
    }
  }, [isDark])

  const toggleTheme = useCallback(() => setIsDark(d => !d), [])

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
      setLayoutVersion(v => v + 1)
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
    setLayoutVersion(v => v + 1)
  }, [])

  function handleJsonChange(value: string) {
    setJsonText(value)
    setError(null)
  }

  /**
   * Reconecta o destino de uma aresta: aplica o patch no modelo (fonte de
   * verdade para exportação) e, só se ele for válido, atualiza o canvas.
   * O ID da aresta é preservado porque codifica a posição no modelo.
   */
  const handleReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    const model = parsedDataRef.current
    if (!model) return
    const result = applyEdgeReconnect(model, oldEdge.id, oldEdge.target, connection.target)
    if (!result.ok) {
      setError(`Não foi possível reconectar: ${result.reason}.`)
      return
    }
    setEdges(eds => reconnectEdge(oldEdge, connection, eds, { shouldReplaceId: false }))
    setError(null)
  }, [])

  /** Exclui a intenção do modelo (com limpeza de referências) e some com o nó. */
  const deleteNode = useCallback((nodeId: string) => {
    const model = parsedDataRef.current
    if (!model) return false
    const result = applyNodeDelete(model, nodeId)
    if (!result.ok) {
      setError(`Não foi possível excluir: ${result.reason}.`)
      return false
    }
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(buildEdges(model).edges)
    setSelectedNode(prev => prev?.id === nodeId ? null : prev)
    setError(null)
    return true
  }, [])

  /**
   * Mudanças de nós do canvas: posição/seleção/dimensões são estado visual;
   * remoção (Delete/Backspace) passa pelo patch do modelo, que limpa as
   * referências de entrada — só é aplicada se o patch for válido.
   */
  const handleNodesChange = useCallback((changes: NodeChange<Node<FlowNodeData>>[]) => {
    const visual = changes.filter(c => c.type !== 'remove')
    if (visual.length) setNodes(curr => applyNodeChanges(visual, curr))
    for (const change of changes) {
      if (change.type === 'remove') deleteNode(change.id)
    }
  }, [deleteNode])

  /**
   * Conecta dois nós criando a referência next na primeira condição livre da
   * origem. A aresta usa o ID posicional do modelo para permitir reconexão
   * e exclusão posteriores.
   */
  const handleConnect = useCallback((connection: Connection) => {
    const model = parsedDataRef.current
    if (!model || !connection.source || !connection.target) return
    const result = applyConnect(model, connection.source, connection.target)
    if (!result.ok) {
      setError(`Não foi possível conectar: ${result.reason}.`)
      return
    }
    // Reconstrói todas as arestas do modelo: cobre tanto next quanto slots de
    // escolha, com IDs posicionais e labels (texto do botão) consistentes
    setEdges(buildEdges(model).edges)
    setError(null)
  }, [])

  /**
   * Mudanças de aresta vindas do canvas: seleção é aplicada direto; remoção
   * (Delete/Backspace) só é aplicada se o patch no modelo for válido —
   * arestas de escolha e externas não são deletáveis.
   */
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const model = parsedDataRef.current
    const allowed: EdgeChange[] = []
    for (const change of changes) {
      if (change.type !== 'remove') {
        allowed.push(change)
        continue
      }
      if (!model) continue
      const result = applyEdgeDelete(model, change.id)
      if (result.ok) {
        allowed.push(change)
        setError(null)
      } else {
        setError(`Não foi possível excluir: ${result.reason}.`)
      }
    }
    if (allowed.length) setEdges(eds => applyEdgeChanges(allowed, eds))
  }, [])

  /** Cria uma intenção nova (template canônico) na posição do drop da paleta. */
  const handleCreateNode = useCallback((kind: CreatableKind, position: XYPosition) => {
    const model = parsedDataRef.current
    if (!model) return
    const botId = model.list.find(i => i.category === 'start')?.botId ?? model.list[0]?.botId ?? ''
    const count = model.list.filter(i => i.name.startsWith('nova_intencao')).length
    const intent = createIntentTemplate(kind, botId, `nova_intencao_${count + 1}`)
    model.list.push(intent)
    setNodes(ns => [...ns, {
      id: intent.id,
      type: kind,
      position,
      data: intentToNodeData(intent),
    }])
    setError(null)
  }, [])

  /**
   * Pós-edição de conteúdo: refaz o view-model do nó editado e os labels das
   * arestas (texto de botão vira label de aresta de escolha), sem relayout.
   */
  const handleApplyEdit = useCallback((intentId: string) => {
    const model = parsedDataRef.current
    if (!model) return
    const intent = model.list.find(i => i.id === intentId)
    if (!intent) return
    const data = intentToNodeData(intent)
    setNodes(ns => ns.map(n => n.id === intentId ? { ...n, data } : n))
    setEdges(buildEdges(model).edges)
    setSelectedNode(prev => prev && prev.id === intentId ? { ...prev, data } : prev)
    setError(null)
  }, [])

  function handleExportJson() {
    const model = parsedDataRef.current
    if (!model) return
    const report = validateFlow(model)
    if (report.errors.length) {
      const extra = report.errors.length > 1 ? ` (+${report.errors.length - 1} erro(s))` : ''
      setError(`Export bloqueado — ${report.errors[0]}${extra}.`)
      return
    }
    if (report.warnings.length) {
      const extra = report.warnings.length > 1 ? ` (+${report.warnings.length - 1} aviso(s))` : ''
      setError(`Exportado com aviso: ${report.warnings[0]}${extra}.`)
    } else {
      setError(null)
    }
    const blob = new Blob([serializeFlow(model)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = 'fluxo.json'
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleNodeClick = useCallback((node: Node<FlowNodeData>) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  const handleClosePanel = useCallback(() => setSelectedNode(null), [])

  return (
    <ThemeContext.Provider value={isDark}>
    <div className={`flex h-screen transition-colors duration-200 ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
      <aside className={`w-96 flex-shrink-0 border-r flex flex-col shadow-sm transition-colors duration-200 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <JsonInput
          value={jsonText}
          onChange={handleJsonChange}
          onSubmit={handleGenerate}
          error={error}
          themeToggle={<ThemeToggle isDark={isDark} onToggle={toggleTheme} />}
        />
      </aside>

      <main className="flex-1 relative overflow-hidden">
        {hasFlow ? (
          <>
            <FlowCanvas
              nodes={nodes}
              edges={edges}
              layoutVersion={layoutVersion}
              isDark={isDark}
              onNodeClick={handleNodeClick}
              onNodesChange={handleNodesChange}
              onReconnect={handleReconnect}
              onConnect={handleConnect}
              onEdgesChange={handleEdgesChange}
              onCreateNode={handleCreateNode}
              onExportJson={handleExportJson}
              onSpacingIncrease={() => handleSpacingChange(SPACING_STEP)}
              onSpacingDecrease={() => handleSpacingChange(-SPACING_STEP)}
            />
            {selectedNode && (
              <DetailPanel
                node={selectedNode}
                intent={parsedDataRef.current?.list.find(i => i.id === selectedNode.id) ?? null}
                onApply={handleApplyEdit}
                onDelete={deleteNode}
                onClose={handleClosePanel}
              />
            )}
          </>
        ) : (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-3 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
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
              <p className={`text-sm font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nenhum fluxo carregado</p>
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Cole o JSON no painel e clique em Gerar Fluxo</p>
            </div>
          </div>
        )}
      </main>
    </div>
    </ThemeContext.Provider>
  )
}
