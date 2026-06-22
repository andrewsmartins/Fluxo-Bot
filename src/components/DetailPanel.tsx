import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, type KeyboardEvent, type RefObject, type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import type { Node } from '@xyflow/react'
import type { BotIntent, Condition, BulkUpdateItem, FlowNodeData, NodeKind, ButtonMessageConfig } from '../types'
import { useTheme } from '../contexts/ThemeContext'
import { PRIORITY_LABELS, CONDITION_TYPE_LABELS } from '../utils/nodeMeta'
import {
  listMessages, updateMessageText, addTextMessage, addMediaMessage, addCollectionMessage, updateCollectionMessage, removeMessage,
  addTemplateMessage, updateTemplateMessage, addButtonListMessage, replaceButtonListMessage, setChoices,
  updateCondition, addCondition, removeCondition,
  updateIntentMeta, updateActionFields, updateSetDataItems, sanitizeIntentName,
  type EditableMessage, type MessageRef, type TemplateMessagePayload,
} from '../utils/editIntent'
import { acceptFor, type UploadMediaType } from '../utils/uploadMedia'
import { VARIABLE_GROUPS, variableDisplay, entityFieldItems, type VariableItem } from '../utils/variables'
import type { VariableGroup } from '../utils/variables'
import { computeMenuLeft, MENU_COLUMN_WIDTH, MENU_MARGIN } from '../utils/menuPosition'
import { useTeams } from '../contexts/TeamsContext'
import type { Collection } from '../utils/collections'
import { templateVarCount, type MessageTemplate } from '../utils/messageTemplates'
import { setNextRef, type EditResult } from '../utils/editFlow'
import { CREATABLE_KINDS, CREATABLE_KIND_LABELS, type CreatableKind } from '../utils/intentTemplates'
import { CAPTURE_FIELDS, CAPTURE_CATEGORY, MULTIPLE_FIELDS_SENTINEL, FREE_CAPTURE } from '../utils/captureFields'

const KIND_LABELS_LIGHT: Record<NodeKind, { label: string; color: string }> = {
  startNode:       { label: 'Início',          color: 'bg-emerald-100 text-emerald-700' },
  choiceNode:      { label: 'Escolha',          color: 'bg-blue-100 text-blue-700' },
  captureNode:     { label: 'Captura',          color: 'bg-violet-100 text-violet-700' },
  transferNode:    { label: 'Transferência',    color: 'bg-rose-100 text-rose-700' },
  waitNode:        { label: 'Aguarda',          color: 'bg-cyan-100 text-cyan-700' },
  setDataNode:     { label: 'Variável',         color: 'bg-indigo-100 text-indigo-700' },
  externalBotNode: { label: 'Outro Bot',        color: 'bg-slate-100 text-slate-600' },
  defaultNode:     { label: 'Mensagem',         color: 'bg-lime-100 text-lime-700' },
  endNode:         { label: 'Terminar',         color: 'bg-zinc-200 text-zinc-800' },
  apiCallNode:     { label: 'Chamada API',      color: 'bg-teal-100 text-teal-700' },
  orderNode:       { label: 'Pedido',           color: 'bg-orange-100 text-orange-700' },
  csatNode:        { label: 'CSAT',             color: 'bg-pink-100 text-pink-700' },
  storeNode:       { label: 'Loja física',      color: 'bg-fuchsia-100 text-fuchsia-700' },
  intentGroupNode: { label: 'Intenção',         color: 'bg-slate-100 text-slate-600' },
}

const KIND_LABELS_DARK: Record<NodeKind, { label: string; color: string }> = {
  startNode:       { label: 'Início',          color: 'bg-emerald-950 text-emerald-300' },
  choiceNode:      { label: 'Escolha',          color: 'bg-blue-950 text-blue-300' },
  captureNode:     { label: 'Captura',          color: 'bg-violet-950 text-violet-300' },
  transferNode:    { label: 'Transferência',    color: 'bg-rose-950 text-rose-300' },
  waitNode:        { label: 'Aguarda',          color: 'bg-cyan-950 text-cyan-300' },
  setDataNode:     { label: 'Variável',         color: 'bg-indigo-950 text-indigo-300' },
  externalBotNode: { label: 'Outro Bot',        color: 'bg-slate-800 text-slate-400' },
  defaultNode:     { label: 'Mensagem',         color: 'bg-lime-950 text-lime-300' },
  endNode:         { label: 'Terminar',         color: 'bg-zinc-800 text-zinc-200' },
  apiCallNode:     { label: 'Chamada API',      color: 'bg-teal-950 text-teal-300' },
  orderNode:       { label: 'Pedido',           color: 'bg-orange-950 text-orange-300' },
  csatNode:        { label: 'CSAT',             color: 'bg-pink-950 text-pink-300' },
  storeNode:       { label: 'Loja física',      color: 'bg-fuchsia-950 text-fuchsia-300' },
  intentGroupNode: { label: 'Intenção',         color: 'bg-slate-800 text-slate-400' },
}

const TRANSFER_TYPES = [
  { value: 'direct4group',        label: 'Grupo direto' },
  { value: 'search4group',        label: 'Busca de grupo' },
  { value: 'direct4user',         label: 'Usuário direto' },
  { value: 'direct4userPrevious', label: 'Atendente anterior' },
  { value: 'direct4userCurrent',  label: 'Atendente atual' },
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
  /** Tipo "context"/"lastIntent": IDs de intenções existentes. */
  intent: string
  context: string
  /** Índice em intent.conditions; null = condição nova ainda não aplicada. */
  originalIdx: number | null
  /** Tipo da AÇÃO da condição nova (só para `originalIdx === null`). */
  kind?: CreatableKind
}

/** Opções do select de tipo de ação ao adicionar uma condição nova. */
const KIND_OPTIONS = CREATABLE_KINDS.map(k => ({ value: k, label: CREATABLE_KIND_LABELS[k] }))

/** Mensagem nova ainda não persistida, criada via "+ Adicionar Resposta". */
type NewDraftMessage = NewMediaMessage | NewButtonListMessage | NewCollectionMessage | NewTemplateMessage

/** Variantes de conteúdo simples (texto/mídia) — `content` é o texto ou a URL. */
interface NewMediaMessage {
  type: 'TEXT' | 'IMAGE' | 'FILE' | 'VIDEO'
  content: string
  fileName: string
}

/**
 * Variante Botão/Lista de EXIBIÇÃO (Fase 10). `variant: 'plain'` = "sem descrição"
 * (itens só com texto). O `type` final (BUTTON/LIST) é decidido no submit pela
 * contagem de itens — ver `addButtonListMessage`.
 */
interface NewButtonListMessage {
  type: 'BUTTONLIST'
  variant: 'plain' | 'described'
  header: string
  body: string
  footer: string
  title: string
  items: { text: string; description: string }[]
}

/**
 * Menu Botão/Lista de UMA condição de escolha (Fase 10c). `editRef` aponta para a
 * mensagem salva (edição in-place via `replaceButtonListMessage`); `null` = menu novo
 * ainda não persistido (`addButtonListMessage`). Os campos espelham o `messageConfig`.
 */
/**
 * Resposta "Coleção" (COLLECTION). `editing` controla a UI: `true` abre o picker
 * (botão "Salvar"), `false` recolhe no preview (botão "Editar"). Não é serializado —
 * a mensagem gravada só leva o `collectionId`.
 */
interface NewCollectionMessage {
  type: 'COLLECTION'
  collectionId: string
  editing: boolean
}

/**
 * Resposta "Modelo de mensagem com Flow" (TEMPLATE). `editing` controla a UI igual ao
 * COLLECTION (picker aberto vs. preview). `messageTemplateId` é o modelo escolhido;
 * `tokens` são os valores das variáveis (`{{n}}`), posicionais. Corpo/título/botão são
 * derivados do modelo (não ficam no draft) — resolvidos via `templatesById` no apply.
 */
interface NewTemplateMessage {
  type: 'TEMPLATE'
  messageTemplateId: string
  tokens: string[]
  editing: boolean
}

interface MenuDraft {
  editRef: MessageRef | null
  variant: 'plain' | 'described'
  header: string
  body: string
  footer: string
  title: string
  items: { text: string; description: string }[]
}

interface Draft {
  // Meta da intenção (modos group/solo)
  name: string
  category: string
  keywords: string
  priority: number
  context: string
  /** Toggle "Configurar tempo para envio da resposta" (intent.executionDelay > 0). */
  delayActive: boolean
  /** Segundos de espera como string (1–30); '' quando inativo/vazio. Vira número no apply. */
  delaySeconds: string
  // Gatilho da condição editada (modo condition)
  condName: string
  condType: string
  condVariable: string
  condValue: string
  // Tipo "context" ("Contexto é igual a"): IDs de intenções existentes.
  condIntent: string
  condContext: string
  // Conteúdo (mensagens/botões/ação) do escopo editado (modos condition/solo)
  messages: EditableMessage[]
  newMessages: NewDraftMessage[]
  removedRefs: MessageRef[]
  // Nó de Escolha (Fase 10c): menu (em cima) + destinos (embaixo), ligados pela ordem.
  /** Índice da condição de escolha em escopo (-1 se não há). Menu/escolhas miram nela. */
  choiceCondIdx: number
  /** Menu Botão/Lista da condição de escolha (null = ainda não criado). */
  menu: MenuDraft | null
  /** Destinos (`action.choices`), posicionais aos itens do menu. */
  choices: string[]
  transferType: string
  transferValue: string
  /** Modo de captura: 'singleField' (um dado) ou 'multipleFields' (vários). */
  captureMode: string
  /** Dado escolhido no modo single (vazio = nada escolhido). */
  captureDataType: string
  /** Dados marcados no modo múltiplo (array de `CaptureDataType`). */
  captureMultiple: string[]
  setDataItems: BulkUpdateItem[]
  // Lista de condições (modos group/solo) — estrutura da intenção
  conditions: DraftCondition[]
  removedCondIdxs: number[]
  // Próximo Fluxo (nós de passo único): destino do `next.intent` da condição em escopo.
  /** "self" = intenção do próprio bot; "other" = redirect para outro bot. */
  nextScope: 'self' | 'other'
  /** Intenção-destino no próprio fluxo (scope "self"); '' = sem próximo. */
  nextSelfId: string
  /** Bot escolhido no scope "other". */
  nextBotId: string
  /** Intenção-destino dentro do bot escolhido (scope "other"). */
  nextOtherId: string
}

/**
 * Índice da condição de ESCOLHA em escopo (a que o menu/escolhas editam), ou -1.
 * No modo condição é a própria (se for choice); no solo/grupo, a 1ª condição choice.
 */
function choiceCondIdxOf(intent: BotIntent, mode: PanelMode, condIdx: number): number {
  if (mode === 'condition') return intent.conditions[condIdx]?.action.type === 'choice' ? condIdx : -1
  return intent.conditions.findIndex(c => c.action.type === 'choice')
}

/**
 * Carrega o menu Botão/Lista (1ª mensagem BUTTON/LIST) de uma condição como `MenuDraft`,
 * com `editRef` para edição in-place. `variant` é inferido: LIST com alguma descrição
 * preenchida → 'described'; senão 'plain'. Devolve null se a condição não tem menu.
 */
function menuOfCondition(intent: BotIntent, condIdx: number): MenuDraft | null {
  const cond = intent.conditions[condIdx]
  if (!cond) return null
  for (let sayIdx = 0; sayIdx < cond.assistant_says.length; sayIdx++) {
    const messages = cond.assistant_says[sayIdx].messages
    for (let msgIdx = 0; msgIdx < messages.length; msgIdx++) {
      const m = messages[msgIdx]
      if ((m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig) {
        const mc = m.messageConfig
        const buttons = mc.buttons ?? []
        const described = m.type === 'LIST' && buttons.some(b => (b.description ?? '').trim())
        return {
          editRef: { condIdx, sayIdx, msgIdx },
          variant: described ? 'described' : 'plain',
          header: mc.header ?? '', body: mc.body ?? '', footer: mc.footer ?? '', title: mc.title ?? '',
          items: buttons.map(b => ({ text: b.text ?? '', description: b.description ?? '' })),
        }
      }
    }
  }
  return null
}

/** Destinos (`action.choices`) de uma condição, como string[] (vazio se não houver). */
function choicesOfCondition(intent: BotIntent, condIdx: number): string[] {
  const choices = intent.conditions[condIdx]?.action.choices
  return Array.isArray(choices) ? choices.map(c => c ?? '') : []
}

/** A mensagem (BUTTON/LIST) nesta ref é de EXIBIÇÃO (condição sem ação de escolha)? */
function isDisplayButtonList(intent: BotIntent | null, ref: MessageRef, type: string): boolean {
  return !!intent && (type === 'BUTTON' || type === 'LIST') && intent.conditions[ref.condIdx]?.action.type !== 'choice'
}

/**
 * Valor da condição no formato do draft (string). A fonte de verdade depende do
 * tipo: "contém" usa o array `values` (esquema de TAGs), "Total é..." usa o número
 * em `valueNumber`, e os demais o campo escalar `value`.
 */
function condValueForDraft(cond: Condition | undefined): string {
  if (!cond) return ''
  if (cond.type === 'contains' && Array.isArray(cond.values)) return cond.values.join(', ')
  if (cond.type === 'totalIsGreaterThan' || cond.type === 'totalIsEqual') {
    const n = cond.valueNumber
    return typeof n === 'number' || (typeof n === 'string' && n.trim()) ? String(n) : '0'
  }
  return cond.value ?? ''
}

function buildDraft(intent: BotIntent, mode: PanelMode, condIdx: number): Draft {
  const scopedCond = intent.conditions[condIdx]
  const allMessages = listMessages(intent)
  const scoped = mode === 'condition' ? allMessages.filter(m => m.ref.condIdx === condIdx) : allMessages

  // Nó de Escolha: o menu (Botão/Lista) é extraído para `menu` e some da lista de
  // mensagens (é editado em bloco no topo); os destinos vão para `choices`.
  const choiceCondIdx = choiceCondIdxOf(intent, mode, condIdx)
  const menu = choiceCondIdx >= 0 ? menuOfCondition(intent, choiceCondIdx) : null
  const choices = choiceCondIdx >= 0 ? choicesOfCondition(intent, choiceCondIdx) : []
  const menuRef = menu?.editRef
  const messages = menuRef
    ? scoped.filter(m => !(m.ref.condIdx === menuRef.condIdx && m.ref.sayIdx === menuRef.sayIdx && m.ref.msgIdx === menuRef.msgIdx))
    : scoped

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

  return {
    name: intent.name,
    category: intent.category?.trim() || 'Sem Categoria',
    keywords: (intent.keywords ?? []).join(', '),
    priority: typeof intent.priority === 'number' ? intent.priority : 0,
    context: intent.context ?? '',
    // `executionDelay` é número puro de segundos na plataforma; > 0 = toggle ligado.
    delayActive: typeof intent.executionDelay === 'number' && intent.executionDelay > 0,
    delaySeconds: typeof intent.executionDelay === 'number' && intent.executionDelay > 0
      ? String(intent.executionDelay)
      : '',
    condName: scopedCond?.name ?? '',
    condType: scopedCond?.type ?? 'any',
    condVariable: scopedCond?.variable ?? '',
    condValue: condValueForDraft(scopedCond),
    condIntent: scopedCond?.intent ?? '',
    condContext: typeof scopedCond?.context === 'string' ? scopedCond.context : '',
    messages,
    newMessages: [],
    removedRefs: [],
    choiceCondIdx,
    menu,
    choices,
    transferType: transferCond?.action.transferType ?? '',
    transferValue: transferCond?.action.value ?? '',
    // Modo derivado de `captureDataTypesCategory`; legado sem o campo cai em single.
    captureMode: captureCond?.action.captureDataTypesCategory === CAPTURE_CATEGORY.multiple
      ? CAPTURE_CATEGORY.multiple
      : CAPTURE_CATEGORY.single,
    // No modo múltiplo o `captureDataType` carrega a sentinela — não é dado real,
    // então o slot single fica vazio nesse caso. No single, null/ausente cai em
    // `free` (o placeholder "— Selecione —"), mantendo o estado de repouso consistente.
    captureDataType: captureCond?.action.captureDataTypesCategory === CAPTURE_CATEGORY.multiple
      ? ''
      : (captureCond?.action.captureDataType ?? FREE_CAPTURE),
    captureMultiple: Array.isArray(captureCond?.action.multipleFields)
      ? [...captureCond.action.multipleFields]
      : [],
    setDataItems: (Array.isArray(setDataCond?.action.bulkUpdate) ? setDataCond.action.bulkUpdate : [])
      .map(i => ({ ...i })),
    conditions: intent.conditions.map((c, i) => ({
      name: c.name, type: c.type, variable: c.variable ?? '', value: condValueForDraft(c),
      intent: c.intent ?? '', context: typeof c.context === 'string' ? c.context : '', originalIdx: i,
    })),
    removedCondIdxs: [],
    ...nextFlowDraft(scopedCond, intent.botId),
  }
}

/**
 * Estado inicial da seção "Próximo Fluxo" a partir do `next.intent` da condição.
 * Forma-objeto `{ botId, id }` é o padrão; com `botId` diferente do bot do fluxo,
 * o destino é cross-bot (scope "other"). Aceita a forma string (legado) como
 * destino no próprio bot. Sem destino → scope "self" vazio.
 */
function nextFlowDraft(cond: Condition | undefined, mainBotId: string): Pick<Draft, 'nextScope' | 'nextSelfId' | 'nextBotId' | 'nextOtherId'> {
  const raw = cond?.next?.intent
  const obj = raw && typeof raw === 'object' ? raw : null
  const str = typeof raw === 'string' ? raw : ''
  const crossBot = !!obj?.botId && obj.botId !== mainBotId
  return {
    nextScope: crossBot ? 'other' : 'self',
    nextSelfId: crossBot ? '' : (obj?.id ?? str),
    nextBotId: crossBot ? obj!.botId : '',
    nextOtherId: crossBot ? obj!.id : '',
  }
}

interface KeywordTagsProps {
  /** Palavras-chave como string separada por vírgula (formato do draft/submit). */
  value: string
  onChange: (value: string) => void
  isDark: boolean
  /** Texto-guia do campo vazio (default: exemplo de palavras-chave). */
  placeholder?: string
}

/**
 * Editor de palavras-chave como tags/chips. Mantém o valor como string separada
 * por vírgula (compatível com o submit em updateIntentMeta), mas exibe cada termo
 * como um chip removível. Enter ou vírgula confirma o termo digitado; Backspace
 * no campo vazio remove o último; blur confirma o pendente (evita perder texto
 * que o usuário digitou mas não deu Enter). Ignora duplicatas.
 */
function KeywordTags({ value, onChange, isDark, placeholder = 'ex: oi, olá, menu' }: KeywordTagsProps) {
  const [text, setText] = useState('')
  const tags = value.split(',').map(k => k.trim()).filter(Boolean)

  const commit = (raw: string) => {
    const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
    setText('')
    if (!parts.length) return
    const next = [...tags]
    for (const p of parts) if (!next.includes(p)) next.push(p)
    onChange(next.join(', '))
  }
  const removeAt = (idx: number) => onChange(tags.filter((_, i) => i !== idx).join(', '))

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      commit(text)
    } else if (e.key === 'Backspace' && !text && tags.length) {
      e.preventDefault()
      removeAt(tags.length - 1)
    }
  }

  const boxCls = `w-full flex flex-wrap items-center gap-1 rounded-lg border px-2 py-1.5 transition-colors ${
    isDark ? 'bg-slate-800 border-slate-700 focus-within:border-blue-600' : 'bg-white border-slate-200 focus-within:border-blue-400'
  }`
  const chipCls = `inline-flex items-center gap-1 text-[11px] rounded-md px-1.5 py-0.5 ${
    isDark ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'
  }`
  const xCls = isDark ? 'leading-none text-slate-400 hover:text-rose-400' : 'leading-none text-slate-400 hover:text-rose-600'
  const fieldCls = `flex-1 min-w-[80px] text-xs bg-transparent outline-none ${
    isDark ? 'text-slate-200 placeholder:text-slate-600' : 'text-slate-700 placeholder:text-slate-300'
  }`

  return (
    <div className={boxCls}>
      {tags.map((tag, i) => (
        <span key={`${tag}-${i}`} className={chipCls}>
          {tag}
          <button type="button" onClick={() => removeAt(i)} className={xCls} aria-label={`Remover ${tag}`}>×</button>
        </span>
      ))}
      <input
        className={fieldCls}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(text)}
        placeholder={tags.length ? '' : placeholder}
      />
    </div>
  )
}

interface CategorySelectProps {
  value: string
  onChange: (value: string) => void
  /** Categorias conhecidas (já com "Sem Categoria" em primeiro). */
  options: string[]
  isDark: boolean
  inputCls: string
}

/**
 * Combobox de categoria: exibe o valor atual, abre a lista de categorias
 * conhecidas ao focar/clicar e permite digitar uma nova (que é criada ao salvar).
 * Substitui o <datalist> nativo, que não abre de forma confiável no clique nem
 * mostra sugestões quando o campo já tem um valor que casa com uma opção.
 */
function CategorySelect({ value, onChange, options, isDark, inputCls }: CategorySelectProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  // Fecha ao clicar fora do componente.
  useEffect(() => {
    if (!open) return
    const onDocMouseDown = (e: MouseEvent) => {
      // `Node` aqui seria o tipo do @xyflow/react (importado no topo); o alvo do
      // evento é um nó do DOM, então casamos via HTMLElement.
      if (wrapRef.current && !wrapRef.current.contains(e.target as unknown as HTMLElement)) setOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [open])

  // Enquanto o usuário digita algo que ainda não é uma categoria exata, filtra;
  // se o valor casa com uma opção (ex.: logo após selecionar), mostra a lista toda.
  const query = value.trim().toLowerCase()
  const exactMatch = options.some(o => o.toLowerCase() === query)
  const filtered = query && !exactMatch
    ? options.filter(o => o.toLowerCase().includes(query))
    : options

  const pick = (opt: string) => {
    onChange(opt)
    setOpen(false)
  }

  const menuCls = `absolute z-30 mt-1 max-h-44 w-full overflow-auto rounded-lg border py-1 shadow-lg ${
    isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
  }`
  const optionCls = (active: boolean) => `w-full text-left text-xs px-2.5 py-1.5 transition-colors ${
    active
      ? (isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-800')
      : (isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100')
  }`

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputCls}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onKeyDown={e => { if (e.key === 'Escape' || e.key === 'Enter') setOpen(false) }}
        placeholder="Sem Categoria"
      />
      {open && filtered.length > 0 && (
        <ul className={menuCls}>
          {filtered.map(opt => (
            <li key={opt}>
              <button type="button" className={optionCls(opt === value)} onClick={() => pick(opt)}>{opt}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

interface VariableMenuProps {
  /** Campo ao qual o menu se ancora (input ou textarea). */
  anchorRef: RefObject<HTMLElement | null>
  isDark: boolean
  /** Escolha de uma variável: grava o token cru (`@customer.name`). isPrefix = liberar digitação. */
  onPick: (raw: string, isPrefix?: boolean) => void
  onClose: () => void
}

/**
 * Linha de item no menu de variáveis (coluna de campos). Ramo (com subitens) mostra
 * "›" e NAVEGA no clique; item com modificadores GRAVA A BASE no clique e ganha um
 * botão "#" estreito que abre a coluna de modificadores; folha/prefixo apenas grava.
 * (Fase 13 — fim do duplo-clique: a base vem em 1 clique e o "#" é opcional.)
 */
function ItemRow({ item, active, rowCls, modCls, onMain, onModifiers }: {
  item: VariableItem
  active: boolean
  rowCls: (active: boolean) => string
  modCls: (active: boolean) => string
  onMain: () => void
  onModifiers: () => void
}) {
  const isBranch = !!item.children?.length
  const hasComponents = !!item.components?.length
  return (
    <li className="flex items-stretch">
      <button type="button" className={`${rowCls(active)} flex-1`} onClick={onMain}>
        {item.label}{isBranch ? ' ›' : ''}
      </button>
      {hasComponents && (
        <button type="button" title="Modificadores (#)" aria-label="Abrir modificadores" className={modCls(active)} onClick={onModifiers}>#</button>
      )}
    </li>
  )
}

/**
 * Dropdown navegável de variáveis (até 4 níveis): Categoria → Item → subitem
 * (ramo, ex.: dias) → Modificador. Reutilizado pelo `VariablePicker` (campo de
 * condição) e pelo `VariableTextArea` (mensagens). É flutuante (`fixed` via portal),
 * ancorado ao campo, então sobrepõe o canvas sem ser cortado pelo `overflow`/largura
 * do painel. Sempre devolve o TOKEN CRU; a tradução para rótulo amigável fica a
 * cargo de quem exibe (`variableDisplay`).
 */
function VariableMenu({ anchorRef, isDark, onPick, onClose }: VariableMenuProps) {
  const [activeGroup, setActiveGroup] = useState<string | null>(null)
  const [activeItem, setActiveItem] = useState<VariableItem | null>(null)
  const [activeChild, setActiveChild] = useState<VariableItem | null>(null)
  // Time selecionado (grupo dinâmico): abre a coluna de campos `@team.{id}.…`.
  const [activeTeam, setActiveTeam] = useState<{ objectId: string; name: string } | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const {
    teams, status: teamsStatus, error: teamsError, loadTeams, hasToken, requestToken,
    entities, entitiesStatus, entitiesError, loadEntities,
  } = useTeams()

  // Posiciona logo abaixo do campo, ancorado pela ESQUERDA (caixa MÓVEL): cresce para
  // a direita conforme abre coluna e só desliza para a esquerda quando estouraria a
  // viewport, usando a largura REAL renderizada. O guarda evita re-render em laço.
  const place = useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect()
    if (!r) return
    const width = panelRef.current?.offsetWidth || MENU_COLUMN_WIDTH
    const left = computeMenuLeft(r, window.innerWidth, width, MENU_MARGIN)
    const top = r.bottom + 4
    setPos(prev => (prev && prev.left === left && prev.top === top) ? prev : { top, left })
  }, [anchorRef])

  // Após cada render (inclui abrir/fechar coluna) remede a largura e reposiciona.
  useLayoutEffect(() => { place() })

  useEffect(() => {
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true) // capture: pega o scroll interno do painel
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [place])

  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const t = e.target as globalThis.Node
      // Menu vive em portal (fora do campo); clique no campo OU no menu não fecha.
      if (panelRef.current?.contains(t) || anchorRef.current?.contains(t)) return
      onClose()
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [anchorRef, onClose])

  // Auto-carrega os times ao abrir a categoria Time quando há token (sem botão).
  useEffect(() => {
    if (activeGroup === 'team' && hasToken && teamsStatus === 'idle') loadTeams()
  }, [activeGroup, hasToken, teamsStatus, loadTeams])

  // Auto-carrega as Listas ao abrir a categoria Lista quando há token (mesmo padrão do Time).
  useEffect(() => {
    if (activeGroup === 'entity' && hasToken && entitiesStatus === 'idle') loadEntities()
  }, [activeGroup, hasToken, entitiesStatus, loadEntities])

  const group = VARIABLE_GROUPS.find(g => g.key === activeGroup) ?? null

  const onCategoryClick = (g: VariableGroup) => {
    setActiveItem(null); setActiveChild(null); setActiveTeam(null)
    // Time e Lista são dinâmicos: em vez de gravar o namespace pelado, abrem a coluna.
    if (g.key === 'team') { setActiveGroup('team'); return }
    if (g.key === 'entity') { setActiveGroup('entity'); return }
    if (g.value !== undefined) onPick(g.value, true) // categoria-folha (namespace livre)
    else setActiveGroup(g.key)
  }
  const onTeamClick = (team: { objectId: string; name: string }) => {
    setActiveItem(null); setActiveChild(null)
    setActiveTeam(team)
  }
  // Item da coluna de campos (categoria ou time). Ramo (subitens) NAVEGA; item com
  // modificadores GRAVA A BASE no clique (1 clique p/ o caso comum) — o "#" abre os
  // modificadores como passo opcional; folha/prefixo grava (Fase 13: sem duplo-clique).
  const onItemMain = (it: VariableItem) => {
    setActiveChild(null)
    if (it.children?.length) setActiveItem(it)   // ramo (ex.: "Horário de Abertura") → navega
    else onPick(it.value ?? '', it.prefix)       // base com modificadores / folha / prefixo → grava
  }
  const onItemModifiers = (it: VariableItem) => { setActiveChild(null); setActiveItem(it) } // "#" abre coluna de #
  // Subitem (ex.: dia da semana): grava a base; "#" abre os modificadores de hora.
  const onChildMain = (child: VariableItem) => {
    if (child.children?.length) setActiveChild(child)
    else onPick(child.value ?? '', child.prefix)
  }
  // Campos de um time selecionado: mesmo schema do Bot, base `@team.{id}`.
  // Memoizado por time para manter referência estável (destaque `activeItem === it`).
  const teamFieldItems = useMemo(
    () => activeTeam ? entityFieldItems(`@team.${activeTeam.objectId}`) : [],
    [activeTeam],
  )

  // Largura fixa por coluna (não encolhe): comporta o rótulo mais longo
  // ("Apenas Horário com Minutos") sem quebrar e cresce para a DIREITA sobre o canvas.
  const panelCls = `fixed z-50 flex rounded-lg border shadow-lg ${
    isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
  }`
  const colCls = 'w-48 shrink-0 max-h-60 overflow-auto py-1'
  const borderCls = isDark ? 'border-slate-700' : 'border-slate-200'
  const headerCls = `px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-slate-500' : 'text-slate-400'}`
  const rowCls = (active: boolean) => `w-full text-left text-xs px-2.5 py-1.5 whitespace-nowrap transition-colors ${
    active
      ? (isDark ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-800')
      : (isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100')
  }`
  // Afford. "#": botão estreito à direita da linha que abre a coluna de modificadores.
  const modCls = (active: boolean) => `shrink-0 px-2 text-xs font-semibold border-l ${borderCls} transition-colors ${
    active
      ? (isDark ? 'bg-slate-700 text-blue-300' : 'bg-slate-100 text-blue-600')
      : (isDark ? 'text-slate-500 hover:bg-slate-700 hover:text-blue-300' : 'text-slate-400 hover:bg-slate-100 hover:text-blue-600')
  }`

  if (!pos) return null
  return createPortal(
    <div ref={panelRef} className={panelCls} style={{ top: pos.top, left: pos.left }}>
      <ul className={colCls}>
        {VARIABLE_GROUPS.map(g => (
          <li key={g.key}>
            <button
              type="button"
              className={rowCls(g.key === activeGroup)}
              onMouseEnter={() => { if (g.items || g.key === 'team' || g.key === 'entity') { setActiveGroup(g.key); setActiveItem(null); setActiveChild(null); setActiveTeam(null) } }}
              onClick={() => onCategoryClick(g)}
            >{g.label}{g.items || g.key === 'team' || g.key === 'entity' ? ' ›' : ''}</button>
          </li>
        ))}
      </ul>
      {group?.items && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          {group.items.map((it: VariableItem) => (
            <ItemRow
              key={it.value ?? it.label}
              item={it}
              active={activeItem === it}
              rowCls={rowCls}
              modCls={modCls}
              onMain={() => onItemMain(it)}
              onModifiers={() => onItemModifiers(it)}
            />
          ))}
        </ul>
      )}
      {/* Grupo dinâmico Time: coluna dos times da loja (carregados sob demanda). */}
      {activeGroup === 'team' && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          <li className={headerCls}>Times da loja</li>
          {/* Sem token: aviso clicável que abre o campo de token na barra. */}
          {!hasToken && (
            <li className="px-2.5 py-1.5">
              <button type="button" className="text-xs font-medium text-blue-500 hover:text-blue-600 text-left" onClick={requestToken}>
                Insira o token da sessão
              </button>
            </li>
          )}
          {/* Com token: carrega sozinho (idle dispara o fetch via efeito). */}
          {hasToken && (teamsStatus === 'idle' || teamsStatus === 'loading') && (
            <li className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando…</li>
          )}
          {hasToken && teamsStatus === 'error' && (
            <li className="px-2.5 py-1.5 flex flex-col gap-1">
              <span className={`text-[11px] leading-snug ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{teamsError}</span>
              <button type="button" className="self-start text-xs font-medium text-blue-500 hover:text-blue-600" onClick={loadTeams}>
                Tentar de novo
              </button>
            </li>
          )}
          {hasToken && teamsStatus === 'loaded' && teams.length === 0 && (
            <li className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nenhum time encontrado.</li>
          )}
          {hasToken && teamsStatus === 'loaded' && teams.map(team => (
            <li key={team.objectId}>
              <button
                type="button"
                className={rowCls(activeTeam?.objectId === team.objectId)}
                onClick={() => onTeamClick(team)}
              >{team.name} ›</button>
            </li>
          ))}
        </ul>
      )}
      {/* Grupo dinâmico Lista: coluna das listas (entities) do bot. Clicar INSERE
          `@entity.<nome>` como prefixo (libera digitação) — sem sub-coluna de campos. */}
      {activeGroup === 'entity' && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          <li className={headerCls}>Listas do bot</li>
          {/* Sem token: aviso clicável que abre o campo de token na barra. */}
          {!hasToken && (
            <li className="px-2.5 py-1.5">
              <button type="button" className="text-xs font-medium text-blue-500 hover:text-blue-600 text-left" onClick={requestToken}>
                Insira o token da sessão
              </button>
            </li>
          )}
          {/* Com token: carrega sozinho (idle dispara o fetch via efeito). */}
          {hasToken && (entitiesStatus === 'idle' || entitiesStatus === 'loading') && (
            <li className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando…</li>
          )}
          {hasToken && entitiesStatus === 'error' && (
            <li className="px-2.5 py-1.5 flex flex-col gap-1">
              <span className={`text-[11px] leading-snug ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{entitiesError}</span>
              <button type="button" className="self-start text-xs font-medium text-blue-500 hover:text-blue-600" onClick={loadEntities}>
                Tentar de novo
              </button>
            </li>
          )}
          {hasToken && entitiesStatus === 'loaded' && entities.length === 0 && (
            <li className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Nenhuma lista cadastrada.</li>
          )}
          {hasToken && entitiesStatus === 'loaded' && entities.map(entity => (
            <li key={entity.id}>
              <button
                type="button"
                className={rowCls(false)}
                onClick={() => onPick(`@entity.${entity.name}`, true)}
              >{entity.name}</button>
            </li>
          ))}
        </ul>
      )}
      {/* Coluna de campos do time selecionado (mesmo schema do Bot). */}
      {activeTeam && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          {teamFieldItems.map(it => (
            <ItemRow
              key={it.value ?? it.label}
              item={it}
              active={activeItem === it}
              rowCls={rowCls}
              modCls={modCls}
              onMain={() => onItemMain(it)}
              onModifiers={() => onItemModifiers(it)}
            />
          ))}
        </ul>
      )}
      {/* 3ª coluna: subitens-ramo (ex.: dias) OU componentes (#) diretos do item */}
      {activeItem?.children?.length && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          {activeItem.children.map(child => (
            <ItemRow
              key={child.value ?? child.label}
              item={child}
              active={activeChild === child}
              rowCls={rowCls}
              modCls={modCls}
              onMain={() => onChildMain(child)}
              onModifiers={() => setActiveChild(child)}
            />
          ))}
        </ul>
      )}
      {activeItem?.components?.length && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          <li className={headerCls}>Componentes (#)</li>
          {activeItem.components.map(c => (
            <li key={c.suffix}>
              <button type="button" className={rowCls(false)} onClick={() => onPick((activeItem.value ?? '') + c.suffix)}>{c.label}</button>
            </li>
          ))}
        </ul>
      )}
      {/* 4ª coluna: componentes (#) do subitem (ex.: Apenas Horário / com Minutos) */}
      {activeChild?.components?.length && (
        <ul className={`${colCls} border-l ${borderCls}`}>
          <li className={headerCls}>Componentes (#)</li>
          {activeChild.components.map(c => (
            <li key={c.suffix}>
              <button type="button" className={rowCls(false)} onClick={() => onPick((activeChild.value ?? '') + c.suffix)}>{c.label}</button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body,
  )
}

const MEDIA_LABELS: Record<string, string> = { IMAGE: 'Imagem', FILE: 'PDF', VIDEO: 'Vídeo' }
const MEDIA_ICONS:  Record<string, string> = { IMAGE: '🖼️', FILE: '📄', VIDEO: '🎬' }

interface MediaMessageEditorProps {
  msg: NewMediaMessage
  index: number
  isDark: boolean
  inputCls: string
  labelCls: string
  ghostBtnCls: string
  onChange: (content: string, fileName: string) => void
  onRemove: () => void
}

/**
 * Editor de mensagem de mídia (IMAGE/FILE/VIDEO) no rascunho.
 * Duas abas: Link (URL manual) e Upload (via API presigned URL da OmniChat).
 * A aba Upload fica bloqueada sem token de sessão.
 */
function MediaMessageEditor({ msg, isDark, inputCls, labelCls, ghostBtnCls, onChange, onRemove }: MediaMessageEditorProps) {
  const [tab, setTab] = useState<'url' | 'upload'>('url')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const { hasToken, requestToken, uploadFile } = useTeams()

  const tabBase = `text-[10px] font-medium px-2 py-0.5 rounded transition-colors`
  const tabActive = isDark ? `${tabBase} bg-slate-700 text-slate-200` : `${tabBase} bg-white text-slate-700 shadow-sm`
  const tabInactive = isDark ? `${tabBase} text-slate-500 hover:text-slate-300` : `${tabBase} text-slate-400 hover:text-slate-600`

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploading(true)
    setUploadError(null)
    try {
      const result = await uploadFile(file, msg.type as UploadMediaType)
      onChange(result.content, result.fileName)
      setTab('url')
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Erro ao fazer upload.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className={labelCls}>{MEDIA_LABELS[msg.type] ?? msg.type} (nova)</span>
        <button className={ghostBtnCls} onClick={onRemove}>remover</button>
      </div>

      {/* Seletor de aba */}
      <div className={`flex gap-1 p-0.5 rounded-md w-fit ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <button type="button" className={tab === 'url' ? tabActive : tabInactive} onClick={() => setTab('url')}>Link</button>
        <button type="button" className={tab === 'upload' ? tabActive : tabInactive} onClick={() => setTab('upload')}>Upload ↑</button>
      </div>

      {tab === 'url' && (
        <div className="flex flex-col gap-1">
          <input
            className={inputCls}
            value={msg.content}
            placeholder="URL do arquivo (https://…)"
            onChange={e => onChange(e.target.value, msg.fileName)}
          />
          <input
            className={inputCls}
            value={msg.fileName}
            placeholder="Nome do arquivo (opcional)"
            onChange={e => onChange(msg.content, e.target.value)}
          />
        </div>
      )}

      {tab === 'upload' && (
        <div className="flex flex-col gap-1">
          {!hasToken ? (
            <div className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <button
                type="button"
                className="font-medium text-blue-500 hover:text-blue-600 text-left"
                onClick={requestToken}
              >
                Insira o token de sessão
              </button>
              {' '}para habilitar o upload.
            </div>
          ) : uploading ? (
            <p className={`text-[11px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Enviando…</p>
          ) : (
            <label className={`cursor-pointer text-xs font-medium rounded-lg border border-dashed px-2 py-2 text-center transition-colors ${
              isDark ? 'text-slate-400 border-slate-700 hover:bg-slate-800' : 'text-slate-500 border-slate-300 hover:bg-slate-50'
            }`}>
              Escolher arquivo
              <input
                type="file"
                className="hidden"
                accept={acceptFor(msg.type as UploadMediaType)}
                onChange={handleFileChange}
              />
            </label>
          )}
          {uploadError && (
            <p className={`text-[11px] leading-snug ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>{uploadError}</p>
          )}
          {msg.content && (
            <p className={`text-[10px] truncate ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              ✓ {msg.fileName || msg.content.split('/').pop()}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const ADD_MESSAGE_OPTIONS: { type: NewDraftMessage['type']; label: string }[] = [
  { type: 'TEXT',  label: 'Texto' },
  { type: 'IMAGE', label: 'Imagem' },
  { type: 'FILE',  label: 'PDF' },
  { type: 'VIDEO', label: 'Vídeo' },
  { type: 'COLLECTION', label: 'Coleção' },
  { type: 'TEMPLATE', label: 'Modelo de mensagem com Flow' },
  // Botão/Lista NÃO entra aqui: vira o "Menu" do nó de Escolha (seção própria, Fase 10c).
]

/** Ícones do menu "Adicionar Resposta" (mídia + texto + botão/lista + coleção + modelo). */
const ADD_MESSAGE_ICONS: Record<string, string> = { ...MEDIA_ICONS, TEXT: '✏️', BUTTONLIST: '🔘', COLLECTION: '🛍️', TEMPLATE: '🧩' }

/** Limites de caracteres do Botão/Lista, espelhando o construtor da plataforma (padrão WhatsApp). */
const BL_LIMITS = { header: 60, body: 80, footer: 60, title: 20, item: 20, desc: 72 } as const
const BL_MAX_ITEMS = 10
/** 4+ itens viram LIST (menu com título); 1-3, BUTTON (botões de resposta). */
const BL_LIST_THRESHOLD = 4

interface CharFieldProps {
  label: string
  value: string
  max: number
  placeholder?: string
  isDark: boolean
  inputCls: string
  labelCls: string
  onChange: (value: string) => void
}

/** Campo de texto com `maxLength` e contador "x/limite" (fica vermelho ao estourar). */
function CharField({ label, value, max, placeholder, isDark, inputCls, labelCls, onChange }: CharFieldProps) {
  const atLimit = value.length >= max
  const counterCls = atLimit
    ? (isDark ? 'text-rose-400' : 'text-rose-500')
    : (isDark ? 'text-slate-600' : 'text-slate-300')
  return (
    <label className="flex flex-col gap-0.5">
      <span className="flex items-center justify-between">
        <span className={labelCls}>{label}</span>
        <span className={`text-[10px] ${counterCls}`}>{value.length}/{max}</span>
      </span>
      <input className={inputCls} value={value} maxLength={max} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </label>
  )
}

interface ButtonListEditorProps {
  msg: NewButtonListMessage
  isDark: boolean
  inputCls: string
  labelCls: string
  ghostBtnCls: string
  dashedBtnCls: string
  onChange: (next: NewButtonListMessage) => void
  onRemove: () => void
}

/**
 * Editor de mensagem Botão/Lista de EXIBIÇÃO (Fase 10, variante "sem descrição").
 * 1-3 itens viram botões de resposta; 4-10 viram lista — e aí o "Título botão
 * opções" aparece e passa a ser obrigatório (validado no submit). A variante
 * "lista com descrição" virá em fase futura (botão desabilitado por ora).
 */
function ButtonListEditor({ msg, isDark, inputCls, labelCls, ghostBtnCls, dashedBtnCls, onChange, onRemove }: ButtonListEditorProps) {
  // "com descrição" é sempre lista; "sem descrição" vira lista só com 4+ itens.
  const isDescribed = msg.variant === 'described'
  const isList = isDescribed || msg.items.length >= BL_LIST_THRESHOLD
  const patch = (p: Partial<NewButtonListMessage>) => onChange({ ...msg, ...p })
  const setItem = (i: number, field: 'text' | 'description', value: string) =>
    patch({ items: msg.items.map((it, j) => j === i ? { ...it, [field]: value } : it) })
  const addItem = () => patch({ items: [...msg.items, { text: '', description: '' }] })
  const removeItem = (i: number) => patch({ items: msg.items.filter((_, j) => j !== i) })
  // Trocar de variante preserva os itens digitados; se estão todos vazios (pristine),
  // reinicia para 1 item (não há mínimo de 2).
  const changeVariant = (next: NewButtonListMessage['variant']) => {
    if (next === msg.variant) return
    const pristine = msg.items.every(it => !it.text.trim() && !it.description.trim())
    patch({ variant: next, items: pristine ? [{ text: '', description: '' }] : msg.items })
  }

  const segBase = 'text-[10px] font-medium px-2 py-0.5 rounded transition-colors'
  const segActive = isDark ? `${segBase} bg-slate-700 text-slate-200` : `${segBase} bg-white text-slate-700 shadow-sm`
  const segIdle = isDark ? `${segBase} text-slate-500 hover:text-slate-300` : `${segBase} text-slate-400 hover:text-slate-600`
  const canRemoveItem = msg.items.length > 1
  const canAddItem = msg.items.length < BL_MAX_ITEMS

  return (
    <div className={`flex flex-col gap-2 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between">
        <span className={labelCls}>🔘 Botão/Lista (nova) — {isList ? 'Lista (menu)' : 'Botões de resposta'}</span>
        <button className={ghostBtnCls} onClick={onRemove}>remover</button>
      </div>

      <CharField label="Título" value={msg.header} max={BL_LIMITS.header} placeholder="Cabeçalho (opcional)"
        isDark={isDark} inputCls={inputCls} labelCls={labelCls} onChange={v => patch({ header: v })} />
      <CharField label="Corpo do texto" value={msg.body} max={BL_LIMITS.body} placeholder="Mensagem principal (obrigatório)"
        isDark={isDark} inputCls={inputCls} labelCls={labelCls} onChange={v => patch({ body: v })} />
      <CharField label="Rodapé" value={msg.footer} max={BL_LIMITS.footer} placeholder="Rodapé (opcional)"
        isDark={isDark} inputCls={inputCls} labelCls={labelCls} onChange={v => patch({ footer: v })} />

      {/* Seletor de variante: sem descrição (botões/lista) ou com descrição (sempre lista) */}
      <div className={`flex gap-1 p-0.5 rounded-md w-fit ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
        <button type="button" className={msg.variant === 'plain' ? segActive : segIdle} onClick={() => changeVariant('plain')}>
          botão/lista sem descrição
        </button>
        <button type="button" className={msg.variant === 'described' ? segActive : segIdle} onClick={() => changeVariant('described')}>
          lista com descrição
        </button>
      </div>

      {/* Título do botão de opções — abaixo do seletor; sempre em "com descrição", senão só com 4+ itens */}
      {isList && (
        <CharField label="Título botão opções" value={msg.title} max={BL_LIMITS.title} placeholder="Rótulo do menu (opcional)"
          isDark={isDark} inputCls={inputCls} labelCls={labelCls} onChange={v => patch({ title: v })} />
      )}

      {/* Itens (1 a 10) */}
      <div className="flex flex-col gap-1.5">
        {msg.items.map((it, i) => (
          <div key={i} className={`flex flex-col gap-1 ${isDescribed ? `border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}` : ''}`}>
            <div className="flex items-end gap-1.5">
              <div className="flex-1">
                <CharField label={`Item ${i + 1}`} value={it.text} max={BL_LIMITS.item} placeholder="Texto do item"
                  isDark={isDark} inputCls={inputCls} labelCls={labelCls} onChange={v => setItem(i, 'text', v)} />
              </div>
              <button
                className={`${ghostBtnCls} mb-1 ${canRemoveItem ? '' : 'opacity-30 cursor-not-allowed'}`}
                disabled={!canRemoveItem}
                onClick={() => removeItem(i)}
              >remover</button>
            </div>
            {isDescribed && (
              <CharField label="Descrição" value={it.description} max={BL_LIMITS.desc} placeholder="Descrição do item (opcional)"
                isDark={isDark} inputCls={inputCls} labelCls={labelCls} onChange={v => setItem(i, 'description', v)} />
            )}
          </div>
        ))}
        <button
          className={`${dashedBtnCls} ${canAddItem ? '' : 'opacity-40 cursor-not-allowed'}`}
          disabled={!canAddItem}
          onClick={addItem}
        >+ Adicionar Item{canAddItem ? '' : ' (máx. 10)'}</button>
      </div>

    </div>
  )
}

interface ButtonListSummaryProps {
  config: ButtonMessageConfig
  /** Tipo real da mensagem (LIST/BUTTON) — define o rótulo com precisão. */
  msgType: string
  isDark: boolean
  labelCls: string
  ghostBtnCls: string
  onRemove: () => void
}

/**
 * Resumo (read-only) de uma mensagem Botão/Lista de EXIBIÇÃO já salva: moldura +
 * itens juntos, num único bloco, com um único "remover" que tira a mensagem inteira
 * (os botões vivem dentro do messageConfig, então saem junto). Editar uma mensagem
 * salva ainda não é suportado nesta fase — remover e recriar.
 */
function ButtonListSummary({ config, msgType, isDark, labelCls, ghostBtnCls, onRemove }: ButtonListSummaryProps) {
  const items = config.buttons ?? []
  const subCls = `text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`
  const chipCls = `text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`
  return (
    <div className={`flex flex-col gap-1 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between">
        <span className={labelCls}>🔘 {msgType === 'LIST' ? 'Lista' : 'Botões'}{config.header ? ` · ${config.header}` : ''}</span>
        <button className={ghostBtnCls} onClick={onRemove}>remover</button>
      </div>
      {config.body && <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>{config.body}</p>}
      {config.footer && <p className={subCls}>{config.footer}</p>}
      {msgType === 'LIST' && config.title && <p className={subCls}>Menu: {config.title}</p>}
      <div className="flex flex-col gap-0.5">
        {items.map((b, j) => (
          <div key={b.id ?? j} className="flex items-baseline gap-1.5">
            <span className={chipCls}>{j + 1}. {b.text}</span>
            {b.description && <span className={subCls}>{b.description}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Pré-visualização legível do menu (estilo "bolha" do WhatsApp): cabeçalho, corpo,
 * rodapé e os itens — botões de resposta (1-3, sem descrição) ou linhas de lista
 * (com o botão "ver opções" e a descrição de cada linha). Só leitura.
 */
function MenuPreview({ menu, isDark }: { menu: MenuDraft; isDark: boolean }) {
  const items = menu.items.filter(it => it.text.trim())
  const isList = menu.variant === 'described' || items.length >= BL_LIST_THRESHOLD
  const cardCls = isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'
  const subCls = `text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`
  const linkCls = isDark ? 'text-sky-400' : 'text-sky-600'
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-1.5 shadow-sm ${cardCls}`}>
      {menu.header.trim() && <p className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{menu.header}</p>}
      {menu.body.trim() && <p className={`text-xs whitespace-pre-wrap ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{menu.body}</p>}
      {menu.footer.trim() && <p className={subCls}>{menu.footer}</p>}
      {isList ? (
        <>
          <div className={`mt-1 rounded-lg border text-[11px] text-center py-1.5 font-medium ${linkCls} ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            ☰ {menu.title.trim() || 'Ver opções'}
          </div>
          {items.length > 0 && (
            <div className={`mt-1 flex flex-col gap-1 pl-2 border-l-2 border-dashed ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
              {items.map((it, i) => (
                <div key={i} className="flex flex-col">
                  <span className={`text-[11px] font-medium ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{i + 1}. {it.text}</span>
                  {it.description.trim() && <span className={subCls}>{it.description}</span>}
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {items.map((it, i) => (
            <div key={i} className={`text-[11px] text-center py-1.5 rounded-lg border font-medium ${linkCls} ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>{it.text}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/** Chip/TAG monoespaçado com o objectId da coleção (preview e resumo). */
function CollectionIdTag({ id, isDark }: { id: string; isDark: boolean }) {
  return (
    <span className={`inline-block text-[10px] font-mono px-1.5 py-0.5 rounded ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>
      {id}
    </span>
  )
}

/**
 * Preview de uma coleção: imagem de capa (quando houver) + nome + ID em TAG. Quando
 * só temos o `collectionId` (coleção não resolvida — fluxo importado sem carregar a
 * lista), `collection` vem `null` e exibimos apenas a TAG do ID.
 */
function CollectionPreview({ collection, collectionId, isDark }: { collection: Collection | null; collectionId: string; isDark: boolean }) {
  const cardCls = isDark ? 'bg-slate-800/60 border-slate-700' : 'bg-white border-slate-200'
  const name = collection?.name ?? ''
  const image = collection?.image ?? null
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 shadow-sm ${cardCls}`}>
      {image ? (
        <img src={image} alt={name || collectionId} className="w-full h-28 object-cover rounded-lg" />
      ) : (
        <div className={`w-full h-28 rounded-lg flex items-center justify-center text-2xl ${isDark ? 'bg-slate-800 text-slate-600' : 'bg-slate-100 text-slate-300'}`}>
          🛍️
        </div>
      )}
      {name && <p className={`text-xs font-semibold ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{name}</p>}
      <CollectionIdTag id={collectionId} isDark={isDark} />
    </div>
  )
}

/**
 * Picker de coleção: à esquerda uma caixa de busca + lista das coleções da loja
 * (carregadas sob demanda com o token de sessão, igual ao picker `@team`); à direita
 * o preview (capa + nome + ID em TAG) da coleção selecionada. A lista é filtrada no
 * cliente sobre as coleções já carregadas. Sem moldura/cabeçalho — é embutido no
 * `CollectionField` quando ele está no modo "editando".
 */
function CollectionPicker({ collectionId, isDark, inputCls, onChange }: { collectionId: string; isDark: boolean; inputCls: string; onChange: (collectionId: string) => void }) {
  const { collections, collectionsStatus, collectionsError, loadCollections, hasToken, requestToken, collectionsById } = useTeams()
  const [search, setSearch] = useState('')

  // Com token e ainda não carregado: dispara o fetch sozinho (igual ao picker de times).
  useEffect(() => {
    if (hasToken && collectionsStatus === 'idle') loadCollections()
  }, [hasToken, collectionsStatus, loadCollections])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? collections.filter(c => c.name.toLowerCase().includes(q)) : collections
  }, [collections, search])

  const selected = collectionId ? (collectionsById.get(collectionId) ?? null) : null

  const rowBase = 'w-full text-left text-xs px-2.5 py-1.5 transition-colors'
  const rowSel = isDark ? `${rowBase} bg-slate-700 text-slate-100` : `${rowBase} bg-blue-50 text-blue-700`
  const rowIdle = isDark ? `${rowBase} text-slate-300 hover:bg-slate-800` : `${rowBase} text-slate-700 hover:bg-slate-50`

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      {/* Coluna esquerda: busca + lista */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {!hasToken ? (
          <div className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <button type="button" className="font-medium text-blue-500 hover:text-blue-600 text-left" onClick={requestToken}>
              Insira o token de sessão
            </button>
            {' '}para carregar as coleções.
          </div>
        ) : (
          <>
            <input
              className={inputCls}
              value={search}
              placeholder="Buscar coleção…"
              onChange={e => setSearch(e.target.value)}
            />
            <div className={`rounded-lg border max-h-44 overflow-y-auto ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              {(collectionsStatus === 'idle' || collectionsStatus === 'loading') && (
                <p className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando…</p>
              )}
              {collectionsStatus === 'error' && (
                <div className="px-2.5 py-1.5 flex flex-col gap-1">
                  <span className={`text-[11px] leading-snug ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{collectionsError}</span>
                  <button type="button" className="self-start text-xs font-medium text-blue-500 hover:text-blue-600" onClick={() => loadCollections()}>
                    Tentar de novo
                  </button>
                </div>
              )}
              {collectionsStatus === 'loaded' && filtered.length === 0 && (
                <p className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {collections.length === 0 ? 'Nenhuma coleção encontrada.' : 'Nenhuma coleção bate com a busca.'}
                </p>
              )}
              {collectionsStatus === 'loaded' && filtered.map(c => (
                <button
                  key={c.objectId}
                  type="button"
                  className={collectionId === c.objectId ? rowSel : rowIdle}
                  onClick={() => onChange(c.objectId)}
                >{c.name}</button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Coluna direita: preview da coleção selecionada */}
      <div className="sm:w-44 shrink-0">
        {collectionId ? (
          <CollectionPreview collection={selected} collectionId={collectionId} isDark={isDark} />
        ) : (
          <div className={`rounded-xl border border-dashed p-3 text-[11px] text-center ${isDark ? 'border-slate-700 text-slate-500' : 'border-slate-200 text-slate-400'}`}>
            Selecione uma coleção para ver o preview.
          </div>
        )}
      </div>
    </div>
  )
}

interface CollectionFieldProps {
  collectionId: string
  /** `true` = picker aberto (Salvar visível); `false` = preview compacto (Editar visível). */
  editing: boolean
  isDark: boolean
  inputCls: string
  labelCls: string
  ghostBtnCls: string
  dashedBtnCls: string
  onChangeId: (collectionId: string) => void
  onSave: () => void
  onEdit: () => void
  onRemove: () => void
}

/**
 * Campo da resposta "Coleção" com dois estados: EDITANDO (picker de busca/lista +
 * botão "Salvar coleção") e SALVO (preview compacto capa+nome+ID + botões "editar"/
 * "remover"). O "Salvar" só confirma a escolha localmente (recolhe o picker); a
 * gravação no fluxo continua no "Aplicar alterações" do painel. Resolve nome/imagem
 * pelo `collectionsById`.
 */
function CollectionField({ collectionId, editing, isDark, inputCls, labelCls, ghostBtnCls, dashedBtnCls, onChangeId, onSave, onEdit, onRemove }: CollectionFieldProps) {
  const { collectionsById } = useTeams()
  const subCls = `text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`
  const collection = collectionId ? (collectionsById.get(collectionId) ?? null) : null
  const canSave = !!collectionId.trim()
  return (
    <div className={`flex flex-col gap-2 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between">
        <span className={labelCls}>🛍️ Coleção</span>
        <div className="flex items-center gap-2">
          {!editing && <button className={ghostBtnCls} onClick={onEdit}>editar</button>}
          <button className={ghostBtnCls} onClick={onRemove}>remover</button>
        </div>
      </div>
      {editing ? (
        <>
          <CollectionPicker collectionId={collectionId} isDark={isDark} inputCls={inputCls} onChange={onChangeId} />
          <button
            className={`${dashedBtnCls} ${canSave ? '' : 'opacity-40 cursor-not-allowed'}`}
            disabled={!canSave}
            onClick={onSave}
          >Salvar coleção{canSave ? '' : ' (selecione uma)'}</button>
        </>
      ) : (
        <div className="flex items-center gap-2">
          {collection?.image && <img src={collection.image} alt={collection.name} className="w-10 h-10 object-cover rounded" />}
          <div className="flex flex-col gap-0.5 min-w-0">
            {collection?.name
              ? <span className={`text-xs truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{collection.name}</span>
              : <span className={subCls}>Coleção não carregada (clique em editar para resolver o nome)</span>}
            <CollectionIdTag id={collectionId} isDark={isDark} />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Modelo de mensagem com Flow (resposta TEMPLATE, Fase 12) ────────────────

/** Segmento do corpo de um modelo: texto literal OU uma variável posicional `{{n}}`. */
type TemplateSegment = { text: string } | { varIndex: number }

/** Quebra o corpo (`...{{1}}...{{2}}...`) em segmentos para o preview. */
function splitTemplateBody(body: string): TemplateSegment[] {
  const segs: TemplateSegment[] = []
  let last = 0
  for (const m of body.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const start = m.index ?? 0
    if (start > last) segs.push({ text: body.slice(last, start) })
    segs.push({ varIndex: Number.parseInt(m[1], 10) })
    last = start + m[0].length
  }
  if (last < body.length) segs.push({ text: body.slice(last) })
  return segs
}

/**
 * Preview da mensagem do modelo: o corpo com cada `{{n}}` substituído inline pelo
 * valor digitado (chip sutil; mostra `{{n}}` esmaecido quando ainda vazio) e o botão
 * Flow renderizado abaixo como pílula desabilitada. Espelha o cartão do COLLECTION.
 */
function TemplatePreview({ body, tokens, flowButtonText, isDark }: { body: string; tokens: string[]; flowButtonText: string; isDark: boolean }) {
  const segs = splitTemplateBody(body)
  const chipCls = isDark ? 'bg-slate-700 text-slate-100' : 'bg-blue-50 text-blue-700'
  const emptyCls = isDark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
  return (
    <div className={`rounded-xl border p-2.5 flex flex-col gap-2 ${isDark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
      <p className={`text-xs whitespace-pre-wrap leading-relaxed ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>
        {segs.map((s, i) =>
          'text' in s
            ? <span key={i}>{s.text}</span>
            : (() => {
                const v = tokens[s.varIndex - 1]?.trim()
                return <span key={i} className={`inline-block rounded px-1 py-0.5 text-[11px] font-medium ${v ? chipCls : emptyCls}`}>{v || `{{${s.varIndex}}}`}</span>
              })(),
        )}
      </p>
      {flowButtonText && (
        <div className={`rounded-lg border text-center text-[11px] font-medium py-1.5 ${isDark ? 'border-slate-700 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
          🔗 {flowButtonText}
        </div>
      )}
    </div>
  )
}

/**
 * Picker de modelo de mensagem em formato DROPDOWN: um gatilho mostra o modelo
 * escolhido (ou "Selecionar modelo…") e, ao abrir, revela uma busca + a lista dos
 * modelos com Flow da loja (carregados sob demanda com o token, igual ao picker de
 * coleções). Filtra no cliente; escolher um item fecha o menu. Clique fora fecha
 * (mesmo padrão do "+ Adicionar Resposta"). Embutido no `TemplateField`.
 */
function TemplatePicker({ selectedId, isDark, inputCls, onSelect }: { selectedId: string; isDark: boolean; inputCls: string; onSelect: (t: MessageTemplate) => void }) {
  const { templates, templatesStatus, templatesError, loadTemplates, hasToken, requestToken, templatesById } = useTeams()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (hasToken && templatesStatus === 'idle') loadTemplates()
  }, [hasToken, templatesStatus, loadTemplates])

  // Clique fora fecha o dropdown.
  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as HTMLElement)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  // Foca a busca ao abrir (digitar filtra na hora).
  useEffect(() => { if (open) searchRef.current?.focus() }, [open])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? templates.filter(t => t.title.toLowerCase().includes(q)) : templates
  }, [templates, search])

  if (!hasToken) {
    return (
      <div className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
        <button type="button" className="font-medium text-blue-500 hover:text-blue-600 text-left" onClick={requestToken}>
          Insira o token de sessão
        </button>
        {' '}para carregar os modelos.
      </div>
    )
  }

  const selected = selectedId ? (templatesById.get(selectedId) ?? null) : null
  const rowBase = 'w-full text-left text-xs px-2.5 py-1.5 transition-colors'
  const rowSel = isDark ? `${rowBase} bg-slate-700 text-slate-100` : `${rowBase} bg-blue-50 text-blue-700`
  const rowIdle = isDark ? `${rowBase} text-slate-300 hover:bg-slate-800` : `${rowBase} text-slate-700 hover:bg-slate-50`
  const triggerLabel = selected?.title ?? (selectedId ? selectedId : 'Selecionar modelo…')

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <button
        type="button"
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
        onClick={() => setOpen(o => !o)}
      >
        <span className={`truncate ${selected || selectedId ? '' : (isDark ? 'text-slate-500' : 'text-slate-400')}`}>{triggerLabel}</span>
        <span className={`shrink-0 text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>▾</span>
      </button>
      {open && (
        <div className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-lg border shadow-lg overflow-hidden ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <div className="p-1.5">
            <input ref={searchRef} className={inputCls} value={search} placeholder="Buscar modelo…" onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="max-h-40 overflow-y-auto border-t border-inherit">
            {(templatesStatus === 'idle' || templatesStatus === 'loading') && (
              <p className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Carregando…</p>
            )}
            {templatesStatus === 'error' && (
              <div className="px-2.5 py-1.5 flex flex-col gap-1">
                <span className={`text-[11px] leading-snug ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>{templatesError}</span>
                <button type="button" className="self-start text-xs font-medium text-blue-500 hover:text-blue-600" onClick={() => loadTemplates()}>
                  Tentar de novo
                </button>
              </div>
            )}
            {templatesStatus === 'loaded' && filtered.length === 0 && (
              <p className={`px-2.5 py-1.5 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                {templates.length === 0 ? 'Nenhum modelo com Flow encontrado.' : 'Nenhum modelo bate com a busca.'}
              </p>
            )}
            {templatesStatus === 'loaded' && filtered.map(t => (
              <button key={t.objectId} type="button" className={selectedId === t.objectId ? rowSel : rowIdle} onClick={() => { onSelect(t); setOpen(false) }}>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface TemplateFieldProps {
  messageTemplateId: string
  tokens: string[]
  /** `true` = picker + campos de variável abertos (Salvar visível); `false` = preview compacto (Editar visível). */
  editing: boolean
  /** Título/corpo gravados, para o resumo quando o modelo não está carregado (id sumiu da plataforma). */
  fallbackTitle?: string
  fallbackBody?: string
  isDark: boolean
  inputCls: string
  labelCls: string
  ghostBtnCls: string
  dashedBtnCls: string
  /** Escolha de um modelo no picker (reinicia os tokens com o nº de variáveis dele). */
  onSelectTemplate: (t: MessageTemplate) => void
  /** Edição do valor da variável `i` (posicional). */
  onChangeToken: (i: number, value: string) => void
  onSave: () => void
  onEdit: () => void
  onRemove: () => void
}

/**
 * Campo da resposta "Modelo de mensagem com Flow" com dois estados (espelha o
 * `CollectionField`): EDITANDO (picker + N campos de variável com `@` + preview +
 * "Salvar") e SALVO (preview compacto + "editar"/"remover"). Só as variáveis são
 * editáveis; corpo/título/botão vêm do modelo aprovado no WhatsApp.
 */
function TemplateField({ messageTemplateId, tokens, editing, fallbackTitle, fallbackBody, isDark, inputCls, labelCls, ghostBtnCls, dashedBtnCls, onSelectTemplate, onChangeToken, onSave, onEdit, onRemove }: TemplateFieldProps) {
  const { templatesById } = useTeams()
  const tpl = messageTemplateId ? (templatesById.get(messageTemplateId) ?? null) : null
  const title = tpl?.title ?? fallbackTitle ?? ''
  const body = tpl?.body ?? fallbackBody ?? ''
  const flowButtonText = tpl?.flowButtonText ?? ''
  const varCount = tpl ? templateVarCount(tpl) : tokens.length
  // Salvar só com modelo escolhido e TODAS as variáveis preenchidas (decisão 5 do PLANS).
  const canSave = !!messageTemplateId && tokens.slice(0, varCount).every(t => t.trim())
  const subCls = `text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`

  return (
    <div className={`flex flex-col gap-2 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
      <div className="flex items-center justify-between">
        <span className={labelCls}>🧩 Modelo de mensagem</span>
        <div className="flex items-center gap-2">
          {!editing && <button className={ghostBtnCls} onClick={onEdit}>editar</button>}
          <button className={ghostBtnCls} onClick={onRemove}>remover</button>
        </div>
      </div>
      {editing ? (
        <>
          <TemplatePicker selectedId={messageTemplateId} isDark={isDark} inputCls={inputCls} onSelect={onSelectTemplate} />
          {messageTemplateId && (
            <>
              {varCount === 0 ? (
                <p className={subCls}>Este modelo não tem variáveis.</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {Array.from({ length: varCount }, (_, i) => (
                    <label key={i} className="flex flex-col gap-0.5">
                      <span className={labelCls}>Variável {`{{${i + 1}}}`}</span>
                      <VariableTextArea
                        rows={1}
                        className={`${inputCls} resize-none`}
                        value={tokens[i] ?? ''}
                        isDark={isDark}
                        placeholder={tpl?.examples[i] || 'Digite @ para valores dinâmicos'}
                        onChange={v => onChangeToken(i, v)}
                      />
                    </label>
                  ))}
                </div>
              )}
              <TemplatePreview body={body} tokens={tokens} flowButtonText={flowButtonText} isDark={isDark} />
              <button
                className={`${dashedBtnCls} ${canSave ? '' : 'opacity-40 cursor-not-allowed'}`}
                disabled={!canSave}
                onClick={onSave}
              >Salvar modelo{canSave ? '' : ' (preencha as variáveis)'}</button>
            </>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          {title
            ? <span className={`text-xs font-semibold truncate ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>{title}</span>
            : <span className={subCls}>Modelo não carregado (clique em editar para resolver)</span>}
          <TemplatePreview body={body} tokens={tokens} flowButtonText={flowButtonText} isDark={isDark} />
        </div>
      )}
    </div>
  )
}

interface AddMessageMenuProps {
  isDark: boolean
  dashedBtnCls: string
  onAdd: (type: NewDraftMessage['type']) => void
}

/** Botão "+ Adicionar Resposta" com dropdown de tipos de mensagem. */
function AddMessageMenu({ isDark, dashedBtnCls, onAdd }: AddMessageMenuProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleOutside(e: MouseEvent) {
      const target = e.target as HTMLElement | null
      if (wrapRef.current && !wrapRef.current.contains(target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [open])

  const menuCls = `absolute bottom-full left-0 mb-1 z-50 rounded-lg shadow-lg border overflow-hidden ${
    isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
  }`
  const itemCls = `w-full text-left text-xs px-3 py-2 transition-colors ${
    isDark ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-700 hover:bg-slate-50'
  }`

  return (
    <div ref={wrapRef} className="relative">
      <button className={dashedBtnCls} onClick={() => setOpen(o => !o)}>
        + Adicionar Resposta
      </button>
      {open && (
        <div className={menuCls}>
          {ADD_MESSAGE_OPTIONS.map(opt => (
            <button
              key={opt.type}
              className={itemCls}
              onClick={() => { onAdd(opt.type); setOpen(false) }}
            >
              {ADD_MESSAGE_ICONS[opt.type] ?? '✏️'} {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface VariablePickerProps {
  value: string
  onChange: (value: string) => void
  isDark: boolean
  inputCls: string
}

/**
 * Campo de variável ÚNICA (condição "O valor está vazio"). Exibe o rótulo amigável
 * dotado ("Consumidor.Nome") quando o valor bate com o catálogo, mas ao FOCAR revela
 * o token cru e fica editável como texto (para ajuste fino à mão). Clicar/`@` abre o
 * `VariableMenu`; a escolha SUBSTITUI o valor (campo de variável única).
 */
function VariablePicker({ value, onChange, isDark, inputCls }: VariablePickerProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { byId: teamNames } = useTeams()

  const { label, resolved } = variableDisplay(value, teamNames)
  const showFriendly = resolved && !editing // foco revela o cru editável

  /** Grava o valor cru; se for prefixo, mantém em edição para completar à mão. */
  const commit = useCallback((raw: string, isPrefix?: boolean) => {
    onChange(raw)
    setOpen(false)
    if (isPrefix) { setEditing(true); requestAnimationFrame(() => inputRef.current?.focus()) }
  }, [onChange])

  return (
    <div className="relative">
      <input
        ref={inputRef}
        className={`${inputCls} ${showFriendly ? 'cursor-pointer' : 'font-mono'}`}
        value={showFriendly ? label : value}
        onChange={e => onChange(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
        onClick={() => { if (value === '' || resolved) setOpen(true) }}
        onKeyDown={e => {
          if (e.key === 'Escape') setOpen(false)
          else if (e.key === '@') { e.preventDefault(); setOpen(true) }
        }}
        placeholder="clique ou digite @ para escolher"
      />
      {open && (
        <VariableMenu anchorRef={inputRef} isDark={isDark} onClose={() => setOpen(false)} onPick={commit} />
      )}
    </div>
  )
}

interface VariableTextAreaProps {
  value: string
  onChange: (value: string) => void
  isDark: boolean
  className?: string
  placeholder?: string
  /** Nº de linhas do textarea — `1` dá a versão de 1 linha (campos de variável do TEMPLATE). */
  rows?: number
}

/**
 * Textarea de mensagem com autocomplete de variáveis: digitar `@` abre o
 * `VariableMenu` e a escolha INSERE o token cru (`@customer.name`) na posição do
 * cursor — texto livre pode misturar várias variáveis ("Olá @customer.name 👋").
 * O conteúdo é gravado/enviado verbatim, como a OmniChat espera (ver example.json).
 */
function VariableTextArea({ value, onChange, isDark, className, placeholder, rows }: VariableTextAreaProps) {
  const [open, setOpen] = useState(false)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const triggerRef = useRef(0) // índice do '@' que abriu o menu

  const insert = useCallback((raw: string) => {
    const ta = taRef.current
    const start = triggerRef.current
    const caret = ta ? ta.selectionStart : start + 1
    // Substitui do '@' (inclusive) até o cursor pelo token cru (que já inclui '@').
    const next = value.slice(0, start) + raw + value.slice(caret)
    onChange(next)
    setOpen(false)
    requestAnimationFrame(() => {
      ta?.focus()
      const p = start + raw.length
      ta?.setSelectionRange(p, p)
    })
  }, [value, onChange])

  return (
    <div className="relative">
      <textarea
        ref={taRef}
        className={className}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Escape') { setOpen(false); return }
          // Não previne: deixa o '@' ser digitado e registra a posição dele.
          if (e.key === '@') { triggerRef.current = e.currentTarget.selectionStart; setOpen(true) }
        }}
      />
      {open && (
        <VariableMenu anchorRef={taRef} isDark={isDark} onClose={() => setOpen(false)} onPick={insert} />
      )}
    </div>
  )
}

interface ConditionTypeFieldsProps {
  type: string
  variable: string
  value: string
  intent: string
  context: string
  onVariable: (v: string) => void
  onValue: (v: string) => void
  onIntent: (v: string) => void
  onContext: (v: string) => void
  intents: BotIntent[]
  isDark: boolean
  inputCls: string
  labelCls: string
}

interface NumberStepperProps {
  /** Valor numérico como string (formato do draft/`valueNumber`); '' = vazio. */
  value: string
  onChange: (value: string) => void
  isDark: boolean
  inputCls: string
}

/**
 * Campo numérico inteiro com botões −/+ (gatilhos "Total é maior que" / "Total é
 * igual a"). Começa em 0 e aceita valores negativos; apagar ou digitar lixo volta
 * a 0. Mantém o valor como string (a plataforma guarda o número como string em
 * `condition.valueNumber`).
 */
function NumberStepper({ value, onChange, isDark, inputCls }: NumberStepperProps) {
  const parsed = Number.parseInt(value, 10)
  const current = Number.isFinite(parsed) ? parsed : 0
  const commit = (n: number) => onChange(String(n))

  const btnCls = `shrink-0 w-7 grid place-items-center rounded-lg border text-sm transition-colors ${
    isDark
      ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
  }`

  return (
    <div className="flex items-stretch gap-1">
      <button type="button" className={btnCls} onClick={() => commit(current - 1)} aria-label="Diminuir">−</button>
      <input
        type="number"
        inputMode="numeric"
        className={`${inputCls} text-center`}
        value={current}
        onChange={e => {
          const n = Number.parseInt(e.target.value, 10)
          commit(Number.isFinite(n) ? n : 0)
        }}
      />
      <button type="button" className={btnCls} onClick={() => commit(current + 1)} aria-label="Aumentar">+</button>
    </div>
  )
}

/**
 * Campos dependentes do TIPO da condição — compartilhado pelos dois editores (a
 * condição individual no modo `condition` e a lista de condições no modo group/solo),
 * pra não divergirem:
 *  - any / else                          → SEM campos (não têm operando)
 *  - context                             → "Intenção" + "Contexto" (IDs de intenções)
 *  - lastIntent                          → "Intenção"
 *  - empty / exists                       → só "Variável" (picker de @) — sem valor
 *  - contains                            → "Variável" (picker) + "Valores" (TAGs em `values`)
 *  - totalIsGreaterThan / totalIsEqual    → "Variável" (picker) + "Total" (stepper em `valueNumber`)
 *  - equals / demais                     → "Variável" (picker) + "Valor" (texto livre)
 */
function ConditionTypeFields(p: ConditionTypeFieldsProps) {
  const { type, intents, isDark, inputCls, labelCls } = p
  if (type === 'any' || type === 'else') return null // sem condição / senão: nada a preencher
  if (type === 'context') {
    return (
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className={labelCls}>Intenção</span>
          <IntentSelect value={p.intent} onChange={p.onIntent} intents={intents} inputCls={inputCls} emptyLabel="Nenhuma" />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className={labelCls}>Contexto</span>
          <IntentSelect value={p.context} onChange={p.onContext} intents={intents} inputCls={inputCls} emptyLabel="Nenhum" />
        </label>
      </div>
    )
  }
  if (type === 'lastIntent') {
    return (
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Intenção</span>
        <IntentSelect value={p.intent} onChange={p.onIntent} intents={intents} inputCls={inputCls} emptyLabel="Nenhuma" />
      </label>
    )
  }
  if (type === 'empty' || type === 'exists') {
    return (
      <label className="flex flex-col gap-1">
        <span className={labelCls}>Variável</span>
        <VariablePicker value={p.variable} onChange={p.onVariable} isDark={isDark} inputCls={inputCls} />
      </label>
    )
  }
  if (type === 'contains') {
    // "Valor contém" casa contra uma LISTA de termos — mesmo esquema de TAGs das
    // palavras-chave. Empilha (variável em cima, valores embaixo) porque a lista
    // de chips precisa da largura toda.
    return (
      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Variável</span>
          <VariablePicker value={p.variable} onChange={p.onVariable} isDark={isDark} inputCls={inputCls} />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>Valores</span>
          <KeywordTags value={p.value} onChange={p.onValue} isDark={isDark} placeholder="ex: boleto, pix, cartão" />
        </label>
      </div>
    )
  }
  if (type === 'totalIsGreaterThan' || type === 'totalIsEqual') {
    // "Total é maior que" / "Total é igual a" comparam um número (guardado em
    // `valueNumber`); inteiro (aceita negativo) com stepper (+/−), começando em 0.
    return (
      <div className="flex gap-2">
        <label className="flex flex-col gap-1 flex-1">
          <span className={labelCls}>Variável</span>
          <VariablePicker value={p.variable} onChange={p.onVariable} isDark={isDark} inputCls={inputCls} />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className={labelCls}>Total</span>
          <NumberStepper value={p.value} onChange={p.onValue} isDark={isDark} inputCls={inputCls} />
        </label>
      </div>
    )
  }
  // equals e demais tipos com operando escalar: Variável (picker de @) + Valor livre.
  return (
    <div className="flex gap-2">
      <label className="flex flex-col gap-1 flex-1">
        <span className={labelCls}>Variável</span>
        <VariablePicker value={p.variable} onChange={p.onVariable} isDark={isDark} inputCls={inputCls} />
      </label>
      <label className="flex flex-col gap-1 flex-1">
        <span className={labelCls}>Valor</span>
        <input className={inputCls} value={p.value} onChange={e => p.onValue(e.target.value)} />
      </label>
    </div>
  )
}

interface IntentSelectProps {
  /** ID da intenção selecionada (ou '' para nenhuma). */
  value: string
  onChange: (value: string) => void
  intents: BotIntent[]
  inputCls: string
  /** Rótulo da opção vazia (ex.: "Nenhum" / "Nenhuma"). */
  emptyLabel: string
}

/**
 * Dropdown que seleciona uma intenção existente (value = id, label = nome).
 * Se o valor atual apontar para um ID fora do fluxo carregado, mantém uma opção
 * de fallback para não perder o dado silenciosamente.
 */
function IntentSelect({ value, onChange, intents, inputCls, emptyLabel }: IntentSelectProps) {
  return (
    <select className={inputCls} value={value} onChange={e => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {intents.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
      {value && !intents.some(i => i.id === value) && (
        <option value={value}>{value} (fora do fluxo)</option>
      )}
    </select>
  )
}

interface NextFlowSectionProps {
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft | null>>
  /** Bot do fluxo atual — exclui-se do picker (isso é o "Neste bot"). */
  selfBotId: string
  /** Intenções do fluxo (já sem a própria) para o destino "Neste bot". */
  intents: BotIntent[]
  isDark: boolean
  inputCls: string
  labelCls: string
}

/**
 * Seção "Próximo Fluxo": define o destino do `next.intent` da condição em escopo.
 * "Neste bot" lista as intenções do fluxo; "Em outro bot" busca os bots da loja e,
 * após escolher um, as intenções daquele bot (via API, sob demanda, cache por bot).
 * Sem token de sessão, oferece abrir o campo de token em vez de listar bots.
 */
function NextFlowSection({ draft, setDraft, selfBotId, intents, isDark, inputCls, labelCls }: NextFlowSectionProps) {
  const {
    bots, botsStatus, botsError, loadBots, hasToken, requestToken,
    botIntents, botIntentsStatus, botIntentsError, loadBotIntents,
  } = useTeams()

  const isOther = draft.nextScope === 'other'

  // Carrega os bots ao abrir "Em outro bot" (com token), uma vez por sessão.
  useEffect(() => {
    if (isOther && hasToken && botsStatus === 'idle') loadBots()
  }, [isOther, hasToken, botsStatus, loadBots])

  // Carrega as intenções do bot escolhido (cache por bot no contexto).
  useEffect(() => {
    if (isOther && draft.nextBotId && hasToken && !botIntentsStatus[draft.nextBotId]) {
      loadBotIntents(draft.nextBotId)
    }
  }, [isOther, draft.nextBotId, hasToken, botIntentsStatus, loadBotIntents])

  const patch = (p: Partial<Draft>) => setDraft(d => d ? { ...d, ...p } : d)
  const otherIntents = botIntents[draft.nextBotId] ?? []
  const intentsStatus = botIntentsStatus[draft.nextBotId] ?? 'idle'
  const intentsErr = botIntentsError[draft.nextBotId]

  const segBase = 'flex-1 text-[11px] font-medium rounded-md px-2 py-1.5 transition-colors'
  const segActive = `${segBase} bg-violet-600 text-white${isDark ? '' : ' shadow-sm'}`
  const segIdle = isDark ? `${segBase} text-slate-400 hover:text-slate-200` : `${segBase} text-slate-500 hover:text-slate-700`
  const hintCls = `text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`
  const errCls = `text-[11px] leading-snug ${isDark ? 'text-rose-400' : 'text-rose-600'}`
  const linkBtn = `self-start text-[11px] font-medium underline ${isDark ? 'text-blue-400' : 'text-blue-600'}`

  return (
    <Section title="Próximo Fluxo" isDark={isDark}>
      <div className="flex flex-col gap-2.5">
        <div className={`flex gap-1 p-0.5 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
          <button type="button" className={!isOther ? segActive : segIdle} onClick={() => patch({ nextScope: 'self' })}>
            Neste bot
          </button>
          <button type="button" className={isOther ? segActive : segIdle} onClick={() => patch({ nextScope: 'other' })}>
            Em outro bot
          </button>
        </div>

        {!isOther ? (
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Destino (intenção)</span>
            <IntentSelect
              value={draft.nextSelfId}
              onChange={v => patch({ nextSelfId: v })}
              intents={intents}
              inputCls={inputCls}
              emptyLabel="Nenhum (sem próximo)"
            />
          </label>
        ) : !hasToken ? (
          <div className="flex flex-col gap-1.5">
            <p className={hintCls}>Conecte-se à loja para listar os bots disponíveis.</p>
            <button type="button" className={linkBtn} onClick={requestToken}>Inserir token de sessão</button>
          </div>
        ) : (
          <>
            <label className="flex flex-col gap-1">
              <span className={labelCls}>Selecionar bot</span>
              {botsStatus === 'loading' ? (
                <p className={hintCls}>Carregando bots…</p>
              ) : botsStatus === 'error' ? (
                <p className={errCls}>{botsError}</p>
              ) : (
                <select
                  className={inputCls}
                  value={draft.nextBotId}
                  onChange={e => patch({ nextBotId: e.target.value, nextOtherId: '' })}
                >
                  <option value="">— Selecione —</option>
                  {bots.filter(b => b.botId !== selfBotId).map(b => (
                    <option key={b.botId} value={b.botId}>{b.name}</option>
                  ))}
                  {draft.nextBotId && !bots.some(b => b.botId === draft.nextBotId) && (
                    <option value={draft.nextBotId}>{draft.nextBotId} (fora da lista)</option>
                  )}
                </select>
              )}
            </label>

            {draft.nextBotId && (
              <label className="flex flex-col gap-1">
                <span className={labelCls}>Selecionar intenção</span>
                {intentsStatus === 'loading' ? (
                  <p className={hintCls}>Carregando intenções…</p>
                ) : intentsStatus === 'error' ? (
                  <p className={errCls}>{intentsErr ?? 'Falha ao carregar as intenções.'}</p>
                ) : (
                  <select className={inputCls} value={draft.nextOtherId} onChange={e => patch({ nextOtherId: e.target.value })}>
                    <option value="">— Selecione —</option>
                    {otherIntents.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                    {draft.nextOtherId && !otherIntents.some(i => i.id === draft.nextOtherId) && (
                      <option value={draft.nextOtherId}>{draft.nextOtherId} (fora da lista)</option>
                    )}
                  </select>
                )}
              </label>
            )}
          </>
        )}
      </div>
    </Section>
  )
}

interface DetailPanelProps {
  node: Node<FlowNodeData>
  intent: BotIntent | null
  /** Todas as intenções do fluxo — para o seletor de contexto no modo grupo/solo. */
  intents: BotIntent[]
  /** Categorias conhecidas na sessão — alimenta o dropdown do campo Categoria. */
  categories: string[]
  /** Chamado antes do primeiro patch — o App captura o snapshot de undo aqui. */
  onBeforeApply: () => void
  onApply: (intentId: string) => void
  /** Chamado quando um patch falha no meio — o App faz rollback do parcial. */
  onApplyFailed: () => void
  onDelete: (intentId: string) => void
  /** Duplica a intenção inteira numa nova intenção (modos group/solo). */
  onDuplicateIntent: (intentId: string) => void
  /** Duplica a condição dentro da MESMA intenção (modos condition/solo). */
  onDuplicateConditionInIntent: (intentId: string, condIdx: number) => void
  /** Extrai a condição-filha para uma intenção NOVA (modo condition). */
  onDuplicateConditionOutside: (intentId: string, condIdx: number) => void
  onClose: () => void
}

export function DetailPanel({ node, intent, intents, categories, onBeforeApply, onApply, onApplyFailed, onDelete, onDuplicateIntent, onDuplicateConditionInIntent, onDuplicateConditionOutside, onClose }: DetailPanelProps) {
  const isDark = useTheme()
  const kind = (node.type ?? 'defaultNode') as NodeKind
  const badge = (isDark ? KIND_LABELS_DARK : KIND_LABELS_LIGHT)[kind]
  const { mode, condIdx } = resolveMode(node, intent)
  const [draft, setDraft] = useState<Draft | null>(intent ? buildDraft(intent, mode, condIdx) : null)
  const [panelError, setPanelError] = useState<string | null>(null)
  // Feedback ao aplicar (Fase 15): `applied` morfa o botão para "✓ Aplicado" por
  // ~1,2s no sucesso; `shake` treme o botão por ~0,4s na falha. Timers em ref para
  // limpar no unmount e não dispararem setState num componente desmontado.
  const [applied, setApplied] = useState(false)
  const [shake, setShake] = useState(false)
  const appliedTimer = useRef<number | null>(null)
  const shakeTimer = useRef<number | null>(null)
  useEffect(() => () => {
    if (appliedTimer.current) clearTimeout(appliedTimer.current)
    if (shakeTimer.current) clearTimeout(shakeTimer.current)
  }, [])
  const flashApplied = useCallback(() => {
    setApplied(true)
    if (appliedTimer.current) clearTimeout(appliedTimer.current)
    appliedTimer.current = window.setTimeout(() => setApplied(false), 1200)
  }, [])
  const flashShake = useCallback(() => {
    setShake(true)
    if (shakeTimer.current) clearTimeout(shakeTimer.current)
    shakeTimer.current = window.setTimeout(() => setShake(false), 400)
  }, [])
  // Coleções/modelos JÁ SALVOS abertos no modo "editar" (chave = endereço da mensagem).
  // Estado só de UI — reseta ao trocar de nó.
  const [editingColl, setEditingColl] = useState<Set<string>>(new Set())
  const [editingTpl, setEditingTpl] = useState<Set<string>>(new Set())
  const { templatesById } = useTeams()

  useEffect(() => {
    setDraft(intent ? buildDraft(intent, mode, condIdx) : null)
    setPanelError(null)
    setEditingColl(new Set())
    setEditingTpl(new Set())
  }, [node.id])

  const set = useCallback(<K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft(d => d ? { ...d, [key]: value } : d)
  }, [])

  /** Atualiza campos da condição `i` na lista de condições (modo group/solo). */
  const patchCond = useCallback((i: number, patch: Partial<DraftCondition>) => {
    setDraft(d => d ? { ...d, conditions: d.conditions.map((c, j) => j === i ? { ...c, ...patch } : c) } : d)
  }, [])

  // Opções do dropdown de Categoria, a partir das categorias conhecidas na sessão.
  // "Sem Categoria" sempre vem primeiro (valor padrão); o resto, ordenado.
  const categoryOptions = useMemo(() => {
    const found = new Set(categories.map(c => c.trim()).filter(Boolean))
    found.delete('Sem Categoria')
    return ['Sem Categoria', ...[...found].sort((a, b) => a.localeCompare(b, 'pt-BR'))]
  }, [categories])

  const showMeta    = mode === 'group' || mode === 'solo'
  const showTrigger = mode === 'condition'
  const showContent = mode === 'condition' || mode === 'solo'
  const showCondList = mode === 'group' || mode === 'solo'
  // "Próximo Fluxo" só em nós de passo único (next linear): exclui Escolha (roteia por
  // item) e Encerrar (terminal, sem próximo). Container/grupo e read-only ficam fora
  // por já não terem `showContent`.
  const showNextFlow = showContent && kind !== 'choiceNode' && kind !== 'endNode'

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

    // Nº de variáveis esperado de um modelo: o do modelo carregado, ou o nº de tokens
    // gravados quando o modelo não está mais disponível (id sumiu da plataforma).
    const tplVarCount = (id: string, tokens: string[]) => {
      const tpl = templatesById.get(id)
      return tpl ? templateVarCount(tpl) : tokens.length
    }
    // Validação (decisão 5 do PLANS): nenhuma resposta TEMPLATE com variável vazia.
    // Vale para novas (com modelo escolhido) e existentes. Mandar `{{n}}` cru ao
    // cliente no WhatsApp seria um vazamento visível.
    if (showContent) {
      const incompleteNew = draft.newMessages.some(m =>
        m.type === 'TEMPLATE' && m.messageTemplateId.trim()
        && m.tokens.slice(0, tplVarCount(m.messageTemplateId, m.tokens)).some(t => !t.trim()))
      const incompleteExisting = draft.messages.some(m =>
        m.type === 'TEMPLATE' && (m.messageTemplateId ?? '').trim()
        && (m.templateTokens ?? []).slice(0, tplVarCount(m.messageTemplateId!, m.templateTokens ?? [])).some(t => !t.trim()))
      if (incompleteNew || incompleteExisting) {
        setPanelError('Preencha todas as variáveis do modelo de mensagem antes de salvar.')
        onApplyFailed()
        flashShake()
        return
      }
    }
    // Monta o payload de serialização de um TEMPLATE a partir do modelo carregado,
    // caindo para os campos já gravados quando o modelo não está disponível.
    const tplPayload = (id: string, tokens: string[], fb?: { title?: string; content?: string; flowButtonText?: string }): TemplateMessagePayload => {
      const tpl = templatesById.get(id)
      return {
        messageTemplateId: id,
        title: tpl?.title ?? fb?.title ?? '',
        content: tpl?.body ?? fb?.content ?? '',
        tokens,
        flowButtonText: tpl?.flowButtonText ?? fb?.flowButtonText ?? '',
      }
    }

    if (showMeta) {
      results.push(updateIntentMeta(intent, {
        name: draft.name,
        category: draft.category,
        keywords: draft.keywords.split(',').map(k => k.trim()).filter(Boolean),
        priority: draft.priority,
        context: draft.context,
        // Ligado grava os segundos; desligado remove o campo (null sinaliza delete).
        executionDelay: draft.delayActive ? Number(draft.delaySeconds) : null,
      }))
    }

    if (showTrigger) {
      results.push(updateCondition(intent, condIdx, {
        name: draft.condName, type: draft.condType, variable: draft.condVariable, value: draft.condValue,
        intent: draft.condIntent, context: draft.condContext,
      }))
    }

    if (showContent) {
      // Menu Botão/Lista da condição de escolha (in-place ANTES das remoções, para o
      // ref não deslocar) + destinos. Menu novo é adicionado; salvo é substituído.
      if (draft.choiceCondIdx >= 0) {
        const m = draft.menu
        if (m) {
          const cfg = { header: m.header, body: m.body, footer: m.footer, title: m.title, items: m.items, variant: m.variant }
          if (m.editRef) {
            results.push(replaceButtonListMessage(intent, m.editRef, cfg))
          } else if (m.body.trim() || m.items.some(it => it.text.trim())) {
            results.push(addButtonListMessage(intent, cfg, draft.choiceCondIdx))
          }
        }
        results.push(setChoices(intent, draft.choiceCondIdx, draft.choices))
      }
      results.push(
        // TEXT e COLLECTION são editáveis em mensagens existentes; IMAGE/FILE/VIDEO são display-only.
        ...draft.messages.filter(m => m.type === 'TEXT').map(m => updateMessageText(intent, m.ref, m.text)),
        ...draft.messages
          .filter(m => m.type === 'COLLECTION' && !!(m.collectionId ?? '').trim())
          .map(m => updateCollectionMessage(intent, m.ref, (m.collectionId ?? '').trim())),
        ...draft.messages
          .filter(m => m.type === 'TEMPLATE' && !!(m.messageTemplateId ?? '').trim())
          .map(m => {
            const cur = intent.conditions[m.ref.condIdx]?.assistant_says[m.ref.sayIdx]?.messages[m.ref.msgIdx]
            return updateTemplateMessage(intent, m.ref, tplPayload(m.messageTemplateId!, m.templateTokens ?? [], {
              title: cur?.title, content: cur?.content ?? undefined, flowButtonText: cur?.messageConfig?.buttons?.[0]?.text,
            }))
          }),
        ...[...draft.removedRefs]
          .sort((a, b) => b.condIdx - a.condIdx || b.sayIdx - a.sayIdx || b.msgIdx - a.msgIdx)
          .map(ref => removeMessage(intent, ref)),
        ...draft.newMessages
          // Botão/Lista conta com corpo ou item; Coleção com collectionId; demais com content (evita rascunho vazio).
          .filter(m =>
            m.type === 'BUTTONLIST' ? (m.body.trim() || m.items.some(it => it.text.trim()))
            : m.type === 'COLLECTION' ? !!m.collectionId.trim()
            : m.type === 'TEMPLATE' ? !!m.messageTemplateId.trim()
            : m.content.trim())
          .map(m =>
            m.type === 'TEXT' ? addTextMessage(intent, m.content.trim(), ci ?? 0)
            : m.type === 'BUTTONLIST'
              ? addButtonListMessage(intent, { header: m.header, body: m.body, footer: m.footer, title: m.title, items: m.items, variant: m.variant }, ci ?? 0)
            : m.type === 'COLLECTION'
              ? addCollectionMessage(intent, m.collectionId.trim(), ci ?? 0)
            : m.type === 'TEMPLATE'
              ? addTemplateMessage(intent, tplPayload(m.messageTemplateId.trim(), m.tokens), ci ?? 0)
              : addMediaMessage(intent, m.type, m.content.trim(), m.fileName.trim(), ci ?? 0)
          ),
      )
      if (kind === 'transferNode') {
        results.push(updateActionFields(intent, 'transfer', { transferType: draft.transferType, value: draft.transferValue }, ci))
      }
      if (kind === 'captureNode') {
        // Modo múltiplo: sentinela em captureDataType + array em multipleFields.
        // Modo single: o dado real + multipleFields vazio. variable sempre '' (campo removido da UI).
        const isMultiple = draft.captureMode === CAPTURE_CATEGORY.multiple
        results.push(updateActionFields(intent, 'captureData', {
          captureDataType: isMultiple ? MULTIPLE_FIELDS_SENTINEL : draft.captureDataType,
          captureDataTypesCategory: isMultiple ? CAPTURE_CATEGORY.multiple : CAPTURE_CATEGORY.single,
          multipleFields: isMultiple ? draft.captureMultiple : [],
          variable: '',
        }, ci))
      }
      if (kind === 'setDataNode') {
        results.push(updateSetDataItems(intent, draft.setDataItems, ci))
      }
    }

    if (showNextFlow) {
      // Condição-alvo: a própria no modo condition; a única (idx 0) no solo.
      const target = intent.conditions[ci ?? 0]
      if (target) {
        const ref = draft.nextScope === 'other'
          ? (draft.nextBotId && draft.nextOtherId ? { botId: draft.nextBotId, id: draft.nextOtherId } : null)
          : (draft.nextSelfId ? { botId: intent.botId, id: draft.nextSelfId } : null)
        setNextRef(target, ref, intent.botId)
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
      flashShake()
      return
    }
    setPanelError(null)
    onApply(intent.id)
    flashApplied()
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
  const dupBtnCls = `w-full text-xs font-medium rounded-lg px-3 py-1.5 border transition-colors ${
    isDark ? 'text-indigo-300 border-indigo-900 hover:bg-indigo-950' : 'text-indigo-600 border-indigo-200 hover:bg-indigo-50'
  }`

  const editable = !!intent && !!draft && mode !== 'externalRO' && mode !== 'startRO'
  const canDeleteCondition = mode === 'condition' && !!intent && intent.conditions.length > 1
  // Captura exige uma escolha real: bloqueia o save no single em repouso (vazio ou
  // `free`, o placeholder) ou no múltiplo sem marcações.
  const captureInvalid = !!draft && kind === 'captureNode' && (
    draft.captureMode === CAPTURE_CATEGORY.multiple
      ? draft.captureMultiple.length === 0
      : (!draft.captureDataType || draft.captureDataType === FREE_CAPTURE)
  )

  // Editar informação exige ao menos uma linha, com variável E valor preenchidos.
  const setDataInvalid = !!draft && kind === 'setDataNode' && (
    draft.setDataItems.length === 0
      || draft.setDataItems.some(it => !it.variable.trim() || !it.value.trim())
  )

  // Com o toggle de tempo de envio ligado, os segundos precisam ser inteiro em [1,30].
  const delayInvalid = !!draft && draft.delayActive && (() => {
    if (!/^\d+$/.test(draft.delaySeconds)) return true
    const n = Number(draft.delaySeconds)
    return n < 1 || n > 30
  })()

  // "Aplicar" fica bloqueado enquanto houver dado de captura, variável de
  // Editar informação ou tempo de envio inválido.
  const applyBlocked = captureInvalid || setDataInvalid || delayInvalid
  const applyHint = captureInvalid ? ' (selecione um dado)'
    : setDataInvalid ? ' (preencha variável e valor)'
    : delayInvalid ? ' (tempo: 1–30s)' : ''

  return (
    <div data-testid="detail-panel" className={`absolute right-0 top-0 h-full w-96 rounded-l-2xl shadow-2xl z-10 flex flex-col overflow-hidden ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
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
                    <input className={inputCls} value={draft.name} onChange={e => set('name', sanitizeIntentName(e.target.value))} />
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className={labelCls}>Categoria</span>
                    <CategorySelect
                      value={draft.category}
                      onChange={v => set('category', v)}
                      options={categoryOptions}
                      isDark={isDark}
                      inputCls={inputCls}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className={labelCls}>Palavras-chave</span>
                    <KeywordTags value={draft.keywords} onChange={v => set('keywords', v)} isDark={isDark} />
                  </div>
                  <div className="flex gap-2">
                    <label className="flex flex-col gap-1 flex-1">
                      <span className={labelCls}>Prioridade</span>
                      <select className={inputCls} value={draft.priority} onChange={e => set('priority', Number(e.target.value))}>
                        {PRIORITY_LABELS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 flex-1">
                      <span className={labelCls}>Contexto (intenção que precede)</span>
                      <IntentSelect
                        value={draft.context}
                        onChange={v => set('context', v)}
                        intents={intents.filter(i => i.id !== intent!.id)}
                        inputCls={inputCls}
                        emptyLabel="Nenhum"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="accent-violet-600"
                        checked={draft.delayActive}
                        onChange={e => {
                          const active = e.target.checked
                          set('delayActive', active)
                          // Ao ligar sem valor prévio, semeia o piso da faixa (1s).
                          if (active && !draft.delaySeconds) set('delaySeconds', '1')
                        }}
                      />
                      <span className={labelCls}>Configurar tempo para envio da resposta</span>
                    </label>
                    <span className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Defina o tempo que o bot deve esperar para responder uma ou mais mensagens.
                    </span>
                    {draft.delayActive && (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="number"
                          min={1}
                          max={30}
                          step={1}
                          className={`${inputCls} w-20 ${delayInvalid ? 'border-rose-500 focus:border-rose-500' : ''}`}
                          value={draft.delaySeconds}
                          onChange={e => set('delaySeconds', e.target.value)}
                        />
                        <span className={labelCls}>segundos (1–30)</span>
                      </div>
                    )}
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
                  <ConditionTypeFields
                    type={draft.condType}
                    variable={draft.condVariable} value={draft.condValue}
                    intent={draft.condIntent} context={draft.condContext}
                    onVariable={v => set('condVariable', v)} onValue={v => set('condValue', v)}
                    onIntent={v => set('condIntent', v)} onContext={v => set('condContext', v)}
                    intents={intents} isDark={isDark} inputCls={inputCls} labelCls={labelCls}
                  />
                </div>
              </Section>
            )}

            {showContent && draft && (
              <Section title="Mensagens" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  {/* Mensagens existentes */}
                  {draft.messages.map((msg, i) => (
                    <div key={`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`} className="flex flex-col gap-0.5">
                      {msg.type === 'TEXT' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <span className={labelCls}>Texto</span>
                            <button
                              className={ghostBtnCls}
                              onClick={() => setDraft(d => d && ({
                                ...d,
                                messages: d.messages.filter((_, j) => j !== i),
                                removedRefs: [...d.removedRefs, msg.ref],
                              }))}
                            >remover</button>
                          </div>
                          <VariableTextArea
                            className={`${inputCls} resize-y min-h-[56px]`}
                            value={msg.text}
                            isDark={isDark}
                            onChange={v => setDraft(d => d && ({
                              ...d,
                              messages: d.messages.map((m, j) => j === i ? { ...m, text: v } : m),
                            }))}
                          />
                        </>
                      ) : isDisplayButtonList(intent, msg.ref, msg.type) ? (
                        <ButtonListSummary
                          config={intent!.conditions[msg.ref.condIdx].assistant_says[msg.ref.sayIdx].messages[msg.ref.msgIdx].messageConfig!}
                          msgType={msg.type}
                          isDark={isDark}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          onRemove={() => setDraft(d => d && ({
                            ...d,
                            messages: d.messages.filter((_, j) => j !== i),
                            removedRefs: [...d.removedRefs, msg.ref],
                          }))}
                        />
                      ) : msg.type === 'COLLECTION' ? (
                        <CollectionField
                          collectionId={msg.collectionId ?? ''}
                          editing={editingColl.has(`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`)}
                          isDark={isDark}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          dashedBtnCls={dashedBtnCls}
                          onChangeId={id => setDraft(d => d && ({
                            ...d,
                            messages: d.messages.map((m, j) => j === i ? { ...m, collectionId: id } : m),
                          }))}
                          onSave={() => setEditingColl(s => {
                            const n = new Set(s); n.delete(`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`); return n
                          })}
                          onEdit={() => setEditingColl(s => new Set(s).add(`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`))}
                          onRemove={() => setDraft(d => d && ({
                            ...d,
                            messages: d.messages.filter((_, j) => j !== i),
                            removedRefs: [...d.removedRefs, msg.ref],
                          }))}
                        />
                      ) : msg.type === 'TEMPLATE' ? (
                        <TemplateField
                          messageTemplateId={msg.messageTemplateId ?? ''}
                          tokens={msg.templateTokens ?? []}
                          editing={editingTpl.has(`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`)}
                          fallbackTitle={msg.templateTitle}
                          fallbackBody={msg.text}
                          isDark={isDark}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          dashedBtnCls={dashedBtnCls}
                          onSelectTemplate={t => setDraft(d => d && ({
                            ...d,
                            messages: d.messages.map((m, j) => j === i ? { ...m, messageTemplateId: t.objectId, templateTitle: t.title, templateTokens: Array(templateVarCount(t)).fill('') } : m),
                          }))}
                          onChangeToken={(vi, value) => setDraft(d => d && ({
                            ...d,
                            messages: d.messages.map((m, j) => j === i ? { ...m, templateTokens: (m.templateTokens ?? []).map((t, k) => k === vi ? value : t) } : m),
                          }))}
                          onSave={() => setEditingTpl(s => {
                            const n = new Set(s); n.delete(`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`); return n
                          })}
                          onEdit={() => setEditingTpl(s => new Set(s).add(`${msg.ref.condIdx}-${msg.ref.sayIdx}-${msg.ref.msgIdx}`))}
                          onRemove={() => setDraft(d => d && ({
                            ...d,
                            messages: d.messages.filter((_, j) => j !== i),
                            removedRefs: [...d.removedRefs, msg.ref],
                          }))}
                        />
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span>{MEDIA_ICONS[msg.type] ?? '📎'}</span>
                            <span className={`${labelCls} truncate`} title={msg.fileName || msg.text}>
                              {msg.fileName || msg.text.split('/').pop() || msg.type}
                            </span>
                          </div>
                          <button
                            className={ghostBtnCls}
                            onClick={() => setDraft(d => d && ({
                              ...d,
                              messages: d.messages.filter((_, j) => j !== i),
                              removedRefs: [...d.removedRefs, msg.ref],
                            }))}
                          >remover</button>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Novas mensagens ainda não aplicadas */}
                  {draft.newMessages.map((msg, i) => (
                    <div key={`new-${i}`}>
                      {msg.type === 'TEXT' ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center justify-between">
                            <span className={labelCls}>Texto (nova)</span>
                            <button
                              className={ghostBtnCls}
                              onClick={() => set('newMessages', draft.newMessages.filter((_, j) => j !== i))}
                            >remover</button>
                          </div>
                          <VariableTextArea
                            className={`${inputCls} resize-y min-h-[56px]`}
                            value={msg.content}
                            isDark={isDark}
                            placeholder="Texto da mensagem…"
                            onChange={v => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, content: v } : m))}
                          />
                        </div>
                      ) : msg.type === 'BUTTONLIST' ? (
                        <ButtonListEditor
                          msg={msg}
                          isDark={isDark}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          dashedBtnCls={dashedBtnCls}
                          onChange={next => set('newMessages', draft.newMessages.map((m, j) => j === i ? next : m))}
                          onRemove={() => set('newMessages', draft.newMessages.filter((_, j) => j !== i))}
                        />
                      ) : msg.type === 'COLLECTION' ? (
                        <CollectionField
                          collectionId={msg.collectionId}
                          editing={msg.editing}
                          isDark={isDark}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          dashedBtnCls={dashedBtnCls}
                          onChangeId={collectionId => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, collectionId } : m))}
                          onSave={() => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, editing: false } : m))}
                          onEdit={() => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, editing: true } : m))}
                          onRemove={() => set('newMessages', draft.newMessages.filter((_, j) => j !== i))}
                        />
                      ) : msg.type === 'TEMPLATE' ? (
                        <TemplateField
                          messageTemplateId={msg.messageTemplateId}
                          tokens={msg.tokens}
                          editing={msg.editing}
                          isDark={isDark}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          dashedBtnCls={dashedBtnCls}
                          onSelectTemplate={t => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, messageTemplateId: t.objectId, tokens: Array(templateVarCount(t)).fill('') } : m))}
                          onChangeToken={(vi, value) => set('newMessages', draft.newMessages.map((m, j) => j === i && m.type === 'TEMPLATE' ? { ...m, tokens: m.tokens.map((t, k) => k === vi ? value : t) } : m))}
                          onSave={() => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, editing: false } : m))}
                          onEdit={() => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, editing: true } : m))}
                          onRemove={() => set('newMessages', draft.newMessages.filter((_, j) => j !== i))}
                        />
                      ) : (
                        <MediaMessageEditor
                          msg={msg}
                          index={i}
                          isDark={isDark}
                          inputCls={inputCls}
                          labelCls={labelCls}
                          ghostBtnCls={ghostBtnCls}
                          onChange={(content, fileName) => set('newMessages', draft.newMessages.map((m, j) => j === i ? { ...m, content, fileName } : m))}
                          onRemove={() => set('newMessages', draft.newMessages.filter((_, j) => j !== i))}
                        />
                      )}
                    </div>
                  ))}

                  {/* Botão "+ Adicionar Resposta" com dropdown de tipos */}
                  <AddMessageMenu
                    isDark={isDark}
                    dashedBtnCls={dashedBtnCls}
                    onAdd={type => set('newMessages', [...draft.newMessages, type === 'BUTTONLIST'
                      ? { type, variant: 'plain', header: '', body: '', footer: '', title: '', items: [{ text: '', description: '' }] }
                      : type === 'COLLECTION'
                        ? { type, collectionId: '', editing: true }
                      : type === 'TEMPLATE'
                        ? { type, messageTemplateId: '', tokens: [], editing: true }
                        : { type, content: '', fileName: '' }])}
                  />
                </div>
              </Section>
            )}

            {showContent && draft && kind === 'choiceNode' && (
              <Section title="Menu (Botão/Lista)" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  {draft.menu ? (
                    <>
                      <ButtonListEditor
                        msg={{ type: 'BUTTONLIST', variant: draft.menu.variant, header: draft.menu.header, body: draft.menu.body, footer: draft.menu.footer, title: draft.menu.title, items: draft.menu.items }}
                        isDark={isDark}
                        inputCls={inputCls}
                        labelCls={labelCls}
                        ghostBtnCls={ghostBtnCls}
                        dashedBtnCls={dashedBtnCls}
                        onChange={next => setDraft(d => (d && d.menu) ? { ...d, menu: { ...d.menu, variant: next.variant, header: next.header, body: next.body, footer: next.footer, title: next.title, items: next.items } } : d)}
                        onRemove={() => setDraft(d => d && ({ ...d, menu: null, removedRefs: d.menu?.editRef ? [...d.removedRefs, d.menu.editRef] : d.removedRefs }))}
                      />
                      <span className={labelCls}>Pré-visualização</span>
                      <MenuPreview menu={draft.menu} isDark={isDark} />
                    </>
                  ) : (
                    <button
                      className={dashedBtnCls}
                      onClick={() => set('menu', { editRef: null, variant: 'plain', header: '', body: '', footer: '', title: '', items: [{ text: '', description: '' }] })}
                    >+ Criar menu Botão/Lista</button>
                  )}
                </div>
              </Section>
            )}

            {showContent && draft && kind === 'choiceNode' && (
              <Section title="Escolhas" isDark={isDark}>
                <div className="flex flex-col gap-2">
                  <p className={`text-[11px] leading-snug ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Cada escolha liga, pela ordem, ao item de mesma posição do menu. Item sem destino pode transitar por palavra-chave.
                  </p>
                  {draft.choices.map((dest, i) => (
                    <div key={i} className={`flex flex-col gap-1 border rounded-lg p-2 ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                      <div className="flex items-center justify-between">
                        <span className={labelCls}>
                          Opção {i + 1}{draft.menu?.items[i]?.text.trim() ? `: ${draft.menu.items[i].text}` : ''}
                        </span>
                        <button className={ghostBtnCls} title="Remover escolha" onClick={() => set('choices', draft.choices.filter((_, j) => j !== i))}>×</button>
                      </div>
                      <IntentSelect
                        value={dest}
                        onChange={v => set('choices', draft.choices.map((c, j) => j === i ? v : c))}
                        intents={intents.filter(it => it.id !== intent!.id)}
                        inputCls={inputCls}
                        emptyLabel="Sem destino (palavra-chave)"
                      />
                    </div>
                  ))}
                  <button
                    className={`${dashedBtnCls} ${draft.menu && draft.choices.length >= draft.menu.items.length ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={!!draft.menu && draft.choices.length >= draft.menu.items.length}
                    onClick={() => set('choices', [...draft.choices, ''])}
                  >+ Adicionar Escolha</button>
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

            {showContent && draft && kind === 'captureNode' && (() => {
              const isMultiple = draft.captureMode === CAPTURE_CATEGORY.multiple
              const singleEmpty = !draft.captureDataType || draft.captureDataType === FREE_CAPTURE
              // Valor legado fora das 11 opções (exceto o `free` do placeholder):
              // preserva como <option> extra (anti-corrupção de import).
              const legacySingle = !isMultiple && !singleEmpty
                && !CAPTURE_FIELDS.some(f => f.value === draft.captureDataType)
                ? draft.captureDataType : null
              const isEmpty = isMultiple ? draft.captureMultiple.length === 0 : singleEmpty
              // Alternar modo limpa a seleção do outro (decisão 4); single volta ao
              // repouso `free` (placeholder), múltiplo zera o array.
              const switchMode = (mode: string) => {
                if (mode === draft.captureMode) return
                setDraft(d => d ? {
                  ...d,
                  captureMode: mode,
                  captureDataType: mode === CAPTURE_CATEGORY.multiple ? '' : FREE_CAPTURE,
                  captureMultiple: [],
                } : d)
              }
              const toggleField = (value: string) => setDraft(d => d ? {
                ...d,
                captureMultiple: d.captureMultiple.includes(value)
                  ? d.captureMultiple.filter(v => v !== value)
                  : [...d.captureMultiple, value],
              } : d)
              const segBase = 'flex-1 text-[11px] font-medium rounded-md px-2 py-1.5 transition-colors'
              const segActive = isDark ? `${segBase} bg-violet-600 text-white` : `${segBase} bg-violet-600 text-white shadow-sm`
              const segIdle = isDark ? `${segBase} text-slate-400 hover:text-slate-200` : `${segBase} text-slate-500 hover:text-slate-700`
              return (
                <Section title="Captura de dado" isDark={isDark}>
                  <div className="flex flex-col gap-2.5">
                    {/* Modo: uma informação x múltiplas — exclusivos */}
                    <div className={`flex gap-1 p-0.5 rounded-lg ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
                      <button type="button" className={!isMultiple ? segActive : segIdle} onClick={() => switchMode(CAPTURE_CATEGORY.single)}>
                        Uma informação
                      </button>
                      <button type="button" className={isMultiple ? segActive : segIdle} onClick={() => switchMode(CAPTURE_CATEGORY.multiple)}>
                        Múltiplas informações
                      </button>
                    </div>

                    {!isMultiple ? (
                      <label className="flex flex-col gap-1">
                        <span className={labelCls}>Dado a coletar</span>
                        <select className={inputCls} value={draft.captureDataType} onChange={e => set('captureDataType', e.target.value)}>
                          <option value={FREE_CAPTURE}>— Selecione —</option>
                          {CAPTURE_FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                          {legacySingle && <option value={legacySingle}>{legacySingle}</option>}
                        </select>
                      </label>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <span className={labelCls}>Dados a coletar</span>
                        <div className="flex flex-col gap-1">
                          {CAPTURE_FIELDS.map(f => (
                            <label key={f.value} className="flex items-center gap-2 text-xs cursor-pointer">
                              <input
                                type="checkbox"
                                className="accent-violet-600"
                                checked={draft.captureMultiple.includes(f.value)}
                                onChange={() => toggleField(f.value)}
                              />
                              <span className={isDark ? 'text-slate-300' : 'text-slate-700'}>{f.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}

                    {isEmpty && (
                      <p className={`text-[11px] leading-snug ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                        Selecione ao menos um dado para salvar.
                      </p>
                    )}
                  </div>
                </Section>
              )
            })()}

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
                      <button
                        className={`${ghostBtnCls} ${draft.setDataItems.length <= 1 ? 'opacity-30 cursor-not-allowed' : ''}`}
                        disabled={draft.setDataItems.length <= 1}
                        title={draft.setDataItems.length <= 1 ? 'É necessária ao menos uma variável' : 'Remover variável'}
                        onClick={() => set('setDataItems', draft.setDataItems.filter((_, j) => j !== i))}
                      >×</button>
                    </div>
                  ))}
                  <button className={dashedBtnCls} onClick={() => set('setDataItems', [...draft.setDataItems, { variable: '', value: '' }])}>
                    + Adicionar variável
                  </button>
                  {setDataInvalid && (
                    <p className={`text-[11px] leading-snug ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                      Preencha variável e valor em todas as linhas para salvar.
                    </p>
                  )}
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
                          onChange={e => patchCond(i, { name: e.target.value })}
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
                      <select
                        className={inputCls}
                        value={cond.type}
                        onChange={e => patchCond(i, { type: e.target.value })}
                      >
                        {COND_TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        {!COND_TYPE_OPTIONS.some(t => t.value === cond.type) && (
                          <option value={cond.type}>{cond.type}</option>
                        )}
                      </select>
                      <ConditionTypeFields
                        type={cond.type}
                        variable={cond.variable} value={cond.value}
                        intent={cond.intent} context={cond.context}
                        onVariable={v => patchCond(i, { variable: v })}
                        onValue={v => patchCond(i, { value: v })}
                        onIntent={v => patchCond(i, { intent: v })}
                        onContext={v => patchCond(i, { context: v })}
                        intents={intents} isDark={isDark} inputCls={inputCls} labelCls={labelCls}
                      />
                      {cond.originalIdx === null && (
                        <div className="flex items-center gap-1.5">
                          <span className={`${labelCls} shrink-0`}>Ação:</span>
                          <select
                            className={inputCls}
                            value={cond.kind ?? 'defaultNode'}
                            onChange={e => patchCond(i, { kind: e.target.value as CreatableKind })}
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
                    onClick={() => set('conditions', [...draft.conditions, { name: `Condição ${draft.conditions.length + 1}`, type: 'any', variable: '', value: 'any', intent: '', context: '', originalIdx: null, kind: 'defaultNode' }])}
                  >+ Adicionar condição</button>
                </div>
              </Section>
            )}

            {showNextFlow && draft && intent && (
              <NextFlowSection
                draft={draft}
                setDraft={setDraft}
                selfBotId={intent.botId}
                intents={intents.filter(it => it.id !== intent.id)}
                isDark={isDark}
                inputCls={inputCls}
                labelCls={labelCls}
              />
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
            disabled={applyBlocked}
            className={[
              'w-full text-xs font-semibold rounded-lg px-3 py-2 transition-all duration-150',
              applied
                ? 'bg-emerald-500 text-white'
                : `bg-amber-400 text-slate-900 ${applyBlocked ? '' : 'hover:bg-amber-500'}`,
              applyBlocked ? 'opacity-40 cursor-not-allowed' : 'active:scale-95',
              shake ? 'fluxo-shake' : '',
            ].join(' ')}
          >{applied ? '✓ Aplicado' : `Aplicar alterações${applyHint}`}</button>
          {(mode === 'condition' || mode === 'solo') && intent && (
            <div className="flex gap-2">
              <button
                onClick={() => onDuplicateConditionInIntent(intent.id, condIdx)}
                className={`${dupBtnCls} flex-1 min-w-0`}
              >Duplicar Condição</button>
              {mode === 'condition' && (
                <button
                  onClick={() => onDuplicateConditionOutside(intent.id, condIdx)}
                  className={`${dupBtnCls} flex-1 min-w-0`}
                >Duplicar Intenção</button>
              )}
              {mode === 'solo' && (
                <button
                  onClick={() => onDuplicateIntent(intent.id)}
                  className={`${dupBtnCls} flex-1 min-w-0`}
                >Duplicar Intenção</button>
              )}
            </div>
          )}
          {mode === 'group' && intent && (
            <button
              onClick={() => onDuplicateIntent(intent.id)}
              className={dupBtnCls}
            >Duplicar Intenção</button>
          )}
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
