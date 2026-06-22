import { createContext, useContext } from 'react'
import type { Bot, Team } from '../utils/teams'
import type { Collection } from '../utils/collections'
import type { StoreEntity } from '../utils/entities'
import type { MessageTemplate } from '../utils/messageTemplates'
import type { UploadMediaType } from '../utils/uploadMedia'
import type { BotIntent } from '../types'

/** Estado do carregamento dos times da loja (variável `@team`). */
export type TeamsStatus = 'idle' | 'loading' | 'loaded' | 'error'

/**
 * Times da loja para o picker de variáveis `@team`, disponibilizados por contexto
 * (evita threadar props por App → DetailPanel → VariablePicker → VariableMenu).
 * O fetch real vive no App (tem o token e o botId); aqui só expomos o resultado,
 * o disparo (`loadTeams`) e o mapa id→nome para exibição.
 */
export interface TeamsContextValue {
  teams: Team[]
  status: TeamsStatus
  /** Mensagem de erro amigável (sem token), quando `status === 'error'`. */
  error: string | null
  /** Dispara o carregamento (idempotente: não refaz se já está carregando). */
  loadTeams: () => void
  /** Há token de sessão definido? Quando true, o picker carrega os times sozinho. */
  hasToken: boolean
  /** Abre o campo de token (barra) — usado pelo aviso "Insira o token da sessão". */
  requestToken: () => void
  /** Mapa objectId→nome, para o `variableDisplay` mostrar o nome do time. */
  byId: ReadonlyMap<string, string>
  /**
   * Faz upload de um arquivo de mídia para a OmniChat e devolve a URL pública + nome.
   * Lança Error se não houver token ou se o upload falhar.
   */
  uploadFile: (file: File, type: UploadMediaType) => Promise<{ content: string; fileName: string }>
  // ─── Coleções (resposta COLLECTION) — mesmo padrão dos times ──────────────
  /** Coleções da loja para o picker da resposta "Coleção". */
  collections: Collection[]
  collectionsStatus: TeamsStatus
  /** Mensagem de erro amigável (sem token), quando `collectionsStatus === 'error'`. */
  collectionsError: string | null
  /** Dispara o carregamento das coleções; `search` filtra por nome (regex). */
  loadCollections: (search?: string) => void
  /** Mapa collectionId→coleção, para o resumo mostrar nome/imagem do que foi salvo. */
  collectionsById: ReadonlyMap<string, Collection>
  // ─── Modelos de mensagem com Flow (resposta TEMPLATE) — mesmo padrão ──────
  /** Modelos de mensagem com Flow da loja para o picker da resposta "Modelo de mensagem". */
  templates: MessageTemplate[]
  templatesStatus: TeamsStatus
  /** Mensagem de erro amigável (sem token), quando `templatesStatus === 'error'`. */
  templatesError: string | null
  /** Dispara o carregamento dos modelos; `search` filtra por título (regex). */
  loadTemplates: (search?: string) => void
  /** Mapa messageTemplateId→modelo, para o resumo/edição mostrar o que foi salvo. */
  templatesById: ReadonlyMap<string, MessageTemplate>
  // ─── Bots da conta + intenções de outro bot (seção "Próximo Fluxo") ───────
  /** Bots ativos da conta — alimenta o picker "Selecionar bot" do redirect cross-bot. */
  bots: Bot[]
  botsStatus: TeamsStatus
  /** Mensagem de erro amigável (sem token), quando `botsStatus === 'error'`. */
  botsError: string | null
  /** Dispara o carregamento dos bots da conta (idempotente). */
  loadBots: () => void
  /** Intenções por bot escolhido (`{botId}` → lista), cache da sessão. */
  botIntents: Record<string, BotIntent[]>
  /** Status do fetch de intenções por bot (`{botId}` → status). */
  botIntentsStatus: Record<string, TeamsStatus>
  /** Erro do fetch de intenções por bot (`{botId}` → mensagem). */
  botIntentsError: Record<string, string | null>
  /** Dispara o carregamento das intenções de um bot específico (idempotente por bot). */
  loadBotIntents: (botId: string) => void
  // ─── Listas (entities) — variável `@entity` + nó "Loja física" (mesmo padrão) ─
  /** Listas (entities) do bot — alimenta o picker `@entity` e (Fase 3) o nó "Loja física". */
  entities: StoreEntity[]
  entitiesStatus: TeamsStatus
  /** Mensagem de erro amigável (sem token), quando `entitiesStatus === 'error'`. */
  entitiesError: string | null
  /** Dispara o carregamento das listas do bot (idempotente). */
  loadEntities: () => void
  /** Mapa id→lista, para a Fase 3 (editor do nó) mostrar o nome do que foi salvo. */
  entitiesById: ReadonlyMap<string, StoreEntity>
}

const EMPTY: TeamsContextValue = {
  teams: [],
  status: 'idle',
  error: null,
  loadTeams: () => {},
  hasToken: false,
  requestToken: () => {},
  byId: new Map(),
  uploadFile: () => Promise.reject(new Error('sem token de sessão')),
  collections: [],
  collectionsStatus: 'idle',
  collectionsError: null,
  loadCollections: () => {},
  collectionsById: new Map(),
  templates: [],
  templatesStatus: 'idle',
  templatesError: null,
  loadTemplates: () => {},
  templatesById: new Map(),
  bots: [],
  botsStatus: 'idle',
  botsError: null,
  loadBots: () => {},
  botIntents: {},
  botIntentsStatus: {},
  botIntentsError: {},
  loadBotIntents: () => {},
  entities: [],
  entitiesStatus: 'idle',
  entitiesError: null,
  loadEntities: () => {},
  entitiesById: new Map(),
}

export const TeamsContext = createContext<TeamsContextValue>(EMPTY)

export function useTeams() {
  return useContext(TeamsContext)
}
