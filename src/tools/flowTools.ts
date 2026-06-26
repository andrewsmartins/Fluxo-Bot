import type { BotIntent } from '../types'
import { FlowStore } from './flowStore'
import { actionToNodeKind, triggerLabel } from '../utils/nodeMeta'
import { createIntentTemplate } from '../utils/intentTemplates'
import { isCreatableKind, type CreatableKind } from '../utils/nodeCatalog'
import {
  updateActionFields, setChoices, listMessages, addButtonListMessage, addChoice,
  addTextMessage, updateMessageText,
} from '../utils/editIntent'
import { applyConnect, setNextRef } from '../utils/editFlow'
import { validateFlow } from '../utils/validateFlow'

/**
 * Camada de TOOLS da spike do agente (Fase 1). Cada função envolve UMA função já
 * existente de `src/utils` (que já é testada e Node-safe) e devolve uma
 * CONFIRMAÇÃO COMPACTA em texto — nunca JSON cru (Q4). Por quê: o modelo opera
 * ferramentas, não raciocina sobre o JSON; e repetir nós inteiros (42 no
 * masterFlow) estouraria o contexto.
 *
 * Toda tool que muta chama `store.beginMutation()` (snapshot) e `store.save()`
 * (persiste sem gate, Q2) — a validação é a tool `validate`, separada.
 *
 * Esta é a peça reusada pelo servidor MCP (Fase 3) e pelo backend do produto
 * (Fase 5): só muda o cliente que chama estas funções.
 */

/**
 * Campos de `action` que a tool `set_action_field` sabe gravar (subconjunto de
 * updateActionFields). FONTE ÚNICA: o array `as const` é a verdade; o type deriva
 * dele e o servidor MCP importa o MESMO array para o `z.enum` — assim o schema
 * de runtime e o type de compilação não podem divergir (drift vira erro de tipo).
 */
export const ACTION_FIELDS = [
  'captureDataType', 'captureDataTypesCategory', 'multipleFields',
  'transferType', 'value', 'variable', 'storeType', 'orderType',
  'apiName', 'externalType',
] as const
export type ActionFieldName = (typeof ACTION_FIELDS)[number]

/**
 * Resolve uma referência de nó (id OU nome exato) para a intenção do modelo.
 * Aceitar nome é ergonomia para o agente; ambiguidade de nome é erro explícito
 * (deve usar o id, que `list_nodes`/`create_node` sempre expõem). `null` quando
 * não há correspondência.
 */
function resolveIntent(store: FlowStore, ref: string): BotIntent | { error: string } {
  const list = store.flow.list
  const byId = list.find(i => i.id === ref)
  if (byId) return byId
  const byName = list.filter(i => i.name === ref)
  if (byName.length === 1) return byName[0]
  if (byName.length > 1) return { error: `nome ambíguo "${ref}" (${byName.length} nós) — use o id` }
  return { error: `nó não encontrado: "${ref}"` }
}

function isError(v: unknown): v is { error: string } {
  return typeof v === 'object' && v !== null && 'error' in v
}

/**
 * Indica se o `next` de uma condição salta para OUTRO bot — mesmo sinal que o
 * `parseFlow` usa para render o nó sintético "Outro Bot": `action === 'bot'` ou
 * `botId` diferente do bot principal. Sem isso um salto cross-bot cujo alvo é
 * `<outroBot>-start` seria rotulado "(start)", como se fosse interno.
 */
function isCrossBotNext(cond: BotIntent['conditions'][number], mainBotId: string): boolean {
  const next = cond.next?.intent
  if (!next || typeof next !== 'object') return false
  return cond.next?.action === 'bot' || (!!next.botId && next.botId !== mainBotId)
}

/** Rótulo legível do destino `next` de uma condição (id-alvo, outro bot ou folha). */
function nextTargetLabel(intent: BotIntent, mainBotId: string): string {
  const targets: string[] = []
  for (const cond of intent.conditions) {
    const next = cond.next?.intent
    if (next && typeof next === 'object' && next.id) {
      if (isCrossBotNext(cond, mainBotId)) targets.push(`outro bot (${next.id})`)
      else targets.push(next.id === `${mainBotId}-start` ? '(start)' : next.id)
    } else if (Array.isArray(cond.action.choices)) {
      const filled = cond.action.choices.filter(Boolean).length
      targets.push(`${filled}/${cond.action.choices.length} escolhas`)
    }
  }
  return targets.length ? targets.join(', ') : '(folha)'
}

/**
 * `create_node(kind, name)` — cria um nó com os defaults canônicos do tipo
 * (envolve `createIntentTemplate`). É a tool mais simples e a porta de entrada
 * da construção. Retorna o id, que as outras tools usam como referência.
 */
export function createNode(store: FlowStore, kind: string, name: string): string {
  if (!isCreatableKind(kind)) {
    return `⚠️ erro: tipo de nó inválido "${kind}" — use um dos criáveis`
  }
  // Sem intenção de início não há botId confiável a herdar — criar com botId vazio
  // produziria um nó com `error.next` apontando para `-start` (ref morta). Barra cedo.
  if (!store.mainBotId) {
    return '⚠️ erro: fluxo sem intenção de início — não dá para inferir o botId do nó'
  }
  store.beginMutation()
  const intent = createIntentTemplate(kind as CreatableKind, store.mainBotId, name)
  store.flow.list.push(intent)
  store.save()
  return `criado nó "${name}" (id ${intent.id}) kind=${kind}`
}

/**
 * `set_action_field(node, field, value)` — grava um campo do `action`
 * (envolve `updateActionFields`). Opera sempre na 1ª condição (a spike usa nós
 * de condição única). `value` aceita string ou array (p/ `multipleFields`).
 */
export function setActionField(
  store: FlowStore, ref: string, field: ActionFieldName, value: string | string[], condIdx = 0,
): string {
  // Só `multipleFields` é lista; os demais campos são escalares. Sem este gate um
  // array gravado em `value`/`captureDataType`/etc. produziria JSON malformado
  // (a plataforma espera string) com confirmação de sucesso.
  if (field === 'multipleFields' && !Array.isArray(value)) {
    return `⚠️ erro: o campo "multipleFields" requer uma lista de campos`
  }
  if (field !== 'multipleFields' && Array.isArray(value)) {
    return `⚠️ erro: o campo "${field}" requer um valor único (string), não uma lista`
  }
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  store.beginMutation()
  // condIdx (default 0) endereça a condição: nós da spike são de condição única;
  // o parâmetro deixa nós-grupo (intentGroupNode) acessíveis sem mudar a interface.
  const actionType = intent.conditions[condIdx]?.action.type ?? ''
  const result = updateActionFields(intent, actionType, { [field]: value }, condIdx)
  if (!result.ok) return `⚠️ erro: ${result.reason}`
  store.save()
  const shown = Array.isArray(value) ? `[${value.join(', ')}]` : value
  return `set ${field}=${shown} em "${intent.name}"`
}

/**
 * `set_message(node, text, condIdx?=0)` — grava o texto da mensagem TEXT de um nó
 * (envolve `addTextMessage`/`updateMessageText`). Fecha o gap do `defaultNode`: criar
 * o nó já não bastava — faltava o conteúdo, e a superfície de tools não expunha
 * `assistant_says` (só `action.*`, via set_action_field). Idempotente na condição-alvo:
 * **0 mensagens TEXT → cria**; **1 → sobrescreve** (pela ref); **N>1 → erro** (edição de
 * múltiplos balões é território do DetailPanel). Escopo só TEXT — mídia/coleção/template
 * exigem referência real que o agente não pode sintetizar, e BUTTON/LIST é do `set_menu`.
 * `choiceNode` é recusado (→ aponta `set_menu`); texto vazio é recusado.
 */
export function setMessage(
  store: FlowStore, ref: string, text: string, condIdx = 0,
): string {
  // "set" nunca grava balão vazio — limpar é remoção (outra operação). Espelha set_menu.
  if (!text.trim()) {
    return `⚠️ erro: o texto da mensagem não pode ficar vazio`
  }
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  const cond = intent.conditions[condIdx]
  if (!cond) return `⚠️ erro: "${intent.name}" não tem a condição c${condIdx}`
  // choiceNode: o `assistant_says` é ESTRUTURALMENTE a mensagem BUTTON/LIST cujos botões
  // mapeiam para `action.choices` — um TEXT solto viraria balão órfão. Aponta o set_menu.
  if (cond.action.type === 'choice') {
    return `⚠️ erro: "${intent.name}" é um nó de escolha — use set_menu para o texto do menu`
  }
  // TEXT da condição-alvo (container 'condition' fixo — o caminho de erro fica fora):
  // 0 → cria; 1 → sobrescreve (idempotente); N>1 → erro honesto (nunca edita o balão
  // errado em silêncio). listMessages só varre `cond.assistant_says`, não o erro.
  const texts = listMessages(intent).filter(m => m.ref.condIdx === condIdx && m.type === 'TEXT')
  if (texts.length > 1) {
    return `⚠️ erro: "${intent.name}" tem ${texts.length} balões de texto — edição de múltiplos balões não é suportada por aqui (use o painel)`
  }
  store.beginMutation()
  const result = texts.length === 0
    ? addTextMessage(intent, text, condIdx)
    : updateMessageText(intent, texts[0].ref, text)
  if (!result.ok) return `⚠️ erro: ${result.reason}`
  store.save()
  const preview = text.length > 40 ? `${text.slice(0, 40)}…` : text
  return `mensagem ${texts.length === 0 ? 'criada' : 'atualizada'} em "${intent.name}": "${preview}"`
}

/**
 * `set_category(node, category)` — grava a CATEGORIA da intenção (campo de cabeçalho
 * que AGRUPA o fluxo na plataforma; texto livre — MODELO-INTENCAO §). Fecha o gap: todo
 * nó nasce em 'Sem Categoria' e a superfície de tools não expunha o cabeçalho. Idempotente.
 * Faz **trim** e colapsa espaços internos (mata a quase-duplicata boba "Vendas " vs "Vendas",
 * decisão Q3). Recusa categoria vazia (espelha set_message) e o nó de início (categoria
 * especial 'start' — nunca recategorizar, Q5). Vocabulário é texto livre (estratégia híbrida,
 * Q1): a coerência/reuso vivem na guidance (instructions) + no nudge do validate, não num enum.
 */
export function setCategory(store: FlowStore, ref: string, category: string): string {
  // Espelha set_menu/set_message: "set" nunca grava cabeçalho vazio. Trim + colapsa
  // espaços internos para que " Vendas " e "Vendas" não virem categorias distintas.
  const clean = category.trim().replace(/\s+/g, ' ')
  if (!clean) return `⚠️ erro: a categoria não pode ficar vazia`
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  // O nó de início usa a categoria especial 'start' (createIntentTemplate); recategorizá-lo
  // não quebra a topologia (a entrada é identificada pelo id `${botId}-start`), mas confunde
  // — recusamos para manter o cabeçalho do start canônico.
  if (intent.id === `${store.mainBotId}-start`) {
    return `⚠️ erro: "${intent.name}" é o nó de início (categoria especial "start") — não recategorize`
  }
  store.beginMutation()
  intent.category = clean
  store.save()
  return `categoria de "${intent.name}" = "${clean}"`
}

/**
 * `set_choices(node, destinos)` — define a lista de destinos de um nó de Escolha
 * (envolve `setChoices`). Os destinos são ids de intenção, posicionais com os itens.
 */
export function setNodeChoices(store: FlowStore, ref: string, destinations: string[]): string {
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  // Resolve cada destino (id OU nome) para id — vazio = slot vazio (opção sem destino).
  // Consistente com `connect`: o agente passa nomes ou ids indistintamente.
  const ids: string[] = []
  for (const d of destinations) {
    if (!d) { ids.push(''); continue }
    const dest = resolveIntent(store, d)
    if (isError(dest)) return `⚠️ erro: destino "${d}": ${dest.error}`
    ids.push(dest.id)
  }
  store.beginMutation()
  const result = setChoices(intent, 0, ids)
  if (!result.ok) return `⚠️ erro: ${result.reason}`
  store.save()
  return `set ${ids.filter(Boolean).length} escolha(s) em "${intent.name}"`
}

/**
 * `set_menu(node, body, items, header?, footer?, title?)` — cria a mensagem
 * BUTTON/LIST de um nó de Escolha com todos os itens de uma vez (envolve
 * `addButtonListMessage`) e cria, em sincronia, N slots de escolha VAZIOS
 * (`buttons[i] ↔ choices[i]`) — deixando o `validate` limpo. Os DESTINOS são
 * definidos à parte (`set_choices`/`connect`): separa conteúdo (itens) de
 * topologia (destinos), cobrindo o caso comum de o destino ainda não existir.
 * BUTTON vs LIST é inferido (algum item com descrição OU 4+ itens → LIST).
 */
export function setMenu(
  store: FlowStore, ref: string, body: string,
  items: { text: string; description?: string }[],
  header = '', footer = '', title = '',
): string {
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  const cond = intent.conditions[0]
  if (cond?.action.type !== 'choice') {
    return `⚠️ erro: "${intent.name}" não é um nó de escolha — set_menu só se aplica a choiceNode`
  }
  // A tool é para CRIAR o menu; recusa duplicar (editar é remover+recriar) para não
  // deixar duas mensagens de botões silenciosas com mapeamento ambíguo. A pré-condição
  // cobre as DUAS metades do mesmo estado: a mensagem de botões E os destinos (choices).
  // Sem checar os choices, um set_choices feito antes do set_menu seria apagado em
  // silêncio pelo reset abaixo. Slots vazios pós-set_menu (`['','']`) não contam.
  const hasMenuMessage = cond.assistant_says
    .flatMap(s => s.messages)
    .some(m => (m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig)
  const hasChoices = Array.isArray(cond.action.choices) && cond.action.choices.some(Boolean)
  if (hasMenuMessage || hasChoices) {
    return `⚠️ erro: "${intent.name}" já tem menu/destinos definidos (remova antes de recriar)`
  }

  // 'described' (sempre LIST) quando algum item traz descrição; senão 'plain'
  // (BUTTON, ou LIST a partir de 4 itens — regra de buildButtonList).
  const variant = items.some(it => (it.description ?? '').trim()) ? 'described' : 'plain'
  store.beginMutation()
  const result = addButtonListMessage(intent, {
    header, body, footer, title, variant,
    items: items.map(it => ({ text: it.text, description: it.description ?? '' })),
  }, 0)
  if (!result.ok) return `⚠️ erro: ${result.reason}`
  // Sincroniza os destinos com os itens: N slots vazios (opção sem destino),
  // preenchidos depois por set_choices/connect. addChoice faz push('') sem aparar.
  cond.action.choices = []
  for (let i = 0; i < items.length; i++) addChoice(intent, 0)
  store.save()
  const msgType = variant === 'described' || items.length >= 4 ? 'LIST' : 'BUTTON'
  return `menu ${msgType} com ${items.length} itens em "${intent.name}" (destinos a definir via set_choices/connect)`
}

/**
 * `connect(origem, destino)` — liga origem→destino preenchendo a 1ª vaga livre
 * (`next` ou slot de escolha; envolve `applyConnect`). Aceita id ou nome em ambos.
 */
export function connectNodes(store: FlowStore, sourceRef: string, targetRef: string): string {
  const source = resolveIntent(store, sourceRef)
  if (isError(source)) return `⚠️ erro: ${source.error}`
  const target = resolveIntent(store, targetRef)
  if (isError(target)) return `⚠️ erro: ${target.error}`
  store.beginMutation()
  const result = applyConnect(store.flow, source.id, target.id)
  if (!result.ok) return `⚠️ erro: ${result.reason}`
  store.save()
  return `${source.name}→${target.name} (${result.kind})`
}

/**
 * `connect_to_bot(node, botId, intentId?)` — redireciona o `next` de um nó para
 * uma intenção de OUTRO bot (envolve `setNextRef`, que grava `next.intent={botId,id}`
 * com `action:'bot'`). Os IDs vêm JÁ resolvidos pelos resolvers (`find_bot`/
 * `list_intents`) — a tool NÃO auto-resolve nem valida remotamente (regra: nunca
 * inventar ID). `intentId` omitido → `${botId}-start` (a entrada do outro bot, o
 * caso comum). Opera na 1ª condição (spike = condição única).
 */
export function connectToBot(
  store: FlowStore, ref: string, botId: string, intentId?: string,
): string {
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  const cond = intent.conditions[0]
  if (!cond) return `⚠️ erro: "${intent.name}" não tem condições`
  // (a) nó de escolha conecta por destinos (choices), não pelo next.
  if (cond.action.type === 'choice') {
    return `⚠️ erro: "${intent.name}" é um nó de escolha — conecte por set_choices; connect_to_bot é para o next de nós de mensagem/ação`
  }
  // (a.1) botId vazio fura a guarda (b) (≠ mainBotId) e cairia em `action:'intent'`
  // no setNextRef (isCrossBot exige botId não-vazio) → next interno órfão com
  // confirmação mentindo "outro bot". Exige um botId resolvido (find_bot).
  if (!botId.trim()) {
    return `⚠️ erro: botId vazio — resolva o bot de destino com find_bot (NUNCA invente o ID)`
  }
  // (b) mesmo bot → seria next interno apontando p/ um id possivelmente ausente do
  // flow (next órfão). Redireciona para a tool certa.
  if (botId === store.mainBotId) {
    return `⚠️ erro: botId é o próprio bot — use connect para destinos internos`
  }
  const targetId = intentId?.trim() || `${botId}-start`
  // (c) sobrescreve um next existente: redirecionar é uma ação deliberada (≠ connect,
  // que recusa vaga ocupada). (d) sem validação remota: confia no ID resolvido.
  const hadNext = !!cond.next?.intent
  store.beginMutation()
  setNextRef(cond, { botId, id: targetId }, store.mainBotId)
  store.save()
  return `${intent.name}→outro bot (${targetId})${hadNext ? ' (destino anterior substituído)' : ''}`
}

/** Extrai o id da intenção-destino de um `next` (objeto `{botId,id}` ou string). */
function nextIntentId(cond: BotIntent['conditions'][number]): string | null {
  const next = cond.next?.intent
  if (!next) return null
  return typeof next === 'string' ? next : (next.id ?? null)
}

/** True se a condição tem ao menos um balão TEXT com conteúdo (= "fez uma pergunta"). */
function hasTextMessage(cond: BotIntent['conditions'][number]): boolean {
  return cond.assistant_says.some(say =>
    say.messages.some(m => m.type === 'TEXT' && !!(m.content ?? '').trim()),
  )
}

/**
 * Nudge do antipadrão "Mensagem + Aguardar" (decisão 5 do interrogatório
 * 2026-06-26): só dispara quando um `defaultNode` QUE CARREGA texto (= fez uma
 * pergunta) aponta para um `waitNode`. É a assinatura de "perguntou e esperou" —
 * que deveria ser UM `captureNode`. Avisos NÃO bloqueiam export; vivem só aqui no
 * `validate()` do agente (não em `validateFlow`), para não acusar Mensagem+Aguardar
 * legítimos montados à mão na UI.
 */
function findAskWaitNudges(store: FlowStore): string[] {
  const byId = new Map(store.flow.list.map(i => [i.id, i]))
  const nudges: string[] = []
  for (const intent of store.flow.list) {
    for (const cond of intent.conditions) {
      if (actionToNodeKind(cond.action) !== 'defaultNode' || !hasTextMessage(cond)) continue
      const target = byId.get(nextIntentId(cond) ?? '')
      const pointsToWait = !!target && target.conditions.some(c => c.action?.type === 'waitForInteraction')
      if (!pointsToWait) continue
      nudges.push(
        `nó "${intent.name}" faz uma pergunta e aponta para "${target.name}" (Aguardar interação) — ` +
        `troque os dois por UM nó de Captura (captureNode): set_message com a pergunta + captureDataType=free (ou tipado).`,
      )
    }
  }
  return nudges
}

/**
 * Chave de comparação de categorias para detectar quase-duplicatas (Q3): ignora
 * caixa, acentos e espaços. Por quê: na plataforma, "Atendimento", "atendimento" e
 * "Atendimento " são categorias DISTINTAS — quem agrupa visualmente é a string crua.
 * Duas categorias que colapsam na mesma chave furam o reuso sem ninguém ver.
 */
function normalizeCategory(category: string): string {
  return category.trim().toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ')
}

/**
 * Nudges de categoria (decisões Q3/Q5 do interrogatório 2026-06-26), não-bloqueantes:
 * (a) categorias QUASE-IGUAIS (diferem só por caixa/acento/espaço) → unifique numa só,
 *     senão viram grupos distintos na plataforma e o reuso fura;
 * (b) nós deixados no default 'Sem Categoria' (exceto o início) → a recidiva que a
 *     feature combate; lista os nomes para o agente saber onde aplicar set_category.
 * Vivem só aqui no `validate()` do agente (não em `validateFlow`/UI): é política de
 * design (toda intenção categorizada), não validação estrutural do fluxo.
 */
function findCategoryNudges(store: FlowStore): string[] {
  const nudges: string[] = []
  const startId = `${store.mainBotId}-start`
  // (a) agrupa as categorias REAIS por chave normalizada; >1 variante na mesma chave = quase-dup.
  const variantsByKey = new Map<string, Set<string>>()
  const uncategorized: string[] = []
  for (const intent of store.flow.list) {
    if (intent.id === startId) continue // o início tem categoria especial 'start'
    // `category` é `string` no type, mas o flow vem de `JSON.parse ... as BotFlowJson`
    // (flowStore.fromFile) e exports reais podem OMITIR o campo (ver PLANS §schema). Tratar
    // ausente/vazia como "Sem Categoria" — sem isso `normalizeCategory(undefined).trim()` quebra o validate().
    if (!intent.category || intent.category === 'Sem Categoria') { uncategorized.push(intent.name); continue }
    const key = normalizeCategory(intent.category)
    if (!variantsByKey.has(key)) variantsByKey.set(key, new Set())
    variantsByKey.get(key)!.add(intent.category)
  }
  for (const variants of variantsByKey.values()) {
    if (variants.size > 1) {
      const shown = [...variants].map(v => `"${v}"`).join(' / ')
      nudges.push(
        `categorias quase-iguais: ${shown} — unifique numa só (diferenças de caixa/acento/espaço ` +
        `contam como categorias distintas na plataforma).`,
      )
    }
  }
  // (b) nós sem categoria — a feature quer todo nó (menos o início) categorizado.
  if (uncategorized.length) {
    nudges.push(
      `${uncategorized.length} nó(s) em "Sem Categoria" (${uncategorized.join(', ')}) — ` +
      `defina a categoria com set_category (reutilize uma já usada no fluxo antes de criar nova).`,
    )
  }
  return nudges
}

/**
 * `validate()` — relatório de validade do fluxo (envolve `validateFlow`).
 * Tool separada (Q2): nunca é gate de escrita; o agente chama quando quer
 * (tipicamente no fim). Erros bloqueiam export; avisos só informam — inclui os
 * nudges de captura (`findAskWaitNudges`) e de categoria (`findCategoryNudges`),
 * exclusivos do agente.
 */
export function validate(store: FlowStore): string {
  const { errors, warnings } = validateFlow(store.flow)
  const allWarnings = [...warnings, ...findAskWaitNudges(store), ...findCategoryNudges(store)]
  if (!errors.length && !allWarnings.length) return '✅ fluxo válido (0 erros, 0 avisos)'
  const lines: string[] = []
  lines.push(errors.length ? `❌ ${errors.length} erro(s):` : '✅ 0 erros')
  errors.forEach(e => lines.push(`  • ${e}`))
  if (allWarnings.length) {
    lines.push(`⚠️ ${allWarnings.length} aviso(s):`)
    allWarnings.forEach(w => lines.push(`  • ${w}`))
  }
  return lines.join('\n')
}

/** `revert()` — desfaz tudo desde a 1ª mutação da sessão (snapshot de storage, Q3). */
export function revert(store: FlowStore): string {
  return store.revert()
    ? 'revertido ao estado inicial da sessão'
    : 'nada a reverter (nenhuma mutação nesta sessão)'
}

/**
 * `list_nodes()` — mapa COMPACTO do fluxo para o agente se orientar (Q5):
 * uma linha por nó com nome, id, kind, categoria e alvo. NÃO traz campos de
 * conteúdo (isso é `describe_node`, sob demanda).
 */
export function listNodes(store: FlowStore): string {
  const list = store.flow.list
  if (!list.length) return '(fluxo vazio)'
  return list.map(intent => {
    const kind = intent.conditions.length > 1
      ? `grupo(${intent.conditions.length})`
      : actionToNodeKind(intent.conditions[0]?.action)
    return `${intent.name} | ${intent.id} | ${kind} | ${intent.category} | →${nextTargetLabel(intent, store.mainBotId)}`
  }).join('\n')
}

/**
 * `describe_node(node)` — campos de UM nó, compacto (Q5): para inspecionar antes
 * de editar. Por condição: gatilho, ação + campos preenchidos, prévia das
 * mensagens e destino. Sem JSON cru.
 */
export function describeNode(store: FlowStore, ref: string): string {
  const intent = resolveIntent(store, ref)
  if (isError(intent)) return `⚠️ erro: ${intent.error}`
  const head = [
    `nó "${intent.name}" (id ${intent.id})`,
    `categoria=${intent.category}`,
    intent.keywords.length ? `keywords=[${intent.keywords.join(', ')}]` : null,
    intent.context ? `context=${intent.context}` : null,
  ].filter(Boolean).join(' · ')

  const conds = intent.conditions.map((cond, i) => {
    const a = cond.action
    const fields = [
      a.captureDataType ? `captureDataType=${a.captureDataType}` : null,
      a.transferType ? `transferType=${a.transferType}` : null,
      a.orderType ? `orderType=${a.orderType}` : null,
      a.storeType ? `storeType=${a.storeType}` : null,
      a.variable ? `variable=${a.variable}` : null,
      a.value ? `value=${a.value}` : null,
      Array.isArray(a.multipleFields) && a.multipleFields.length ? `multipleFields=[${a.multipleFields.join(', ')}]` : null,
      a.error ? 'tem error' : null,
    ].filter(Boolean).join(', ')
    const msgs = listMessages(intent)
      .filter(m => m.ref.condIdx === i && m.text)
      .map(m => `"${m.text.slice(0, 40)}"`)
    const next = (() => {
      const n = cond.next?.intent
      if (n && typeof n === 'object' && n.id) {
        return isCrossBotNext(cond, store.mainBotId) ? `→outro bot (${n.id})` : `→${n.id}`
      }
      if (Array.isArray(a.choices)) return `choices=[${a.choices.map(c => c || '∅').join(', ')}]`
      return '(folha)'
    })()
    return `  [c${i}] ${triggerLabel(cond.type)} · ${actionToNodeKind(a)}${fields ? ` (${fields})` : ''} · ${next}${msgs.length ? ` · msgs: ${msgs.join(' ')}` : ''}`
  }).join('\n')

  return `${head}\n${conds}`
}
