/**
 * Etapa 2/3 do protocolo da Fase 4: monta um fluxo encadeado pelo app
 * (start -> mensagem -> espera) para validar o remapeamento de IDs do push.
 * Salva em samples/etapa2-fluxo.json. Não toca a API.
 *
 * Uso: node scripts/etapa2-build-flow.mjs <botId> [url]
 */
import { chromium } from 'playwright'
import { readFileSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const botId = process.argv[2]
const baseUrl = process.argv[3] ?? 'http://localhost:5174/Fluxo-Bot/'
if (!botId) { console.error('Uso: node scripts/etapa2-build-flow.mjs <botId>'); process.exit(1) }

async function dropNode(page, kind, fx, fy) {
  await page.evaluate(({ kind, fx, fy }) => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', kind)
    const canvas = document.querySelector('.react-flow')
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.x + r.width * fx, clientY: r.y + r.height * fy,
    }))
  }, { kind, fx, fy })
  await page.waitForTimeout(250)
}

async function connect(page, sourceName, targetName) {
  const src = await page.locator('.react-flow__node', { hasText: sourceName })
    .locator('.react-flow__handle.source').boundingBox()
  const tgt = await page.locator('.react-flow__node', { hasText: targetName })
    .locator('.react-flow__handle.target').boundingBox()
  const sx = src.x + src.width / 2, sy = src.y + src.height / 2
  const tx = tgt.x + tgt.width / 2, ty = tgt.y + tgt.height / 2

  await page.mouse.move(sx, sy)
  await page.waitForTimeout(60)        // hover registra o handle
  await page.mouse.down()
  await page.mouse.move(sx + 6, sy + 6, { steps: 3 }) // movimento inicial dispara o modo conexão
  for (let i = 1; i <= 12; i++) {
    await page.mouse.move(sx + (tx - sx) * (i / 12), sy + (ty - sy) * (i / 12), { steps: 2 })
    await page.waitForTimeout(20)
  }
  await page.mouse.move(tx, ty, { steps: 3 })
  await page.mouse.up()
  await page.waitForTimeout(250)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })

  await page.locator('header').getByRole('button', { name: 'Novo fluxo' }).click()
  await page.getByPlaceholder('8df3c1e7-a8c9-4bad-ac5a-2855462da840').fill(botId)
  await page.getByRole('button', { name: 'Criar fluxo' }).click()
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(600)

  // O fitView põe o start no canto sup. esquerdo, sob a paleta (que intercepta
  // o ponteiro). Faz um pan do canvas (arrasta o pane vazio) para deslocar todo
  // o conteúdo para longe da paleta antes de conectar.
  await page.mouse.move(800, 500)
  await page.mouse.down()
  await page.mouse.move(1050, 650, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)

  await dropNode(page, 'defaultNode', 0.45, 0.45) // nova_intencao_1 (mensagem)
  await dropNode(page, 'waitNode',    0.45, 0.78) // nova_intencao_2 (espera)

  // Mensagem na intenção 1
  await page.locator('.react-flow__node', { hasText: 'nova_intencao_1' }).click()
  await page.waitForSelector('text=Aplicar alterações')
  await page.getByRole('button', { name: '+ Adicionar mensagem de texto' }).click()
  await page.getByPlaceholder('Texto da mensagem…').fill('Mensagem do fluxo encadeado (Etapa 2 da Fase 4).')
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(300)
  await page.getByLabel('Fechar', { exact: true }).click()

  await connect(page, 'nova_intencao_1', 'nova_intencao_2')
  console.log(`após 1->2: ${await page.locator('.react-flow__edge').count()} aresta(s), toast: ${await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '(nenhum)')}`)
  await connect(page, 'start', 'nova_intencao_1')
  console.log(`após start->1: ${await page.locator('.react-flow__edge').count()} aresta(s), toast: ${await page.evaluate(() => document.querySelector('[role="status"]')?.textContent ?? '(nenhum)')}`)

  const edges = await page.locator('.react-flow__edge').count()
  console.log(`arestas no canvas: ${edges} (esperado 2)`)
  if (edges !== 2) { console.error('FALHOU ao conectar'); process.exit(1) }

  const downloadPromise = page.waitForEvent('download')
  await page.locator('header').getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('button', { name: 'JSON (plataforma)' }).click()
  const download = await downloadPromise
  const out = fileURLToPath(new URL('../samples/etapa2-fluxo.json', import.meta.url))
  copyFileSync(await download.path(), out)

  const exported = JSON.parse(readFileSync(out, 'utf-8'))
  console.log(`Arquivo: samples/etapa2-fluxo.json (${exported.list.length} intenções)`)
  for (const i of exported.list) {
    const ref = i.conditions[0]?.next?.intent
    console.log(`  ${i.name} (${i.id}) -> next: ${typeof ref === 'object' ? ref?.id : ref || '(nenhum)'}`)
  }
} finally {
  await browser.close()
}
