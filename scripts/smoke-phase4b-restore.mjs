/**
 * Smoke test do RestoreDialog (Fase 4b — restaurar ao estado real do backup).
 *
 * NÃO TOCA A API REAL — `window.fetch` é interceptado por `addInitScript` com um
 * servidor falso e ESTADO mutável (GET/POST/DELETE juntos): GET lista o vivo,
 * DELETE remove, POST de id novo gera outro id (achado da Etapa 1). Cobre: upload
 * do backup, leitura do botId, gating, dry-run (excluir/recriar/sobrescrever),
 * snapshot de segurança baixado antes, exclusão do excedente e recriação.
 *
 * Uso: node scripts/smoke-phase4b-restore.mjs [url]
 */
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const BOT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TAIL = BOT_ID.slice(-6)
const TOKEN = 'r:SMOKE_SECRET_TOKEN_NAO_DEVE_VAZAR'

// Backup: start (existe) + uma intenção que sumiu do servidor (recriar).
const backup = {
  list: [
    { id: `${BOT_ID}-start`, name: 'start', category: 'start', botId: BOT_ID, conditions: [] },
    { id: 'a', name: 'recriar_A', category: 'default', botId: BOT_ID, conditions: [] },
  ],
}

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))

  // Servidor falso com estado: start + 2 excedentes. POST de id novo gera outro.
  await page.addInitScript((startId) => {
    const live = [
      { id: startId, name: 'start' },
      { id: 'extra-1', name: 'extra_um' },
      { id: 'extra-2', name: 'extra_dois' },
    ]
    let seq = 0
    window.__server = { deletes: [], posts: [] }
    window.fetch = async (url, init = {}) => {
      const method = init.method || 'GET'
      const json = obj => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
      const u = String(url)
      if (u.includes('/intents?')) return json({ list: live.slice() })
      const id = u.split('/').pop()
      if (method === 'DELETE') {
        window.__server.deletes.push(id)
        const idx = live.findIndex(i => i.id === id)
        if (idx >= 0) live.splice(idx, 1)
        return json({})
      }
      if (method === 'POST') {
        const body = JSON.parse(init.body)
        window.__server.posts.push(body.name)
        const existing = live.find(i => i.id === id)
        if (existing) { existing.name = body.name; return json({ id }) }
        const newId = 'srv-' + (++seq)
        live.push({ id: newId, name: body.name })
        return json({ id: newId })
      }
      return json({})
    }
  }, `${BOT_ID}-start`)

  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  // 1. Abre o diálogo de restore (independe de fluxo carregado)
  await page.locator('nav').getByRole('button', { name: 'Restaurar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Restaurar backup' })
  await dialog.waitFor()

  const restoreBtn = dialog.getByRole('button', { name: 'Restaurar para o backup' })
  const previewBtn = dialog.getByRole('button', { name: /Pré-visualizar/ })
  if (!(await restoreBtn.isDisabled())) fail('Restaurar deveria começar desabilitado (sem backup)')

  // 2. Sobe o arquivo de backup
  await dialog.locator('input[type=file]').setInputFiles({
    name: 'backup-teste.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  })
  if (!(await dialog.textContent())?.includes(BOT_ID)) fail('diálogo não leu o botId do backup')

  // 3. Token + confirmação + trava
  await dialog.locator('input[type=password]').fill(TOKEN)
  await dialog.getByPlaceholder(`…${TAIL}`).fill(TAIL)
  if (!(await restoreBtn.isDisabled())) fail('Restaurar não deveria habilitar sem a trava de bot de testes')
  await dialog.getByRole('checkbox').check()
  if (await restoreBtn.isDisabled()) fail('Restaurar deveria habilitar com backup + token + confirmação + trava')

  // 4. Dry-run: excluir 2 · recriar 1 · sobrescrever 1
  await previewBtn.click()
  await page.waitForTimeout(200)
  const planText = (await dialog.textContent()) ?? ''
  if (!/Excluir 2/.test(planText)) fail('dry-run não indicou 2 exclusões')
  if (!/recriar 1/.test(planText)) fail('dry-run não indicou 1 recriação')
  if (!/sobrescrever 1/.test(planText)) fail('dry-run não indicou 1 sobrescrita')

  // 5. Executa: snapshot de segurança é baixado ANTES de destruir
  const downloadPromise = page.waitForEvent('download')
  await restoreBtn.click()
  const safety = await downloadPromise
  if (!safety.suggestedFilename().startsWith('pre-restore-')) {
    fail(`snapshot de segurança não foi baixado antes (arquivo: ${safety.suggestedFilename()})`)
  }

  // 6. Conclusão: excluiu os 2 excedentes e recriou A
  await dialog.getByText(/Restore concluído/).waitFor({ timeout: 12000 })
  const server = await page.evaluate(() => window.__server)
  if (server.deletes.length !== 2) fail(`deveria ter excluído 2 (excluiu ${server.deletes.length})`)
  if (server.deletes.some(id => String(id).startsWith('srv-'))) fail('um ID recriado foi deletado — ordem errada')
  if (!server.posts.includes('recriar_A')) fail('a intenção faltante não foi recriada')

  // 7. Sanitização: token não vaza
  if ((await dialog.textContent())?.includes(TOKEN)) fail('o token VAZOU na interface do diálogo')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 4b RESTORE OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
