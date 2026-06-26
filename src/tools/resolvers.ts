import { FlowStore } from './flowStore'
import type { FetchLike } from '../utils/pushFlow'
import { fetchStoreTeams, fetchActiveBots, type Team, type Bot } from '../utils/teams'
import { fetchSupervisedUsers, USERS_PAGE_LIMIT, type StoreUser } from '../utils/users'
import { fetchBotEndpoints, type BotEndpoint } from '../utils/endpoints'
import { fetchStoreEntities, type StoreEntity } from '../utils/entities'
import { fetchServerIntents } from '../utils/pushFlow'

/**
 * Camada de RESOLVERS da Fase 4 (PLANS.md § "Fase 4"). Tools read-only que
 * resolvem **nome → ID** batendo na API OmniChat, ENVOLVENDO as funções de fetch
 * já existentes e testadas (`teams.ts`, `users.ts`, `endpoints.ts`, `entities.ts`,
 * `fetchServerIntents`). O agente recebe o ID e grava pelo `set_action_field`
 * existente — **nunca inventa ID** (o resolver é a única fonte de ID, então o
 * modelo não tem de onde alucinar — decisão 2).
 *
 * Decisões travadas (interrogatório 2026-06-24):
 *  - 1: `botId` vem do flow file (`store.mainBotId`) — fonte única, nunca diverge.
 *  - 3: erros = mensagem clara; **401/403 ou 400+token → renove o OMNI_TOKEN, sem retry**;
 *       token ausente → "configure OMNI_TOKEN"; NOT_FOUND/ambíguo → candidatos.
 *  - 4: cache sob demanda, por sessão, sem TTL (read-only ⇒ sem invalidação).
 *  - 5: matching normalizado exato (→ ID) + `contains` para candidatos; ambíguo
 *       (>1 exato) → o modelo PARA e pergunta, nunca auto-escolhe.
 *  - 6: `find_user` filtra SERVER-SIDE (param `search`), cache por query.
 *  - 7: `list_intents` é o complemento cross-bot (recebe `botId`).
 *
 * Retorno = confirmação compacta em texto (mesma filosofia de `flowTools.ts`),
 * nunca JSON cru. O token vive aqui (injetado pelo servidor MCP a partir de
 * `flow-viewer.env`) e NUNCA chega ao modelo nem é logado.
 */

// --- Mensagens de erro de família AUTH/config (decisão 3) --------------------
const NO_TOKEN_MSG =
  '⚠️ configure OMNI_TOKEN em flow-viewer.env para usar os resolvers da API OmniChat'
const NO_BOTID_MSG =
  '⚠️ fluxo sem intenção de início — sem botId para consultar a API (abra/importe um fluxo com nós)'
const AUTH_MSG =
  '⚠️ autenticação falhou (token de sessão expira rápido) — renove o OMNI_TOKEN em flow-viewer.env'

/**
 * Classifica um erro lançado pelas funções de fetch. 401/403 → mensagem AUTH
 * especial (sem retry — o token de sessão Parse é a falha real #1). O endpoint
 * de times retorna 400 (não 401) com body "token inválido" quando o token
 * expirou — detectamos por status 400 + "token" na mensagem para cobrir esse
 * caso com o mesmo AUTH_MSG orientativo. As funções subjacentes embutem
 * `status NNN` na mensagem; detectamos por aí em vez de reescrevê-las.
 */
function errorToMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/status 40[13]\b/.test(msg)) return AUTH_MSG
  if (/status 400\b/.test(msg) && /token/i.test(msg)) return AUTH_MSG
  return `⚠️ erro ao consultar a API: ${msg}`
}

// --- Matching nome → ID (decisão 5) ------------------------------------------
/** Referência resolvível: um nome legível e o ID a gravar. */
interface NamedRef {
  id: string
  name: string
}

/** Resultado do match: exato único / ambíguo (>1 exato) / parciais (contains) / nada. */
type MatchResult =
  | { kind: 'exact'; ref: NamedRef }
  | { kind: 'ambiguous'; refs: NamedRef[] }
  | { kind: 'partial'; refs: NamedRef[] }
  | { kind: 'none' }

/** Normaliza para o match pt-BR: minúscula, sem acento, sem espaços nas pontas. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim()
}

/**
 * Casa uma query contra uma lista de refs. Exato único → `exact`. >1 exato →
 * `ambiguous` (o modelo PARA). Sem exato mas há quem CONTENHA a query →
 * `partial` (candidatos para desambiguar com o humano). Nada → `none`.
 */
function matchByName(items: NamedRef[], query: string): MatchResult {
  const q = normalize(query)
  if (!q) return { kind: 'none' }
  const exact = items.filter(i => normalize(i.name) === q)
  if (exact.length === 1) return { kind: 'exact', ref: exact[0] }
  if (exact.length > 1) return { kind: 'ambiguous', refs: exact }
  const partial = items.filter(i => normalize(i.name).includes(q))
  if (partial.length) return { kind: 'partial', refs: partial }
  return { kind: 'none' }
}

/** Limite de candidatos exibidos (evita estourar o contexto em loja grande). */
const CANDIDATE_CAP = 20

/** Renderiza candidatos como "Nome (id), …" com corte e contagem do excedente. */
function renderRefs(refs: NamedRef[]): string {
  const shown = refs.slice(0, CANDIDATE_CAP).map(r => `${r.name} (${r.id})`).join(', ')
  const extra = refs.length > CANDIDATE_CAP ? ` … e mais ${refs.length - CANDIDATE_CAP}` : ''
  return shown + extra
}

/**
 * Substantivo de um tipo resolvível, com as formas que a mensagem precisa:
 * singular + plural + artigo ("o"/"a") — concordância pt-BR (evita "intençãos"
 * e "intenção idênticos"). Texto é voltado ao agente, mas vale ler limpo.
 */
interface Noun {
  one: string
  many: string
  /** 'o' (masculino) ou 'a' (feminino) — concorda com "idêntico(s)". */
  article: 'o' | 'a'
}
const NOUNS = {
  time: { one: 'time', many: 'times', article: 'o' },
  usuario: { one: 'usuário', many: 'usuários', article: 'o' },
  bot: { one: 'bot', many: 'bots', article: 'o' },
  intencao: { one: 'intenção', many: 'intenções', article: 'a' },
} as const satisfies Record<string, Noun>

/**
 * Formata o `MatchResult` na confirmação compacta de uma tool `find_*`. Em
 * ambíguo e parcial devolve candidatos + instrução para o modelo PARAR e
 * confirmar com o humano (é o que protege contra gravar o alvo errado em
 * silêncio — decisão 5).
 */
function formatMatch(result: MatchResult, noun: Noun, query: string, total: number): string {
  const identical = noun.article === 'a' ? 'idênticas' : 'idênticos'
  switch (result.kind) {
    case 'exact':
      return `${noun.one} "${result.ref.name}" → id ${result.ref.id}`
    case 'ambiguous':
      return `⚠️ nome ambíguo "${query}" — ${result.refs.length} ${noun.many} ${identical}: ` +
        `${renderRefs(result.refs)} · PARE e confirme qual com o humano; grave pelo id`
    case 'partial':
      return `⚠️ ${noun.article === 'a' ? 'nenhuma' : 'nenhum'} ${noun.one} com nome exato "${query}"; ` +
        `candidatos que contêm a busca: ${renderRefs(result.refs)} · confirme qual com o humano e grave pelo id`
    case 'none':
      return `${noun.article === 'a' ? 'nenhuma' : 'nenhum'} ${noun.one} corresponde a "${query}" ` +
        `(${total} ${total === 1 ? `${noun.one} disponível` : `${noun.many} disponíveis`})`
  }
}

/**
 * Conjunto de resolvers de uma sessão. Mantém os caches sob demanda (decisão 4):
 * a 1ª chamada de cada um dispara o fetch e cacheia; as seguintes batem no cache.
 * Read-only ⇒ sem invalidação. UMA instância por processo MCP (igual à FlowStore).
 */
export class Resolvers {
  private teamsCache: Team[] | null = null
  private botsCache: Bot[] | null = null
  private endpointsCache: BotEndpoint[] | null = null
  private entitiesCache: StoreEntity[] | null = null
  /** `find_user` cacheia por query (busca server-side) — chave = nome normalizado. */
  private usersCache = new Map<string, StoreUser[]>()
  /** `list_intents` cacheia por botId (cross-bot). */
  private intentsCache = new Map<string, NamedRef[]>()

  constructor(
    private readonly store: FlowStore,
    private readonly deps: { fetch: FetchLike; token: string },
  ) {}

  /** botId da fonte única (flow file); `null` em fluxo sem início (decisão 1). */
  private botId(): string | null {
    return this.store.mainBotId || null
  }

  // --- Times -----------------------------------------------------------------
  private async loadTeams(botId: string): Promise<Team[]> {
    if (!this.teamsCache) {
      this.teamsCache = await fetchStoreTeams({ fetch: this.deps.fetch, token: this.deps.token, botId })
    }
    return this.teamsCache
  }

  /** `find_team(nome)` — resolve um time da loja para o `objectId` (transfer). */
  async findTeam(name: string): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    const botId = this.botId()
    if (!botId) return NO_BOTID_MSG
    try {
      const teams = await this.loadTeams(botId)
      const refs = teams.map(t => ({ id: t.objectId, name: t.name }))
      return formatMatch(matchByName(refs, name), NOUNS.time, name, refs.length)
    } catch (e) {
      return errorToMessage(e)
    }
  }

  /** `list_teams()` — mapa compacto dos times da loja (nome | id). */
  async listTeams(): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    const botId = this.botId()
    if (!botId) return NO_BOTID_MSG
    try {
      const teams = await this.loadTeams(botId)
      if (!teams.length) return 'nenhum time na loja'
      return teams.map(t => `${t.name} | ${t.objectId}`).join('\n')
    } catch (e) {
      return errorToMessage(e)
    }
  }

  // --- Usuários (vendedores) — busca server-side (decisão 6) -----------------
  private async loadUsers(query: string): Promise<StoreUser[]> {
    const key = normalize(query)
    const cached = this.usersCache.get(key)
    if (cached) return cached
    // Manda o nome cru como `search` para a cloud function filtrar no servidor
    // (evita o truncamento em 100 do filtro-em-memória do picker).
    const users = await fetchSupervisedUsers({
      fetch: this.deps.fetch, token: this.deps.token, search: query,
    })
    this.usersCache.set(key, users)
    return users
  }

  /**
   * `find_user(nome)` — resolve um vendedor (usuário supervisionado) para o
   * `objectId`. NÃO usa botId (são "supervisionados pela conta do token" —
   * decisão 1). Avisa se a busca bateu no teto de página (alvo pode ter sido
   * truncado — refinar o nome).
   */
  async findUser(name: string): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    try {
      const users = await this.loadUsers(name)
      const refs = users.map(u => ({ id: u.objectId, name: u.name }))
      const base = formatMatch(matchByName(refs, name), NOUNS.usuario, name, refs.length)
      if (users.length >= USERS_PAGE_LIMIT) {
        return `${base}\n⚠️ a busca retornou ${USERS_PAGE_LIMIT}+ resultados (teto da página) — ` +
          'refine o nome se o alvo não apareceu'
      }
      return base
    } catch (e) {
      return errorToMessage(e)
    }
  }

  // --- Bots ------------------------------------------------------------------
  private async loadBots(): Promise<Bot[]> {
    if (!this.botsCache) {
      this.botsCache = await fetchActiveBots({ fetch: this.deps.fetch, token: this.deps.token })
    }
    return this.botsCache
  }

  /** `find_bot(nome)` — resolve um bot ativo da conta para o `botId` (cross-bot). */
  async findBot(name: string): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    try {
      const bots = await this.loadBots()
      const refs = bots.map(b => ({ id: b.botId, name: b.name }))
      return formatMatch(matchByName(refs, name), NOUNS.bot, name, refs.length)
    } catch (e) {
      return errorToMessage(e)
    }
  }

  /** `list_bots()` — mapa compacto dos bots ativos da conta (nome | botId). */
  async listBots(): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    try {
      const bots = await this.loadBots()
      if (!bots.length) return 'nenhum bot ativo na conta'
      return bots.map(b => `${b.name} | ${b.botId}`).join('\n')
    } catch (e) {
      return errorToMessage(e)
    }
  }

  // --- APIs (endpoints) ------------------------------------------------------
  private async loadEndpoints(botId: string): Promise<BotEndpoint[]> {
    if (!this.endpointsCache) {
      this.endpointsCache = await fetchBotEndpoints({ fetch: this.deps.fetch, token: this.deps.token, botId })
    }
    return this.endpointsCache
  }

  /** `list_api_integrations()` — APIs cadastradas no bot (nome | id | tipo). */
  async listApiIntegrations(): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    const botId = this.botId()
    if (!botId) return NO_BOTID_MSG
    try {
      const eps = await this.loadEndpoints(botId)
      if (!eps.length) return 'nenhuma API configurada neste bot'
      return eps.map(e => `${e.name} | ${e.id}${e.type ? ` | ${e.type}` : ''}`).join('\n')
    } catch (e) {
      return errorToMessage(e)
    }
  }

  // --- Listas (entities) -----------------------------------------------------
  private async loadEntities(botId: string): Promise<StoreEntity[]> {
    if (!this.entitiesCache) {
      this.entitiesCache = await fetchStoreEntities({ fetch: this.deps.fetch, token: this.deps.token, botId })
    }
    return this.entitiesCache
  }

  /** `list_entities()` — Listas (entities) do bot (nome | id | tipo). */
  async listEntities(): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    const botId = this.botId()
    if (!botId) return NO_BOTID_MSG
    try {
      const ents = await this.loadEntities(botId)
      if (!ents.length) return 'nenhuma lista (entity) neste bot'
      return ents.map(e => `${e.name} | ${e.id} | ${e.type}`).join('\n')
    } catch (e) {
      return errorToMessage(e)
    }
  }

  // --- Intenções de OUTRO bot (decisão 7) ------------------------------------
  private async loadIntents(botId: string): Promise<NamedRef[]> {
    const cached = this.intentsCache.get(botId)
    if (cached) return cached
    const intents = await fetchServerIntents({ fetch: this.deps.fetch, token: this.deps.token, botId })
    const refs = intents
      .map(i => ({ id: i.id, name: i.name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    this.intentsCache.set(botId, refs)
    return refs
  }

  /**
   * `list_intents(botId, nome?)` — intenções de OUTRO bot (o atual usa
   * `list_nodes` local). Com `nome`, resolve via match; sem ele, lista compacto.
   * Resolve "redireciona para a intenção X do bot Y": `find_bot → botId →
   * list_intents → grava next.intent {id, botId}`.
   */
  async listIntents(botId: string, name?: string): Promise<string> {
    if (!this.deps.token) return NO_TOKEN_MSG
    if (!botId) return '⚠️ informe o botId (use find_bot para resolvê-lo a partir do nome)'
    try {
      const refs = await this.loadIntents(botId)
      if (!refs.length) return `nenhuma intenção no bot ${botId}`
      if (name) return formatMatch(matchByName(refs, name), NOUNS.intencao, name, refs.length)
      return refs.map(r => `${r.name} | ${r.id}`).join('\n')
    } catch (e) {
      return errorToMessage(e)
    }
  }
}
