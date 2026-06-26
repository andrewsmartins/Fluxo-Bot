import type { Action, NodeKind } from '../types'

/**
 * NODE_CATALOG — fonte única de verdade *por tipo de nó* (kind-level), Node-pure.
 *
 * Consolida o que antes vivia espalhado em ≥3 arquivos: o rótulo descritivo
 * (`CREATABLE_KIND_LABELS`), o `action.type` materializado (`ACTION_TYPE_BY_KIND`,
 * antes privado no intentTemplates), a flag de caminho de erro (`ACTION_KINDS_WITH_ERROR`)
 * e o manifesto/`fields` que o servidor MCP expunha à mão (`mcp/nodeManifest.ts`).
 * Esses arquivos passam a DERIVAR daqui — uma só edição quando a plataforma mudar.
 *
 * ESCOPO (decisões travadas no PLANS.md §"Fase 2", interrogatório 2026-06-24):
 * - Catálogo MAGRO, kind-level: só fatos *por tipo de nó*. Sub-enums internos
 *   (transferType, captureDataType, storeType, …) NÃO entram — são fontes únicas
 *   locais com um só consumidor; dívida nomeada para quando o MCP validar valores.
 * - Node-pure: o `mcp/` importa este arquivo e roda sem DOM ⇒ ZERO deps de browser.
 *   Cor/ícone da badge são TEMA → ficam no DetailPanel (não aqui).
 * - Chaveado pelos 11 `CreatableKind`. Os 3 kinds não-criáveis (start/externalBot/
 *   intentGroup) vêm de detecção estrutural, nunca de `action.type`, e seu label
 *   CURTO + cor (badge) é presentation de consumidor único → vive no DetailPanel.
 * - DOIS sistemas de label: aqui mora só o **descritivo/paleta** (Sistema P). O label
 *   curto da badge (Sistema B, ex.: "Aguarda" vs "Aguardar interação") fica no DetailPanel.
 */

/**
 * Tipos de nó CRIÁVEIS — um para cada um dos 11 ActionTypes da plataforma.
 * `as const` preserva a ORDEM (paleta/`KIND_OPTIONS`) e o tipo literal `CreatableKind`.
 * `externalBotNode` (redirect p/ outro bot) e `startNode` (início) NÃO são criáveis.
 */
export const CREATABLE_KINDS = [
  'defaultNode', 'choiceNode', 'captureNode', 'transferNode', 'waitNode', 'setDataNode',
  'endNode', 'apiCallNode', 'orderNode', 'csatNode', 'storeNode',
] as const

export type CreatableKind = (typeof CREATABLE_KINDS)[number]

/** Fatos de um tipo de nó criável. `summary`/`fields` são consumidos pelo manifesto MCP. */
export interface NodeTypeEntry {
  /** Rótulo descritivo (Sistema P — paleta/menu/MCP). NÃO é o label curto da badge. */
  label: string
  /** `action.type` que o nó materializa (bijetivo com o kind criável). */
  actionType: string
  /** Materializa `action.error` no template? (a plataforma aceita nos 7 nós de ação). */
  hasError: boolean
  /** Uma linha: o que o nó faz — vai no manifesto compacto do MCP. */
  summary: string
  /** Campos configuráveis via tools, com dica de valores. `[]` = nenhum. */
  fields: string[]
}

/**
 * O catálogo. `label`/`actionType`/`hasError` são fatos do contrato da plataforma
 * (ver docs/MODELO-INTENCAO-OMNICHAT.md); `summary`/`fields` (mínimos, escritos à mão)
 * migraram verbatim do antigo `mcp/nodeCatalog.ts` da spike.
 */
export const NODE_CATALOG: Record<CreatableKind, NodeTypeEntry> = {
  defaultNode: {
    label: 'Mensagem',
    actionType: 'none',
    hasError: false,
    summary: 'Mensagem simples (texto/mídia). Encadeia para o próximo nó via connect.',
    fields: ['texto → use set_message (grava/edita o balão de texto), não set_action_field'],
  },
  choiceNode: {
    label: 'Escolha',
    actionType: 'choice',
    hasError: false,
    summary: 'Menu de escolha (LIST/BUTTON): cada item leva a um destino.',
    fields: ['choices → use set_choices (destinos posicionais), não set_action_field'],
  },
  captureNode: {
    label: 'Captura',
    actionType: 'captureData',
    hasError: true,
    summary:
      'Pergunta algo e AGUARDA a resposta do contato — use no lugar de "Mensagem + Aguardar interação". ' +
      'O texto da pergunta entra via set_message; a resposta fica em captureDataType=free (texto livre, é o default) ' +
      'ou num campo TIPADO quando a pergunta casa limpo com um campo conhecido (CNPJ→cnpj, e-mail→mail, telefone→fullPhoneNumber).',
    fields: [
      'captureDataType: free (texto livre, default) | mail | name | fullName | fullPhoneNumber | cpf | cnpj | zipcode | … — ' +
        'só tipe quando a pergunta casar LIMPO com UM campo; composto/ambíguo (ex.: "CNPJ e nome da loja") → deixe free',
      'captureDataTypesCategory: singleField | multipleFields',
      'multipleFields: lista de campos (só no modo multipleFields)',
      'variable: NÃO setar — é do tipo custom, fora do escopo (a plataforma grava o campo tipado sozinha)',
    ],
  },
  transferNode: {
    label: 'Transferência',
    actionType: 'transfer',
    hasError: true,
    summary: 'Transfere a conversa para um time ou atendente humano (folha — o bot para).',
    fields: [
      'transferType: search4group | direct4group | search4user | direct4user | directFromBranch | direct4userPrevious',
      'value: ID do time/usuário (resolvido na Fase 4; NUNCA inventar — peça ao humano)',
    ],
  },
  waitNode: {
    label: 'Aguardar interação',
    actionType: 'waitForInteraction',
    hasError: false,
    summary:
      'Aguarda a próxima interação do contato SEM perguntar nada. ' +
      'Se você precisa FAZER uma pergunta e esperar a resposta, use o nó de Captura (captureNode) — ' +
      'NÃO Mensagem + Aguardar. Sem campos.',
    fields: [],
  },
  setDataNode: {
    label: 'Editar informação',
    actionType: 'setData',
    hasError: true,
    summary: 'Edita variáveis do contato (bulkUpdate variable/value).',
    fields: ['bulkUpdate: ⚠️ ainda NÃO exposto por tool nesta fase (limitação da spike)'],
  },
  endNode: {
    label: 'Encerrar conversa',
    actionType: 'endConversation',
    hasError: false,
    summary: 'Encerra a conversa. Terminal. Sem campos.',
    fields: [],
  },
  apiCallNode: {
    label: 'Chamada de API',
    actionType: 'external',
    hasError: true,
    summary: 'Chama uma API/integração já configurada no bot (referência, nunca cria).',
    fields: [
      'apiName: ID da integração existente (resolvido na Fase 4; NUNCA inventar)',
      'externalType: tipo da chamada (ex.: request)',
    ],
  },
  orderNode: {
    label: 'Pedido',
    actionType: 'order',
    hasError: true,
    summary: 'Ação de pedido: gerar pedido ou adicionar item ao carrinho.',
    fields: [
      'orderType: generateOrder | addToCart',
      'variable: variável do item (só em addToCart, ex.: @custom.produto)',
    ],
  },
  csatNode: {
    label: 'Captura CSAT',
    actionType: 'captureCsat',
    hasError: true,
    summary: 'Captura avaliação CSAT (nota ou comentário).',
    fields: ['captureDataType: supportRate | supportRateComment'],
  },
  storeNode: {
    label: 'Loja física',
    actionType: 'store',
    hasError: true,
    summary: 'Ação sobre a loja física.',
    fields: ['storeType: first'],
  },
}

/**
 * Rótulos descritivos (Sistema P) por kind criável. Fonte única — consumido pela
 * paleta (NodePalette) e pelo seletor de tipo do DetailPanel (`KIND_OPTIONS`).
 */
export const CREATABLE_KIND_LABELS: Record<CreatableKind, string> = Object.fromEntries(
  CREATABLE_KINDS.map(k => [k, NODE_CATALOG[k].label]),
) as Record<CreatableKind, string>

/**
 * Os tipos de NÓ DE AÇÃO que materializam `action.error` no template. Derivado do
 * `hasError` do catálogo — reusado pelo DetailPanel (gate da seção "Em caso de erro")
 * e pelo template (`buildKindAction`).
 */
export const ACTION_KINDS_WITH_ERROR: ReadonlySet<NodeKind> = new Set<NodeKind>(
  CREATABLE_KINDS.filter(k => NODE_CATALOG[k].hasError),
)

/**
 * Mapa reverso `action.type` → kind criável, derivado do catálogo (bijetivo).
 * Base do `actionToNodeKind`; `defaultNode` (action `none`) é o fallback para
 * tipos ausentes/desconhecidos — preserva o comportamento do switch original.
 */
const KIND_BY_ACTION_TYPE = new Map<string, CreatableKind>(
  CREATABLE_KINDS.map(k => [NODE_CATALOG[k].actionType, k]),
)

/** Mapeia o `action.type` da plataforma para o tipo de nó do visualizador. */
export function actionToNodeKind(action?: Action | null): NodeKind {
  return (action?.type && KIND_BY_ACTION_TYPE.get(action.type)) || 'defaultNode'
}

/** O `action.type` que um kind criável materializa. */
export function actionTypeOf(kind: CreatableKind): string {
  return NODE_CATALOG[kind].actionType
}

/** Verifica se um tipo de nó vindo da paleta é criável. */
export function isCreatableKind(kind: string): kind is CreatableKind {
  return (CREATABLE_KINDS as readonly string[]).includes(kind)
}
