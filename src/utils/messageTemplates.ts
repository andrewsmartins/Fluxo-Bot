/**
 * Busca a lista de MODELOS DE MENSAGEM do WhatsApp compatíveis com Flow, para a
 * resposta "Modelo de mensagem com Flow" do menu "Adicionar resposta"
 * (`MessageType = TEMPLATE`). É o núcleo testável do fetch — a UI do picker
 * (DetailPanel) consome estas funções; aqui não há React nem DOM.
 *
 * Espelha `collections.ts`: o navegador lê os modelos com o MESMO token de sessão
 * do push (NUNCA a master key REST), em dois passos:
 *   1. `fetchRetailerId` (reusado de `teams.ts`) casa o `botId` do fluxo → `retailerId`.
 *   2. `POST <api>/parse/functions/findMessageTemplates` com o `where` da plataforma
 *      → os modelos da loja; o filtro "tem Flow" é client-side (ver decisão 1 do PLANS).
 *
 * Contrato confirmado por captura real (2026-06-21). ATENÇÃO: o endpoint de modelos
 * mora em `api-private.omni.chat` (SEM o "2"), diferente do `PARSE` de classes
 * (`api-private2`) — por isso a URL é uma constante própria aqui.
 *
 * Segurança: o token chega por parâmetro, vai só nos headers e NUNCA é logado nem
 * devolvido. O `fetch` é injetável (deps) para os testes rodarem sem rede.
 */
import { sessionHeaders, fetchRetailerId, type Deps } from './teams'

/**
 * Cloud Function do Parse que lista modelos de mensagem. Base distinta do `PARSE`
 * (api-private2) — confirmada na captura de 2026-06-21.
 */
const FIND_TEMPLATES_FN = 'https://api-private.omni.chat/parse/functions/findMessageTemplates'

/**
 * Modelo de mensagem (WhatsApp Template) compatível com Flow — só os campos que o
 * picker, o editor de variáveis e o preview precisam.
 */
export interface MessageTemplate {
  /** `objectId` do Parse — é o `messageTemplateId` gravado na mensagem TEMPLATE. */
  objectId: string
  /** Título do modelo (rótulo do picker; gravado em `title` na mensagem). */
  title: string
  /** Corpo do modelo, com placeholders posicionais `{{1}}..{{n}}`. */
  body: string
  /** Texto-exemplo por posição de variável (`examples[i]` → `{{i+1}}`); placeholder do campo. */
  examples: string[]
  /** Texto do botão Flow (componente BUTTONS, `type: 'FLOW'`) — exibido no preview. */
  flowButtonText: string
}

/** Conta as variáveis posicionais `{{n}}` distintas do corpo (fonte canônica do nº de campos). */
export function templateVarCount(t: MessageTemplate): number {
  return distinctPlaceholders(t.body).length
}

/** Corpo do modelo (com `{{n}}`) — helper de leitura para a UI. */
export function templateBody(t: MessageTemplate): string {
  return t.body
}

/** Posições `{{n}}` distintas presentes num texto, em ordem crescente. Ex.: "a {{2}} {{1}}" → [1, 2]. */
export function distinctPlaceholders(text: string): number[] {
  const found = new Set<number>()
  for (const m of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) {
    const n = Number.parseInt(m[1], 10)
    if (Number.isFinite(n) && n > 0) found.add(n)
  }
  return [...found].sort((a, b) => a - b)
}

/** Componente cru de um modelo (forma tolerante; só lemos o que importa). */
interface RawComponent {
  type?: string
  text?: string
  examples?: unknown[]
  buttons?: Array<{ text?: string; type?: string }>
}

/** Extrai um texto-exemplo de um item de `examples` (string direta ou objeto com texto). */
function exampleText(raw: unknown): string {
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object') {
    const o = raw as Record<string, unknown>
    const v = o.text ?? o.value ?? o.example
    if (typeof v === 'string') return v
  }
  return ''
}

/**
 * Acha o botão Flow nos componentes (BUTTONS → buttons[type='FLOW']) e devolve seu
 * texto, ou `null` se o modelo NÃO tem Flow (usado tanto para filtrar quanto para o
 * preview). Tolerante a `components` ausente.
 */
function findFlowButtonText(components: RawComponent[]): string | null {
  for (const c of components) {
    if (c.type !== 'BUTTONS' || !Array.isArray(c.buttons)) continue
    const flow = c.buttons.find(b => b?.type === 'FLOW')
    if (flow) return typeof flow.text === 'string' ? flow.text : ''
  }
  return null
}

/** Extrai os textos-exemplo do componente BODY (alimenta os placeholders dos campos). */
function bodyExamples(components: RawComponent[]): string[] {
  const body = components.find(c => c.type === 'BODY')
  if (!body || !Array.isArray(body.examples)) return []
  return body.examples.map(exampleText)
}

/**
 * Mapeia um modelo cru do servidor para `MessageTemplate`, OU `null` se ele não tem
 * botão Flow (filtro client-side da decisão 1 do PLANS). Sem `objectId` também cai fora.
 */
function toFlowTemplate(raw: Record<string, unknown>): MessageTemplate | null {
  if (typeof raw.objectId !== 'string') return null
  const components = Array.isArray(raw.components) ? (raw.components as RawComponent[]) : []
  const flowButtonText = findFlowButtonText(components)
  if (flowButtonText === null) return null // não é "compatível com Flow"
  const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title : raw.objectId
  const body = typeof raw.text === 'string' ? raw.text : ''
  return { objectId: raw.objectId, title, body, examples: bodyExamples(components), flowButtonText }
}

/**
 * Lista os modelos de mensagem com Flow de uma loja pelo `retailerId` (passo 2).
 * Monta o `where` exato da plataforma (espelha o construtor) e filtra Flow no
 * cliente. Aceita um `search` opcional (regex case-insensitive sobre o título).
 * Ordena por título para o picker. Lança (sem expor o token) se a leitura falhar.
 */
export async function fetchMessageTemplates(
  deps: Deps & { retailerId: string; search?: string },
): Promise<MessageTemplate[]> {
  const where = {
    retailer: { __type: 'Pointer', className: 'Retailer', objectId: deps.retailerId },
    status: 'READY',
    title: { $regex: deps.search ?? '', $options: 'i' },
    userVisible: true,
    type: { $in: ['NEW_CHAT', 'CUSTOM', 'MARKETING', 'ACCOUNT_UPDATE'] },
  }
  const res = await deps.fetch(FIND_TEMPLATES_FN, {
    method: 'POST',
    headers: sessionHeaders(deps.token),
    body: JSON.stringify({ where, limit: 1000, order: '-createdAt' }),
  })
  if (!res.ok) {
    // Inclui o motivo do servidor (sem token) — um 400 costuma ser where/pointer.
    const body = await res.text().catch(() => '')
    throw new Error(
      `não foi possível listar os modelos de mensagem da loja (status ${res.status}; retailer ${deps.retailerId}` +
      `${body ? `; resposta: ${body.slice(0, 200)}` : ''})`,
    )
  }
  const data = (await res.json()) as { result?: Array<Record<string, unknown>> }
  return (data.result ?? [])
    .map(toFlowTemplate)
    .filter((t): t is MessageTemplate => t !== null)
    .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'))
}

/**
 * Conveniência: resolve o `retailerId` pelo `botId` e já devolve os modelos com Flow
 * da loja. É o que a UI chama (tem o `botId` do modelo, não o `retailerId`).
 */
export async function fetchStoreMessageTemplates(
  deps: Deps & { botId: string; search?: string },
): Promise<MessageTemplate[]> {
  const retailerId = await fetchRetailerId(deps)
  return fetchMessageTemplates({ fetch: deps.fetch, token: deps.token, retailerId, search: deps.search })
}
