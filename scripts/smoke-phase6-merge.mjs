/**
 * Smoke do Marco D (merge pela paleta): arrastar um tipo da paleta SOBRE um nó
 * existente adiciona-o como NOVA condição daquela intenção (em vez de criar um
 * nó solto). A intenção-alvo passa a ter 2 condições → vira grupo com 2 filhos.
 * Roda sem tocar API.
 *
 * Uso: node scripts/smoke-phase6-merge.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01.json', import.meta.url), 'utf-8')

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, sample)

  // Estado inicial: escolhe uma intenção SOLO (1 condição) que não seja o start.
  const before = await exportJson(page)
  const target = before.list.find(i => i.conditions.length === 1 && i.category !== 'start' && !i.id.endsWith('-start'))
  if (!target) { fail('nenhuma intenção solo elegível no sample'); throw new Error('sem alvo') }
  console.log(`alvo do merge: ${target.name} (${target.id}) — ${target.conditions.length} condição`)

  // Centro do nó-alvo no viewport (precisa estar renderizado como nó solto).
  const box = await page.locator(`.react-flow__node[data-id="${target.id}"]`).boundingBox()
  if (!box) { fail('nó-alvo não encontrado no canvas'); throw new Error('sem nó') }

  // Drop sintético de um tipo (Transferência) SOBRE o centro do nó-alvo.
  await page.evaluate(({ cx, cy }) => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', 'transferNode')
    const canvas = document.querySelector('.react-flow')
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt, clientX: cx, clientY: cy,
    }))
  }, { cx: box.x + box.width / 2, cy: box.y + box.height / 2 })
  await page.waitForTimeout(400)

  // 1. NÃO criou intenção nova; o alvo ganhou uma 2ª condição (transfer)
  const after = await exportJson(page)
  console.log(`intenções: ${before.list.length} -> ${after.list.length} (esperado igual)`)
  if (after.list.length !== before.list.length) fail('merge criou intenção nova em vez de juntar')
  const merged = after.list.find(i => i.id === target.id)
  console.log(`condições do alvo: ${target.conditions.length} -> ${merged?.conditions.length} (esperado +1)`)
  if (merged?.conditions.length !== 2) fail('alvo não ganhou a 2ª condição')
  if (merged?.conditions[1].action.type !== 'transfer') fail('condição nova não é do tipo escolhido (transfer)')

  // 2. No canvas o alvo virou grupo com filho ::c1 do tipo certo
  const groupOk = await page.locator(`.react-flow__node.react-flow__node-intentGroupNode[data-id="${target.id}"]`).count()
  const childOk = await page.locator(`.react-flow__node.react-flow__node-transferNode[data-id="${target.id}::c1"]`).count()
  console.log(`grupo: ${groupOk}, filho transfer ::c1: ${childOk}`)
  if (groupOk !== 1) fail('alvo não virou intentGroupNode')
  if (childOk !== 1) fail('filho-condição transfer ::c1 não renderizou')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (process.exitCode !== 1) console.log('SMOKE PHASE 6 (merge pela paleta) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
