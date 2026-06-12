/** Diagnóstico do gesto de conexão: a connection line aparece? O nó se move? */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5174/Fluxo-Bot/'
const sample = readFileSync(new URL('../samples/sample01.json', import.meta.url), 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', m => console.log('[browser]', m.text()))
page.on('pageerror', e => console.log('[pageerror]', e.message))
await loadFlow(page, baseUrl, sample)

// cria um nó novo via paleta e usa ELE como origem
await page.evaluate(() => {
  const dt = new DataTransfer()
  dt.setData('application/fluxo-node-kind', 'defaultNode')
  const canvas = document.querySelector('.react-flow')
  const r = canvas.getBoundingClientRect()
  canvas.dispatchEvent(new DragEvent('drop', {
    bubbles: true, cancelable: true, dataTransfer: dt,
    clientX: r.x + r.width - 200, clientY: r.y + r.height - 150,
  }))
})
await page.waitForTimeout(500)

const info = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll('.react-flow__node')]
  const src = nodes.find(n => n.textContent.includes('nova_intencao'))
  const h = src?.querySelector('.react-flow__handle.source')?.getBoundingClientRect()
  const tgt = nodes.find(n => n !== src && n.querySelector('.react-flow__handle.target') && !n.getAttribute('data-id').startsWith('ext-'))
  const th = tgt.querySelector('.react-flow__handle.target').getBoundingClientRect()
  return {
    srcNode: src?.getAttribute('data-id') ?? null,
    srcRect: src?.getBoundingClientRect().toJSON(),
    handle: h ? { x: h.x + h.width / 2, y: h.y + h.height / 2 } : null,
    tgtNode: tgt.getAttribute('data-id'),
    tgtHandle: { x: th.x + th.width / 2, y: th.y + th.height / 2 },
  }
})
console.log(info)
if (!info.srcNode || !info.handle) { console.log('nó novo sem handle!'); await browser.close(); process.exit(1) }

await page.mouse.move(info.handle.x, info.handle.y)
await page.mouse.down()
await page.mouse.move(info.handle.x + 20, info.handle.y + 20, { steps: 5 })
await page.waitForTimeout(200)

const midState = await page.evaluate((srcId) => ({
  connectionLine: !!document.querySelector('.react-flow__connection'),
  connectionPath: !!document.querySelector('.react-flow__connectionline'),
  nodeDragging: document.querySelector(`.react-flow__node[data-id="${srcId}"]`)?.classList.contains('dragging'),
}), info.srcNode)
console.log('durante o drag:', midState)

await page.mouse.move(info.tgtHandle.x, info.tgtHandle.y, { steps: 10 })
await page.waitForTimeout(100)
await page.mouse.up()
await page.waitForTimeout(300)

const edges = await page.evaluate((p) => {
  return [...document.querySelectorAll('.react-flow__edge')]
    .map(e => e.getAttribute('data-id'))
    .filter(id => id.startsWith(p.srcNode) && id.includes('next'))
}, info)
console.log('arestas -next da origem após drop:', edges)
const toast = await page.evaluate(() =>
  document.querySelector('[role="status"]')?.textContent?.trim() ?? '(sem toast)')
console.log('toast:', toast)

await browser.close()
