/**
 * Reproduz a reconexão de aresta via drag real para diagnosticar por que o
 * drop não aplica a mudança. Loga console do browser e estado antes/depois.
 *
 * Uso: node scripts/debug-reconnect.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5174/Fluxo-Bot/'
const sample = readFileSync(new URL('../samples/sample01.json', import.meta.url), 'utf-8')

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
page.on('console', msg => console.log(`[browser:${msg.type()}]`, msg.text()))
page.on('pageerror', err => console.log('[pageerror]', err.message))

await loadFlow(page, baseUrl, sample)

// Escolhe uma aresta -next e identifica origem/destino
const edgeInfo = await page.evaluate(() => {
  const edges = [...document.querySelectorAll('.react-flow__edge')]
  const e = edges.find(el => el.getAttribute('data-id')?.endsWith('-next'))
  return e ? { id: e.getAttribute('data-id'), label: e.getAttribute('aria-label') } : null
})
console.log('aresta escolhida:', edgeInfo)
if (!edgeInfo) { await browser.close(); process.exit(1) }

const edgeSel = `.react-flow__edge[data-id="${edgeInfo.id}"]`

// Seleciona a aresta para garantir que o updater esteja interativo
await page.locator(edgeSel).click({ force: true })
await page.waitForTimeout(200)

const anchor = page.locator(`${edgeSel} .react-flow__edgeupdater-target`)
console.log('âncoras na aresta:', await anchor.count())
const anchorBox = await anchor.first().boundingBox()
console.log('bbox âncora:', anchorBox)

// Acha um handle de destino (topo) de outro nó qualquer
// Mira no CORPO do nó (centro superior, ~40px abaixo do topo) — gesto natural
// do usuário; só funciona se o connectionRadius cobrir a distância até o handle
const handleBox = await page.evaluate((label) => {
  const currentTarget = label?.match(/to (\S+)/)?.[1] ?? ''
  const handles = [...document.querySelectorAll('.react-flow__handle.target')]
  for (const h of handles) {
    const node = h.closest('.react-flow__node')?.getAttribute('data-id')
    if (node === currentTarget || node?.startsWith('ext-')) continue
    const r = h.closest('.react-flow__node').getBoundingClientRect()
    if (r.width > 0 && r.y > 0 && r.y < 1000) return { x: r.x + r.width / 2, y: r.y + 40, node }
  }
  return null
}, edgeInfo.label)
console.log('handle alvo:', handleBox)
if (!anchorBox || !handleBox) { await browser.close(); process.exit(1) }

// Drag manual com passos intermediários
const sx = anchorBox.x + anchorBox.width / 2
const sy = anchorBox.y + anchorBox.height / 2
await page.mouse.move(sx, sy)
await page.mouse.down()
for (let i = 1; i <= 10; i++) {
  await page.mouse.move(sx + (handleBox.x - sx) * (i / 10), sy + (handleBox.y - sy) * (i / 10))
  await page.waitForTimeout(30)
}
await page.mouse.up()
await page.waitForTimeout(300)

// Estado depois: a aresta aponta para o novo nó? Apareceu erro no painel?
const after = await page.evaluate((id) => {
  const e = document.querySelector(`.react-flow__edge[data-id="${id}"]`)
  const error = document.querySelector('[role="status"]')?.textContent?.trim() ?? null
  return { edgeStillExists: !!e, ariaLabel: e?.getAttribute('aria-label') ?? null, toast: error }
}, edgeInfo.id)
console.log('depois do drag:', after)

// Exporta e verifica se o modelo mudou
const exported = await exportJson(page)
const changed = JSON.stringify(exported) !== JSON.stringify(JSON.parse(sample))
console.log('modelo mudou após drag:', changed)

await browser.close()
