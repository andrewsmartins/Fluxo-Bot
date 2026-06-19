/**
 * Busca a lista de TIMES de uma loja para alimentar a variável dinâmica `@team`
 * (ver `variables.ts` e a Fase 9 do PLANS.md). É o núcleo testável do fetch —
 * a UI do picker consome estas funções; aqui não há React nem DOM.
 *
 * Caminho descoberto pela sonda `scripts/probe-teams.mjs` (2026-06-16): o navegador
 * lê os times com o MESMO token de sessão do push (NUNCA a master key REST), em
 * dois passos, ambos com CORS liberado:
 *   1. `GET /v2/bots?status=active` (execute-api) → casa o `botId` do fluxo e devolve o `retailerId`.
 *   2. `GET api-private2.../classes/Team?where=<pointer retailer>` → os times da loja.
 *
 * Segurança: o token chega por parâmetro, vai só nos headers e NUNCA é logado nem
 * devolvido. O `fetch` é injetável (deps) para os testes rodarem sem rede — igual
 * ao `pushFlow.ts`.
 */
import type { FetchLike } from './pushFlow'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
/** Base do Parse — reusada pelo `collections.ts` (mesma loja, mesmo app). */
export const PARSE = 'https://api-private2.omni.chat/parse'
// ID público do app Parse (visível a qualquer navegador na plataforma — não é segredo).
export const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'

/** Time da loja — só os campos que a variável `@team.{id}` precisa. */
export interface Team {
  /** `objectId` do Parse — é o `{id}` do token `@team.{id}.campo`. */
  objectId: string
  /** Nome legível do time (rótulo amigável do picker). */
  name: string
}

/** Dependências comuns dos fetchs (token de sessão + fetch injetável). */
export interface Deps {
  fetch: FetchLike
  token: string
}

/** Headers de sessão — iguais aos do push (Bearer + session-token + app-id). */
export function sessionHeaders(token: string): Record<string, string> {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-omnichat-platform': 'web',
    'x-parse-application-id': APP_ID,
    'x-parse-session-token': token,
  }
}

/**
 * Resolve o `retailerId` da loja a partir do `botId` do fluxo (passo 1).
 * Lê a lista de bots ativos da conta do token e casa pelo `botId`. Lança erro
 * (sem expor o token) se a leitura falhar ou o bot não estiver na lista.
 */
export async function fetchRetailerId(deps: Deps & { botId: string }): Promise<string> {
  const res = await deps.fetch(`${API}/v2/bots?status=active`, { headers: sessionHeaders(deps.token) })
  if (!res.ok) {
    throw new Error(`não foi possível listar os bots para achar a loja (status ${res.status})`)
  }
  const data = (await res.json()) as { list?: Array<{ botId?: string; retailerId?: string }> }
  const bot = (data.list ?? []).find(b => b.botId === deps.botId)
  if (!bot) {
    throw new Error(`o bot ${deps.botId} não está na lista de bots ativos desta conta`)
  }
  if (!bot.retailerId) {
    throw new Error(`o bot ${deps.botId} não tem retailerId — não dá para buscar os times`)
  }
  return bot.retailerId
}

/**
 * Lista os times de uma loja pelo `retailerId` (passo 2). Devolve só `{objectId,
 * name}`, ordenados por nome para o picker. Quando um time vier sem `name`, cai
 * para o `objectId` (o picker sempre precisa de um rótulo). Lança se a leitura
 * falhar.
 */
export async function fetchTeams(deps: Deps & { retailerId: string }): Promise<Team[]> {
  const where = encodeURIComponent(JSON.stringify({
    retailer: { __type: 'Pointer', className: 'Retailer', objectId: deps.retailerId },
  }))
  const res = await deps.fetch(`${PARSE}/classes/Team?where=${where}`, { headers: sessionHeaders(deps.token) })
  if (!res.ok) {
    // Inclui o motivo do servidor (sem token) — um 400 costuma ser where/pointer.
    const body = await res.text().catch(() => '')
    throw new Error(
      `não foi possível listar os times da loja (status ${res.status}; retailer ${deps.retailerId}` +
      `${body ? `; resposta: ${body.slice(0, 200)}` : ''})`,
    )
  }
  const data = (await res.json()) as { results?: Array<{ objectId?: string; name?: string }> }
  return (data.results ?? [])
    .filter((t): t is { objectId: string; name?: string } => typeof t.objectId === 'string')
    .map(t => ({ objectId: t.objectId, name: t.name ?? t.objectId }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Conveniência: resolve o `retailerId` pelo `botId` e já devolve os times da
 * loja. É o que a UI chama (tem o `botId` do modelo, não o `retailerId`).
 */
export async function fetchStoreTeams(deps: Deps & { botId: string }): Promise<Team[]> {
  const retailerId = await fetchRetailerId(deps)
  return fetchTeams({ fetch: deps.fetch, token: deps.token, retailerId })
}
