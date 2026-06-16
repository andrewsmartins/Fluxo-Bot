import { useState, useEffect, useCallback } from 'react'
import type { Node } from '@xyflow/react'
import type { BotIntent, BulkUpdateItem, FlowNodeData, NodeKind } from '../types'
import { useTheme } from '../contexts/ThemeContext'
import { PRIORITY_LABELS, CONDITION_TYPE_LABELS } from '../utils/nodeMeta'
import {
  listMessages, updateMessageText, addTextMessage, removeMessage,
  updateButton, addButton, removeButton, addButtonsMessage,
  updateCondition, addCondition, removeCondition,
  updateIntentMeta, updateActionFields, updateSetDataItems,
  type EditableMessage, type MessageRef,
} from '../utils/editIntent'
import type { EditResult } from '../utils/editFlow'
import { CREATABLE_KINDS, CREATABLE_KIND_LABELS, type CreatableKind } from '../utils/intentTemplates'

const KIND_LABELS_LIGHT: Record<NodeKind, { label: string; color: string }> = {
  startNode:       { label: 'Início',          color: 'bg-emerald-100 text-emerald-700' },
  choiceNode:      { label: 'Escolha',          color: 'bg-blue-100 text-blue-700' },
  captureNode:     { label: 'Captura',          color: 'bg-violet-100 text-violet-700' },
  transferNode:    { label: 'Transferência',    color: 'bg-rose-100 text-rose-700' },
  waitNode:        { label: 'Aguarda',          color: 'bg-cyan-100 text-cyan-700' },
  setDataNode:     { label: 'Variável',         color: 'bg-indigo-100 text-indigo-700' },
  externalBotNode: { label: 'Outro Bot',        color: 'bg-amber-100 text-amber-700' },
  defaultNode:     { label: 'Mensagem',         color: 'bg-slate-100 text-slate-600' },
  endNode:         { label: 'Terminar',         color: 'bg-red-100 text-red-700' },
  apiCallNode:     { label: 'Chamada API',      color: 'bg-teal-100 text-teal-700' },
  orderNode:       { label: 'Pedido',           color: 'bg-orange-100 text-orange-700' },
  csatNode:        { label: 'CSAT',             color: 'bg-pink-100 text-pink-700' },
  storeNode:       { label: 'Loja física',      color: 'bg-lime-100 text-lime-700' },
  intentGroupNode: { label: 'Intenção',         color: 'bg-slate-100 text-slate-600' },
}

const KIND_LABELS_DARK: Record<NodeKind, { label: string; color: string }> = {
  startNode:       { label: 'Início',          color: 'bg-emerald-950 text-emerald-300' },
  choiceNode:      { label: 'Escolha',          color: 'bg-blue-950 text-blue-300' },
  captureNode:     { label: 'Captura',          color: 'bg-violet-950 text-violet-300' },
  transferNode:    { label: 'Transferência',    color: 'bg-rose-950 text-rose-300' },
  waitNode:        { label: 'Aguarda',          color: 'bg-cyan-950 text-cyan-300' },
  setDataNode:     { label: 'Variável',         color: 'bg-indigo-950 text-indigo-300' },
  externalBotNode: { label: 'Outro Bot',        color: 'bg-amber-950 text-amber-300' },
  defaultNode:     { label: 'Mensagem',         color: 'bg-slate-800 text-slate-400' },
  endNode:         { label: 'Terminar',         color: 'bg-red-950 text-red-300' },
  apiCallNode:     { label: 'Chamada API',      color: 'bg-teal-950 text-teal-300' },
  orderNode:       { label: 'Pedido',           color: 'bg-orange-950 text-orange-300' },
  csatNode:        { label: 'CSAT',             color: 'bg-pink-950 text-pink-300' },
  storeNode:       { label: 'Loja física',      color: 'bg-lime-950 text-lime-300' },
  intentGroupNode: { label: 'Intenção',         color: 'bg-slate-800 text-slate-400' },
}

const TRANSFER_TYPES = [
  { value: 'direct4group',        label: 'Grupo direto' },
  { value: 'search4group',        label: 'Busca de grupo' },
  { value: 'direct4user',         label: 'Usuário direto' },
  { value: 'direct4userPrevious', label: 'Atendente anterior' },
  { value: 'direct4userCurrent',  label: 'Atendente atual' },
]

const CAPTURE_TYPES = [
  { value: 'free',    label: 'Livre' },
  { value: 'custom',  label: 'Customizado' },
  { value: 'name',    label: 'Nome' },
  { value: 'fullName', label: 'Nome completo' },
  { value: 'cpf',     label: 'CPF' },
  { value: 'email',   label: 'E-mail' },
  { value: 'phone',   label: 'Telefone' },
  { value: 'zipcode', label: 'CEP' },
  { value: 'entity',  label: 'Entidade' },
]

/** Opções de gatilho (ConditionType) — os 10 tipos oficiais da plataforma. */
const COND_TYPE_OPTIONS = Object.entries(CONDITION_TYPE_LABELS).map(([value, label]) => ({ value, label }))

/** Modo do painel: a forma de edição depende do nó clicado (Modelo B, Marco C). */
type PanelMode = 'group' | 'condition' | 'solo' | 'externalRO' | 'startRO'

/** Determina o modo e (para filhos) o índice da condição a partir do nó. */
function resolveMode(node: Node<FlowNodeData>, intent: BotIntent | null): { mode: PanelMode; condIdx: number } {
  if (node.type === 'externalBotNode' || !intent) return { mode: 'externalRO', condIdx: 0 }
  // O nó de início é somente-leitura: a estrutura da intenção `start` é canônica
  // e não deve ser editada (a conexão de saída é feita no canvas).
  if (node.type === 'startNode' || intent.category === 'start') return { mode: 'startRO', condIdx: 0 }
  if (node.type === 'intentGroupNode') return { mode: 'group', condIdx: 0 }
  const m = /::c(\d+)$/.exec(node.id)
  if (m) return { mode: 'condition', condIdx: Number(m[1]) }
  return { mode: 'solo', condIdx: 0 }
}

interface DraftCondition {
  name: string
  type: string
  variable: string
  value: string
  /** Índice em intent.conditions; null = condição nova ainda não aplicada. */
  originalIdx: number | null
  /** Tipo da AÇÃO da condição nova (só para `originalIdx === null`). */
  kind?: CreatableKind
}

/** Opções do select de tipo de ação ao adicionar uma condição nova. */
const KIND_OPTIONS = CREATABLE_KINDS.map(k => ({ value: k, label: CREATABLE_KIND_LABELS[k] }))

interface Draft {
  // Meta da intenção (modos group/solo)
  name: string
  category: string
  keywords: string
  priority: number
  context: string
  // Gatilho da condição editada (modo condition)
  condName: string
  condType: string
  condVariable: string
  condValue: string
  // Conteúdo (mensagens/botões/ação) do escopo editado (modos condition/solo)
  messages: EditableMessage[]
  newMessages: string[]
  removedRefs: MessageRef[]
  buttons: { text: string; description: string; originalIdx: number | null }[]
  removedButtonIdxs: number[]
  newButtonsBody: string | null
  transferType: string
  transferValue: string
  captureDataType: string
  captureVariable: string
  setDataItems: BulkUpdateItem[]
  // Lista de condições (modos group/solo) — estrutura da intenção
  conditions: DraftCondition[]
  removedCondIdxs: number[]
}

/** Botões (BUTTON/LIST) de UMA condição específica. */
function buttonsOfCondition(intent: BotIntent, condIdx: number) {
  return intent.conditions[condIdx]?.assistant_says
    .flatMap(s => s.messages)
    .find(m => (m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig?.buttons?.length)
    ?.messageConfig?.buttons ?? []
}

/** Botões da intenção inteira (1ª mensagem de botões encontrada) — modo solo. */
function buttonsOfIntent(intent: BotIntent) {
  return intent.conditions
    .flatMap(c => c.assistant_says).flatMap(s => s.messages)
    .find(m => (m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig?.buttons?.length)
    ?.messageConfig?.buttons ?? []
}

function hasButtonsMessage(intent: BotIntent, condIdx: number, mode: PanelMode): boolean {
  const conds = mode === 'condition' ? [intent.conditions[condIdx]].filter(Boolean) : intent.conditions
  return conds.some(c =>
    c.assistant_says.some(s => s.messages.some(m => (m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig)))
}

function buildDraft(intent: BotIntent, mode: PanelMode, condIdx: number): Draft {
  const scopedCond = intent.conditions[condIdx]
  const allMessages = listMessages(intent)
  const messages = mode === 'condition' ? allMessages.filter(m => m.ref.condIdx === condIdx) : allMessages

  // Condição-fonte de cada ação: no modo condition é a própria; no solo, a 1ª do tipo.
  const transferCond = mode === 'condition'
    ? (scopedCond?.action.type === 'transfer' ? scopedCond : undefined)
    : intent.conditions.find(c => c.action.type === 'transfer')
  const captureCond = mode === 'condition'
    ? (scopedCond?.action.type === 'captureData' ? scopedCond : undefined)
    : intent.conditions.find(c => c.action.type === 'captureData')
  const setDataCond = mode === 'condition'
    ? (scopedCond?.action.type === 'setData' ? scopedCond : undefined)
    : intent.conditions.find(c => c.action.type === 'setData')

  const buttons = mode === 'condition' ? buttonsOfCondition(intent, condIdx) : buttonsOfIntent(intent)

  return {
    name: intent.name,
    category: intent.category,
    keywords: (intent.keywords ?? []).join(', '),
    priority: typeof intent.priority === 'number' ? intent.priority : 0,
    context: intent.context ?? '',
    condName: scopedCond?.name ?? '',
    condType: scopedCond?.type ?? 'any',
    condVariable: scopedCond?.variable ?? '',
    condValue: scopedCond?.value ?? '',
    messages,
    newMessages: [],
    removedRefs: [],
    buttons: buttons.map((b, i) => ({ text: b.text, description: b.description ?? '', originalIdx: i })),
    removedButtonIdxs: [],
    newButtonsBody: null,
    transferType: transferCond?.action.transferType ?? '',
    transferValue: transferCond?.action.value ?? '',
    captureDataType: captureCond?.action.captureDataType ?? '',
    captureVariable: captureCond?.action.variable ?? '',
    setDataItems: (Array.isArray(setDataCond?.action.bulkUpdate) ? setDataCond.action.bulkUpdate : [])
      .map(i => ({ ...i })),
    conditions: intent.conditions.map((c, i) => ({
      name: c.name, type: c.type, variable: c.variable ?? '', value: c.value ?? '', originalIdx: i,
    })),
    removedCondIdxs: [],
  }
}

interface DetailPanelProps {
  node: Node<FlowNodeData>
  intent: BotIntent | null
  /** Todas as intenções do fluxo — para o seletor de contexto no modo grupo/solo. */
  intents: BotIntent[]
  /** Chamado antes do primeiro patch — o App captura o snapshot de undo aqui. */
  onBeforeApply: () => void
  onApply: (intentId: string) => void
  /** Chamado quando um patch falha no meio — o App faz rollback do parcial. */
  onApplyFailed: () => void
  onDelete: (intentId: string) => void
  onClose: () => void
}

export function DetailPanel({ node, intent, intents, onBeforeApply, onApply, onApplyFailed, onDelete, onClose }: DetailPanelProps) {
  const isDark = useTheme()
  const kind = (node.type ?? 'defaultNode') as NodeKind
  const badge = (isDark ? KIND_LABELS_DARK : KIND_LABELS_LIGHT)[kind]
  const { mode, condIdx } = resolveMode(node, intent)
  const [draft, setDraft] = useState<Draft | null>(intent ? buildDraft(intent, mode, condIdx) : null)
  const [panelError, setPanelError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(intent ? buildDraft(intent, mode, condIdx) : null)
    setPanelError(null)
  }, [node.id])

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(d => d ? { ...d, [key]: value } : d)
  }, [])

  const showMeta    = mode === 'group' || mode === 'solo'
  const showTrigger = mode === 'condition'
  const showContent = mode === 'condition' || mode === 'solo'
  const showCondList = mode === 'group' || mode === 'solo'

  /**
   * Aplica o rascunho via patches pequenos, no escopo do modo (meta da intenção,
   * uma condição, ou conteúdo + lista de condições no solo). Remoções sempre em
   * índice decrescente; remoções de condição por último (refs deslocam).
   */
  function handleApply() {
    if (!intent || !draft) return
    onBeforeApply()
    // `ci`: índice da condição-alvo das funções escopadas. No solo (1 condição)
    // fica undefined → as funções acham a 1ª do tipo, que é a única.
    const ci = mode === 'condition' ? condIdx : undefined
    const results: EditResult[] = []

    if (showMeta) {
      results.push(updateIntentMeta(intent, {
        name: draft.name,
        category: draft.category,
        keywords: draft.keywords.split(',').map(k => k.trim()).filter(Boolean),
        priority: draft.priority,
        context: draft.context,
      }))
    }

    if (showTrigger) {
      results.push(updateCondition(intent, condIdx, {
        name: draft.condName, type: draft.condType, variable: draft.condVariable, value: draft.condValue,
      }))
    }

    if (showContent) {
      results.push(
        ...draft.messages.map(m => updateMessageText(intent, m.ref, m.text)),
        ...[...draft.removedRefs]
          .sort((a, b) => b.condIdx - a.condIdx || b.sayIdx - a.sayIdx || b.msgIdx - a.msgIdx)
          .map(ref => removeMessage(intent, ref)),
        ...draft.newMessages.filter(t => t.trim()).map(t => addTextMessage(intent, t.trim(), ci ?? 0)),
      )
      if (draft.newButtonsBody !== null && draft.newButtonsBody.trim()) {
        results.push(addButtonsMessage(intent, draft.newButtonsBody.trim(), ci))
      }
      results.push(
        ...draft.buttons
          .filter(b => b.originalIdx !== null)
          .map(b => updateButton(intent, b.originalIdx as number, b.text, b.description || null, ci)),
        ...[...draft.removedButtonIdxs].sort((a, b) => b - a).map(i => removeButton(intent, i, ci)),
        ...draft.buttons
          .filter(b => b.originalIdx === null && b.text.trim())
          .map(b => addButton(intent, b.text.trim(), b.description || null, ci)),
      )
      if (kind === 'transferNode') {
        results.push(updateActionFields(intent, 'transfer', { transferType: draft.transferType, value: draft.transferValue }, ci))
      }
      if (kind === 'captureNode') {
        results.push(updateActionFields(intent, 'captureData', { captureDataType: draft.captureDataType, variable: draft.captureVariable }, ci))
      }
      if (kind === 'setDataNode') {
        results.push(updateSetDataItems(intent, draft.setDataItems, ci))
      }
    }

    if (showCondList) {
      results.push(
        ...draft.conditions
          .filter(c => c.originalIdx !== null)
          .map(c => updateCondition(intent, c.originalIdx as number, c)),
        ...[...draft.removedCondIdxs].sort((a, b) => b - a).map(i => removeCondition(intent, i)),
      )
      for (const added of draft.conditions.filter(c => c.originalIdx === null && c.name.trim())) {
        const addResult = addCondition(intent, added.kind)
        results.push(addResult.ok ? updateCondition(intent, intent.conditions.length - 1, added) : addResult)
      }
    }

    const failed = results.find(r => !r.ok)
    if (failed && !failed.ok) {
      setPanelError(`Falha ao aplicar: ${failed.reason}.`)
      onApplyFailed()
      return
    }
    setPanelError(null)
    onApply(intent.id)
    setDraft(buildDraft(intent, mode, condIdx))
  }

  /** Exclui a condição atual (modo filho) — só permitida se houver mais de uma. */
  function handleDeleteCondition() {
    if (!intent) return
    onBeforeApply()
    const result = removeCondition(intent, condIdx)
    if (!result.ok) {
      setPanelError(`Não foi possível excluir: ${result.reason}.`)
      onApplyFailed()
      return
    }
    onApply(intent.id)
    onClose()
  }

  const inputCls = `w-full text-xs rounded-lg border px-2.5 py-1.5 outline-none transition-colors ${
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-200 focus:border-blue-600 placeholder:text-slate-600'
      : 'bg-white border-slate-200 text-slate-700 focus:border-blue-400 placeholder:text-slate-300'
  }`
  const labelCls = `text-[10px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`
  const ghostBtnCls = `text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors ${
    isDark ? 'text-slate-500 hover:text-rose-400' : 'text-slate-400 hover:text-rose-600'
  }`
  const dashedBtnCls = `text-xs font-medium rounded-lg border border-dashed px-2 py-1.5 transition-colors ${
    isDark ? 'text-slate-400 border-slate-700 hover:bg-slate-800' : 'text-slate-500 border-slate-300 hover:bg-slate-50'
  }`

  const editable = !!intent && !!draft && mode !== 'externalRO' && mode !== 'startRO'
  const canDeleteCondition = mode === 'condition' && !!intent && intent.conditions.length > 1

  return (
    <div data-testid="detail-panel" className={`absolute right-0 top-0 h-full w-96 border-l shadow-xl z-10 flex flex-col ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
      {/* Header */}
      <div className={`flex items-start justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <div className="min-w-0 pr-2">
          <p className={`text-sm font-semibold leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{node.data.name}</p>
          <p className={`text-xs mt-0.5 truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{node.data.category}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>{badge.label}</span>
          <button
            onClick={onClose}
            className={`transition-colors ${isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}`}
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        {mode === 'externalRO' && <ReadOnlyExternal node={node} isDark={isDark} />}
        {mode === 'startRO' && intent && <ReadOnlyStart intent={intent} isDark={isDark} />}

        {editable && draft && (
          <>
            {mode === 'condition' && (
              <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Editando <strong>uma condição</strong> da intenção. Para nome, categoria,
                prioridade e contexto, clique no cabeçalho da intenção.
              </p>
            )}

            {showMeta && (
              <Section title="Geral" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Nome</span>
                    <input className={inputCls} value={draft.name} onChange={e => set('name', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Categoria</span>
                    <input className={inputCls} value={draft.category} onChange={e => set('category', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Keywords (separadas por vírgula)</span>
                    <input className={inputCls} value={draft.keywords} onChange={e => set('keywords', e.target.value)} placeholder="ex: oi, olá, menu" />
                  </label>
                  <div className="flex gap-2">
                    <label className="flex flex-col gap-1 flex-1">
                      <span className={labelCls}>Prioridade</span>
                      <select className={inputCls} value={draft.priority} onChange={e => set('priority', Number(e.target.value))}>
                        {PRIORITY_LABELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 flex-1">
                      <span className={labelCls}>Contexto (intenção que precede)</span>
                      <select className={inputCls} value={draft.context} onChange={e => set('context', e.target.value)}>
                        <option value="">Nenhum</option>
                        {intents
                          .filter(i => i.id !== intent!.id)
                          .map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                        {draft.context && !intents.some(i => i.id === draft.context) && (
                          <option value={draft.context}>{draft.context} (fora do fluxo)</option>
                        )}
                      </select>
                    </label>
                  </div>
                </div>
              </Section>
            )}

            {showTrigger && draft && (
              <Section title="Gatilho da condição" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Nome da condição</span>
                    <input className={inputCls} value={draft.condName} onChange={e => set('condName', e.target.value)} />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Tipo de gatilho</span>
                    <select className={inputCls} value={draft.condType} onChange={e => set('condType', e.target.value)}>
                      {COND_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      {!COND_TYPE_OPTIONS.some(t => t.value === draft.condType) && (
                        <option value={draft.condType}>{draft.condType}</option>
                      )}
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <label className="flex flex-col gap-1 flex-1">
                      <span className={labelCls}>Variável</span>
                      <input className={`${inputCls} font-mono`} value={draft.condVariable} onChange={e => set('condVariable', e.target.value)} placeholder="ex: customer.cpf" />
                    </label>
                    <label className="flex flex-col gap-1 flex-1">
                      <span className={labelCls}>Valor</span>
                      <input className={inputCls} value={draft.condValue} onChange={e => set('condValue', e.target.value)} />
                    </label>
                  </div>
                </div>
              </Section>
            )}

            {showContent && draft && (
              <Section title="Mensagens" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  {draft.messages.map((msg, i) => (
                    <div key={`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className={labelCls}>{msg.type}</span>
                        {msg.type === 'TEXT' && (
                          <button
                            className={ghostBtnCls}
                            onClick={() => setDraft(d => d && ({
                              ...d,
                              messages: d.messages.filter((_, j) => j !== i),
                              removedRefs: [...d.removedRefs, msg.ref],
                            }))}
                          >remover</button>
                        )}
                      </div>
                      <textarea
                        className={`${inputCls} resize-y min-h-[56px]`}
                        value={msg.text}
                        onChange={e => setDraft(d => d && ({
                          ...d,
                          messages: d.messages.map((m, j) => j === i ? { ...m, text: e.target.value } : m),
                        }))}
                      />
                    </div>
                  ))}
                  {draft.newMessages.map((text, i) => (
                    <div key={`new-${i}`} className="flex flex-col gap-0.5">
                      <div className="flex items-center justify-between">
                        <span className={labelCls}>TEXT (nova)</span>
                        <button
                          className={ghostBtnCls}
                          onClick={() => set('newMessages', draft.newMessages.filter((_, j) => j !== i))}
                        >remover</button>
                      </div>
                      <textarea
                        className={`${inputCls} resize-y min-h-[56px]`}
                        value={text}
                        placeholder="Texto da mensagem…"
                        onChange={e => set('newMessages', draft.newMessages.map((t, j) => j === i ? e.target.value : t))}
                      />
                    </div>
                  ))}
                  <button className={dashedBtnCls} onClick={() => set('newMessages', [...draft.newMessages, ''])}>
                    + Adicionar mensagem de texto
                  </button>
                </div>
              </Section>
            )}

            {showContent && draft && (draft.buttons.length > 0 || kind === 'choiceNode') && (
              <Section title="Opções (botões ↔ escolhas)" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  {draft.buttons.map((btn, i) => (
                    <div key={i} className={`flex flex-col gap-1 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      <div className="flex items-center gap-1.5">
                        <input
                          className={inputCls}
                          value={btn.text}
                          placeholder="Texto do botão"
                          onChange={e => set('buttons', draft.buttons.map((b, j) => j === i ? { ...b, text: e.target.value } : b))}
                        />
                        {kind === 'choiceNode' && (
                          <button
                            className={ghostBtnCls}
                            title="Remover botão e a escolha correspondente"
                            onClick={() => setDraft(d => d && ({
                              ...d,
                              buttons: d.buttons.filter((_, j) => j !== i),
                              removedButtonIdxs: btn.originalIdx !== null
                                ? [...d.removedButtonIdxs, btn.originalIdx]
                                : d.removedButtonIdxs,
                            }))}
                          >×</button>
                        )}
                      </div>
                      <input
                        className={inputCls}
                        value={btn.description}
                        placeholder="Descrição (opcional)"
                        onChange={e => set('buttons', draft.buttons.map((b, j) => j === i ? { ...b, description: e.target.value } : b))}
                      />
                      {btn.originalIdx === null && (
                        <p className={labelCls}>novo — conecte no canvas após aplicar</p>
                      )}
                    </div>
                  ))}

                  {kind === 'choiceNode' && !hasButtonsMessage(intent!, condIdx, mode) && draft.newButtonsBody === null && (
                    <button className={dashedBtnCls} onClick={() => set('newButtonsBody', '')}>
                      + Criar mensagem de botões
                    </button>
                  )}
                  {draft.newButtonsBody !== null && (
                    <label className="flex flex-col gap-1">
                      <span className={labelCls}>Corpo da mensagem de botões (nova)</span>
                      <textarea
                        className={`${inputCls} resize-y min-h-[56px]`}
                        value={draft.newButtonsBody}
                        placeholder="Texto que acompanha os botões…"
                        onChange={e => set('newButtonsBody', e.target.value)}
                      />
                    </label>
                  )}
                  {kind === 'choiceNode' && (hasButtonsMessage(intent!, condIdx, mode) || draft.newButtonsBody !== null) && (
                    <button
                      className={dashedBtnCls}
                      onClick={() => set('buttons', [...draft.buttons, { text: '', description: '', originalIdx: null }])}
                    >+ Adicionar botão</button>
                  )}
                </div>
              </Section>
            )}

            {showContent && draft && kind === 'transferNode' && (
              <Section title="Transferência" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Tipo</span>
                    <select className={inputCls} value={draft.transferType} onChange={e => set('transferType', e.target.value)}>
                      {TRANSFER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      {!TRANSFER_TYPES.some(t => t.value === draft.transferType) && draft.transferType && (
                        <option value={draft.transferType}>{draft.transferType}</option>
                      )}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Destino (ID do grupo/usuário)</span>
                    <input className={`${inputCls} font-mono`} value={draft.transferValue} onChange={e => set('transferValue', e.target.value)} />
                  </label>
                </div>
              </Section>
            )}

            {showContent && draft && kind === 'captureNode' && (
              <Section title="Captura de dado" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Tipo de dado</span>
                    <select className={inputCls} value={draft.captureDataType} onChange={e => set('captureDataType', e.target.value)}>
                      {CAPTURE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      {!CAPTURE_TYPES.some(t => t.value === draft.captureDataType) && draft.captureDataType && (
                        <option value={draft.captureDataType}>{draft.captureDataType}</option>
                      )}
                    </select>
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className={labelCls}>Variável de destino</span>
                    <input className={`${inputCls} font-mono`} value={draft.captureVariable} onChange={e => set('captureVariable', e.target.value)} placeholder="ex: customer.name" />
                  </label>
                </div>
              </Section>
            )}

            {showContent && draft && kind === 'setDataNode' && (
              <Section title="Variáveis definidas" isDark={isDark}>
                <div className="flex flex-col gap-1.5">
                  {draft.setDataItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <input
                        className={`${inputCls} font-mono flex-1`}
                        value={item.variable}
                        placeholder="variável"
                        onChange={e => set('setDataItems', draft.setDataItems.map((it, j) => j === i ? { ...it, variable: e.target.value } : it))}
                      />
                      <span className={isDark ? 'text-slate-500' : 'text-slate-400'}>=</span>
                      <input
                        className={`${inputCls} flex-1`}
                        value={item.value}
                        placeholder="valor"
                        onChange={e => set('setDataItems', draft.setDataItems.map((it, j) => j === i ? { ...it, value: e.target.value } : it))}
                      />
                      <button className={ghostBtnCls} onClick={() => set('setDataItems', draft.setDataItems.filter((_, j) => j !== i))}>×</button>
                    </div>
                  ))}
                  <button className={dashedBtnCls} onClick={() => set('setDataItems', [...draft.setDataItems, { variable: '', value: '' }])}>
                    + Adicionar variável
                  </button>
                </div>
              </Section>
            )}

            {showCondList && draft && (
              <Section title="Condições" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  {mode === 'group' && (
                    <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      Clique num nó-condição no canvas para editar mensagens e ação.
                    </p>
                  )}
                  {draft.conditions.map((cond, i) => (
                    <div key={i} className={`flex flex-col gap-1 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      <div className="flex items-center gap-1.5">
                        <input
                          className={inputCls}
                          value={cond.name}
                          placeholder="Nome da condição"
                          onChange={e => set('conditions', draft.conditions.map((c, j) => j === i ? { ...c, name: e.target.value } : c))}
                        />
                        <button
                          className={ghostBtnCls}
                          title="Remover condição"
                          onClick={() => setDraft(d => d && ({
                            ...d,
                            conditions: d.conditions.filter((_, j) => j !== i),
                            removedCondIdxs: cond.originalIdx !== null
                              ? [...d.removedCondIdxs, cond.originalIdx]
                              : d.removedCondIdxs,
                          }))}
                        >×</button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <select
                          className={inputCls}
                          value={cond.type}
                          onChange={e => set('conditions', draft.conditions.map((c, j) => j === i ? { ...c, type: e.target.value } : c))}
                        >
                          {COND_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          {!COND_TYPE_OPTIONS.some(t => t.value === cond.type) && (
                            <option value={cond.type}>{cond.type}</option>
                          )}
                        </select>
                        <input
                          className={`${inputCls} font-mono`}
                          value={cond.variable}
                          placeholder="variável"
                          onChange={e => set('conditions', draft.conditions.map((c, j) => j === i ? { ...c, variable: e.target.value } : c))}
                        />
                        <input
                          className={inputCls}
                          value={cond.value}
                          placeholder="valor"
                          onChange={e => set('conditions', draft.conditions.map((c, j) => j === i ? { ...c, value: e.target.value } : c))}
                        />
                      </div>
                      {cond.originalIdx === null && (
                        <div className="flex items-center gap-1.5">
                          <span className={`${labelCls} shrink-0`}>Ação:</span>
                          <select
                            className={inputCls}
                            value={cond.kind ?? 'defaultNode'}
                            onChange={e => set('conditions', draft.conditions.map((c, j) => j === i ? { ...c, kind: e.target.value as CreatableKind } : c))}
                          >
                            {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                          </select>
                          <span className={`${labelCls} shrink-0`}>nova — aplicada ao salvar</span>
                        </div>
                      )}
                    </div>
                  ))}
                  <button
                    className={dashedBtnCls}
                    onClick={() => set('conditions', [...draft.conditions, { name: `Condição ${draft.conditions.length + 1}`, type: 'any', variable: '', value: 'any', originalIdx: null, kind: 'defaultNode' }])}
                  >+ Adicionar condição</button>
                </div>
              </Section>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {editable && (
        <div className={`px-4 py-3 border-t flex flex-col gap-2 ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          {panelError && (
            <p className={`text-[11px] leading-snug ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{panelError}</p>
          )}
          <button
            onClick={handleApply}
            className="w-full text-xs font-semibold rounded-lg px-3 py-2 bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >Aplicar alterações</button>
          {canDeleteCondition && (
            <button
              onClick={handleDeleteCondition}
              className={`w-full text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
                isDark ? 'text-rose-400 border-rose-900 hover:bg-rose-950' : 'text-rose-600 border-rose-200 hover:bg-rose-50'
              }`}
            >Excluir condição</button>
          )}
          {showMeta && kind !== 'startNode' && (
            <button
              onClick={() => intent && onDelete(intent.id)}
              className={`w-full text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
                isDark
                  ? 'text-rose-400 border-rose-900 hover:bg-rose-950'
                  : 'text-rose-600 border-rose-200 hover:bg-rose-50'
              }`}
            >Excluir intenção</button>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Visão somente-leitura do nó de início. O start é canônico e imutável aqui — a
 * única ação estrutural permitida é conectar/remover a aresta de saída no canvas.
 */
function ReadOnlyStart({ intent, isDark }: { intent: BotIntent; isDark: boolean }) {
  const cond = intent.conditions[0]
  const next = cond?.next?.intent
  const nextId = next && typeof next === 'object' ? next.id : (typeof next === 'string' ? next : null)
  return (
    <Section title="Nó de início (somente leitura)" isDark={isDark}>
      <p className={`text-[11px] leading-snug mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        O nó de início não é editável. Para definir por onde o fluxo começa,
        conecte a aresta de saída a outra intenção no canvas.
      </p>
      <InfoRow label="Nome"     value={intent.name || '-'} isDark={isDark} />
      <InfoRow label="Condição" value={cond?.name || '-'} isDark={isDark} />
      <InfoRow label="Próximo"  value={nextId ?? '(sem destino — conecte no canvas)'} isDark={isDark} />
    </Section>
  )
}

function ReadOnlyExternal({ node, isDark }: { node: Node<FlowNodeData>; isDark: boolean }) {
  return (
    <Section title="Destino externo (somente leitura)" isDark={isDark}>
      <InfoRow label="Bot ID"    value={node.data.externalBotId    ?? '-'} isDark={isDark} />
      <InfoRow label="Intent ID" value={node.data.externalIntentId ?? '-'} isDark={isDark} />
    </Section>
  )
}

function Section({ title, children, isDark }: { title: string; children: React.ReactNode; isDark: boolean }) {
  return (
    <div>
      <p className={`text-[10px] uppercase tracking-wider font-semibold mb-1.5 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 mb-1.5">
      <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{label}</span>
      <span className={`text-[10px] break-all border rounded px-1.5 py-0.5 font-mono ${isDark ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-amber-50 text-amber-800 border-amber-200'}`} title={value}>
        {value}
      </span>
    </div>
  )
}
