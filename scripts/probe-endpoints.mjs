/**
 * Sonda READ-ONLY do endpoint de APIs cadastradas (endpoints) — diagnóstico.
 * Não escreve nada. Lê o token de OMNI_TOKEN ou de flow-viewer.env.
 * Uso: node scripts/probe-endpoints.mjs <botId>
 * O token NUNCA é exibido.
 */
import { readFileSync } from 'node:fs'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'

function readToken() {
  if (process.env.OMNI_TOKEN) return process.env.OMNI_TOKEN.trim()
  try {
    const env = readFileSync(new URL('../flow-viewer.env', import.meta.url), 'utf8')
    const m = env.match(/OMNI_TOKEN\s*=\s*(.+)/)
    if (m) return m[1].trim().replace(/^['"]|['"]$/g, '')
  } catch {}
  return ''
}

const botId = process.argv[2]
const token = readToken()
if (!botId) { console.error('Uso: node scripts/probe-endpoints.mjs <botId>'); process.exit(1) }
if (!token) { console.error('Sem token (OMNI_TOKEN ou flow-viewer.env).'); process.exit(1) }

const url = `${API}/v1/${botId}/endpoints?fullObject=true`
console.log(`GET ${url}`)
const res = await fetch(url, {
  headers: {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-omnichat-platform': 'web',
    'x-parse-application-id': APP_ID,
    'x-parse-session-token': token,
  },
})
console.log(`status ${res.status}`)
const body = await res.text()
if (!res.ok) { console.error(`corpo (sem token): ${body.slice(0, 400)}`); process.exit(1) }
let data
try { data = JSON.parse(body) } catch { console.error('resposta não-JSON'); process.exit(1) }
const list = Array.isArray(data.list) ? data.list : null
console.log(`envelope tem .list array? ${list ? 'sim' : 'NÃO — chaves: ' + Object.keys(data)}`)
if (list) {
  console.log(`total: ${list.length}`)
  for (const e of list) {
    console.log(`  - id=${e.id ? e.id : 'AUSENTE'} name=${JSON.stringify(e.name)} type=${JSON.stringify(e.type)} keys=[${Object.keys(e).join(', ')}]`)
  }
}
