import type { BotIntent, BotMessage, BulkUpdateItem, Condition, ButtonMessageConfig, ButtonOption, AssistantSay, Next } from '../types'
import type { EditResult } from './editFlow'
import { createConditionTemplate, createConditionForKind } from './intentTemplates'
import type { CreatableKind } from './nodeCatalog'

/**
 * Patches de CONTEÚDO de uma intenção (Fase 3): mensagens, botões, metadados
 * e campos da ação. Todas as funções mutam o intent do modelo em memória
 * (estratégia preserve-and-patch) e atualizam `updatedAt`.
 */

/** Endereço estável de uma mensagem dentro da intenção. */
export interface MessageRef {
  condIdx: number
  sayIdx: number
  msgIdx: number
  /**
   * Container das mensagens dentro da condição. `'condition'` (default) = as
   * respostas normais (`cond.assistant_says`); `'error'` = as mensagens de
   * fallback do caminho de erro (`cond.action.error.assistant_says`). Permite
   * reusar toda a máquina de mensagens para os dois conjuntos.
   */
  container?: 'condition' | 'error'
}

export interface EditableMessage {
  ref: MessageRef
  type: string
  /** Texto exibível: content (TEXT/IMAGE/FILE/VIDEO/TEMPLATE) ou messageConfig.body (BUTTON/LIST). */
  text: string
  /** Nome do arquivo original — presente em IMAGE, FILE e VIDEO. */
  fileName: string
  /** objectId da coleção — presente só em COLLECTION (resolve nome/imagem no resumo). */
  collectionId?: string
  /** objectId do modelo de mensagem — presente só em TEMPLATE (resolve título/corpo). */
  messageTemplateId?: string
  /** Título gravado do modelo — presente só em TEMPLATE (resumo quando o id sumiu da plataforma). */
  templateTitle?: string
  /** Valores das variáveis do corpo, posicionais — presente só em TEMPLATE. */
  templateTokens?: string[]
}

/**
 * Dados necessários para serializar uma resposta TEMPLATE (modelo de mensagem com
 * Flow). `content` é o corpo com `{{n}}`, `tokens` são os valores posicionais das
 * variáveis e `flowButtonText` é o rótulo do botão Flow do modelo.
 */
export interface TemplateMessagePayload {
  messageTemplateId: string
  title: string
  content: string
  tokens: string[]
  flowButtonText: string
}

/**
 * Marca a intenção como modificada (`updatedAt`). Exportada para que os setters de campo de
 * cabeçalho fora deste módulo (ex.: `flowTools.setCategory`) reflitam a mesma regra de timestamp
 * sem duplicá-la — toda escrita honesta toca `updatedAt` num só lugar.
 */
export function touch(intent: BotIntent): void {
  intent.updatedAt = new Date().toUTCString()
}

/**
 * Resolve o array de `assistant_says` de uma condição conforme o container do
 * endereço: `'condition'` (default) → `cond.assistant_says`; `'error'` →
 * `cond.action.error.assistant_says`. Por padrão é só leitura (retorna
 * `undefined` quando o caminho de erro não existe). Com `create: true` materializa
 * `action.error`/`assistant_says` ausentes — usado pelos writers de mensagem; o
 * `next` placeholder (`type:'error'`) é depois sobrescrito por `setActionErrorNext`.
 */
function saysOf(
  cond: Condition | undefined,
  container: MessageRef['container'] = 'condition',
  create = false,
): AssistantSay[] | undefined {
  if (!cond) return undefined
  if (container !== 'error') return cond.assistant_says
  if (!cond.action.error) {
    if (!create) return undefined
    cond.action.error = { next: { type: 'error' }, assistant_says: [] }
  }
  if (!cond.action.error.assistant_says) {
    if (!create) return undefined
    cond.action.error.assistant_says = []
  }
  return cond.action.error.assistant_says
}

function getMessage(intent: BotIntent, ref: MessageRef): BotMessage | null {
  return saysOf(intent.conditions[ref.condIdx], ref.container)?.[ref.sayIdx]?.messages[ref.msgIdx] ?? null
}

/** Monta o `EditableMessage` exibível a partir de um `BotMessage` e seu endereço. */
function toEditableMessage(msg: BotMessage, ref: MessageRef): EditableMessage {
  const text = msg.type === 'TEXT' || msg.type === 'IMAGE' || msg.type === 'FILE'
    || msg.type === 'VIDEO' || msg.type === 'TEMPLATE'
    ? msg.content ?? ''
    : msg.messageConfig?.body ?? ''
  return {
    ref, type: msg.type, text, fileName: msg.fileName ?? '',
    ...(msg.type === 'COLLECTION' ? { collectionId: msg.collectionId ?? '' } : {}),
    ...(msg.type === 'TEMPLATE' ? {
      messageTemplateId: msg.messageTemplateId ?? '',
      templateTitle: msg.title ?? '',
      templateTokens: [...(msg.messageTemplateTokens ?? [])],
    } : {}),
  }
}

/** Lista todas as mensagens da intenção com seus endereços, na ordem de exibição. */
export function listMessages(intent: BotIntent): EditableMessage[] {
  const result: EditableMessage[] = []
  intent.conditions.forEach((cond, condIdx) => {
    cond.assistant_says.forEach((say, sayIdx) => {
      say.messages.forEach((msg, msgIdx) => {
        result.push(toEditableMessage(msg, { condIdx, sayIdx, msgIdx }))
      })
    })
  })
  return result
}

/**
 * Lista as mensagens de fallback do caminho de erro de cada condição
 * (`action.error.assistant_says`), com refs marcados `container:'error'`.
 * Conjunto separado das respostas normais (`listMessages`) — alimenta a seção
 * "Em caso de erro" do painel. Só leitura: condições sem `action.error` são
 * ignoradas (não cria estrutura).
 */
export function listErrorMessages(intent: BotIntent): EditableMessage[] {
  const result: EditableMessage[] = []
  intent.conditions.forEach((cond, condIdx) => {
    cond.action.error?.assistant_says?.forEach((say, sayIdx) => {
      say.messages.forEach((msg, msgIdx) => {
        result.push(toEditableMessage(msg, { condIdx, sayIdx, msgIdx, container: 'error' }))
      })
    })
  })
  return result
}

/** Atualiza o conteúdo de uma mensagem (content para TEXT/IMAGE/FILE/VIDEO, body para BUTTON/LIST). */
export function updateMessageText(intent: BotIntent, ref: MessageRef, text: string): EditResult {
  const msg = getMessage(intent, ref)
  if (!msg) return { ok: false, reason: 'mensagem não encontrada na intenção' }
  if (msg.type === 'TEXT' || msg.type === 'IMAGE' || msg.type === 'FILE' || msg.type === 'VIDEO') {
    msg.content = text
  } else if (msg.messageConfig) {
    msg.messageConfig.body = text
  } else {
    return { ok: false, reason: `mensagem do tipo ${msg.type} não tem texto editável` }
  }
  touch(intent)
  return { ok: true }
}

/**
 * Acrescenta uma mensagem TEXT ao final de uma condição (padrão: a primeira).
 * No Modelo B (Marco C) o editor de um filho passa o `condIdx` da condição
 * sendo editada para que a mensagem caia na condição certa.
 */
export function addTextMessage(intent: BotIntent, text: string, condIdx = 0, container: MessageRef['container'] = 'condition'): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'intenção sem condições' }
  const says = saysOf(cond, container, true)!
  if (!says.length) says.push({ channel: 'any', messages: [] })
  says[0].messages.push({ type: 'TEXT', content: text, fileName: '' })
  touch(intent)
  return { ok: true }
}

/**
 * Remove uma mensagem de conteúdo. TEXT/IMAGE/FILE/VIDEO sempre podem. BUTTON/LIST
 * só quando são de EXIBIÇÃO (condição sem `action.type === 'choice'`): numa ação de
 * escolha os botões mapeiam posicionalmente para `action.choices` e ficariam órfãos.
 */
export function removeMessage(intent: BotIntent, ref: MessageRef): EditResult {
  const msg = getMessage(intent, ref)
  if (!msg) return { ok: false, reason: 'mensagem não encontrada na intenção' }
  const isButtonList = msg.type === 'BUTTON' || msg.type === 'LIST'
  if (isButtonList && intent.conditions[ref.condIdx]?.action.type === 'choice') {
    return { ok: false, reason: `mensagens do tipo ${msg.type} não podem ser removidas (os botões mapeiam para as escolhas)` }
  }
  saysOf(intent.conditions[ref.condIdx], ref.container)![ref.sayIdx].messages.splice(ref.msgIdx, 1)
  touch(intent)
  return { ok: true }
}

/**
 * Acrescenta uma mensagem de mídia (IMAGE, FILE ou VIDEO) ao final de uma condição.
 * O `content` é a URL pública do arquivo hospedado na OmniChat (S3).
 */
export function addMediaMessage(
  intent: BotIntent,
  type: 'IMAGE' | 'FILE' | 'VIDEO',
  content: string,
  fileName: string,
  condIdx = 0,
  container: MessageRef['container'] = 'condition',
): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'intenção sem condições' }
  const says = saysOf(cond, container, true)!
  if (!says.length) says.push({ channel: 'any', messages: [] })
  says[0].messages.push({ type, content, fileName })
  touch(intent)
  return { ok: true }
}

/**
 * Acrescenta uma mensagem COLLECTION (resposta "Coleção") ao final de uma condição.
 * Espelha o formato exportado pela plataforma: `collectionId` carrega o objectId da
 * coleção e `fileName` vai como string vazia (não usa `content`).
 */
export function addCollectionMessage(intent: BotIntent, collectionId: string, condIdx = 0, container: MessageRef['container'] = 'condition'): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'intenção sem condições' }
  if (!collectionId.trim()) return { ok: false, reason: 'selecione uma coleção antes de salvar' }
  const says = saysOf(cond, container, true)!
  if (!says.length) says.push({ channel: 'any', messages: [] })
  says[0].messages.push({ type: 'COLLECTION', fileName: '', collectionId })
  touch(intent)
  return { ok: true }
}

/**
 * Atualiza a coleção de uma resposta COLLECTION já salva (edição in-place pelo
 * endereço). Usado quando o usuário troca a coleção no "Editar" do painel. Mantém
 * `fileName` como string vazia (padrão da plataforma).
 */
export function updateCollectionMessage(intent: BotIntent, ref: MessageRef, collectionId: string): EditResult {
  const msg = getMessage(intent, ref)
  if (!msg) return { ok: false, reason: 'mensagem não encontrada na intenção' }
  if (msg.type !== 'COLLECTION') return { ok: false, reason: `mensagem do tipo ${msg.type} não é uma coleção` }
  if (!collectionId.trim()) return { ok: false, reason: 'selecione uma coleção antes de salvar' }
  msg.collectionId = collectionId
  touch(intent)
  return { ok: true }
}

/**
 * Monta o `BotMessage` de uma resposta TEMPLATE no formato exportado pela plataforma
 * (confirmado por captura real, Fase 12). `messageTemplateTokens[i]` ↔ `{{i+1}}`
 * (posicional). O botão Flow vai só com `{ id, text, type:'FLOW' }` — a plataforma
 * resolve o Flow pelo `messageTemplateId`. `messageTemplateHeaderToken` é fixo `''`
 * (nenhum modelo real usa variável de cabeçalho — decisão 3 do PLANS).
 */
function buildTemplateMessage(payload: TemplateMessagePayload): BotMessage {
  return {
    type: 'TEMPLATE',
    content: payload.content,
    fileName: '',
    title: payload.title,
    messageTemplateId: payload.messageTemplateId,
    messageTemplateHeaderToken: '',
    messageTemplateTokens: [...payload.tokens],
    messageConfig: {
      type: 'text',
      body: '',
      buttons: [{ id: crypto.randomUUID(), text: payload.flowButtonText, type: 'FLOW' }],
    },
  }
}

/**
 * Acrescenta uma resposta TEMPLATE (modelo de mensagem com Flow) ao final de uma
 * condição. `content`/`title`/botão derivam do modelo selecionado; só os `tokens`
 * (variáveis) são preenchidos pelo usuário. Exige `messageTemplateId` (a UI bloqueia
 * antes, mas guardamos aqui também).
 */
export function addTemplateMessage(intent: BotIntent, payload: TemplateMessagePayload, condIdx = 0, container: MessageRef['container'] = 'condition'): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'intenção sem condições' }
  if (!payload.messageTemplateId.trim()) return { ok: false, reason: 'selecione um modelo de mensagem antes de salvar' }
  const says = saysOf(cond, container, true)!
  if (!says.length) says.push({ channel: 'any', messages: [] })
  says[0].messages.push(buildTemplateMessage(payload))
  touch(intent)
  return { ok: true }
}

/**
 * Atualiza uma resposta TEMPLATE já salva (edição in-place pelo endereço). Reescreve
 * todos os campos derivados do modelo (id/título/corpo/botão) + os tokens, porque o
 * usuário pode trocar o modelo no "Editar" do painel. `messageConfig` é regenerado
 * (novo `id` de botão) só quando o texto do botão muda; para preservar o id quando
 * possível, reaproveita o botão existente quando o texto é igual.
 */
export function updateTemplateMessage(intent: BotIntent, ref: MessageRef, payload: TemplateMessagePayload): EditResult {
  const msg = getMessage(intent, ref)
  if (!msg) return { ok: false, reason: 'mensagem não encontrada na intenção' }
  if (msg.type !== 'TEMPLATE') return { ok: false, reason: `mensagem do tipo ${msg.type} não é um modelo de mensagem` }
  if (!payload.messageTemplateId.trim()) return { ok: false, reason: 'selecione um modelo de mensagem antes de salvar' }
  const prevBtn = msg.messageConfig?.buttons?.[0]
  const reuseBtn = prevBtn && prevBtn.text === payload.flowButtonText && prevBtn.type === 'FLOW'
  msg.content = payload.content
  msg.fileName = ''
  msg.title = payload.title
  msg.messageTemplateId = payload.messageTemplateId
  msg.messageTemplateHeaderToken = ''
  msg.messageTemplateTokens = [...payload.tokens]
  msg.messageConfig = {
    type: 'text',
    body: '',
    buttons: [reuseBtn ? prevBtn : { id: crypto.randomUUID(), text: payload.flowButtonText, type: 'FLOW' }],
  }
  touch(intent)
  return { ok: true }
}

/**
 * Atualiza texto/descrição de um botão (BUTTON/LIST) pelo índice exibido.
 * Com `condIdx` (Modelo B, Marco C) o índice é relativo aos botões DAQUELA
 * condição; sem ele, procura o primeiro botão na intenção inteira.
 */
export function updateButton(intent: BotIntent, btnIdx: number, text: string, description: string | null, condIdx?: number): EditResult {
  const conds = condIdx === undefined ? intent.conditions : [intent.conditions[condIdx]].filter(Boolean)
  for (const cond of conds) {
    for (const say of cond.assistant_says) {
      for (const msg of say.messages) {
        const btn = msg.messageConfig?.buttons?.[btnIdx]
        if ((msg.type === 'BUTTON' || msg.type === 'LIST') && btn) {
          btn.text = text
          btn.description = description || null
          touch(intent)
          return { ok: true }
        }
      }
    }
  }
  return { ok: false, reason: 'botão não encontrado na intenção' }
}

/**
 * Localiza a condição de escolha e sua mensagem de botões. Com `condIdx`, usa
 * exatamente aquela condição (modo filho); sem ele, a primeira condição choice.
 */
function findChoiceContext(intent: BotIntent, condIdx?: number): { cond: Condition; msg: BotMessage | null } | null {
  const cond = condIdx === undefined
    ? intent.conditions.find(c => c.action.type === 'choice')
    : (intent.conditions[condIdx]?.action.type === 'choice' ? intent.conditions[condIdx] : undefined)
  if (!cond) return null
  const msg = cond.assistant_says
    .flatMap(s => s.messages)
    .find(m => (m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig) ?? null
  return { cond, msg }
}

/**
 * Adiciona um botão à mensagem BUTTON/LIST da condição de escolha, criando em
 * sincronia um slot vazio em `action.choices` (buttons[i] ↔ choices[i]).
 * O slot é preenchido depois, conectando o nó no canvas.
 */
export function addButton(intent: BotIntent, text: string, description: string | null, condIdx?: number): EditResult {
  const ctx = findChoiceContext(intent, condIdx)
  if (!ctx) return { ok: false, reason: 'a intenção não tem ação de escolha' }
  if (!ctx.msg?.messageConfig) {
    return { ok: false, reason: 'a intenção não tem mensagem de botões (crie-a primeiro)' }
  }
  ctx.msg.messageConfig.buttons.push({ id: crypto.randomUUID(), text, description: description || null })
  if (!Array.isArray(ctx.cond.action.choices)) ctx.cond.action.choices = []
  ctx.cond.action.choices.push('')
  touch(intent)
  return { ok: true }
}

/** Remove o botão e a escolha na mesma posição (mapeamento posicional). */
export function removeButton(intent: BotIntent, btnIdx: number, condIdx?: number): EditResult {
  const ctx = findChoiceContext(intent, condIdx)
  if (!ctx?.msg?.messageConfig?.buttons[btnIdx]) {
    return { ok: false, reason: 'botão não encontrado na intenção' }
  }
  ctx.msg.messageConfig.buttons.splice(btnIdx, 1)
  if (Array.isArray(ctx.cond.action.choices) && btnIdx < ctx.cond.action.choices.length) {
    ctx.cond.action.choices.splice(btnIdx, 1)
  }
  touch(intent)
  return { ok: true }
}

/**
 * Cria a mensagem BUTTON canônica (body + botões vazios) na condição de
 * escolha — para nós de escolha recém-criados pela paleta.
 */
export function addButtonsMessage(intent: BotIntent, body: string, condIdx?: number): EditResult {
  const ctx = findChoiceContext(intent, condIdx)
  if (!ctx) return { ok: false, reason: 'a intenção não tem ação de escolha' }
  if (ctx.msg) return { ok: false, reason: 'a intenção já tem mensagem de botões' }
  if (!ctx.cond.assistant_says.length) ctx.cond.assistant_says.push({ channel: 'any', messages: [] })
  ctx.cond.assistant_says[0].messages.push({
    type: 'BUTTON',
    content: null,
    messageConfig: { header: null, title: null, body, footer: null, type: 'text', buttons: [] },
  })
  if (!Array.isArray(ctx.cond.action.choices)) ctx.cond.action.choices = []
  touch(intent)
  return { ok: true }
}

/** Config de uma mensagem Botão/Lista de EXIBIÇÃO (Fase 10). */
export interface ButtonListConfig {
  header: string
  body: string
  footer: string
  title: string
  items: { text: string; description: string }[]
  /**
   * 'plain' ("sem descrição"): 1-3 itens → BUTTON, 4-10 → LIST.
   * 'described' ("com descrição"): SEMPRE LIST (descrição só existe em linha de lista),
   * então o título passa a ser obrigatório independentemente da contagem.
   */
  variant: 'plain' | 'described'
}

/** Limite do WhatsApp espelhado pela plataforma: 4+ itens viram LIST (menu); 1-3, BUTTON. */
const LIST_THRESHOLD = 4
const MAX_BUTTONLIST_ITEMS = 10

/**
 * Valida o config e monta o `messageConfig` + o `type` (BUTTON/LIST) de uma
 * Botão/Lista. Compartilhado entre criar (`addButtonListMessage`) e editar
 * (`replaceButtonListMessage`). `reuseButtons` preserva os IDs por POSIÇÃO ao editar
 * (os destinos em `choices` são posicionais, então manter os IDs evita surpresa).
 * Regras: "com descrição" sempre LIST; "sem descrição" vira LIST com 4+ itens; título
 * sempre opcional; campos vazios saem como `""`; BUTTON nunca carrega descrição.
 */
function buildButtonList(
  cfg: ButtonListConfig,
  reuseButtons: ButtonOption[] = [],
): { messageConfig: ButtonMessageConfig; msgType: 'BUTTON' | 'LIST' } | { error: string } {
  const items = cfg.items.map(it => ({ text: it.text.trim(), description: (it.description ?? '').trim() }))
  if (items.length < 1) return { error: 'a mensagem precisa de ao menos 1 item' }
  if (items.length > MAX_BUTTONLIST_ITEMS) return { error: `a mensagem aceita no máximo ${MAX_BUTTONLIST_ITEMS} itens` }
  if (items.some(it => !it.text)) return { error: 'todo item precisa de texto' }
  if (!cfg.body.trim()) return { error: 'o corpo do texto não pode ficar vazio' }

  const msgType: 'BUTTON' | 'LIST' = cfg.variant === 'described' || items.length >= LIST_THRESHOLD ? 'LIST' : 'BUTTON'
  return {
    msgType,
    messageConfig: {
      header: cfg.header.trim(),
      title: msgType === 'LIST' ? cfg.title.trim() : '',
      body: cfg.body.trim(),
      footer: cfg.footer.trim(),
      type: 'text',
      buttons: items.map((it, i) => ({
        id: reuseButtons[i]?.id ?? crypto.randomUUID(),
        text: it.text,
        description: msgType === 'LIST' ? it.description : '',
      })),
    },
  }
}

/**
 * Acrescenta uma mensagem Botão/Lista ao final de uma condição (Fase 10). NÃO mexe em
 * `action`/`choices` — em nó de Escolha os destinos são geridos à parte (`addChoice`/
 * `setChoiceDestination`), ligados aos itens pela ordem.
 */
export function addButtonListMessage(intent: BotIntent, cfg: ButtonListConfig, condIdx = 0): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'intenção sem condições' }

  const built = buildButtonList(cfg)
  if ('error' in built) return { ok: false, reason: built.error }

  if (!cond.assistant_says.length) cond.assistant_says.push({ channel: 'any', messages: [] })
  cond.assistant_says[0].messages.push({ type: built.msgType, content: '', fileName: '', messageConfig: built.messageConfig })
  touch(intent)
  return { ok: true }
}

/**
 * Substitui o `messageConfig` de uma mensagem Botão/Lista já existente (edição do menu
 * salvo). Reaproveita os IDs dos botões por posição e recalcula o `type`. Não toca em
 * `action`/`choices` (os destinos são posicionais e geridos à parte).
 */
export function replaceButtonListMessage(intent: BotIntent, ref: MessageRef, cfg: ButtonListConfig): EditResult {
  const msg = getMessage(intent, ref)
  if (!msg || (msg.type !== 'BUTTON' && msg.type !== 'LIST')) {
    return { ok: false, reason: 'mensagem de botões não encontrada' }
  }
  const built = buildButtonList(cfg, msg.messageConfig?.buttons ?? [])
  if ('error' in built) return { ok: false, reason: built.error }
  msg.type = built.msgType
  msg.content = ''
  msg.messageConfig = built.messageConfig
  touch(intent)
  return { ok: true }
}

/**
 * Escolhas (`action.choices`) de uma condição de escolha — destinos, ligados aos
 * itens do menu (`buttons`) pela ORDEM (`choices[i]` ↔ `buttons[i]`). Ficam
 * SEPARADOS dos itens: nem todo item precisa de destino (transição por palavra-chave),
 * então `choices` pode ser mais curto que `buttons`. Posicional, com `''` para vazio.
 */
function choiceCond(intent: BotIntent, condIdx: number): Condition | null {
  const cond = intent.conditions[condIdx]
  if (!cond || cond.action.type !== 'choice') return null
  if (!Array.isArray(cond.action.choices)) cond.action.choices = []
  return cond
}

/** Acrescenta um slot de escolha vazio (destino a definir depois). */
export function addChoice(intent: BotIntent, condIdx = 0): EditResult {
  const cond = choiceCond(intent, condIdx)
  if (!cond) return { ok: false, reason: 'a condição não é de escolha' }
  ;(cond.action.choices as string[]).push('')
  touch(intent)
  return { ok: true }
}

/** Remove o slot de escolha no índice. As arestas são reconstruídas pelo App. */
export function removeChoice(intent: BotIntent, condIdx: number, idx: number): EditResult {
  const cond = choiceCond(intent, condIdx)
  const choices = cond?.action.choices as string[] | undefined
  if (!cond || !choices || idx < 0 || idx >= choices.length) {
    return { ok: false, reason: 'escolha não encontrada na condição' }
  }
  choices.splice(idx, 1)
  touch(intent)
  return { ok: true }
}

/**
 * Define o destino (ID de intenção) de um slot de escolha; vazio limpa o slot (`''`).
 * Preenche com `''` até o índice se preciso, mantendo a relação posicional com os itens.
 */
export function setChoiceDestination(intent: BotIntent, condIdx: number, idx: number, destIntentId: string): EditResult {
  const cond = choiceCond(intent, condIdx)
  if (!cond) return { ok: false, reason: 'a condição não é de escolha' }
  const choices = cond.action.choices as string[]
  while (choices.length <= idx) choices.push('')
  choices[idx] = destIntentId.trim()
  touch(intent)
  return { ok: true }
}

/**
 * Substitui TODA a lista de destinos de uma condição de escolha (aplicação em lote a
 * partir do draft). Mantém os vazios do meio (`''`) e APARA os vazios do fim — como na
 * amostra real (menu de 10 itens com 2 choices). Vazia → `[]`.
 */
export function setChoices(intent: BotIntent, condIdx: number, destinations: string[]): EditResult {
  const cond = choiceCond(intent, condIdx)
  if (!cond) return { ok: false, reason: 'a condição não é de escolha' }
  const trimmed = destinations.map(d => (d ?? '').trim())
  let end = trimmed.length
  while (end > 0 && !trimmed[end - 1]) end-- // apara vazios do fim
  cond.action.choices = trimmed.slice(0, end)
  touch(intent)
  return { ok: true }
}

/**
 * Atualiza os campos lógicos de uma condição (nome, tipo, variável, valor) e,
 * para o tipo "context" ("Contexto é igual a"), as duas referências a intenções
 * existentes: `intent` (campo "Intenção") e `context` (campo "Contexto"). Os dois
 * vêm como ID de intenção (ou vazio). Fazem round-trip em todos os tipos — a UI só
 * permite editá-los no tipo context, então tipos sem esses campos não são afetados.
 */
export function updateCondition(
  intent: BotIntent,
  condIdx: number,
  fields: { name: string; type: string; variable: string; value: string; intent?: string; context?: string },
): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'condição não encontrada na intenção' }
  if (!fields.name.trim()) return { ok: false, reason: 'o nome da condição não pode ficar vazio' }
  cond.name = fields.name.trim()
  cond.type = fields.type
  cond.variable = fields.variable.trim() || null
  // Cada gatilho usa um campo diferente como operando; mantemos só o relevante
  // preenchido e limpamos os outros para não deixar dado órfão ao trocar o tipo.
  // A plataforma guarda `value = "any"` como placeholder quando o operando vive em
  // outro campo (confirmado nas amostras):
  //  - "Valor contém"            → lista de termos (TAGs) em `values`
  //  - "Total é maior que / igual" → número (string) em `valueNumber`
  //  - demais (equals…)          → escalar em `value`
  if (fields.type === 'contains') {
    const terms = fields.value.split(',').map(v => v.trim()).filter(Boolean)
    cond.values = terms.length ? terms : null
    cond.valueNumber = null
    cond.value = 'any'
  } else if (fields.type === 'totalIsGreaterThan' || fields.type === 'totalIsEqual') {
    const num = fields.value.trim()
    cond.valueNumber = num || null
    cond.values = null
    cond.value = 'any'
  } else {
    cond.value = fields.value.trim() || null
    cond.values = null
    cond.valueNumber = null
  }
  // Só toca em intent/context quando o caller os fornece (caminho do tipo context);
  // o editor em lote de condições não passa esses campos e não deve sobrescrevê-los.
  if (fields.intent !== undefined) cond.intent = fields.intent.trim() || null
  if (fields.context !== undefined) cond.context = fields.context.trim() || null
  touch(intent)
  return { ok: true }
}

/**
 * Acrescenta uma condição ao final da intenção. Com `kind` (Marco D), a condição
 * já nasce TIPADA pela ação escolhida (mesmo template da criação de nó); sem ele,
 * mantém o comportamento anterior — condição de mensagem (`action.none`).
 */
export function addCondition(intent: BotIntent, kind?: CreatableKind): EditResult {
  intent.conditions.push(
    kind ? createConditionForKind(kind, intent.botId) : createConditionTemplate(),
  )
  touch(intent)
  return { ok: true }
}

/**
 * Remove uma condição. A última condição não é removível (intenção sem
 * condições é inválida na plataforma). As arestas são reconstruídas pelo App
 * (os IDs posicionais c{idx} das demais condições deslocam).
 */
export function removeCondition(intent: BotIntent, condIdx: number): EditResult {
  if (!intent.conditions[condIdx]) return { ok: false, reason: 'condição não encontrada na intenção' }
  if (intent.conditions.length === 1) {
    return { ok: false, reason: 'a intenção precisa de ao menos uma condição' }
  }
  intent.conditions.splice(condIdx, 1)
  touch(intent)
  return { ok: true }
}

/**
 * Regra de nome de intenção na plataforma OmniChat: mixed_snake_case — apenas
 * letras (A-Z, a-z), dígitos e underscore. O campo no builder usa a diretiva
 * Angular `specialcharacter`, que impede a digitação de qualquer outro caractere
 * (espaço, acento, símbolo). Espelhamos a mesma regra aqui para não gerar nomes
 * que a plataforma rejeitaria no push.
 */
const INTENT_NAME_VALID = /^[A-Za-z0-9_]+$/
const INTENT_NAME_INVALID_CHARS = /[^A-Za-z0-9_]/g

/**
 * Normaliza `value` para a regra mixed_snake_case, usado no onChange do campo de
 * nome para corrigir a digitação em tempo real (em vez de só acusar erro no
 * submit). Espaço (e qualquer whitespace) vira underscore — é o separador natural
 * em snake_case, então convertemos em vez de apagar; o resto dos caracteres fora
 * de [A-Za-z0-9_] (acentos, símbolos) é removido.
 */
export function sanitizeIntentName(value: string): string {
  return value.replace(/\s/g, '_').replace(INTENT_NAME_INVALID_CHARS, '')
}

/**
 * Coleta as categorias distintas e não-vazias de uma lista de intenções, para
 * alimentar o dropdown de categoria no painel. Exclui 'start' (categoria de
 * sistema da intenção de início, não selecionável pelo usuário) e 'Sem Categoria'
 * (o painel já a injeta como valor padrão).
 */
export function collectCategories(intents: BotIntent[]): string[] {
  const found = new Set<string>()
  for (const intent of intents) {
    const category = intent.category?.trim()
    if (category && category !== 'start' && category !== 'Sem Categoria') found.add(category)
  }
  return [...found]
}

/**
 * Atualiza a meta da intenção: nome, categoria, keywords e, no Modelo B
 * (Marco C), também `priority` e `context` (a intenção que precede esta — a
 * origem da aresta de contexto). `context` vazio limpa a referência (null).
 *
 * `executionDelay` é o tempo de espera (segundos) antes do bot responder. A
 * plataforma OmniChat usa número puro e trata *presença do campo = ativo*; por
 * isso `> 0` grava o número e qualquer outro caso (`null`/`0`) REMOVE o campo,
 * em vez de gravar `0` (que apareceria como "ativo + 0s" na plataforma).
 * `undefined` não toca no campo — preserva chamadores que não controlam o delay.
 */
export function updateIntentMeta(
  intent: BotIntent,
  meta: {
    name: string
    category: string
    keywords: string[]
    priority?: number
    context?: string | null
    executionDelay?: number | null
  },
): EditResult {
  const name = meta.name.trim()
  if (!name) return { ok: false, reason: 'o nome da intenção não pode ficar vazio' }
  if (!INTENT_NAME_VALID.test(name)) {
    return { ok: false, reason: 'o nome da intenção só pode conter letras, números e underscore (sem espaços, acentos ou caracteres especiais)' }
  }
  intent.name = name
  intent.category = meta.category.trim() || 'Sem Categoria'
  intent.keywords = meta.keywords.map(k => k.trim()).filter(Boolean)
  if (meta.priority !== undefined) intent.priority = meta.priority
  if (meta.context !== undefined) intent.context = meta.context?.trim() || null
  if (meta.executionDelay !== undefined) {
    if (typeof meta.executionDelay === 'number' && meta.executionDelay > 0) {
      intent.executionDelay = meta.executionDelay
    } else {
      delete intent.executionDelay
    }
  }
  touch(intent)
  return { ok: true }
}

/**
 * Setter PURO de palavras-chave da intenção (v0.33.0, Fase 2). SUBSTITUI o array
 * (verbo "set" honesto) aplicando só a higiene mínima: trim + colapsa espaços por
 * palavra, descarta vazias e duplicatas EXATAS (pós-limpeza) preservando a ordem.
 * Não normaliza caixa/acento — a keyword grava como o humano quer ver (a detecção
 * de colisão "frouxa" vive no nudge do `validate()`). Array vazio LIMPA (estado
 * default e legítimo). Retorna o array já limpo (o valor realmente gravado), para
 * quem chama montar mensagem/pré-preencher sem reler. NUNCA toca `variable`/`context`.
 *
 * Por que puro sobre `BotIntent` (e não em `flowTools`): a Fase 2 (UI) precisa escrever
 * keyword na intenção-ALVO sem passar por `updateIntentMeta` — este revalida o NOME do
 * alvo (`INTENT_NAME_VALID`), o que faria a escrita falhar num alvo de nome legado.
 * `flowTools.setKeywords` passa a envolver este setter (resolve ref + `store.save`).
 */
export function setIntentKeywords(intent: BotIntent, keywords: string[]): string[] {
  const seen = new Set<string>()
  const clean: string[] = []
  for (const k of keywords) {
    const word = (k ?? '').trim().replace(/\s+/g, ' ')
    if (!word || seen.has(word)) continue
    seen.add(word)
    clean.push(word)
  }
  intent.keywords = clean
  touch(intent)
  return clean
}

/**
 * Setter PURO do `context` da intenção (v0.33.0, Fase 2): grava o id da intenção que
 * a ESCOPA (tipicamente o nó de Escolha do menu) ou `null` para LIMPAR (a keyword vira
 * atalho GLOBAL). `contextId` já deve vir RESOLVIDO a um id (ou null) — a resolução por
 * id/nome intra-fluxo vive em quem chama (`flowTools.setContext` resolve a ref; a UI passa
 * o `intent.id` do próprio `choiceNode`). Recusa auto-referência: context de si mesmo seria
 * circular e não escopa nada. Espelha o `setIntentKeywords` (puro, desacoplado do nome do alvo).
 */
export function setIntentContext(intent: BotIntent, contextId: string | null): EditResult {
  const id = contextId?.trim() || null
  if (id && id === intent.id) {
    return { ok: false, reason: `"${intent.name}" não pode ter a si mesmo como context` }
  }
  intent.context = id
  touch(intent)
  return { ok: true }
}

/**
 * Atualiza campos da ação de uma condição (transfer → transferType/value;
 * captureData → captureDataType/variable/captureDataTypesCategory/multipleFields).
 * Com `condIdx` (Modelo B, Marco C) mira aquela condição; sem ele, a primeira
 * condição cujo action.type bate.
 */
export function updateActionFields(
  intent: BotIntent,
  actionType: string,
  fields: Partial<{
    transferType: string
    value: string
    captureDataType: string
    variable: string
    captureDataTypesCategory: string
    multipleFields: string[]
    storeType: string
    entity: string
    externalType: string
    apiName: string
    orderType: string
  }>,
  condIdx?: number,
): EditResult {
  const cond = condIdx === undefined
    ? intent.conditions.find(c => c.action.type === actionType)
    : intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: `a intenção não tem ação do tipo ${actionType}` }
  if (fields.transferType !== undefined) cond.action.transferType = fields.transferType || null
  if (fields.value !== undefined) cond.action.value = fields.value || null
  if (fields.captureDataType !== undefined) cond.action.captureDataType = fields.captureDataType || null
  // `variable` no captureData pode ser intencionalmente '' (payload real); preserva o vazio.
  if (fields.variable !== undefined) cond.action.variable = fields.variable
  if (fields.captureDataTypesCategory !== undefined) cond.action.captureDataTypesCategory = fields.captureDataTypesCategory
  if (fields.multipleFields !== undefined) cond.action.multipleFields = fields.multipleFields
  // Loja física: storeType vazio cai pra null; entity é o id da Lista (string).
  if (fields.storeType !== undefined) cond.action.storeType = fields.storeType || null
  if (fields.entity !== undefined) cond.action.entity = fields.entity
  // Pedido: orderType é 'addToCart' | 'generateOrder' (ou legado preservado). Em
  // generateOrder a serialização NÃO passa `variable` → o valor subjacente fica
  // intacto (preserve-and-patch), como a própria plataforma faz.
  if (fields.orderType !== undefined) cond.action.orderType = fields.orderType
  // Chamada de API: grava external = { type, apiName } como STRINGS (fidelidade ao
  // export real; o template usa arrays vazios). Toca SÓ o external — error.next e o
  // resto da ação ficam preservados. apiName=id do endpoint.
  if (fields.externalType !== undefined || fields.apiName !== undefined) {
    const ext = cond.action.external ?? { type: '', apiName: '' }
    cond.action.external = {
      type: fields.externalType ?? ext.type,
      apiName: fields.apiName ?? ext.apiName,
    }
  }
  touch(intent)
  return { ok: true }
}

/**
 * Grava o destino do caminho de erro (`action.error.next`) de uma condição,
 * aplicando o acoplamento confirmado nos exemplos reais: `redirect:'continueFlow'`
 * → `intentBot:''`; `redirect:'waitInteraction'` → `intentBot:<botId da intenção>`.
 * `type:'error'` e `action:'intent'` são fixos; `intent` é o id da intenção-destino
 * (string, ex.: `${botId}-start`). Preserva as `assistant_says` de erro existentes
 * (só sobrescreve o `next`); cria o `action.error` se ainda não houver.
 */
export function setActionErrorNext(
  intent: BotIntent,
  condIdx: number,
  fields: { redirect: string; intent: string },
): EditResult {
  const cond = intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'condição não encontrada na intenção' }
  const next: Next = {
    redirect: fields.redirect,
    type: 'error',
    // Nunca grava intent vazio (a opção "— Selecione —" do picker) — cai no Start
    // sintético, o default válido da seção "Em caso de erro".
    intent: fields.intent || `${intent.botId}-start`,
    intentBot: fields.redirect === 'waitInteraction' ? intent.botId : '',
    action: 'intent',
  }
  if (!cond.action.error) {
    cond.action.error = { next, assistant_says: [] }
  } else {
    cond.action.error.next = next
  }
  touch(intent)
  return { ok: true }
}

/** Substitui as variáveis definidas (bulkUpdate) da condição setData. */
export function updateSetDataItems(intent: BotIntent, items: BulkUpdateItem[], condIdx?: number): EditResult {
  const cond = condIdx === undefined
    ? intent.conditions.find(c => c.action.type === 'setData')
    : intent.conditions[condIdx]
  if (!cond) return { ok: false, reason: 'a intenção não tem ação setData' }
  const cleaned = items
    .map(i => ({ variable: i.variable.trim(), value: i.value }))
    .filter(i => i.variable)
  cond.action.bulkUpdate = cleaned
  touch(intent)
  return { ok: true }
}
