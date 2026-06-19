/**
 * Validação do Marco B (Fase 6): importa um fluxo sintético com `intent.context`
 * e confere que a aresta de CONTEXTO renderiza tracejada (contexto → esta
 * intenção), distinta das arestas de fluxo. Fluxo mínimo (não usa samples
 * grandes, que estouram o `fill` do textarea). Roda sem tocar API.
 *
 * Uso: node scripts/smoke-phase6-context.mjs [url]
 */
import { chromium } from 'playwright'
import { loadFlow } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const BOT = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'

function cond(type = 'none') {
  return {
    name: 'Condição Padrão', type: 'any', variable: null, intent: null, value: 'any',
    valueNumber: null, fallbackIntents: [], values: null, context: null,
    action: {
      type, choices: null, captureDataType: null, transferType: null, value: null,
      variable: null, conversationType: null, storeType: null, entity: null,
      external: { type: null, apiName: null },
    },
    assistant_says: [{ channel: 'any', messages: [] }],
    next: { type: 'context' },
  }
}
function intent(id, conds, extra = {}) {
  return { id, name: id, category: 'cat', botId: BOT, keywords: [], context: null, priority: 0, conditions: conds, ...extra }
}

// menu = intenção-de-contexto (origem); sub = ativa só nesse contexto (destino).
const flow = {
  list: [
    intent('menu', [cond('choice'), cond('none')]),   // 2 condições → vira GRUPO (origem agrupada)
    intent('sub', [cond('none')], { context: 'menu' }),
    intent('orfa', [cond('none')], { context: 'nao-existe' }), // contexto órfão → sem aresta
  ],
}

let failed = false
function fail(msg) { console.error(`FALHOU: ${msg}`); failed = true }

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, JSON.stringify(flow))

  // 1. Exatamente 1 aresta de contexto (sub←menu); a órfã não vira aresta.
  const ctxIds = await page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__edge')]
      .map(e => e.getAttribute('data-id'))
      .filter(id => id?.startsWith('ctx-')),
  )
  console.log(`arestas de contexto: ${JSON.stringify(ctxIds)}`)
  if (ctxIds.length !== 1 || ctxIds[0] !== 'ctx-sub') {
    fail(`esperava só [ctx-sub], veio ${JSON.stringify(ctxIds)}`)
  }

  // 2. A aresta de contexto é TRACEJADA (stroke-dasharray no path).
  const dashed = await page.evaluate(() => {
    const path = document.querySelector('.react-flow__edge[data-id="ctx-sub"] path.react-flow__edge-path')
    return path ? getComputedStyle(path).strokeDasharray : null
  })
  console.log(`stroke-dasharray: ${dashed}`)
  if (!dashed || dashed === 'none') fail('aresta de contexto não está tracejada')

  // 3. A origem agrupada (menu, 2 condições) renderizou (a aresta achou a origem).
  const menuExists = await page.locator('.react-flow__node[data-id="menu"]').count()
  if (menuExists !== 1) fail('nó de origem (menu) não renderizou')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (!failed) console.log('VALIDAÇÃO MARCO B OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
