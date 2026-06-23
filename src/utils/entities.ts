/**
 * Busca a lista de LISTAS (entities) de uma loja para alimentar a variável
 * dinâmica `@entity` (rótulo "Lista") e o picker de Loja do nó "Loja física".
 * É o núcleo testável do fetch — a UI (DetailPanel/VariableMenu) consome estas
 * funções; aqui não há React nem DOM.
 *
 * Caminho confirmado por sonda read-only na API real (bot de testes, 2026-06-22):
 *   `GET <execute-api>/v1/{botId}/entities?fullObject=true` — por `botId` DIRETO,
 *   sem o passo `retailerId` dos times/coleções. Envelope `{ list: [...] }`.
 *   ATENÇÃO: o `?fullObject=true` é OBRIGATÓRIO — sem ele a API devolve só
 *   `{ name, id }` (sem `type`), e o picker do nó "Loja física" (que filtra
 *   `type === 'store'`) ficaria sempre vazio.
 *
 * Segurança: o token chega por parâmetro, vai só nos headers e NUNCA é logado nem
 * devolvido. O `fetch` é injetável (deps) para os testes rodarem sem rede — igual
 * a `teams.ts`/`collections.ts`.
 */
import { API, sessionHeaders, type Deps } from './teams'

/** Lista (entity) da loja — só os campos que os pickers precisam. */
export interface StoreEntity {
  /** ID da lista — vira `@entity.<name>` no picker e `action.entity` no nó Loja física. */
  id: string
  /** Nome legível da lista (rótulo dos pickers); cai para o `id` quando ausente. */
  name: string
  /** Tipo da lista (`store` = loja física por distância; outros = listas de valores). */
  type: string
}

/**
 * Lista as Listas (entities) de um bot pelo `botId` (passo único — sem o
 * `retailerId` que times/coleções exigem). Devolve `{ id, name, type }` ordenado
 * por nome para o picker; quando uma lista vier sem `name`, cai para o `id` (o
 * picker sempre precisa de um rótulo). Lança (sem expor o token) se a leitura
 * falhar.
 */
export async function fetchStoreEntities(deps: Deps & { botId: string }): Promise<StoreEntity[]> {
  const res = await deps.fetch(`${API}/v1/${deps.botId}/entities?fullObject=true`, { headers: sessionHeaders(deps.token) })
  if (!res.ok) {
    throw new Error(`não foi possível listar as listas do bot (status ${res.status})`)
  }
  const data = (await res.json()) as { list?: Array<{ id?: string; name?: string; type?: string }> }
  return (data.list ?? [])
    .filter((e): e is { id: string; name?: string; type?: string } => typeof e.id === 'string')
    .map(e => ({ id: e.id, name: e.name ?? e.id, type: e.type ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
