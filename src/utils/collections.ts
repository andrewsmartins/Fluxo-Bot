/**
 * Busca a lista de COLEÇÕES (catálogos de produtos) de uma loja para a resposta
 * "Coleção" do menu "Adicionar resposta" (`MessageType = COLLECTION`). É o núcleo
 * testável do fetch — a UI do picker (DetailPanel) consome estas funções; aqui não
 * há React nem DOM.
 *
 * Espelha `teams.ts`: o navegador lê as coleções com o MESMO token de sessão do push
 * (NUNCA a master key REST), em dois passos:
 *   1. `fetchRetailerId` (reusado de `teams.ts`) casa o `botId` do fluxo → `retailerId`.
 *   2. `GET <parse>/classes/Collection?where=<pointer retailer + name regex>` → as coleções.
 *
 * Segurança: o token chega por parâmetro, vai só nos headers e NUNCA é logado nem
 * devolvido. O `fetch` é injetável (deps) para os testes rodarem sem rede.
 */
import { PARSE, sessionHeaders, fetchRetailerId, type Deps } from './teams'

/** Coleção da loja — só os campos que o picker e o preview precisam. */
export interface Collection {
  /** `objectId` do Parse — é o `collectionId` gravado na mensagem COLLECTION. */
  objectId: string
  /** Nome legível da coleção (rótulo do picker e do preview). */
  name: string
  /** URL da imagem de capa, quando houver (preview). `null` = sem capa. */
  image: string | null
}

/**
 * Extrai a URL da imagem de capa de um objeto Collection cru, sendo tolerante ao
 * formato: a plataforma pode devolver a capa como string (URL direta), como objeto
 * `{ url }` ou como Parse File (`{ __type: 'File', url }`), sob nomes diferentes de
 * campo. Devolve `null` quando nada utilizável é encontrado.
 */
function extractImageUrl(raw: Record<string, unknown>): string | null {
  const candidates = [raw.image, raw.coverImage, raw.cover, raw.photo, raw.thumbnail]
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c
    if (c && typeof c === 'object') {
      const url = (c as { url?: unknown }).url
      if (typeof url === 'string' && url.trim()) return url
    }
  }
  return null
}

/**
 * Lista as coleções de uma loja pelo `retailerId` (passo 2). Aceita um filtro
 * opcional `search` (regex case-insensitive sobre `name`, como o construtor faz).
 * Devolve `{objectId, name, image}` ordenado por nome para o picker; quando uma
 * coleção vier sem `name`, cai para o `objectId`. Lança (sem expor o token) se a
 * leitura falhar.
 */
export async function fetchCollections(
  deps: Deps & { retailerId: string; search?: string },
): Promise<Collection[]> {
  const where = encodeURIComponent(JSON.stringify({
    retailer: { __type: 'Pointer', className: 'Retailer', objectId: deps.retailerId },
    name: { $regex: deps.search ?? '', $options: 'i' },
  }))
  // limit alto: o picker carrega uma vez e filtra no cliente (sem refetch por busca).
  const url = `${PARSE}/classes/Collection?where=${where}&include=salesPerson&order=-updatedAt&limit=200&skip=0`
  const res = await deps.fetch(url, { headers: sessionHeaders(deps.token) })
  if (!res.ok) {
    // Inclui o motivo do servidor (sem token) — um 400 costuma ser where/pointer.
    const body = await res.text().catch(() => '')
    throw new Error(
      `não foi possível listar as coleções da loja (status ${res.status}; retailer ${deps.retailerId}` +
      `${body ? `; resposta: ${body.slice(0, 200)}` : ''})`,
    )
  }
  const data = (await res.json()) as { results?: Array<Record<string, unknown>> }
  return (data.results ?? [])
    .filter((c): c is Record<string, unknown> & { objectId: string } => typeof c.objectId === 'string')
    .map(c => ({
      objectId: c.objectId,
      name: typeof c.name === 'string' && c.name.trim() ? c.name : c.objectId,
      image: extractImageUrl(c),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

/**
 * Conveniência: resolve o `retailerId` pelo `botId` e já devolve as coleções da
 * loja. É o que a UI chama (tem o `botId` do modelo, não o `retailerId`).
 */
export async function fetchStoreCollections(
  deps: Deps & { botId: string; search?: string },
): Promise<Collection[]> {
  const retailerId = await fetchRetailerId(deps)
  return fetchCollections({ fetch: deps.fetch, token: deps.token, retailerId, search: deps.search })
}
