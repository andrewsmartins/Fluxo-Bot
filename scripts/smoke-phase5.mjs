/**
 * Smoke test da Fase 5: novo fluxo do zero (botId), criação de nó,
 * undo/redo via teclado e botões da toolbar, e export validado.
 *
 * Uso: node scripts/smoke-phase5.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5174/Fluxo-Bot/'
const BOT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  // 1. Novo fluxo do zero
  await page.locator('header').getByRole('button', { name: 'Novo fluxo' }).click()
  await page.getByPlaceholder('8df3c1e7-a8c9-4bad-ac5a-2855462da840').fill(BOT_ID)
  await page.getByRole('button', { name: 'Criar fluxo' }).click()
  await page.waitForSelector('.react-flow__node')
  const startCount = await page.locator('.react-flow__node').count()
  console.log(`fluxo novo criado, nós: ${startCount}`)
  if (startCount !== 1) fail('fluxo novo deveria ter só o start')

  // 2. Cria um nó pela paleta
  await page.waitForTimeout(600)
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', 'defaultNode')
    const canvas = document.querySelector('.react-flow')
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.x + r.width * 0.45, clientY: r.y + r.height - 200,
    }))
  })
  await page.waitForTimeout(300)
  if ((await page.locator('.react-flow__node').count()) !== 2) fail('drop não criou o 2º nó')

  // 3. Undo via teclado remove o nó criado
  await page.locator('.react-flow__pane').click({ position: { x: 600, y: 150 } })
  await page.keyboard.press('Control+z')
  await page.waitForTimeout(300)
  const afterUndo = await page.locator('.react-flow__node').count()
  console.log(`nós após Ctrl+Z: ${afterUndo}`)
  if (afterUndo !== 1) fail('Ctrl+Z não desfez a criação')

  // 4. Redo via botão da toolbar repõe o nó
  await page.locator('header').getByRole('button', { name: 'Refazer' }).click()
  await page.waitForTimeout(300)
  const afterRedo = await page.locator('.react-flow__node').count()
  console.log(`nós após Refazer: ${afterRedo}`)
  if (afterRedo !== 2) fail('Refazer não repôs o nó')

  // 5. Exporta e valida o modelo
  const downloadPromise = page.waitForEvent('download')
  await page.locator('header').getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('button', { name: 'JSON (plataforma)' }).click()
  const exported = JSON.parse(readFileSync(await (await downloadPromise).path(), 'utf-8'))
  console.log(`export: ${exported.list.length} intenções, start=${exported.list[0]?.id}`)
  if (exported.list.length !== 2) fail('export deveria ter 2 intenções')
  if (exported.list[0]?.id !== `${BOT_ID}-start`) fail('start não tem o ID canônico do botId informado')
  if (exported.list[1]?.name !== 'nova_intencao_1') fail('intenção criada (e refeita via redo) não está no export')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 5 OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
