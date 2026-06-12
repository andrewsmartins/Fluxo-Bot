/**
 * Rollback do bot de testes: restaura o estado de um arquivo de backup,
 * excluindo as intenções que existem hoje mas não estavam no backup.
 * Útil para limpar o bot após uma rodada de testes da Fase 4.
 *
 * NÃO recria intenções que estavam no backup e foram apagadas — só remove as
 * que sobraram (o caso comum: voltar o bot de testes ao estado inicial).
 *
 * Uso (PowerShell):
 *   $env:OMNI_TOKEN = 'r:...'
 *   node scripts/rollback-bot.mjs <botId> samples/backup-....json [--yes]
 *
 * Sem --yes é dry-run. Use somente em BOT DE TESTES.
 */
import { readFileSync } from 'node:fs'

const API = 'https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod'
const APP_ID = 'UCeS99itvZg1tsea2OSoyKvpLbKddhoVAPotIQOy'

const [botId, backupPath] = process.argv.slice(2).filter(a => !a.startsWith('--'))
const confirmed = process.argv.includes('--yes')
const token = process.env.OMNI_TOKEN

function abort(m) { console.error(`ABORTADO: ${m}`); process.exit(1) }
if (!botId || !backupPath) abort('uso: node scripts/rollback-bot.mjs <botId> <backup.json> [--yes]')
if (!token) abort("defina o token:  $env:OMNI_TOKEN = 'r:...'")

const headers = {
  accept: 'application/json',
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
  'x-omnichat-platform': 'web',
  'x-parse-application-id': APP_ID,
  'x-parse-session-token': token,
}

const backup = JSON.parse(readFileSync(backupPath, 'utf-8'))
const keepIds = new Set(backup.list.map(i => i.id))

const current = await (await fetch(`${API}/v1/${botId}/intents?fullObject=true`, { headers })).json()
const toDelete = current.list.filter(i => !keepIds.has(i.id))

console.log(`Backup mantém ${keepIds.size} intenção(ões). Servidor tem ${current.list.length}.`)
console.log(`A excluir: ${toDelete.length}`)
for (const i of toDelete) console.log(`  - ${i.name} (${i.id})`)

if (!toDelete.length) { console.log('Nada a fazer.'); process.exit(0) }
if (!confirmed) { console.log('\nDRY-RUN — adicione --yes para excluir.'); process.exit(0) }

for (const intent of toDelete) {
  const res = await fetch(`${API}/v1/${botId}/intents/${intent.id}`, { method: 'DELETE', headers })
  console.log(`DELETE ${intent.name} -> ${res.status}`)
}
console.log('Rollback concluído. Confira na tela da Omni.')
