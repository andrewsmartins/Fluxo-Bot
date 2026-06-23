/**
 * Busca a lista de ENDPOINTS (APIs cadastradas) de um bot para alimentar o picker
 * "Nome da API" do nó "Chamada de API" (`action.type === 'external'`). É o núcleo
 * testável do fetch — a UI (DetailPanel) consome estas funções; aqui não há React
 * nem DOM.
 *
 * Caminho confirmado por sonda read-only na API real (bot de testes, 2026-06-22):
 *   `GET <execute-api>/v1/{botId}/endpoints?fullObject=true` — por `botId` DIRETO,
 *   sem o passo `retailerId` dos times/coleções (mesma `execute-api` das entities).
 *   Envelope `{ list: [...] }`. Cada item: `{ id, name, type, method, url, ... }`.
 *
 * O `id` do endpoint bate exatamente com `action.external.apiName` no export real:
 * o picker MOSTRA `name` e GRAVA `id` (padrão @team/coleções/entities).
 *
 * Segurança: o token chega por parâmetro, vai só nos headers e NUNCA é logado nem
 * devolvido. O `fetch` é injetável (deps) para os testes rodarem sem rede — igual
 * a `entities.ts`/`teams.ts`.
 */
import { API, sessionHeaders, type Deps } from './teams'

/** Endpoint (API cadastrada) do bot — só os campos que o picker precisa. */
export interface BotEndpoint {
  /** ID do endpoint — vira `action.external.apiName` no nó "Chamada de API". */
  id: string
  /** Nome legível do endpoint (rótulo do picker); cai para o `id` quando ausente. */
  name: string
  /** Tipo HTTP do endpoint (`custom`, …) — informativo; NÃO é o "Tipo de Integração" do nó. */
  type: string
}

/**
 * Lista os endpoints (APIs) de um bot pelo `botId` (passo único — sem o
 * `retailerId` que times/coleções exigem). Devolve `{ id, name, type }` ordenado
 * por nome para o picker; quando um endpoint vier sem `name`, cai para o `id` (o
 * picker sempre precisa de um rótulo). Lança (sem expor o token) se a leitura
 * falhar.
 */
export async function fetchBotEndpoints(deps: Deps & { botId: string }): Promise<BotEndpoint[]> {
  const res = await deps.fetch(`${API}/v1/${deps.botId}/endpoints?fullObject=true`, { headers: sessionHeaders(deps.token) })
  if (!res.ok) {
    throw new Error(`não foi possível listar as APIs do bot (status ${res.status})`)
  }
  const data = (await res.json()) as { list?: Array<{ id?: string; name?: string; type?: string }> }
  return (data.list ?? [])
    .filter((e): e is { id: string; name?: string; type?: string } => typeof e.id === 'string')
    .map(e => ({ id: e.id, name: e.name ?? e.id, type: e.type ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}
