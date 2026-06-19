/**
 * Sonda READ-ONLY para a Fase 2 da variável "Times" — descobre como o NAVEGADOR
 * pode listar os times de uma loja SEM expor a master key REST no frontend.
 * Não faz NENHUMA escrita e NÃO usa master key (só o token de sessão, igual ao
 * push). A master key da curl da Team-class é segredo de servidor e deve ficar
 * FORA do bundle — por isso esta sonda nem a recebe.
 *
 * O que verifica:
 *   1. CORS + auth de `/v2/bots?status=active` (mesmo host do push → CORS provado).
 *   2. A SHAPE do bot: ele já traz `retailerId`/`retailer`/`teams`? (decide se
 *      precisamos de um 2º request para os times.)
 *   3. Endpoints CANDIDATOS de times autenticados por token de sessão (browser-safe):
 *      se algum responder 2xx, a Fase 2 vira um fetch em runtime; se todos
 *      falharem, os times terão de vir por script server-side + cache.
 *
 * Uso (PowerShell):
 *   $env:OMNI_TOKEN = 'r:SEU_TOKEN_DE_SESSAO'
 *   node scripts/probe-teams.mjs [botId]
 *
 * O token NUNCA é exibido nem gravado. Use somente uma conta/bot DE TESTES.
 */

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
// ID público do app Parse (visível a qualquer navegador na plataforma — não é segredo)
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'
const ORIGINS_TO_TEST = ['http://localhost:5173', 'https://andrewsmartins.github.io']

const botId = process.argv[2] ?? null
const token = process.env.OMNI_TOKEN

if (!token) {
  console.error("Defina o token antes:  $env:OMNI_TOKEN = 'r:...'")
  process.exit(1)
}

/** Headers de sessão (mesmos do push). O token vai só aqui, nunca no log. */
function sessionHeaders() {
  return {
    accept: 'application/json',
    authorization: `Bearer ${token}`,
    'content-type': 'application/json',
    'x-omnichat-platform': 'web',
    'x-parse-application-id': APP_ID,
    'x-parse-session-token': token,
  }
}

/** Preflight OPTIONS como o navegador faria a partir do FlowViewer. */
async function checkCors(url) {
  console.log(`\nCORS (preflight OPTIONS) em ${url.replace(API, '…')}`)
  for (const origin of ORIGINS_TO_TEST) {
    try {
      const res = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,content-type,x-omnichat-platform,x-parse-application-id,x-parse-session-token',
        },
      })
      const allow = res.headers.get('access-control-allow-origin')
      const ok = allow === '*' || allow === origin
      console.log(`   ${origin} -> status ${res.status}, allow-origin: ${allow ?? '(ausente)'} => ${ok ? 'NAVEGADOR OK' : 'BLOQUEADO'}`)
    } catch (err) {
      console.log(`   ${origin} -> falha: ${err.message}`)
    }
  }
}

/** Lista até `n` chaves do objeto — para inspecionar a SHAPE sem vazar valores. */
function keysOf(obj, n = 40) {
  return obj && typeof obj === 'object' ? Object.keys(obj).slice(0, n).join(', ') : `(${typeof obj})`
}

// ── 1. /v2/bots: CORS + auth + shape ─────────────────────────────────────────
const botsUrl = `${API}/v2/bots?status=active`
await checkCors(botsUrl)

console.log('\n1) GET /v2/bots?status=active (somente leitura)…')
const botsRes = await fetch(botsUrl, { headers: sessionHeaders() })
console.log(`   status ${botsRes.status}`)
if (!botsRes.ok) {
  const body = await botsRes.text()
  console.error(`   corpo (token NÃO incluído): ${body.slice(0, 400)}`)
  console.error('   401 = token expirado; 403 = sem permissão. Capture outro token logado e tente de novo.')
  process.exit(1)
}

const botsData = await botsRes.json()
const bots = Array.isArray(botsData) ? botsData : (botsData.results ?? botsData.bots ?? botsData.list ?? [])
console.log(`   OK — ${bots.length} bot(s). Envelope: ${keysOf(botsData)}`)

const sample = bots[0]
if (sample) {
  console.log(`\n2) SHAPE de um bot — chaves: ${keysOf(sample)}`)
  const retailerHints = ['retailerId', 'retailer', 'retailerObjectId', 'teams', 'team']
  for (const k of retailerHints) {
    if (k in sample) console.log(`   ↳ tem "${k}" (tipo ${typeof sample[k]})${k.startsWith('team') ? '  <-- TIMES INLINE?' : ''}`)
  }
}

// Se passaram um botId, localiza-o e mostra o retailerId (sem expor o resto).
if (botId) {
  const target = bots.find(b => b.objectId === botId || b.botId === botId || b.id === botId)
  if (!target) console.log(`\n   (botId ${botId} não encontrado na lista de bots ativos da conta deste token)`)
  else console.log(`\n   botId ${botId}: retailerId = ${target.retailerId ?? target.retailer?.objectId ?? target.retailer ?? '(não veio na shape)'}`)
}

// ── 3. Endpoints CANDIDATOS de times por token de sessão (browser-safe?) ──────
// Só GET read-only. Se algum responder 2xx, a Fase 2 é fetch em runtime.
const candidates = [
  `${API}/v2/teams?status=active`,
  botId ? `${API}/v1/${botId}/teams` : null,
  botId ? `${API}/v2/bots/${botId}/teams` : null,
].filter(Boolean)

console.log('\n3) Endpoints candidatos de TIMES (token de sessão, read-only):')
if (candidates.length === 0) {
  console.log('   (passe um botId para sondar os endpoints por-bot: node scripts/probe-teams.mjs <botId>)')
}
for (const url of candidates) {
  try {
    const res = await fetch(url, { headers: sessionHeaders() })
    let hint = ''
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.teams ?? data?.list ?? [])
      hint = ` — ${Array.isArray(arr) ? arr.length : '?'} item(ns); chaves item[0]: ${keysOf(arr?.[0] ?? {})}`
    }
    console.log(`   ${res.status}  ${url.replace(API, '…')}${hint}${res.ok ? '   <-- BROWSER-SAFE!' : ''}`)
  } catch (err) {
    console.log(`   ERR  ${url.replace(API, '…')} -> ${err.message}`)
  }
}

// ── 4. Team-class no Parse (api-private2) por TOKEN DE SESSÃO (sem master key) ─
// Host privado, mas é onde os times vivem. Testamos se a CLP/ACL libera leitura
// por sessão (Bearer + x-parse-session-token) E se há CORS de navegador. Se SIM,
// a Fase 2 é fetch em runtime mesmo aqui; se a leitura/CORS falhar, fica claro
// que os times só vêm server-side (com master key, fora do browser).
const retailerId = sample ? (botId
  ? (bots.find(b => b.objectId === botId || b.botId === botId || b.id === botId)?.retailerId)
  : sample.retailerId) : null

if (retailerId) {
  const PARSE = 'https://api-private2.omni.chat/parse'
  const where = encodeURIComponent(JSON.stringify({
    retailer: { __type: 'Pointer', className: 'Retailer', objectId: retailerId },
  }))
  const teamUrl = `${PARSE}/classes/Team?where=${where}`

  console.log(`\n4) Team-class no Parse por SESSÃO (retailer ${retailerId}, sem master key):`)
  // CORS primeiro — host privado costuma bloquear o navegador.
  for (const origin of ORIGINS_TO_TEST) {
    try {
      const res = await fetch(teamUrl, {
        method: 'OPTIONS',
        headers: {
          origin,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization,x-parse-application-id,x-parse-session-token',
        },
      })
      const allow = res.headers.get('access-control-allow-origin')
      const ok = allow === '*' || allow === origin
      console.log(`   CORS ${origin} -> status ${res.status}, allow-origin: ${allow ?? '(ausente)'} => ${ok ? 'NAVEGADOR OK' : 'BLOQUEADO'}`)
    } catch (err) {
      console.log(`   CORS ${origin} -> falha: ${err.message}`)
    }
  }
  // GET por sessão (NUNCA master key).
  try {
    const res = await fetch(teamUrl, { headers: sessionHeaders() })
    let hint = ''
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const arr = data?.results ?? []
      hint = ` — ${arr.length} time(s); chaves item[0]: ${keysOf(arr[0] ?? {})}`
    }
    console.log(`   GET por sessão -> status ${res.status}${hint}${res.ok ? '   <-- LEITURA POR SESSÃO OK' : ''}`)
  } catch (err) {
    console.log(`   GET por sessão -> falha: ${err.message}`)
  }
}

console.log('\nSonda concluída — nenhuma escrita, master key nunca usada.')
console.log('Leitura: se algum endpoint do passo 3 deu 2xx + CORS OK, a Fase 2 é fetch em runtime')
console.log('com o token de sessão (como o push). Senão, os times vêm por script server-side + cache.')
