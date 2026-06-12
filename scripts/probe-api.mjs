/**
 * Sonda READ-ONLY da API da OmniChat — passo 0 da Fase 4.
 * Não faz nenhuma escrita. Três verificações:
 *   1. CORS: a API aceitaria chamadas do navegador a partir do Fluxo?
 *   2. Autenticação: o token de sessão funciona num GET?
 *   3. Backup: salva o estado atual do bot em samples/ (fora do git).
 *
 * Uso (PowerShell):
 *   $env:OMNI_TOKEN = 'r:SEU_TOKEN_DE_SESSAO'
 *   node scripts/probe-api.mjs <botId>
 *
 * O token NUNCA é exibido nem gravado. Use somente um BOT DE TESTES.
 */
import { writeFileSync, mkdirSync } from 'node:fs'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
// ID público do app Parse (visível a qualquer navegador na plataforma — não é segredo)
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'
const ORIGINS_TO_TEST = ['http://localhost:5173', 'https://andrewsmartins.github.io']

const botId = process.argv[2]
const token = process.env.OMNI_TOKEN

if (!botId || !/^[0-9a-f-]{36}$/i.test(botId)) {
  console.error('Uso: node scripts/probe-api.mjs <botId>  (botId deve ser um UUID)')
  process.exit(1)
}
if (!token) {
  console.error('Defina o token antes:  $env:OMNI_TOKEN = \'r:...\'')
  process.exit(1)
}

const url = `${API}/v1/${botId}/intents?fullObject=true`

// ── 1. CORS: preflight como o navegador faria a partir do Fluxo ─────────────
console.log('1) Verificando CORS (preflight OPTIONS)…')
for (const origin of ORIGINS_TO_TEST) {
  try {
    const res = await fetch(url, {
      method: 'OPTIONS',
      headers: {
        origin,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type,x-omnichat-platform,x-parse-application-id,x-parse-session-token',
      },
    })
    const allowOrigin = res.headers.get('access-control-allow-origin')
    const allowed = allowOrigin === '*' || allowOrigin === origin
    console.log(`   ${origin} -> status ${res.status}, allow-origin: ${allowOrigin ?? '(ausente)'} => ${allowed ? 'NAVEGADOR OK' : 'BLOQUEADO no navegador'}`)
  } catch (err) {
    console.log(`   ${origin} -> falha na requisição: ${err.message}`)
  }
}

// ── 2 e 3. GET autenticado + backup ─────────────────────────────────────────
console.log('2) Testando autenticação com GET (somente leitura)…')
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
console.log(`   GET intents -> status ${res.status}`)
if (!res.ok) {
  const body = await res.text()
  console.error(`   Corpo da resposta (token NÃO incluído): ${body.slice(0, 500)}`)
  console.error('   401 = token expirado (faça login de novo e capture outro); 403/404 = botId errado ou sem permissão.')
  process.exit(1)
}

const data = await res.json()
const count = Array.isArray(data.list) ? data.list.length : 0
console.log(`   OK — ${count} intenções no bot.`)

mkdirSync(new URL('../samples/', import.meta.url), { recursive: true })
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const backupPath = new URL(`../samples/backup-${botId}-${stamp}.json`, import.meta.url)
writeFileSync(backupPath, JSON.stringify(data, null, 2))
console.log(`3) Backup salvo em samples/backup-${botId}-${stamp}.json (pasta fora do git).`)
console.log('\nSonda concluída sem nenhuma escrita na plataforma.')
