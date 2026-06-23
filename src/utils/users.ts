/**
 * Busca a lista de VENDEDORES (usuários supervisionados) de uma loja para
 * alimentar o picker do nó "Transferência" no tipo "Por vendedor → busca por
 * nome" (`direct4user`, grava o `objectId` em `action.value`). É o núcleo
 * testável do fetch — a UI (DetailPanel) consome esta função; aqui não há React
 * nem DOM.
 *
 * Caminho confirmado por sonda read-only na API real (bot de testes, 2026-06-22,
 * `scripts/probe-users.mjs`):
 *   `POST <PARSE>/functions/getSupervisedUsersV2` body `{offset,limit,search}`.
 *   Ambas as bases (`api-private` e `api-private2`) respondem 200 — usamos a do
 *   projeto (`PARSE` = `api-private2`) para não divergir de teams.ts/collections.ts.
 *   Envelope é uma cloud function Parse: `{ result: [ ... ] }` (array DIRETO em
 *   `result`, diferente do `list` de entities e do `results` dos times).
 *   Shape do usuário: { objectId, name, lastName, username, status, ... } — SEM
 *   `email`. O rótulo do picker é `name + lastName` (vendedores repetem o 1º nome).
 *
 * Segurança: o token chega por parâmetro, vai só nos headers e NUNCA é logado nem
 * devolvido. O `fetch` é injetável (deps) para os testes rodarem sem rede — igual
 * a `teams.ts`/`entities.ts`.
 */
import { PARSE, sessionHeaders, type Deps } from './teams'

/**
 * Limite por página da cloud function. O fetch carrega uma vez e a UI filtra em
 * memória (decisão 2 do plano). Se a loja tiver mais vendedores que isto, a lista
 * trunca — o consumidor deve avisar quando vierem exatamente `USERS_PAGE_LIMIT`.
 */
export const USERS_PAGE_LIMIT = 100

/** Vendedor (usuário supervisionado) — só os campos que o picker precisa. */
export interface StoreUser {
  /** `objectId` do Parse — vira `action.value` no tipo `direct4user`. */
  objectId: string
  /** Nome de exibição (`name` + `lastName`); cai para o `objectId` quando ausente. */
  name: string
}

/** Compõe o rótulo a partir de `name` + `lastName`; cai para o `objectId` se vazio. */
function displayName(u: { name?: string; lastName?: string; objectId: string }): string {
  const full = [u.name, u.lastName].filter(Boolean).join(' ').trim()
  return full || u.objectId
}

/**
 * Lista os vendedores supervisionados pela conta do token. Carrega uma página
 * (`USERS_PAGE_LIMIT`) com `search:'.*'` (todos) e devolve `{ objectId, name }`
 * ordenado por nome para o picker; ignora entradas sem `objectId`. Lança (sem
 * expor o token) se a leitura falhar.
 */
export async function fetchSupervisedUsers(deps: Deps): Promise<StoreUser[]> {
  const res = await deps.fetch(`${PARSE}/functions/getSupervisedUsersV2`, {
    method: 'POST',
    headers: sessionHeaders(deps.token),
    body: JSON.stringify({ offset: 0, limit: USERS_PAGE_LIMIT, search: '.*' }),
  })
  if (!res.ok) {
    throw new Error(`não foi possível listar os vendedores da loja (status ${res.status})`)
  }
  const data = (await res.json()) as { result?: Array<{ objectId?: string; name?: string; lastName?: string }> }
  return (data.result ?? [])
    .filter((u): u is { objectId: string; name?: string; lastName?: string } => typeof u.objectId === 'string')
    .map(u => ({ objectId: u.objectId, name: displayName(u) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
