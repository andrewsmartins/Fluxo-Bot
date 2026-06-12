/**
 * Etapa 1 do protocolo da Fase 4: monta o fluxo de teste usando o PRÓPRIO
 * Fluxo (novo fluxo com o botId de testes → nó de mensagem → texto via
 * painel → export) e salva o JSON em samples/etapa1-fluxo.json.
 * Não toca a API — só gera o arquivo para o push-flow.mjs.
 *
 * Uso: node scripts/etapa1-build-flow.mjs <botId> [url]
 */
import { chromium } from 'playwright'
import { readFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const botId = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://localhost:5174/Fluxo-Bot/'
if (!botId) { console.error('Uso: node scripts/etapa1-build-flow.mjs <botId>'); process.exit(1) }

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  // Novo fluxo com o botId de testes
  await page.locator('header').getByRole('button', { name: 'Novo fluxo' }).click()
  await page.getByPlaceholder('8df3c1e7-a8c9-4bad-ac5a-2855462da840').fill(botId)
  await page.getByRole('button', { name: 'Criar fluxo' }).click()
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(600)

  // Nó de mensagem
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

  // Texto via painel
  await page.locator('.react-flow__node', { hasText: 'nova_intencao_1' }).click()
  await page.waitForSelector('text=Aplicar alterações')
  await page.getByRole('button', { name: '+ Adicionar mensagem de texto' }).click()
  await page.getByPlaceholder('Texto da mensagem…').fill('Olá! Esta é uma mensagem de teste enviada pelo Fluxo (Etapa 1 da Fase 4). 🤖')
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('Fechar', { exact: true }).click()

  // Export
  const downloadPromise = page.waitForEvent('download')
  await page.locator('header').getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('button', { name: 'JSON (plataforma)' }).click()
  const download = await downloadPromise
  const out = fileURLToPath(new URL('../samples/etapa1-fluxo.json', import.meta.url))
  copyFileSync(await download.path(), out)

  const exported = JSON.parse(readFileSync(out, 'utf-8'))
  const created = exported.list.find(i => i.name === 'nova_intencao_1')
  console.log(`Arquivo: samples/etapa1-fluxo.json (${exported.list.length} intenções)`)
  console.log(`start:   ${exported.list.find(i => i.category === 'start')?.id}`)
  console.log(`nova:    ${created?.id}  <- use no --only`)
  console.log(`texto:   ${created?.conditions[0]?.assistant_says[0]?.messages[0]?.content}`)
} finally {
  await browser.close()
}
