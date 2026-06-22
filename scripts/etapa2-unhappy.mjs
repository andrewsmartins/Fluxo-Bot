/**
 * Etapa 2 (pendências) do protocolo da Fase 4 — caminhos infelizes deliberados.
 * Roda os 3 testes que ficaram pendentes em docs/fase4-resultados.md:
 *
 *   1. malformada   — intent SEM o campo `conditions`: a API valida ou aceita?
 *   2. duplicada    — mesmo POST de criação 2×: idempotente ou duplica?
 *   3. refquebrada  — `next.intent.id` apontando para UUID inexistente: aceita?
 *
 * Guardrails (mesmos do push-flow.mjs):
 *   - SEM --yes roda em dry-run (não escreve nada).
 *   - --bot <botId> obrigatório. Use SOMENTE o bot de testes.
 *   - Backup (GET) salvo em samples/ antes do primeiro POST.
 *   - Relatório final sanitizado (sem token) no formato do TESTE-FASE4.md.
 *
 * Uso (PowerShell):
 *   $env:OMNI_TOKEN = 'r:...'
 *   node scripts/etapa2-unhappy.mjs --bot <botId> [--test malformada|duplicada|refquebrada] [--yes]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'

// ── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flagValue = name => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const targetBot = flagValue('--bot')
const onlyTest = flagValue('--test')
const confirmed = args.includes('--yes')

function abort(msg) {
  console.error(`ABORTADO: ${msg}`)
  process.exit(1)
}

if (!targetBot) abort('a flag --bot <botId> é obrigatória — use o bot de TESTES')
const VALID_TESTS = ['malformada', 'duplicada', 'refquebrada']
if (onlyTest && !VALID_TESTS.includes(onlyTest)) abort(`--test deve ser um de: ${VALID_TESTS.join(', ')}`)
const toRun = onlyTest ? [onlyTest] : VALID_TESTS
const token = process.env.OMNI_TOKEN
if (!token) abort("defina o token antes:  $env:OMNI_TOKEN = 'r:...'")

const headers = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-omnichat-platform': 'web',
  'x-parse-application-id': APP_ID,
  'x-parse-session-token': token,
}

// ── Payloads (forma canônica validada na Fase 4a) ───────────────────────────
function canonicalAction() {
  return {
    type: 'none', bulkUpdate: [], variable: null, value: null, choices: null,
    entity: null, transferType: null, captureDataType: null,
    captureDataTypesCategory: 'singleField', multipleFields: [],
    conversationType: null, storeType: null, orderType: null,
    lastMessageTextParams: { position: null, pattern: null },
    external: { type: [], apiName: [] },
  }
}

function buildIntent(name, messageText) {
  const now = new Date().toUTCString()
  return {
    id: crypto.randomUUID(),
    botId: targetBot,
    name,
    category: 'Teste Fase 4',
    keywords: [], context: null, priority: 0,
    conditions: [{
      type: 'any', name: 'Condição Padrão', variable: null, value: 'any',
      valueNumber: null, values: null, intent: null, context: null,
      assistant_says: [{ channel: 'any', messages: [{ type: 'TEXT', content: messageText, fileName: '' }] }],
      action: canonicalAction(),
      fallbackIntents: [],
      next: { redirect: 'waitInteraction', type: 'context' },
    }],
    createdAt: now, updatedAt: now,
    advanced: { active: false, endpointId: null },
  }
}

async function postIntent(intent) {
  const res = await fetch(`${API}/v1/${targetBot}/intents/${intent.id}`, {
    method: 'POST', headers, body: JSON.stringify(intent),
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* corpo não-JSON fica no excerpt */ }
  return { status: res.status, ok: res.ok, body, excerpt: text.slice(0, 300) }
}

async function fetchIntentList() {
  const res = await fetch(`${API}/v1/${targetBot}/intents?fullObject=true`, { headers })
  if (!res.ok) abort(`GET do estado atual falhou (status ${res.status})`)
  return res.json()
}

// ── Definição dos testes ─────────────────────────────────────────────────────
const results = []

async function testMalformada() {
  const intent = buildIntent('teste_fase4_malformada', 'Intent malformada (sem conditions).')
  delete intent.conditions
  const r = await postIntent(intent)
  results.push({
    test: 'malformada', sent: intent.id, status: r.status, serverId: r.body?.id ?? null,
    excerpt: r.excerpt,
    verdict: r.ok ? 'API ACEITOU intent sem conditions — checar se a tela da Omni abre sem quebrar' : 'API rejeitou (validação no servidor)',
  })
}

async function testDuplicada() {
  const intent = buildIntent('teste_fase4_duplicada', 'Push duplicado da mesma intenção.')
  const first = await postIntent(intent)
  const second = await postIntent(intent) // mesmo payload, mesmo ID de cliente
  const dupCount = (await fetchIntentList()).list.filter(i => i.name === 'teste_fase4_duplicada').length
  results.push({
    test: 'duplicada', sent: intent.id,
    status: `${first.status} / ${second.status}`,
    serverId: [first.body?.id, second.body?.id].filter(Boolean).join(' , ') || null,
    excerpt: second.excerpt,
    verdict: dupCount > 1
      ? `DUPLICOU (${dupCount} cópias) — re-rodar push do mesmo arquivo duplica criações; documentar`
      : `não duplicou (${dupCount} no servidor) — segundo POST foi tratado como ${second.body?.id === first.body?.id ? 'update do mesmo id' : 'descartado'}`,
  })
}

async function testRefQuebrada() {
  const intent = buildIntent('teste_fase4_refquebrada', 'Referência next para UUID inexistente.')
  const ghostId = crypto.randomUUID()
  intent.conditions[0].next = {
    redirect: 'continueFlow', type: 'context', action: 'intent',
    intent: { botId: targetBot, id: ghostId },
  }
  const r = await postIntent(intent)
  let stored = null
  if (r.ok && r.body?.id) {
    const onServer = (await fetchIntentList()).list.find(i => i.id === r.body.id)
    stored = onServer?.conditions?.[0]?.next?.intent?.id ?? null
  }
  results.push({
    test: 'refquebrada', sent: intent.id, status: r.status, serverId: r.body?.id ?? null,
    excerpt: r.excerpt, ghostId,
    verdict: !r.ok ? 'API rejeitou ref quebrada'
      : stored === ghostId ? 'API ACEITOU e ARMAZENOU a ref quebrada — checar tela e simulador da Omni'
      : `API aceitou mas a ref armazenada difere (${stored ?? 'removida'})`,
  })
}

const TESTS = { malformada: testMalformada, duplicada: testDuplicada, refquebrada: testRefQuebrada }

// ── Execução ─────────────────────────────────────────────────────────────────
const before = await fetchIntentList()
console.log(`Alvo: ${targetBot} (${before.list.length} intenções no servidor)`)
console.log(`Testes a rodar: ${toRun.join(', ')}`)

// process.exitCode (não process.exit) para deixar o event loop drenar os sockets
// do fetch — process.exit() abrupto dispara uma assertion do libuv no Windows.
if (!confirmed) {
  console.log('\nDRY-RUN — nada foi enviado. Adicione --yes para executar.')
  console.log('Cada teste cria 1–2 intenções "teste_fase4_*" no bot (limpar depois com rollback-bot.mjs).')
  process.exitCode = 0
} else {
  mkdirSync(new URL('../samples/', import.meta.url), { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupFile = `backup-${targetBot}-${stamp}.json`
  writeFileSync(new URL(`../samples/${backupFile}`, import.meta.url), JSON.stringify(before, null, 2))
  console.log(`Backup salvo: samples/${backupFile}\n`)

  for (const name of toRun) {
    console.log(`── teste: ${name} ──`)
    try {
      await TESTS[name]()
    } catch (err) {
      results.push({ test: name, status: 'erro de rede/script', excerpt: err.message, verdict: 'não concluído' })
    }
    const last = results[results.length - 1]
    console.log(`   status: ${last.status} | veredito: ${last.verdict}`)
  }

  // ── Relatório (sanitizado — sem token) ─────────────────────────────────────
  console.log(`\n===== RELATÓRIO (cole no docs/fase4-resultados.md) =====`)
  console.log(`Data: ${new Date().toISOString()} | Bot: ${targetBot} | Backup: samples/${backupFile}`)
  for (const r of results) {
    console.log(`\n- **Teste:** ${r.test}`)
    console.log(`  - Request: POST /v1/<botTestes>/intents/${r.sent ?? '?'}${r.ghostId ? ` (next -> ${r.ghostId})` : ''}`)
    console.log(`  - Status: ${r.status}${r.serverId ? ` | id(s) no servidor: ${r.serverId}` : ''}`)
    if (String(r.status).includes('40') || String(r.status).includes('50')) console.log(`  - Corpo: ${r.excerpt}`)
    console.log(`  - Veredito: ${r.verdict}`)
  }
  console.log(`\nLimpeza (deleta tudo que não está no backup e restaura o conteúdo):`)
  console.log(`  node scripts/rollback-bot.mjs ${targetBot} samples/${backupFile} --yes`)
  console.log(`  node scripts/push-flow.mjs samples/${backupFile} --bot ${targetBot} --yes`)
}
