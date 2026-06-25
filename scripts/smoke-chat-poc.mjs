/**
 * Smoke do PASSO 1 do plano "Caixinha de chat na página — PoC local do agente"
 * (PLANS.md § "Caixinha de chat na página"). Prova o ÚNICO elo não-verificado do
 * plano:
 *
 *   → O Claude Agent SDK, autenticado pela ASSINATURA do CLI (sem ANTHROPIC_API_KEY),
 *     dirige o `mcp/server.ts` por STDIO e streama eventos de tool — E o arquivo de
 *     fluxo realmente muda.
 *
 * Se isto passa, todo o resto do plano (WS, UI, lock, reload) é montagem de peças
 * que já existem.
 *
 * NÃO-COMMITADO de propósito (decisão 2026-06-25): é uma prova de conceito que toca
 * a auth de assinatura, não um smoke de regressão. Rode localmente e descarte.
 *
 * Pré-requisitos:
 *   - `claude` CLI logado por assinatura (rode `claude /login` se falhar a auth).
 *   - Sem ANTHROPIC_API_KEY no ambiente (o objetivo é provar a auth de assinatura).
 *
 * Uso:  node scripts/smoke-chat-poc.mjs
 *       MODEL=claude-opus-4-8 node scripts/smoke-chat-poc.mjs   (override do modelo)
 *
 * Gotchas honrados (handoff 2026-06-25):
 *   #1 MCP em PROCESSO NOVO via `tsx mcp/server.ts` (caminho absoluto), nunca o MCP
 *      já vivo no Claude Code (que roda o código antigo).
 *   #1 FLOW_FILE aponta p/ uma CÓPIA DESCARTÁVEL — nunca public/masterFlow.json.
 */
import { query } from '@anthropic-ai/claude-agent-sdk'
import { fileURLToPath } from 'node:url'
import { dirname, resolve, join } from 'node:path'
import { mkdtempSync, copyFileSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '..')                       // D:/Fluxo
const mcpServer = join(repoRoot, 'mcp', 'server.ts')       // caminho absoluto (gotcha #1)
const seedFlow = join(repoRoot, 'public', 'masterFlow.json')

// --- Helpers de relatório ----------------------------------------------------
let failed = false
const fail = (msg) => { failed = true; console.error(`  ✗ ${msg}`) }
const pass = (msg) => console.log(`  ✓ ${msg}`)
const section = (msg) => console.log(`\n${msg}`)

// --- Arquivo de fluxo descartável (NUNCA o canônico) -------------------------
// Copiamos o masterFlow para um tmp; o MCP só escreve nessa cópia. O canônico é
// apenas LIDO como semente, nunca escrito.
const workDir = mkdtempSync(join(tmpdir(), 'flow-poc-'))
const workFile = join(workDir, 'work.flow.json')
copyFileSync(seedFlow, workFile)

const flowSnapshot = () => {
  const raw = readFileSync(workFile, 'utf8')
  return { bytes: raw.length, nodes: JSON.parse(raw).list.length, mtimeMs: statSync(workFile).mtimeMs }
}
const before = flowSnapshot()

section('── Setup ──')
console.log(`  arquivo de trabalho (descartável): ${workFile}`)
console.log(`  nós iniciais: ${before.nodes} | bytes: ${before.bytes}`)
if (process.env.ANTHROPIC_API_KEY) {
  console.warn('  ⚠ ANTHROPIC_API_KEY está SETADO — o teste quer provar a auth de ASSINATURA.')
  console.warn('    Remova a key do ambiente para uma prova honesta (apiKeySource deve ser "oauth").')
}

// --- Evidências coletadas durante o stream -----------------------------------
const ev = {
  sawSystemInit: false,
  apiKeySource: null,
  mcpStatuses: [],
  createNodeToolExposed: false,
  streamedTextChunks: 0,
  toolCalls: [],          // nomes das tools que o agente chamou
  resultSubtype: null,
  resultIsError: null,
  resultText: '',
}

const MCP_NAME = 'omnichat-flow-editor'

section('── Rodando o agente (Agent SDK → CLI → MCP stdio) ──')
console.log('  prompt: "Crie um nó de mensagem chamado saudacao com o texto Olá!"\n')

try {
  const run = query({
    prompt:
      'Crie um nó de mensagem (defaultNode) chamado "saudacao" com o texto "Olá!". ' +
      'Use SOMENTE as ferramentas do editor de fluxo — nunca escreva JSON cru. ' +
      'Quando terminar, responda apenas "pronto".',
    options: {
      // Modelo: default do CLI (Opus 4.8, decisão 8) salvo override por env.
      ...(process.env.MODEL ? { model: process.env.MODEL } : {}),
      // cwd do projeto p/ o `tsx` resolver tsconfig + node_modules do MCP.
      cwd: repoRoot,
      // Isolamento: NÃO carregar settings do projeto (.mcp.json apontaria o
      // FLOW_FILE para o masterFlow canônico e subiria um 2º MCP). Só o MCP
      // explícito abaixo conta.
      settingSources: [],
      // O MCP que o plano reusa, em processo novo, contra a cópia descartável.
      mcpServers: {
        [MCP_NAME]: {
          type: 'stdio',
          command: 'npx',
          args: ['-y', 'tsx', mcpServer],
          env: { ...process.env, FLOW_FILE: workFile },
        },
      },
      // Limita ao que o smoke precisa e evita prompts (arquivo descartável).
      allowedTools: [
        `mcp__${MCP_NAME}__list_nodes`,
        `mcp__${MCP_NAME}__describe_node_type`,
        `mcp__${MCP_NAME}__create_node`,
        `mcp__${MCP_NAME}__validate`,
      ],
      permissionMode: 'bypassPermissions',
      maxTurns: 10,
    },
  })

  for await (const msg of run) {
    if (msg.type === 'system' && msg.subtype === 'init') {
      ev.sawSystemInit = true
      ev.apiKeySource = msg.apiKeySource
      ev.mcpStatuses = msg.mcp_servers ?? []
      ev.createNodeToolExposed = (msg.tools ?? []).some((t) => t.endsWith('create_node'))
    } else if (msg.type === 'assistant') {
      for (const block of msg.message?.content ?? []) {
        if (block.type === 'text' && block.text.trim()) {
          ev.streamedTextChunks++
          console.log(`  [texto] ${block.text.trim().slice(0, 120)}`)
        } else if (block.type === 'tool_use') {
          ev.toolCalls.push(block.name)
          console.log(`  [tool ] ${block.name}(${JSON.stringify(block.input).slice(0, 100)})`)
        }
      }
    } else if (msg.type === 'result') {
      ev.resultSubtype = msg.subtype
      ev.resultIsError = msg.is_error
      ev.resultText = msg.subtype === 'success' ? (msg.result ?? '') : msg.subtype
    }
  }
} catch (err) {
  const text = String(err?.message ?? err)
  console.error(`\n  ✗ o agente lançou: ${text}`)
  if (/login|auth|unauthor|credential|oauth/i.test(text)) {
    console.error('  → parece falta de auth. Rode `claude /login` e tente de novo.')
  }
  failed = true
}

// --- Asserts -----------------------------------------------------------------
// Princípio: o elo se prova pelo COMPORTAMENTO OBSERVADO ponta-a-ponta, não pelo
// snapshot do `system/init` (que é cedo: o MCP conecta de forma assíncrona e, em
// ambientes com muitas tools, elas chegam "deferred"). O que prova de fato:
// (a) uma tool do MCP foi REALMENTE invocada e (b) o arquivo mudou no disco.
const after = flowSnapshot()
const mcpToolCalls = ev.toolCalls.filter((n) => n.startsWith(`mcp__${MCP_NAME}__`))

section('── Asserts (elo: Agent SDK c/ assinatura → MCP stdio → arquivo) ──')

// (1) Rodou SEM API key → a auth só pode ter vindo do CLI logado (assinatura).
!process.env.ANTHROPIC_API_KEY
  ? pass('rodou sem ANTHROPIC_API_KEY → auth necessariamente via login do CLI')
  : fail('ANTHROPIC_API_KEY presente — o teste não isola a auth de assinatura')

// (2) Houve STREAM (texto e/ou atividade de tool) — o que vende a demo (decisão 4).
ev.streamedTextChunks > 0 || ev.toolCalls.length > 0
  ? pass(`stream observado: ${ev.streamedTextChunks} blocos de texto, ${ev.toolCalls.length} chamadas de tool`)
  : fail('nenhum evento de stream (nem texto, nem tool)')

// (3) O MCP STDIO foi de fato dirigido — uma tool do servidor foi invocada com sucesso
//     (a chamada só retorna se o stdio conectou). Prova mais forte que o status do init.
mcpToolCalls.length > 0
  ? pass(`MCP stdio dirigido: ${mcpToolCalls.length} chamadas [${[...new Set(mcpToolCalls.map((n) => n.replace(`mcp__${MCP_NAME}__`, '')))].join(', ')}]`)
  : fail('nenhuma tool do MCP foi chamada — stdio não conectou ou o modelo não usou')

// (4) Especificamente a tool de mutação create_node (não escreveu JSON cru).
ev.toolCalls.some((n) => n.endsWith('create_node'))
  ? pass('agente chamou create_node via tool (não escreveu JSON cru)')
  : fail('o agente não chamou create_node')

// (5) O ARQUIVO mudou (a mutação chegou ao disco — elo final do plano).
after.nodes > before.nodes
  ? pass(`arquivo mudou: ${before.nodes} → ${after.nodes} nós`)
  : fail(`arquivo NÃO ganhou nó (${before.nodes} → ${after.nodes}); mtime ${before.mtimeMs === after.mtimeMs ? 'igual' : 'mudou'}`)

// (6) Turno terminou sem erro.
ev.resultSubtype === 'success' && ev.resultIsError === false
  ? pass(`turno concluído (subtype="${ev.resultSubtype}")`)
  : fail(`turno terminou anormal (subtype="${ev.resultSubtype}", is_error=${ev.resultIsError})`)

// Informativo (não-gate): o que o init reportou e a fonte de auth observada.
section('── Informativo (não-gate) ──')
console.log(`  apiKeySource no init: "${ev.apiKeySource}" (esperado "none"/"oauth" sem key; "none" = sem key, usa credencial do CLI)`)
console.log(`  mcp_servers no init: ${JSON.stringify(ev.mcpStatuses)} (status no init pode ser "pending" — conexão é assíncrona)`)
console.log(`  tools MCP no init: ${ev.createNodeToolExposed ? 'expostas direto' : 'deferred (via ToolSearch) — normal neste ambiente'}`)

section(failed ? '❌ SMOKE FALHOU' : '✅ SMOKE OK — Agent SDK (assinatura) dirige o MCP stdio e o arquivo muda')
console.log(`(arquivo de trabalho descartável: ${workFile})`)
process.exit(failed ? 1 : 0)
