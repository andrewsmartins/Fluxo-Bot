import type { BotIntent } from '../types'
import { FlowStore } from './flowStore'
import { actionToNodeKind, triggerLabel } from '../utils/nodeMeta'
import {
  createIntentTemplate, isCreatableKind, type CreatableKind,
} from '../utils/intentTemplates'
import { updateActionFields, setChoices, listMessages } from '../utils/editIntent'
import { applyConnect } from '../utils/editFlow'
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

/** Campos de `action` que a tool `set_action_field` sabe gravar (subconjunto de updateActionFields). */
export type ActionFieldName =
  | 'captureDataType' | 'captureDataTypesCategory' | 'multipleFields'
  | 'transferType' | 'value' | 'variable' | 'storeType' | 'orderType'
  | 'apiName' | 'externalType'

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
 * `validate()` — relatório de validade do fluxo (envolve `validateFlow`).
 * Tool separada (Q2): nunca é gate de escrita; o agente chama quando quer
 * (tipicamente no fim). Erros bloqueiam export; avisos só informam.
 */
export function validate(store: FlowStore): string {
  const { errors, warnings } = validateFlow(store.flow)
  if (!errors.length && !warnings.length) return '✅ fluxo válido (0 erros, 0 avisos)'
  const lines: string[] = []
  lines.push(errors.length ? `❌ ${errors.length} erro(s):` : '✅ 0 erros')
  errors.forEach(e => lines.push(`  • ${e}`))
  if (warnings.length) {
    lines.push(`⚠️ ${warnings.length} aviso(s):`)
    warnings.forEach(w => lines.push(`  • ${w}`))
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
