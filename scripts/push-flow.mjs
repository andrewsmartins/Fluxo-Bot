/**
 * Push de fluxo para a OmniChat — Fase 4a (CLI).
 * Envia intenções de um fluxo.json exportado pelo Fluxo para o RASCUNHO do
 * bot. A publicação continua manual na plataforma.
 *
 * Comportamento da API descoberto na Etapa 1 (2026-06-12):
 *   - POST /v1/{botId}/intents/{id} com ID desconhecido CRIA a intenção,
 *     mas o servidor IGNORA o ID enviado e gera outro (devolvido no corpo).
 *   - POST com ID já existente ATUALIZA in-place.
 * Por isso o push é em DUAS PASSADAS:
 *   1ª) cria as intenções novas e captura os IDs reais do servidor;
 *   2ª) remapeia as referências (next.intent, choices, error.next,
 *       fallbackIntents) para os IDs reais e envia atualizações.
 *
 * Guardrails:
 *   - SEM a flag --yes roda em dry-run (não escreve nada).
 *   - --bot <botId> obrigatório e validado contra o botId do arquivo.
 *   - Backup automático (GET) salvo em samples/ antes do primeiro POST.
 *   - Sequencial com parada no primeiro erro + relatório final.
 *
 * Uso (PowerShell):
 *   $env:OMNI_TOKEN = 'r:...'
 *   node scripts/push-flow.mjs fluxo.json --bot <botId> [--only <intentId>] [--yes]
 *
 * Use somente em BOT DE TESTES. O token nunca é exibido nem gravado.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'

// ── Argumentos ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const filePath = args.find(a => !a.startsWith('--'))
const flagValue = name => {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : null
}
const targetBot = flagValue('--bot')
const onlyId = flagValue('--only')
const confirmed = args.includes('--yes')

function abort(msg) {
  console.error(`ABORTADO: ${msg}`)
  process.exit(1)
}

if (!filePath) abort('informe o arquivo: node scripts/push-flow.mjs fluxo.json --bot <botId> [--only <id>] [--yes]')
if (!targetBot) abort('a flag --bot <botId> é obrigatória (dupla confirmação do alvo)')
const token = process.env.OMNI_TOKEN
if (!token) abort("defina o token antes:  $env:OMNI_TOKEN = 'r:...'")

// ── Carrega e valida o arquivo ───────────────────────────────────────────────
let flow
try {
  flow = JSON.parse(readFileSync(filePath, 'utf-8'))
} catch (err) {
  abort(`não foi possível ler ${filePath}: ${err.message}`)
}
if (!Array.isArray(flow.list) || flow.list.length === 0) abort('o arquivo não tem { list: [...] } com intenções')

const botIds = [...new Set(flow.list.map(i => i.botId))]
if (botIds.length !== 1) abort(`o arquivo mistura botIds (${botIds.join(', ')}) — push cancelado`)
if (botIds[0] !== targetBot) {
  abort(`o botId do arquivo (${botIds[0]}) não bate com --bot (${targetBot}) — confira o alvo`)
}

let toPush = flow.list
if (onlyId) {
  toPush = flow.list.filter(i => i.id === onlyId)
  if (!toPush.length) abort(`--only ${onlyId} não encontrado no arquivo`)
}

// ── Estado do servidor: quem é criação e quem é atualização ─────────────────
const headers = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-omnichat-platform': 'web',
  'x-parse-application-id': APP_ID,
  'x-parse-session-token': token,
}

const backupRes = await fetch(`${API}/v1/${targetBot}/intents?fullObject=true`, { headers })
if (!backupRes.ok) abort(`leitura do estado atual falhou (status ${backupRes.status}) — push cancelado por segurança`)
const backupData = await backupRes.json()
const serverIds = new Set((backupData.list ?? []).map(i => i.id))

const creates = toPush.filter(i => !serverIds.has(i.id))
const updates = toPush.filter(i => serverIds.has(i.id))

console.log(`Alvo:        ${targetBot} (${serverIds.size} intenções no servidor)`)
console.log(`Criações:    ${creates.length} (servidor vai gerar IDs novos; refs remapeadas na 2ª passada)`)
for (const i of creates) console.log(`  + ${i.name}  (${i.id})`)
console.log(`Atualizações: ${updates.length}`)
for (const i of updates) console.log(`  ~ ${i.name}  (${i.id})`)

if (onlyId && creates.length && toPush.length < flow.list.length) {
  console.log('\nATENÇÃO: --only com criação — refs de OUTRAS intenções do arquivo para esta não serão remapeadas.')
}

if (!confirmed) {
  console.log('\nDRY-RUN — nada foi enviado. Adicione --yes para executar o push.')
  process.exit(0)
}

// ── Backup antes de escrever ─────────────────────────────────────────────────
mkdirSync(new URL('../samples/', import.meta.url), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupFile = `backup-${targetBot}-${stamp}.json`
writeFileSync(new URL(`../samples/${backupFile}`, import.meta.url), JSON.stringify(backupData, null, 2))
console.log(`\nBackup salvo: samples/${backupFile}`)

/** Reaponta todas as referências usando o mapa clientId -> serverId. */
function remapRefs(intent, idMap) {
  let changed = false
  const swap = id => {
    if (idMap.has(id)) { changed = true; return idMap.get(id) }
    return id
  }
  for (const cond of intent.conditions ?? []) {
    const ref = cond.next?.intent
    if (ref && typeof ref === 'object' && ref.id) ref.id = swap(ref.id)
    if (Array.isArray(cond.action?.choices)) cond.action.choices = cond.action.choices.map(swap)
    const errNext = cond.action?.error?.next
    if (errNext && typeof errNext.intent === 'string') errNext.intent = swap(errNext.intent)
    if (Array.isArray(cond.fallbackIntents)) cond.fallbackIntents = cond.fallbackIntents.map(swap)
  }
  return changed
}

async function postIntent(intent) {
  const res = await fetch(`${API}/v1/${targetBot}/intents/${intent.id}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(intent),
  })
  const text = await res.text()
  let body = null
  try { body = JSON.parse(text) } catch { /* corpo não-JSON fica só no log */ }
  return { res, body, text }
}

// ── 1ª passada: criações (captura IDs reais) ────────────────────────────────
const idMap = new Map()
const results = []
let failed = false

for (const intent of creates) {
  const { res, body, text } = await postIntent(intent)
  results.push({ op: 'criar', name: intent.name, sent: intent.id, got: body?.id ?? null, status: res.status, excerpt: text.slice(0, 300) })
  console.log(`POST criar ${intent.name} -> ${res.status}${body?.id ? ` (id servidor: ${body.id})` : ''}`)
  if (!res.ok || !body?.id) { failed = true; break }
  idMap.set(intent.id, body.id)
  intent.id = body.id
}

// ── 2ª passada: remap + atualizações ────────────────────────────────────────
if (!failed) {
  for (const intent of toPush) {
    const remapped = remapRefs(intent, idMap)
    const isUpdate = updates.includes(intent)
    // novos sem refs remapeadas já estão corretos no servidor; pula re-envio
    if (!isUpdate && !remapped) continue
    const { res, text } = await postIntent(intent)
    results.push({ op: remapped ? 'remap' : 'atualizar', name: intent.name, sent: intent.id, got: intent.id, status: res.status, excerpt: text.slice(0, 300) })
    console.log(`POST ${remapped ? 'remap' : 'atualizar'} ${intent.name} -> ${res.status}`)
    if (!res.ok) { failed = true; break }
  }
}

// ── Relatório (sanitizado — sem token) ───────────────────────────────────────
const ok = results.filter(r => r.status >= 200 && r.status < 300)
console.log(`\n===== RELATÓRIO (cole no docs/fase4-resultados.md) =====`)
console.log(`Data: ${new Date().toISOString()}`)
console.log(`Bot:  ${targetBot} | Backup: samples/${backupFile}`)
console.log(`Operações OK: ${ok.length}/${results.length}${failed ? ' — INTERROMPIDO no primeiro erro' : ''}`)
for (const r of results) {
  const idInfo = r.op === 'criar' ? `${r.sent} -> ${r.got ?? '?'}` : r.sent
  console.log(`- [${r.op}] ${r.name} (${idInfo}) -> HTTP ${r.status}${r.status >= 300 ? `\n  corpo: ${r.excerpt}` : ''}`)
}
if (idMap.size) {
  console.log('Mapa de IDs (cliente -> servidor):')
  for (const [from, to] of idMap) console.log(`  ${from} -> ${to}`)
}
console.log('Próximo passo: validar na tela da Omni (lista, formulário, simulador).')
process.exit(failed ? 1 : 0)
