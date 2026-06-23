/**
 * Sonda READ-ONLY da cloud function de VENDEDORES (getSupervisedUsersV2) — diagnóstico.
 * Não escreve nada. Lê o token de OMNI_TOKEN ou de flow-viewer.env.
 * Uso: node scripts/probe-users.mjs
 *
 * Objetivo (Fase 1 — Transferência rico): decidir a BASE correta da API
 * (`api-private` SEM "2" do curl do Andy vs `api-private2` que o projeto usa em
 * teams.ts) e revelar o SHAPE do usuário (objectId? name? email?) antes de
 * escrever src/utils/users.ts. O token NUNCA é exibido.
 */
import { readFileSync } from 'node:fs'

const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'
// As duas bases candidatas — a sonda diz qual responde 2xx.
const BASES = [
  'https://api-private.omni.chat/parse',
  'https://api-private2.omni.chat/parse',
]
const BODY = { offset: 0, limit: 100, search: '.*' }

function readToken() {
  if (process.env.OMNI_TOKEN) return process.env.OMNI_TOKEN.trim()
  try {
    const env = readFileSync(new URL('../flow-viewer.env', import.meta.url), 'utf8')
    const m = env.match(/OMNI_TOKEN\s*=\s*(.+)/)
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  } catch {}
  return ''
}

const token = readToken()
if (!token) { console.error('Sem token (OMNI_TOKEN ou flow-viewer.env).'); process.exit(1) }

const headers = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-omnichat-platform': 'web',
  'x-parse-application-id': APP_ID,
  'x-parse-session-token': token,
}

/** Resume o shape de um usuário: chaves + presença dos campos que vamos usar. */
function describeUser(u) {
  const keys = Object.keys(u)
  const has = (k) => (u[k] !== undefined ? 'sim' : 'NÃO')
  return `    chaves: ${keys.join(', ')}\n` +
    `    objectId=${has('objectId')} name=${has('name')} email=${has('email')} ` +
    `username=${has('username')} fullName=${has('fullName')}`
}

for (const base of BASES) {
  const url = `${base}/functions/getSupervisedUsersV2`
  console.log(`\n=== POST ${base}/functions/getSupervisedUsersV2 ===`)
  let res
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(BODY) })
  } catch (e) {
    console.error(`  falha de rede: ${e.message}`)
    continue
  }
  console.log(`  status ${res.status}`)
  const text = await res.text()
  if (!res.ok) { console.error(`  corpo (sem token): ${text.slice(0, 300)}`); continue }
  let data
  try { data = JSON.parse(text) } catch { console.error('  resposta não-JSON'); continue }
  // Parse cloud functions devolvem { result: ... }. O result pode ser array ou { results: [...] }.
  console.log(`  chaves do envelope: ${Object.keys(data).join(', ')}`)
  const result = data.result ?? data
  const list = Array.isArray(result) ? result
    : Array.isArray(result?.results) ? result.results
    : Array.isArray(result?.users) ? result.users
    : null
  if (!list) {
    console.log(`  NÃO achei array de usuários. result (recortado): ${JSON.stringify(result).slice(0, 300)}`)
    continue
  }
  console.log(`  total de usuários: ${list.length}${list.length === 100 ? '  ⚠️ exatamente 100 (pode estar truncado)' : ''}`)
  if (list[0]) {
    console.log(`  shape do 1º usuário:`)
    console.log(describeUser(list[0]))
  }
}
