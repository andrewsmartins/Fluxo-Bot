/**
 * Smoke: (1) remover conexão pelo botão "×" da aresta reflete no modelo; (2) o
 * nó de início abre o painel em modo somente-leitura (sem formulário/Aplicar).
 * Roda sem tocar API.
 *
 * Uso: node scripts/smoke-phase6-edge-delete.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/Fluxo-Bot/'
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

  // ── Parte 1: botão "×" remove uma conexão ──────────────────────────────────
  // Escolhe uma aresta -next e localiza o botão de remover mais próximo do seu meio.
  const nextEdgeId = await page.evaluate(() => {
    const e = [...document.querySelectorAll('.react-flow__edge')]
      .find(el => /-c\d+-next$/.test(el.getAttribute('data-id') ?? ''))
    return e?.getAttribute('data-id') ?? null
  })
  if (!nextEdgeId) { fail('nenhuma aresta -next no fluxo'); throw new Error('sem aresta') }
  console.log(`aresta-alvo: ${nextEdgeId}`)

  const edgesBefore = await page.locator('.react-flow__edge').count()
  const clicked = await page.evaluate((id) => {
    const path = document.querySelector(`.react-flow__edge[data-id="${id}"] .react-flow__edge-path`)
    if (!path) return false
    const p = path.getPointAtLength(path.getTotalLength() * 0.5)
    const mid = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM())
    // Botão de remover (no layer de labels) mais próximo do meio da aresta.
    const btns = [...document.querySelectorAll('button[title="Remover conexão"]')]
    let best = null, bestD = Infinity
    for (const b of btns) {
      const r = b.getBoundingClientRect()
      const d = Math.hypot(r.x + r.width / 2 - mid.x, r.y + r.height / 2 - mid.y)
      if (d < bestD) { bestD = d; best = b }
    }
    if (!best) return false
    best.click()
    return true
  }, nextEdgeId)
  if (!clicked) { fail('botão "×" da aresta não encontrado'); }
  await page.waitForTimeout(350)

  const edgesAfter = await page.locator('.react-flow__edge').count()
  console.log(`arestas: ${edgesBefore} -> ${edgesAfter} (esperado -1)`)
  if (edgesAfter !== edgesBefore - 1) fail('clicar no "×" não removeu a aresta')
  const stillThere = await page.locator(`.react-flow__edge[data-id="${nextEdgeId}"]`).count()
  if (stillThere !== 0) fail('a aresta-alvo continua no canvas')

  // Confirma no modelo: o next daquela condição foi resetado (sem intent).
  const m = /^(.+)-c(\d+)-next$/.exec(nextEdgeId)
  const exported = await exportJson(page)
  const srcIntent = exported.list.find(i => i.id === m[1])
  const nextRef = srcIntent?.conditions[Number(m[2])]?.next?.intent
  console.log(`next.intent da origem após remover: ${JSON.stringify(nextRef ?? null)}`)
  if (nextRef) fail('o next da condição não foi removido no modelo')

  // ── Parte 2: nó de início é somente-leitura ────────────────────────────────
  const startId = await page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__node')]
      .map(n => n.getAttribute('data-id')).find(id => id?.endsWith('-start')) ?? null)
  if (!startId) { fail('nó de início não encontrado'); throw new Error('sem start') }
  await page.locator(`.react-flow__node[data-id="${startId}"]`).click()
  await page.waitForTimeout(250)

  const panel = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="detail-panel"]')
    if (!el) return { missing: true }
    const text = el.textContent ?? ''
    const hasApply = [...el.querySelectorAll('button')].some(b => /Aplicar/i.test(b.textContent ?? ''))
    const inputs = el.querySelectorAll('input, textarea, select').length
    return { readonly: /não é editável/i.test(text), hasApply, inputs }
  })
  if (panel.missing) { fail('painel não abriu ao clicar no start'); }
  console.log(`painel do start: readonly=${panel.readonly}, Aplicar=${panel.hasApply}, inputs=${panel.inputs}`)
  if (!panel.readonly) fail('painel do start não mostra aviso de somente-leitura')
  if (panel.hasApply) fail('painel do start ainda tem botão Aplicar')
  if (panel.inputs !== 0) fail('painel do start ainda tem campos editáveis')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (process.exitCode !== 1) console.log('SMOKE PHASE 6 (remover conexão + start read-only) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
