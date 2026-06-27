#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, resolve, isAbsolute } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { FlowStore } from '../src/tools/flowStore'
import {
  createNode, setActionField, setMessage, setCategory, setKeywords, setContext,
  setNodeChoices, setMenu, connectNodes, connectToBot,
  validate, revert, listNodes, describeNode,
  ACTION_FIELDS, type ActionFieldName,
} from '../src/tools/flowTools'
import { Resolvers } from '../src/tools/resolvers'
import type { FetchLike } from '../src/utils/pushFlow'
import { manifest, describeNodeType } from './nodeManifest'

/**
 * Servidor MCP local (Fase 3, PLANS.md § "Fase 3"). Expõe a camada de tools já
 * pronta (`src/tools/flowTools.ts`) como ferramentas que o Claude Code lança por
 * STDIO — zero portas, zero rede de entrada. A camada de tools é a peça durável;
 * aqui só se adiciona o transporte (decisão Q6: mesmo repo, importa `src/utils`
 * direto, roda via `tsx`, SDK `@modelcontextprotocol/sdk`).
 *
 * IMPORTANTE: em stdio, o stdout é o canal do protocolo — TODO log vai para
 * stderr (`console.error`). Escrever em stdout corromperia as mensagens MCP.
 */

// --- Localização do arquivo de fluxo ----------------------------------------
// Uma FlowStore por processo (modelo natural do stdio): o arquivo é carregado na
// subida e mantido em memória; o snapshot/revert vale por toda a vida do
// processo (= a sessão, Q3). Origem do caminho, em ordem: FLOW_FILE (env) →
// 1º argumento de CLI → default public/masterFlow.json.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')
const defaultFlow = resolve(repoRoot, 'public', 'masterFlow.json')

function resolveFlowPath(): string {
  const raw = process.env.FLOW_FILE ?? process.argv[2]
  if (!raw) return defaultFlow
  return isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
}

const flowPath = resolveFlowPath()
if (!existsSync(flowPath)) {
  console.error(`[flow-mcp] arquivo de fluxo não encontrado: ${flowPath}`)
  console.error('[flow-mcp] defina FLOW_FILE (env) ou passe o caminho como 1º argumento.')
  process.exit(1)
}

const store = FlowStore.fromFile(flowPath)
console.error(
  `[flow-mcp] fluxo carregado: ${flowPath} ` +
  `(${store.flow.list.length} nós, bot ${store.mainBotId || '<sem início>'})`,
)

// --- Token da API OmniChat (resolvers da Fase 4) -----------------------------
// O `.mcp.json` é COMMITADO, então o token NÃO pode morar nele. O servidor lê o
// `OMNI_TOKEN` por conta própria: env do processo (caso o shell já tenha exportado)
// → fallback para `flow-viewer.env` na raiz (gitignored). O token vive só aqui (na
// camada de tools), NUNCA chega ao modelo e NUNCA é logado — logamos só se há token.
function loadOmniToken(): string {
  if (process.env.OMNI_TOKEN) return process.env.OMNI_TOKEN
  const envPath = resolve(repoRoot, 'flow-viewer.env')
  if (!existsSync(envPath)) return ''
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*OMNI_TOKEN\s*=\s*(.*)$/.exec(line)
    if (match) return match[1].trim().replace(/^["']|["']$/g, '')
  }
  return ''
}

const omniToken = loadOmniToken()
// Adapta o `fetch` global do Node ao `FetchLike` da camada de tools (só os campos
// que ela usa). As funções de fetch lançam em falha; o resolver classifica o erro.
const nodeFetch: FetchLike = async (url, init) => {
  const res = await fetch(url, init)
  return { ok: res.ok, status: res.status, text: () => res.text(), json: () => res.json() }
}
const resolvers = new Resolvers(store, { fetch: nodeFetch, token: omniToken })
console.error(`[flow-mcp] OMNI_TOKEN ${omniToken ? 'carregado' : 'AUSENTE (resolvers da API vão pedir configuração)'}.`)

// --- Instruções sempre no contexto do agente --------------------------------
const instructions = [
  'Editor de fluxos de bot OmniChat por FERRAMENTAS. Você constrói e edita nós',
  'operando estas tools — NUNCA escreva JSON cru. A validade vive no código das tools.',
  '',
  'Trabalho típico: list_nodes (orientar) → describe_node (inspecionar) → create_node →',
  'set_message / set_category / set_action_field / set_menu / set_choices / set_keywords → connect → validate.',
  'Use revert para desfazer tudo desde o início da sessão.',
  '',
  'Regras:',
  '- Referencie nós por id OU nome exato (nome ambíguo é erro — use o id).',
  '- Perguntar algo e esperar a resposta = UM nó de Captura (captureNode), NUNCA Mensagem +',
  '  Aguardar interação. Ponha a pergunta com set_message; deixe captureDataType=free (texto',
  '  livre, default) ou tipe via set_action_field só quando a pergunta casar LIMPO com um campo',
  '  conhecido (CNPJ→cnpj, e-mail→mail, telefone→fullPhoneNumber); composto/ambíguo → free. Nunca',
  '  setar variable. Use waitNode só para esperar SEM perguntar nada.',
  '- Categorize TODO nó com set_category(node, categoria) — agrupa o fluxo na plataforma. É texto',
  '  livre, mas REUTILIZE: rode list_nodes e prefira uma categoria JÁ usada no fluxo; senão escolha da',
  '  semente por FASE da jornada (Saudação e triagem · Identificação · Atendimento · Vendas · Transferência',
  '  · Encerramento); só invente nova, no mesmo eixo "fase", se nenhuma servir. O assunto específico vai no',
  '  NOME do nó, não na categoria. Não recategorize o nó de início.',
  '- Nó de Escolha (choiceNode): crie os itens com set_menu (body + itens), depois ligue os',
  '  destinos com set_choices ou connect. Sem set_menu o menu nasce vazio (sem botões).',
  '- Menu de BOTÃO/LISTA roteia pela KEYWORD da intenção-ALVO, NÃO pelo choices[] — clicar envia o',
  '  TEXTO do botão (não um número), então o choices[] posicional fica morto. Para cada destino do',
  '  menu, set_keywords(alvo, [palavra saliente]) — ex.: "Falar com Financeiro" → ["financeiro"]',
  '  (o casamento é "contém"). Deixe SEM context por padrão (atalho global); use set_context(alvo, menu)',
  '  só quando a keyword for genérica/reusada (ex.: "Voltar", "Sim") e fosse colidir entre menus.',
  '- Redirect cross-bot: connect_to_bot(node, botId, intentId?) grava o next para outro bot.',
  '- NUNCA invente IDs de time/usuário/bot/API/lista (campos value, apiName, next.intent).',
  '  Resolva o nome → ID pelos resolvers (find_team/find_user/find_bot/list_*) e só então',
  '  grave o ID com set_action_field / connect_to_bot. Se o resolver devolver candidatos ou',
  '  ambiguidade, PARE e pergunte ao humano — nunca auto-escolha.',
  '- describe_node_type(kind) detalha os campos de cada tipo (sem kind, lista todos).',
  '',
  'Tipos de nó criáveis:',
  manifest(),
].join('\n')

const server = new McpServer(
  { name: 'omnichat-flow-editor', version: '0.1.0' },
  { instructions },
)

/** Empacota a confirmação compacta da tool no formato de conteúdo do MCP. */
const reply = (textOut: string) => ({ content: [{ type: 'text' as const, text: textOut }] })

// --- Tools de leitura --------------------------------------------------------
server.registerTool('list_nodes', {
  title: 'Listar nós',
  description: 'Mapa compacto do fluxo: uma linha por nó (nome, id, kind, categoria, destino).',
  inputSchema: {},
}, async () => reply(listNodes(store)))

server.registerTool('describe_node', {
  title: 'Descrever nó',
  description: 'Campos de UM nó (gatilho, ação, mensagens, destino) — para inspecionar antes de editar.',
  inputSchema: { node: z.string().describe('id ou nome do nó') },
}, async ({ node }) => reply(describeNode(store, node)))

server.registerTool('describe_node_type', {
  title: 'Descrever tipo de nó',
  description: 'Detalha os campos configuráveis de um tipo de nó criável (kind). Sem argumento, lista todos.',
  inputSchema: { kind: z.string().optional().describe('kind do nó, ex.: captureNode') },
}, async ({ kind }) => reply(kind ? describeNodeType(kind) : manifest()))

// --- Tools de mutação --------------------------------------------------------
server.registerTool('create_node', {
  title: 'Criar nó',
  description: 'Cria um nó com os defaults do tipo. Retorna o id, usado como referência nas demais tools.',
  inputSchema: {
    kind: z.string().describe('tipo do nó (ver describe_node_type)'),
    name: z.string().describe('nome da intenção'),
  },
}, async ({ kind, name }) => reply(createNode(store, kind, name)))

server.registerTool('set_action_field', {
  title: 'Definir campo da ação',
  description: 'Grava um campo do action de um nó (ex.: transferType, captureDataType, orderType). Lista só em multipleFields.',
  inputSchema: {
    node: z.string().describe('id ou nome do nó'),
    field: z.enum(ACTION_FIELDS).describe('campo a gravar'),
    value: z.union([z.string(), z.array(z.string())]).describe('valor (lista só para multipleFields)'),
    condIdx: z.number().int().nonnegative().optional().describe('índice da condição (default 0)'),
  },
}, async ({ node, field, value, condIdx }) =>
  reply(setActionField(store, node, field as ActionFieldName, value, condIdx ?? 0)))

server.registerTool('set_message', {
  title: 'Definir texto da mensagem',
  description: 'Grava o texto (TEXT) da mensagem de um nó: 0 balões→cria, 1→sobrescreve, N>1→erro. Não serve para nó de escolha (use set_menu).',
  inputSchema: {
    node: z.string().describe('id ou nome do nó (não pode ser nó de escolha)'),
    text: z.string().describe('texto da mensagem (não pode ficar vazio)'),
    condIdx: z.number().int().nonnegative().optional().describe('índice da condição (default 0)'),
  },
}, async ({ node, text, condIdx }) => reply(setMessage(store, node, text, condIdx ?? 0)))

server.registerTool('set_category', {
  title: 'Definir categoria',
  description: 'Grava a categoria da intenção (agrupa o fluxo). Texto livre — REUTILIZE uma categoria já usada no fluxo (veja list_nodes) ou a semente por fase (Saudação e triagem/Identificação/Atendimento/Vendas/Transferência/Encerramento) antes de criar nova. Não recategorize o nó de início.',
  inputSchema: {
    node: z.string().describe('id ou nome do nó'),
    category: z.string().describe('categoria (texto livre; reutilize uma existente sempre que servir)'),
  },
}, async ({ node, category }) => reply(setCategory(store, node, category)))

server.registerTool('set_keywords', {
  title: 'Definir palavras-chave',
  description: 'SUBSTITUI as palavras-chave (keywords) da intenção-ALVO de um menu — é o que ROTEIA botão/lista (clicar envia o texto, não um número; choices[] posicional não dispara). Casamento é "contém". Array vazio limpa. Uma palavra saliente por alvo (ex.: "Falar com Financeiro" → ["financeiro"]).',
  inputSchema: {
    node: z.string().describe('id ou nome do nó-alvo (a intenção para onde o item do menu aponta)'),
    keywords: z.array(z.string()).describe('palavras-chave (substituem as atuais; vazio limpa)'),
  },
}, async ({ node, keywords }) => reply(setKeywords(store, node, keywords)))

server.registerTool('set_context', {
  title: 'Definir context (escopo da keyword)',
  description: 'Escopa a keyword da intenção-ALVO a UM menu: grava context = id da intenção que a escopa (resolve por id/nome intra-fluxo). Sem o argumento (ou vazio) LIMPA → keyword vira atalho global. Por padrão deixe global; escope só keyword genérica/reusada que colidiria.',
  inputSchema: {
    node: z.string().describe('id ou nome do nó-alvo cuja keyword será escopada'),
    contextNode: z.string().optional().describe('id ou nome do nó de Escolha que escopa (omitido/vazio → limpa, keyword global)'),
  },
}, async ({ node, contextNode }) => reply(setContext(store, node, contextNode)))

server.registerTool('set_choices', {
  title: 'Definir escolhas',
  description: 'Define os destinos de um nó de Escolha (posicionais com os itens do menu). Vazio = slot sem destino.',
  inputSchema: {
    node: z.string().describe('id ou nome do nó de escolha'),
    destinations: z.array(z.string()).describe('ids ou nomes dos destinos (na ordem dos itens)'),
  },
}, async ({ node, destinations }) => reply(setNodeChoices(store, node, destinations)))

server.registerTool('set_menu', {
  title: 'Definir menu de escolha',
  description: 'Cria a mensagem de itens (BUTTON/LIST) de um nó de Escolha de uma vez. Infere BUTTON vs LIST. Destinos à parte (set_choices/connect).',
  inputSchema: {
    node: z.string().describe('id ou nome do nó de escolha'),
    body: z.string().describe('texto principal do menu'),
    items: z.array(z.object({
      text: z.string().describe('rótulo do item'),
      description: z.string().optional().describe('descrição (item com descrição força LIST)'),
    })).describe('itens do menu, na ordem (1-10)'),
    header: z.string().optional().describe('cabeçalho (opcional)'),
    footer: z.string().optional().describe('rodapé (opcional)'),
    title: z.string().optional().describe('título da lista (opcional, só LIST)'),
  },
}, async ({ node, body, items, header, footer, title }) =>
  reply(setMenu(store, node, body, items, header ?? '', footer ?? '', title ?? '')))

server.registerTool('connect', {
  title: 'Conectar nós',
  description: 'Liga origem→destino na 1ª vaga livre (next ou slot de escolha).',
  inputSchema: {
    source: z.string().describe('id ou nome da origem'),
    target: z.string().describe('id ou nome do destino'),
  },
}, async ({ source, target }) => reply(connectNodes(store, source, target)))

server.registerTool('connect_to_bot', {
  title: 'Redirecionar para outro bot',
  description: 'Redireciona o next de um nó para uma intenção de OUTRO bot. botId/intentId vêm dos resolvers (find_bot/list_intents). intentId omitido → entrada do bot ({botId}-start).',
  inputSchema: {
    node: z.string().describe('id ou nome do nó de origem (não pode ser nó de escolha)'),
    botId: z.string().describe('botId do outro bot (resolva pelo find_bot — NUNCA invente)'),
    intentId: z.string().optional().describe('id da intenção-destino (resolva pelo list_intents); omitido → {botId}-start'),
  },
}, async ({ node, botId, intentId }) => reply(connectToBot(store, node, botId, intentId)))

server.registerTool('validate', {
  title: 'Validar fluxo',
  description: 'Relatório de validade (erros bloqueiam export; avisos só informam).',
  inputSchema: {},
}, async () => reply(validate(store)))

server.registerTool('revert', {
  title: 'Reverter',
  description: 'Desfaz tudo desde a 1ª mutação da sessão (snapshot de storage).',
  inputSchema: {},
}, async () => reply(revert(store)))

// --- Tools de resolução nome → ID (Fase 4, read-only contra a API) -----------
// Resolvem nomes legíveis em IDs reais vindos da API (mata ID alucinado). O token
// vive na camada de tools (lido do flow-viewer.env), nunca chega aqui ao modelo.
server.registerTool('find_team', {
  title: 'Resolver time',
  description: 'Resolve o nome de um time da loja para o id (transfer). Ambíguo/candidatos → pare e pergunte.',
  inputSchema: { name: z.string().describe('nome (ou parte) do time') },
}, async ({ name }) => reply(await resolvers.findTeam(name)))

server.registerTool('list_teams', {
  title: 'Listar times',
  description: 'Mapa compacto dos times da loja (nome | id).',
  inputSchema: {},
}, async () => reply(await resolvers.listTeams()))

server.registerTool('find_user', {
  title: 'Resolver usuário',
  description: 'Resolve o nome de um vendedor (usuário supervisionado) para o id. Busca no servidor.',
  inputSchema: { name: z.string().describe('nome (ou parte) do vendedor') },
}, async ({ name }) => reply(await resolvers.findUser(name)))

server.registerTool('find_bot', {
  title: 'Resolver bot',
  description: 'Resolve o nome de um bot ativo da conta para o botId (redirect cross-bot).',
  inputSchema: { name: z.string().describe('nome (ou parte) do bot') },
}, async ({ name }) => reply(await resolvers.findBot(name)))

server.registerTool('list_bots', {
  title: 'Listar bots',
  description: 'Mapa compacto dos bots ativos da conta (nome | botId).',
  inputSchema: {},
}, async () => reply(await resolvers.listBots()))

server.registerTool('list_api_integrations', {
  title: 'Listar APIs',
  description: 'APIs (endpoints) cadastradas no bot (nome | id | tipo) — para o campo apiName.',
  inputSchema: {},
}, async () => reply(await resolvers.listApiIntegrations()))

server.registerTool('list_entities', {
  title: 'Listar listas',
  description: 'Listas (entities) do bot (nome | id | tipo) — variável @entity e nó Loja física.',
  inputSchema: {},
}, async () => reply(await resolvers.listEntities()))

server.registerTool('list_intents', {
  title: 'Listar intenções de outro bot',
  description: 'Intenções de OUTRO bot (nome | id); com nome, resolve via match. Para o bot atual use list_nodes.',
  inputSchema: {
    botId: z.string().describe('botId do outro bot (resolva pelo find_bot)'),
    name: z.string().optional().describe('nome da intenção a resolver (opcional)'),
  },
}, async ({ botId, name }) => reply(await resolvers.listIntents(botId, name)))

// --- Conecta o transporte stdio ----------------------------------------------
const transport = new StdioServerTransport()
await server.connect(transport)
console.error('[flow-mcp] servidor pronto (stdio).')
