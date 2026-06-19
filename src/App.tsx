import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { reconnectEdge, applyEdgeChanges, applyNodeChanges, type Connection, type Node, type Edge, type EdgeChange, type NodeChange, type XYPosition } from '@xyflow/react'
import { FlowCanvas }    from './components/FlowCanvas'
import { Sidebar, type ExportFormat } from './components/Sidebar'
import { ImportDialog }  from './components/ImportDialog'
import { NewFlowDialog } from './components/NewFlowDialog'
import { PushDialog }    from './components/PushDialog'
import { RestoreDialog } from './components/RestoreDialog'
import { DetailPanel }   from './components/DetailPanel'
import { Toast, type Notice } from './components/Toast'
import { ThemeToggle }   from './components/ThemeToggle'
import { ThemeContext }  from './contexts/ThemeContext'
import { TeamsContext, type TeamsStatus } from './contexts/TeamsContext'
import { fetchStoreTeams, type Team } from './utils/teams'
import { fetchStoreCollections, type Collection } from './utils/collections'
import { uploadMedia, type UploadMediaType } from './utils/uploadMedia'
import type { FetchLike } from './utils/pushFlow'
import { parseFlow, intentToNodeData, buildEdges } from './utils/parseFlow'
import { applyEdgeReconnect, applyConnect, applyEdgeDelete, applyNodeDelete, serializeFlow } from './utils/editFlow'
import { createIntentTemplate, createStartIntent, type CreatableKind } from './utils/intentTemplates'
import { addCondition, collectCategories } from './utils/editIntent'
import { cloneIntent, duplicateConditionInIntent, intentFromCondition } from './utils/duplicate'
import { validateFlow } from './utils/validateFlow'
import { exportFlowImage } from './utils/exportImage'
import { FlowHistory, takeSnapshot, type FlowSnapshot } from './utils/history'
import type { BotFlowJson, FlowNodeData } from './types'
import pkg from '../package.json'

const SPACING_STEP = 60
const SPACING_MIN  = 20
const SPACING_MAX  = 600
/** Esmeralda do destaque de duplicação (nó + arestas). Cor de "novo" do app. */
const HIGHLIGHT_COLOR = '#10b981'

/** ID da intenção a partir do ID de um nó: filhos de grupo são `{id}::c{idx}`. */
function intentIdOf(nodeId: string): string {
  return nodeId.replace(/::c\d+$/, '')
}

/** O `fetch` do navegador adaptado à assinatura mínima dos módulos de API. */
const browserFetch: FetchLike = (url, init) => fetch(url, init)

/** botId do fluxo: o da intenção de início (canônico) ou o da primeira intenção. */
function botIdOf(model: BotFlowJson | null): string {
  if (!model) return ''
  return model.list.find(i => i.category === 'start')?.botId ?? model.list[0]?.botId ?? ''
}

export default function App() {
  const [isDark, setIsDark]             = useState(() => document.documentElement.classList.contains('dark'))
  const [nodes, setNodes]               = useState<Node<FlowNodeData>[]>([])
  const [edges, setEdges]               = useState<Edge[]>([])
  const [notice, setNotice]             = useState<Notice | null>(null)
  const [hasFlow, setHasFlow]           = useState(false)
  const [importOpen, setImportOpen]     = useState(false)
  const [newFlowOpen, setNewFlowOpen]   = useState(false)
  const [pushOpen, setPushOpen]         = useState(false)
  const [restoreOpen, setRestoreOpen]   = useState(false)
  const [exporting, setExporting]       = useState(false)
  const [selectedNode, setSelectedNode] = useState<Node<FlowNodeData> | null>(null)
  // Categorias conhecidas na sessão. Acumula toda categoria criada/editada para
  // ficar disponível em outras intenções antes do push (a plataforma faz isso
  // gravando a cada save; aqui só gravamos no fim, então guardamos localmente).
  const [knownCategories, setKnownCategories] = useState<string[]>([])
  // Token de sessão da OmniChat — GLOBAL e só em memória (nunca salvo/logado).
  // Fonte única reaproveitada por push, restore E carregamento dos times (@team).
  const [sessionToken, setSessionToken] = useState('')
  // Popover do token na barra — controlado pelo App para o picker poder abri-lo
  // (aviso "Insira o token da sessão") e fechá-lo sozinho após colar.
  const [tokenOpen, setTokenOpen] = useState(false)
  // Times da loja (variável @team) — carregados sob demanda pelo picker.
  const [teams, setTeams]               = useState<Team[]>([])
  const [teamsStatus, setTeamsStatus]   = useState<TeamsStatus>('idle')
  const [teamsError, setTeamsError]     = useState<string | null>(null)
  // Coleções da loja (resposta COLLECTION) — carregadas sob demanda pelo picker.
  const [collections, setCollections]             = useState<Collection[]>([])
  const [collectionsStatus, setCollectionsStatus] = useState<TeamsStatus>('idle')
  const [collectionsError, setCollectionsError]   = useState<string | null>(null)
  // IDs de nó com destaque "duplicando / recém-duplicado" (borda esmeralda animada).
  // Estado transitório de UI — nunca entra no modelo nem no histórico.
  const [highlightIds, setHighlightIds] = useState<Set<string>>(() => new Set())
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
    setHighlightIds(new Set())
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

  /**
   * Nós/arestas exibidos com o destaque de duplicação aplicado. Derivados (não
   * mutam o estado real): nós destacados ganham a classe `fluxo-dup` (marching
   * ants esmeralda) e as arestas das intenções destacadas ficam animadas/esmeralda.
   * Caso comum (nada destacado) retorna os arrays originais — custo zero.
   */
  const displayNodes = useMemo(() => {
    if (highlightIds.size === 0) return nodes
    return nodes.map(n => highlightIds.has(n.id)
      ? { ...n, className: `${n.className ?? ''} fluxo-dup`.trim() }
      : n)
  }, [nodes, highlightIds])

  const displayEdges = useMemo(() => {
    if (highlightIds.size === 0) return edges
    const intentIds = new Set([...highlightIds].map(intentIdOf))
    return edges.map(e =>
      intentIds.has(intentIdOf(e.source)) || intentIds.has(intentIdOf(e.target))
        ? { ...e, animated: true, style: { ...e.style, stroke: HIGHLIGHT_COLOR } }
        : e)
  }, [edges, highlightIds])

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
    setKnownCategories(collectCategories(data.list))
    const result = parseFlow(data, spacingRef.current)
    setNodes(result.nodes)
    setEdges(result.edges)
    setNotice(null)
    setHasFlow(true)
    setSelectedNode(null)
    setHighlightIds(new Set())
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
    // Re-parseia preservando posições em vez de filtrar só o id exato: no Modelo B
    // uma intenção agrupada tem nós-filhos `{id}::c{idx}` que ficariam órfãos no
    // canvas se removêssemos apenas o container. Com a intenção fora do modelo, o
    // parseFlow não emite o grupo nem os filhos — as condições somem junto.
    const parsed = parseFlow(model, spacingRef.current)
    const posById = new Map(nodesRef.current.map(n => [n.id, n.position]))
    setNodes(parsed.nodes.map(n => { const p = posById.get(n.id); return p ? { ...n, position: p } : n }))
    setEdges(parsed.edges)
    setSelectedNode(prev => prev ? (parsed.nodes.find(n => n.id === prev.id) ?? null) : null)
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

  /** Remove uma conexão pelo botão "×" da aresta — mesmo caminho do Delete. */
  const handleDeleteEdge = useCallback((edgeId: string) => {
    handleEdgesChange([{ type: 'remove', id: edgeId }])
  }, [handleEdgesChange])

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
   * Funde um tipo da paleta numa intenção existente: arrastar e soltar um tipo
   * SOBRE um nó-intenção adiciona-o como NOVA condição daquela intenção (em vez
   * de criar um nó solto). Uma intenção com 2+ condições vira um grupo no canvas.
   * Re-parseia preservando posições — a intenção pode passar de solo para grupo.
   */
  const handleAddConditionToNode = useCallback((intentId: string, kind: CreatableKind) => {
    const model = parsedDataRef.current
    if (!model) return
    const intent = model.list.find(i => i.id === intentId)
    if (!intent || intent.category === 'start') return  // start nunca agrupa
    const snapshot = takeSnap()
    const result = addCondition(intent, kind)
    if (!result.ok) {
      fail(`Não foi possível adicionar a condição: ${result.reason}.`)
      return
    }
    if (snapshot) historyRef.current.push(snapshot)
    const parsed = parseFlow(model, spacingRef.current)
    const posById = new Map(nodesRef.current.map(n => [n.id, n.position]))
    setNodes(parsed.nodes.map(n => { const p = posById.get(n.id); return p ? { ...n, position: p } : n }))
    setEdges(parsed.edges)
    setNotice(null)
    bumpModel()
  }, [bumpModel, takeSnap, fail])

  /**
   * Duplica uma intenção inteira pelo botão "Duplicar intenção" do painel. A cópia
   * nasce com offset a partir do original e já **destacada** (perde o destaque na 1ª
   * interação). O nó de início nunca é duplicado.
   */
  const handleDuplicateIntent = useCallback((intentId: string) => {
    const model = parsedDataRef.current
    if (!model) return
    const intent = model.list.find(i => i.id === intentId)
    if (!intent || intent.category === 'start') return
    const snapshot = takeSnap()
    const copy = cloneIntent(intent, model.list)
    if (snapshot) historyRef.current.push(snapshot)
    model.list.push(copy)
    const parsed = parseFlow(model, spacingRef.current)
    const posById = new Map(nodesRef.current.map(n => [n.id, n.position]))
    const base = posById.get(intentId) ?? { x: 0, y: 0 }
    const target = { x: base.x + 40, y: base.y + 40 }
    setNodes(parsed.nodes.map(n => {
      if (n.id === copy.id) return { ...n, position: target }
      const p = posById.get(n.id)
      return p ? { ...n, position: p } : n
    }))
    setEdges(parsed.edges)
    setHighlightIds(new Set([copy.id]))
    setNotice(null)
    bumpModel()
  }, [bumpModel, takeSnap])

  /**
   * Início do Ctrl+arrastar: a cópia nasce JÁ no começo do gesto, para aparecer e
   * se mover junto. Em vez de re-parsear tudo (trocaria os objetos dos nós e poderia
   * cancelar o arraste do original em curso), **anexa** apenas os nós/arestas da
   * cópia, posicionando-a sobre o original. Destaca os dois (esmeralda animado).
   * Devolve o ID da cópia para o FlowCanvas finalizar no `dragStop`, ou null.
   */
  const handleDuplicateStart = useCallback((intentId: string): string | null => {
    const model = parsedDataRef.current
    if (!model) return null
    const intent = model.list.find(i => i.id === intentId)
    if (!intent || intent.category === 'start') return null
    const snapshot = takeSnap()
    const copy = cloneIntent(intent, model.list)
    if (snapshot) historyRef.current.push(snapshot)
    model.list.push(copy)
    const parsed = parseFlow(model, spacingRef.current)
    const originPos = nodesRef.current.find(n => n.id === intentId)?.position ?? { x: 0, y: 0 }
    const copyNodes = parsed.nodes
      .filter(n => intentIdOf(n.id) === copy.id)
      .map(n => n.id === copy.id ? { ...n, position: originPos } : n)
    const copyEdges = parsed.edges.filter(e => intentIdOf(e.source) === copy.id || intentIdOf(e.target) === copy.id)
    setNodes(curr => [...curr, ...copyNodes])
    setEdges(curr => [...curr, ...copyEdges])
    setHighlightIds(new Set([intentId, copy.id]))
    setNotice(null)
    bumpModel()
    return copy.id
  }, [bumpModel, takeSnap])

  /**
   * Fim do Ctrl+arrastar: a cópia vai para onde foi solta e o original volta ao
   * ponto inicial (as arestas de ENTRADA pertencem ao original, então quem foi
   * solto no destino é a cópia, sem entradas). Limpa o destaque. Sem novo snapshot
   * (já empilhado no start) nem re-parse.
   */
  const handleDuplicateFinish = useCallback((originalId: string, copyId: string, dropPos: XYPosition, startPos: XYPosition) => {
    setNodes(curr => curr.map(n => {
      if (n.id === copyId) return { ...n, position: dropPos }
      if (n.id === originalId) return { ...n, position: startPos }
      return n
    }))
    setHighlightIds(new Set())
  }, [])

  /** Remove o destaque de duplicação de um nó (1º clique/arraste dele). */
  const handleClearHighlight = useCallback((nodeId: string) => {
    setHighlightIds(prev => {
      if (!prev.has(nodeId)) return prev
      const next = new Set(prev)
      next.delete(nodeId)
      return next
    })
  }, [])

  /**
   * Duplica UMA condição dentro da MESMA intenção (botão "Duplicar dentro da
   * intenção"). Numa intenção de 1 condição (nó solto), isso a transforma em grupo.
   * Re-parseia preservando posições (a estrutura solto↔grupo pode mudar).
   */
  const handleDuplicateConditionInIntent = useCallback((intentId: string, condIdx: number) => {
    const model = parsedDataRef.current
    if (!model) return
    const intent = model.list.find(i => i.id === intentId)
    if (!intent || intent.category === 'start') return
    const snapshot = takeSnap()
    const result = duplicateConditionInIntent(intent, condIdx)
    if (!result.ok) {
      fail(`Não foi possível duplicar: ${result.reason}.`)
      return
    }
    if (snapshot) historyRef.current.push(snapshot)
    const newCondIdx = intent.conditions.length - 1
    const parsed = parseFlow(model, spacingRef.current)
    const posById = new Map(nodesRef.current.map(n => [n.id, n.position]))
    setNodes(parsed.nodes.map(n => { const p = posById.get(n.id); return p ? { ...n, position: p } : n }))
    setEdges(parsed.edges)
    setSelectedNode(prev => prev ? (parsed.nodes.find(n => n.id === prev.id) ?? null) : prev)
    setHighlightIds(new Set([`${intentId}::c${newCondIdx}`]))
    setNotice(null)
    bumpModel()
  }, [bumpModel, takeSnap, fail])

  /**
   * Extrai UMA condição-filha para uma intenção NOVA (botão "Duplicar fora da
   * intenção"). A meta é herdada da intenção de origem; a cópia ganha ID/nome novos
   * e é posicionada com offset a partir do grupo de origem.
   */
  const handleDuplicateConditionOutside = useCallback((intentId: string, condIdx: number) => {
    const model = parsedDataRef.current
    if (!model) return
    const intent = model.list.find(i => i.id === intentId)
    if (!intent || intent.category === 'start') return
    const copy = intentFromCondition(intent, condIdx, model.list)
    if (!copy) {
      fail('Não foi possível duplicar: condição não encontrada.')
      return
    }
    const snapshot = takeSnap()
    if (snapshot) historyRef.current.push(snapshot)
    model.list.push(copy)
    const parsed = parseFlow(model, spacingRef.current)
    const posById = new Map(nodesRef.current.map(n => [n.id, n.position]))
    const base = posById.get(intentId) ?? { x: 0, y: 0 }
    const target = { x: base.x + 40, y: base.y + 80 }
    setNodes(parsed.nodes.map(n => {
      if (n.id === copy.id) return { ...n, position: target }
      const p = posById.get(n.id)
      return p ? { ...n, position: p } : n
    }))
    setEdges(parsed.edges)
    setHighlightIds(new Set([copy.id]))
    setNotice(null)
    bumpModel()
  }, [bumpModel, takeSnap, fail])

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
   * Pós-edição: re-parseia o fluxo preservando as posições dos nós que já
   * existiam. No Modelo B uma edição pode mudar a estrutura (tipo do nó-filho,
   * número de condições, grupo↔solo), então rebuildar só um nó não basta —
   * re-parsear é robusto e o merge de posições evita o relayout indesejado.
   */
  const handleApplyEdit = useCallback((intentId: string) => {
    const model = parsedDataRef.current
    if (!model) return
    if (!model.list.some(i => i.id === intentId)) return
    if (applySnapRef.current) {
      historyRef.current.push(applySnapRef.current)
      applySnapRef.current = null
    }
    const result = parseFlow(model, spacingRef.current)
    const posById = new Map(nodesRef.current.map(n => [n.id, n.position]))
    const merged = result.nodes.map(n => {
      const pos = posById.get(n.id)
      return pos ? { ...n, position: pos } : n
    })
    setNodes(merged)
    setEdges(result.edges)
    // Reaponta o nó selecionado para a sua versão reconstruída (mesmo id).
    setSelectedNode(prev => prev ? (merged.find(n => n.id === prev.id) ?? null) : prev)
    setNotice(null)
    // Acumula categorias recém-criadas/editadas para reuso nas demais intenções.
    setKnownCategories(prev => {
      const merged = new Set(prev)
      for (const category of collectCategories(model.list)) merged.add(category)
      return merged.size === prev.length ? prev : [...merged]
    })
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
    handleClearHighlight(node.id)
    setSelectedNode(prev => prev?.id === node.id ? null : node)
  }, [handleClearHighlight])

  const handleClosePanel = useCallback(() => setSelectedNode(null), [])

  // Trocar o token (outra conta) invalida os times E as coleções já carregados.
  useEffect(() => {
    setTeams([])
    setTeamsStatus('idle')
    setTeamsError(null)
    setCollections([])
    setCollectionsStatus('idle')
    setCollectionsError(null)
  }, [sessionToken])

  // Carrega os times da loja sob demanda (picker @team). Usa o token global e o
  // botId do fluxo; o ref evita disparos concorrentes. NUNCA loga o token.
  const teamsLoadingRef = useRef(false)
  const loadTeams = useCallback(async () => {
    if (teamsLoadingRef.current) return
    const token = sessionToken.trim()
    const botId = botIdOf(parsedDataRef.current)
    if (!token) {
      setTeamsStatus('error')
      setTeamsError('Defina o token de sessão (botão de chave na barra) para carregar os times.')
      return
    }
    if (!botId) {
      setTeamsStatus('error')
      setTeamsError('Fluxo sem botId — não dá para descobrir a loja.')
      return
    }
    teamsLoadingRef.current = true
    setTeamsStatus('loading')
    setTeamsError(null)
    try {
      const list = await fetchStoreTeams({ fetch: browserFetch, token, botId })
      setTeams(list)
      setTeamsStatus('loaded')
    } catch (e) {
      setTeamsStatus('error')
      setTeamsError(e instanceof Error ? e.message : 'Falha ao carregar os times.')
    } finally {
      teamsLoadingRef.current = false
    }
  }, [sessionToken])

  const teamsById = useMemo(() => new Map(teams.map(t => [t.objectId, t.name])), [teams])

  // Carrega as coleções da loja sob demanda (picker da resposta COLLECTION). Mesmo
  // padrão do loadTeams: token global + botId do fluxo, ref anti-concorrência, sem
  // logar o token. `search` filtra por nome (regex no servidor).
  const collectionsLoadingRef = useRef(false)
  const loadCollections = useCallback(async (search?: string) => {
    if (collectionsLoadingRef.current) return
    const token = sessionToken.trim()
    const botId = botIdOf(parsedDataRef.current)
    if (!token) {
      setCollectionsStatus('error')
      setCollectionsError('Defina o token de sessão (botão de chave na barra) para carregar as coleções.')
      return
    }
    if (!botId) {
      setCollectionsStatus('error')
      setCollectionsError('Fluxo sem botId — não dá para descobrir a loja.')
      return
    }
    collectionsLoadingRef.current = true
    setCollectionsStatus('loading')
    setCollectionsError(null)
    try {
      const list = await fetchStoreCollections({ fetch: browserFetch, token, botId, search })
      setCollections(list)
      setCollectionsStatus('loaded')
    } catch (e) {
      setCollectionsStatus('error')
      setCollectionsError(e instanceof Error ? e.message : 'Falha ao carregar as coleções.')
    } finally {
      collectionsLoadingRef.current = false
    }
  }, [sessionToken])

  const collectionsById = useMemo(() => new Map(collections.map(c => [c.objectId, c])), [collections])
  const requestToken = useCallback(() => setTokenOpen(true), [])
  const hasToken = !!sessionToken.trim()
  const uploadFile = useCallback(async (file: File, type: UploadMediaType) => {
    const token = sessionToken.trim()
    if (!token) throw new Error('Sem token de sessão — defina o token de sessão para fazer upload.')
    return uploadMedia(file, type, token)
  }, [sessionToken])
  const teamsValue = useMemo(
    () => ({
      teams, status: teamsStatus, error: teamsError, loadTeams, hasToken, requestToken, byId: teamsById, uploadFile,
      collections, collectionsStatus, collectionsError, loadCollections, collectionsById,
    }),
    [
      teams, teamsStatus, teamsError, loadTeams, hasToken, requestToken, teamsById, uploadFile,
      collections, collectionsStatus, collectionsError, loadCollections, collectionsById,
    ],
  )

  return (
    <ThemeContext.Provider value={isDark}>
    <TeamsContext.Provider value={teamsValue}>
    <div className={`flex h-screen transition-colors duration-200 ${isDark ? 'bg-slate-950' : 'bg-slate-100'}`}>
      <Sidebar
        version={pkg.version}
        report={report}
        hasFlow={hasFlow}
        exporting={exporting}
        sessionToken={sessionToken}
        onSessionTokenChange={setSessionToken}
        tokenOpen={tokenOpen}
        onTokenOpenChange={setTokenOpen}
        canUndo={hasFlow && historyRef.current.canUndo}
        canRedo={hasFlow && historyRef.current.canRedo}
        canPush={hasFlow && !!report && report.errors.length === 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        themeToggle={<ThemeToggle isDark={isDark} onToggle={toggleTheme} />}
        onImport={() => setImportOpen(true)}
        onNewFlow={() => setNewFlowOpen(true)}
        onExport={handleExport}
        onPush={() => setPushOpen(true)}
        onRestore={() => setRestoreOpen(true)}
        onSpacingIncrease={() => handleSpacingChange(SPACING_STEP)}
        onSpacingDecrease={() => handleSpacingChange(-SPACING_STEP)}
      />

      <main className="flex-1 relative overflow-hidden min-w-0">
        {hasFlow ? (
          <>
            <FlowCanvas
              nodes={displayNodes}
              edges={displayEdges}
              layoutVersion={layoutVersion}
              isDark={isDark}
              onNodeClick={handleNodeClick}
              onNodesChange={handleNodesChange}
              onReconnect={handleReconnect}
              onConnect={handleConnect}
              onEdgesChange={handleEdgesChange}
              onCreateNode={handleCreateNode}
              onAddConditionToNode={handleAddConditionToNode}
              onDuplicateStart={handleDuplicateStart}
              onDuplicateFinish={handleDuplicateFinish}
              onClearHighlight={handleClearHighlight}
              onDeleteEdge={handleDeleteEdge}
            />
            {selectedNode && (
              <DetailPanel
                node={selectedNode}
                intent={parsedDataRef.current?.list.find(i => i.id === intentIdOf(selectedNode.id)) ?? null}
                intents={parsedDataRef.current?.list ?? []}
                categories={knownCategories}
                onBeforeApply={handleBeforeApply}
                onApply={handleApplyEdit}
                onApplyFailed={handleApplyFailed}
                onDelete={deleteNode}
                onDuplicateIntent={handleDuplicateIntent}
                onDuplicateConditionInIntent={handleDuplicateConditionInIntent}
                onDuplicateConditionOutside={handleDuplicateConditionOutside}
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
              className="py-2 px-4 text-xs font-semibold text-slate-900 bg-amber-400 rounded-lg hover:bg-amber-500 transition-colors"
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

      {pushOpen && parsedDataRef.current && report && (
        <PushDialog
          model={parsedDataRef.current}
          report={report}
          token={sessionToken}
          onTokenChange={setSessionToken}
          onClose={() => setPushOpen(false)}
        />
      )}

      {restoreOpen && (
        <RestoreDialog
          token={sessionToken}
          onTokenChange={setSessionToken}
          onClose={() => setRestoreOpen(false)}
        />
      )}
    </div>
    </TeamsContext.Provider>
    </ThemeContext.Provider>
  )
}
