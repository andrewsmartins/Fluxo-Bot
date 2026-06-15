/**
 * Smoke test da Fase 4b: PushDialog (envio pela UI).
 *
 * NÃO TOCA A API REAL — `window.fetch` é interceptado por `addInitScript` e
 * devolve um servidor falso, então o dry-run e o envio rodam ponta a ponta na
 * UI sem rede. Cobre: gating do botão Enviar (token + confirmação do botId +
 * trava de bot de testes), validação da confirmação do alvo, dry-run, download
 * do backup antes do envio, relatório final e sanitização do token.
 *
 * Uso: node scripts/smoke-phase4b.mjs [url]
 */
import { chromium } from 'playwright'

const baseUrl = process.argv[2] ?? 'http://localhost:5174/Fluxo-Bot/'
const BOT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const TAIL = BOT_ID.slice(-6)
const TOKEN = 'r:SMOKE_SECRET_TOKEN_NAO_DEVE_VAZAR'

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))

  // Intercepta window.fetch ANTES de carregar a app: servidor falso, sem rede.
  // GET (estado atual) → o start já existe (vira atualização). POST → 200.
  await page.addInitScript((startId) => {
    window.__pushCalls = []
    window.fetch = async (url, init = {}) => {
      const method = init.method || 'GET'
      window.__pushCalls.push({ url: String(url), method })
      const json = (obj, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
      if (String(url).includes('/intents?')) return json({ list: [{ id: startId }] })
      if (method === 'POST') return json({ id: 'srv-generated' })
      return json({})
    }
  }, `${BOT_ID}-start`)

  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  // 1. Fluxo novo do zero (start válido, sem erros → botão Enviar habilitado)
  await page.locator('header').getByRole('button', { name: 'Novo fluxo' }).click()
  await page.getByPlaceholder('8df3c1e7-a8c9-4bad-ac5a-2855462da840').fill(BOT_ID)
  await page.getByRole('button', { name: 'Criar fluxo' }).click()
  await page.waitForSelector('.react-flow__node')

  const topPush = page.locator('header').getByRole('button', { name: 'Enviar' })
  if (await topPush.isDisabled()) fail('botão Enviar deveria habilitar com fluxo válido')

  // 2. Abre o diálogo
  await topPush.click()
  const dialog = page.getByRole('dialog', { name: 'Enviar para OmniChat' })
  await dialog.waitFor()
  if (!(await dialog.textContent())?.includes(BOT_ID)) fail('diálogo não mostra o botId de destino')

  const sendBtn = dialog.getByRole('button', { name: 'Enviar para OmniChat' })
  const previewBtn = dialog.getByRole('button', { name: /Pré-visualizar/ })
  const tokenInput = dialog.locator('input[type=password]')
  const tailInput = dialog.getByPlaceholder(`…${TAIL}`)
  const checkbox = dialog.getByRole('checkbox')

  // 3. Gating: tudo desabilitado sem token/confirmação/checkbox
  if (!(await sendBtn.isDisabled())) fail('Enviar deveria começar desabilitado')
  if (!(await previewBtn.isDisabled())) fail('Pré-visualizar deveria começar desabilitado')

  // 4. Só token → ainda desabilitado
  await tokenInput.fill(TOKEN)
  if (!(await sendBtn.isDisabled())) fail('Enviar não deveria habilitar só com token')

  // 5. Confirmação do botId errada → erro e segue desabilitado
  await tailInput.fill('xxxxxx')
  if (!(await dialog.getByText('Não confere com o fim do botId.').isVisible())) {
    fail('confirmação errada do botId deveria avisar')
  }
  if (!(await previewBtn.isDisabled())) fail('Pré-visualizar não deveria habilitar com confirmação errada')

  // 6. Confirmação certa → preview habilita; Enviar ainda não (falta checkbox)
  await tailInput.fill(TAIL)
  if (await previewBtn.isDisabled()) fail('Pré-visualizar deveria habilitar com a confirmação certa')
  if (!(await sendBtn.isDisabled())) fail('Enviar não deveria habilitar sem a trava de bot de testes')

  // 7. Marca a trava → Enviar habilita
  await checkbox.check()
  if (await sendBtn.isDisabled()) fail('Enviar deveria habilitar com token + confirmação + trava')

  // 8. Dry-run (preview): usa o fetch mockado, mostra o plano
  await previewBtn.click()
  await page.waitForTimeout(200)
  if (!(await dialog.getByText(/atualização\(ões\)/).isVisible())) fail('dry-run não exibiu o plano')
  const getCalls = await page.evaluate(() => window.__pushCalls.filter(c => c.method === 'GET').length)
  if (getCalls < 1) fail('dry-run deveria ter feito um GET (mockado)')

  // 9. Envio: baixa o backup ANTES e mostra o relatório final
  const downloadPromise = page.waitForEvent('download')
  await sendBtn.click()
  const backup = await downloadPromise
  if (!backup.suggestedFilename().startsWith(`backup-${BOT_ID}`)) {
    fail(`backup não foi baixado antes do envio (arquivo: ${backup.suggestedFilename()})`)
  }
  await dialog.getByText(/Push concluído/).waitFor({ timeout: 3000 })
  const postCalls = await page.evaluate(() => window.__pushCalls.filter(c => c.method === 'POST').length)
  if (postCalls < 1) fail('envio deveria ter feito ao menos 1 POST (mockado)')

  // 10. Sanitização: o token nunca aparece na UI
  if ((await dialog.textContent())?.includes(TOKEN)) fail('o token VAZOU na interface do diálogo')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 4b OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
