import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { reconnectEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Node, type Edge, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import { FlowCanvas }    from './components/FlowCanvas'
import { TopBar, type ExportFormat } from './components/TopBar'
import { ImportDialog }  from './components/ImportDialog'
import { NewFlowDialog } from './components/NewFlowDialog'
import { DetailPanel }   from './components/DetailPanel'
import { Toast, type Notice } from './components/Toast'
import { ThemeToggle }   from './components/ThemeToggle'
import { ThemeContext }  from './contexts/ThemeContext'
import { parseFlow, intentToNodeData, buildEdges } from './utils/parseFlow'
import { applyEdgeReconnect, applyConnect, applyEdgeDelete, applyNodeDelete, serializeFlow } from './utils/editFlow'
import { createIntentTemplate, createStartIntent, type CreatableKind } from './utils/intentTemplates'
import { validateFlow } from './utils/validateFlow'
import { exportFlowImage } from './utils/exportImage'
import { FlowHistory, takeSnapshot, type FlowSnapshot } from './utils/history'
import type { BotFlowJson, FlowNodeData } from './types'
import pkg from '../package.json'

const SPACING_STEP = 60
const SPACING_MIN  = 20
const SPACING_MAX  = 600

export default function App() {
  const [isDark, setIsDark]             = useState(() => document.documentElement.classList.contains('dark'))
  const [nodes, setNodes]               = useState<Node<FlowNodeData>[]>([])
  const [edges, setEdges]               = useState<Edge[]>([])
  const [notice, setNotice]             = useState<Notice | null>(null)
  const [hasFlow, setHasFlow]           = useState(false)
  const [importOpen, setImportOpen]     = useState(false)
  const [newFlowOpen, setNewFlowOpen]   = useState(false)
  const [exporting, setExporting]       = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)
  const [layoutVersion, setLayoutVersion] = useState(0)
  const [modelVersion, setModelVersion]   = useState(0)
  const parsedDataRef                   = useRef<BotFlowJson | null>(null)
  const spacingRef                      = useRef({ ranksep: 60, nodesep: 40 })
  const historyRef                      = useRef(new FlowHistory())
  const applySnapRef                    = useRef<FlowSnapshot | null>(null)
  // Espelhos do estado para capturar snapshots dentro de callbacks estáveis
  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  useEffect(() => { nodesRef.current = nodes }, [nodes])
  useEffect(() => { edgesRef.current = edges }, [edges])

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
  const bumpModel   = useCallback(() => setModelVersion(v => v + 1), [])

  /** Snapshot do estado atual (modelo + nós + arestas) para o histórico. */
  const takeSnap = useCallback((): FlowSnapshot | null => {
    return parsedDataRef.current
      ? takeSnapshot(parsedDataRef.current, nodesRef.current, edgesRef.current)
      : null
  }, [])

  /** Restaura um snapshot (undo/redo ou rollback de edição parcial). */
  const restoreSnap = useCallback((snapshot: FlowSnapshot) => {
    parsedDataRef.current = snapshot.model
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    setSelectedNode(null)
    setNotice(null)
    setModelVersion(v => v + 1)
  }, [])

  const handleUndo = useCallback(() => {
    const current = takeSnap()
    if (!current) return
    const snapshot = historyRef.current.undo(current)
    if (snapshot) restoreSnap(snapshot)
  }, [takeSnap, restoreSnap])

  const handleRedo = useCallback(() => {
    const current = takeSnap()
    if (!current) return
    const snapshot = historyRef.current.redo(current)
    if (snapshot) restoreSnap(snapshot)
  }, [takeSnap, restoreSnap])

  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y — ignorados quando o foco está num campo
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.altKey) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) handleRedo()
        else handleUndo()
      } else if (e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [handleUndo, handleRedo])

  /** Relatório de validação vivo, recalculado a cada mutação do modelo. */
  const report = useMemo(
    () => hasFlow && parsedDataRef.current ? validateFlow(parsedDataRef.current) : null,
    [hasFlow, modelVersion],
  )

  const fail = useCallback((text: string) => setNotice({ level: 'error', text }), [])

  /**
   * Importa o JSON colado/carregado no modal. Retorna a mensagem de erro
   * (exibida no próprio modal) ou null em caso de sucesso.
   */
  function generateFromText(text: string): string | null {
    if (!text.trim()) return 'Cole ou importe um JSON antes de gerar o fluxo.'
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      return 'JSON inválido. Verifique a sintaxe e tente novamente.'
    }
    const data = parsed as BotFlowJson
    if (!data?.list || !Array.isArray(data.list)) {
      return 'O JSON deve conter uma propriedade "list" com o array de intents.'
    }
    if (data.list.length === 0) return 'A lista de intents está vazia.'
    try {
      loadModel(data)
      return null
    } catch (e) {
      return `Erro ao processar o fluxo: ${e instanceof Error ? e.message : 'desconhecido'}`
    }
  }

  /** Carrega um modelo no editor (importação ou fluxo novo). */
  function loadModel(data: BotFlowJson) {
    historyRef.current.clear()
    parsedDataRef.current = data
    const result = parseFlow(data, spacingRef.current)
    setNodes(result.nodes)
    setEdges(result.edges)
    setNotice(null)
    setHasFlow(true)
    setSelectedNode(null)
    setImportOpen(false)
    setNewFlowOpen(false)
    setLayoutVersion(v => v + 1)
    bumpModel()
  }

  /** Cria um fluxo do zero com a intenção de início canônica do botId informado. */
  function handleCreateFlow(botId: string) {
    loadModel({ list: [createStartIntent(botId)] })
    setNotice({ level: 'success', text: 'Fluxo criado. Arraste tipos da paleta para adicionar intenções.' })
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

  /** Exclui a intenção do modelo (com limpeza de referências) e some com o nó. */
  const deleteNode = useCallback((nodeId: string) => {
    const model = parsedDataRef.current
    if (!model) return false
    const snapshot = takeSnap()
    const result = applyNodeDelete(model, nodeId)
    if (!result.ok) {
      fail(`Não foi possível excluir: ${result.reason}.`)
      return false
    }
    if (snapshot) historyRef.current.push(snapshot)
    setNodes(ns => ns.filter(n => n.id !== nodeId))
    setEdges(buildEdges(model).edges)
    setSelectedNode(prev => prev?.id === nodeId ? null : prev)
    setNotice(null)
    bumpModel()
    return true
  }, [fail, bumpModel, takeSnap])

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
   * Reconecta o destino de uma aresta: aplica o patch no modelo (fonte de
   * verdade para exportação) e, só se ele for válido, atualiza o canvas.
   * O ID da aresta é preservado porque codifica a posição no modelo.
   */
  const handleReconnect = useCallback((oldEdge: Edge, connection: Connection) => {
    const model = parsedDataRef.current
    if (!model) return
    const snapshot = takeSnap()
    const result = applyEdgeReconnect(model, oldEdge.id, oldEdge.target, connection.target)
    if (!result.ok) {
      fail(`Não foi possível reconectar: ${result.reason}.`)
      return
    }
    if (snapshot) historyRef.current.push(snapshot)
    setEdges(eds => reconnectEdge(oldEdge, connection, eds, { shouldReplaceId: false }))
    setNotice(null)
    bumpModel()
  }, [fail, bumpModel, takeSnap])

  /**
   * Conecta dois nós: preenche o primeiro slot de escolha vazio ou o next da
   * primeira condição livre, e reconstrói as arestas do modelo.
   */
  const handleConnect = useCallback((connection: Connection) => {
    const model = parsedDataRef.current
    if (!model || !connection.source || !connection.target) return
    const snapshot = takeSnap()
    const result = applyConnect(model, connection.source, connection.target)
    if (!result.ok) {
      fail(`Não foi possível conectar: ${result.reason}.`)
      return
    }
    if (snapshot) historyRef.current.push(snapshot)
    setEdges(buildEdges(model).edges)
    setNotice(null)
    bumpModel()
  }, [fail, bumpModel, takeSnap])

  /**
   * Mudanças de aresta vindas do canvas: seleção é aplicada direto; remoção
   * (Delete/Backspace) só é aplicada se o patch no modelo for válido.
   */
  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    const model = parsedDataRef.current
    const allowed: EdgeChange[] = []
    const snapshot = changes.some(c => c.type === 'remove') ? takeSnap() : null
    let removed = false
    for (const change of changes) {
      if (change.type !== 'remove') {
        allowed.push(change)
        continue
      }
      if (!model) continue
      const result = applyEdgeDelete(model, change.id)
      if (result.ok) {
        allowed.push(change)
        removed = true
        setNotice(null)
      } else {
        fail(`Não foi possível excluir: ${result.reason}.`)
      }
    }
    if (removed && snapshot) historyRef.current.push(snapshot)
    if (allowed.length) setEdges(eds => applyEdgeChanges(allowed, eds))
    if (removed) bumpModel()
  }, [fail, bumpModel, takeSnap])

  /** Cria uma intenção nova (template canônico) na posição do drop da paleta. */
  const handleCreateNode = useCallback((kind: CreatableKind, position: XYPosition) => {
    const model = parsedDataRef.current
    if (!model) return
    const botId = model.list.find(i => i.category === 'start')?.botId ?? model.list[0]?.botId ?? ''
    const count = model.list.filter(i => i.name.startsWith('nova_intencao')).length
    const intent = createIntentTemplate(kind, botId, `nova_intencao_${count + 1}`)
    const snapshot = takeSnap()
    if (snapshot) historyRef.current.push(snapshot)
    model.list.push(intent)
    setNodes(ns => [...ns, {
      id: intent.id,
      type: kind,
      position,
      data: intentToNodeData(intent),
    }])
    setNotice(null)
    bumpModel()
  }, [bumpModel, takeSnap])

  /**
   * Captura o estado pré-edição: o DetailPanel muta o intent diretamente, então
   * o snapshot precisa ser tirado antes do primeiro patch.
   */
  const handleBeforeApply = useCallback(() => {
    applySnapRef.current = takeSnap()
  }, [takeSnap])

  /**
   * Rollback de edição parcial: se um patch do meio falhar, restaura o estado
   * pré-edição para o modelo não ficar meio-aplicado.
   */
  const handleApplyFailed = useCallback(() => {
    if (applySnapRef.current) {
      const { model } = applySnapRef.current
      parsedDataRef.current = model
      setNodes(applySnapRef.current.nodes)
      setEdges(applySnapRef.current.edges)
      setModelVersion(v => v + 1)
      applySnapRef.current = null
    }
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
    if (applySnapRef.current) {
      historyRef.current.push(applySnapRef.current)
      applySnapRef.current = null
    }
    const data = intentToNodeData(intent)
    setNodes(ns => ns.map(n => n.id === intentId ? { ...n, data } : n))
    setEdges(buildEdges(model).edges)
    setSelectedNode(prev => prev && prev.id === intentId ? { ...prev, data } : prev)
    setNotice(null)
    bumpModel()
  }, [bumpModel])

  function exportJson(model: BotFlowJson) {
    const validation = validateFlow(model)
    if (validation.errors.length) {
      const extra = validation.errors.length > 1 ? ` (+${validation.errors.length - 1} erro(s))` : ''
      fail(`Export bloqueado — ${validation.errors[0]}${extra}.`)
      return
    }
    if (validation.warnings.length) {
      const extra = validation.warnings.length > 1 ? ` (+${validation.warnings.length - 1} aviso(s))` : ''
      setNotice({ level: 'warning', text: `Exportado com aviso: ${validation.warnings[0]}${extra}.` })
    } else {
      setNotice({ level: 'success', text: 'JSON exportado.' })
    }
    const blob = new Blob([serializeFlow(model)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.download = 'fluxo.json'
    a.href = url
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleExport(format: ExportFormat) {
    const model = parsedDataRef.current
    if (!model) return
    if (format === 'json') {
      exportJson(model)
      return
    }
    setExporting(true)
    try {
      await exportFlowImage(nodes, format)
    } catch (err) {
      console.error('Erro ao exportar imagem:', err)
      fail('Não foi possível exportar a imagem.')
    } finally {
      setExporting(false)
    }
  }

  const handleNodeClick = useCallback((node: Node<FlowNodeData>) => {
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [])

  const handleClosePanel = useCallback(() => setSelectedNode(null), [])

  return (
    <ThemeContext.Provider value={isDark}>
    <div className={`flex flex-col h-screen transition-colors duration-200 ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
      <TopBar
        version={pkg.version}
        hasFlow={hasFlow}
        report={report}
        exporting={exporting}
        canUndo={hasFlow && historyRef.current.canUndo}
        canRedo={hasFlow && historyRef.current.canRedo}
        onUndo={handleUndo}
        onRedo={handleRedo}
        themeToggle={<ThemeToggle isDark={isDark} onToggle={toggleTheme} />}
        onImport={() => setImportOpen(true)}
        onNewFlow={() => setNewFlowOpen(true)}
        onExport={handleExport}
      />

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
              onSpacingIncrease={() => handleSpacingChange(SPACING_STEP)}
              onSpacingDecrease={() => handleSpacingChange(-SPACING_STEP)}
            />
            {selectedNode && (
              <DetailPanel
                node={selectedNode}
                intent={parsedDataRef.current?.list.find(i => i.id === selectedNode.id) ?? null}
                onBeforeApply={handleBeforeApply}
                onApply={handleApplyEdit}
                onApplyFailed={handleApplyFailed}
                onDelete={deleteNode}
                onClose={handleClosePanel}
              />
            )}
          </>
        ) : (
          <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
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
              <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Importe o JSON do bot para visualizar e editar o fluxo</p>
            </div>
            <button
              onClick={() => setImportOpen(true)}
              className="py-2 px-4 text-xs font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Importar JSON
            </button>
          </div>
        )}

        {notice && <Toast notice={notice} onDismiss={() => setNotice(null)} />}
      </main>

      {importOpen && (
        <ImportDialog
          hasFlow={hasFlow}
          onGenerate={generateFromText}
          onClose={() => setImportOpen(false)}
        />
      )}

      {newFlowOpen && (
        <NewFlowDialog
          hasFlow={hasFlow}
          onCreate={handleCreateFlow}
          onClose={() => setNewFlowOpen(false)}
        />
      )}
    </div>
    </ThemeContext.Provider>
  )
}
