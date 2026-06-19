/**
 * Smoke do Marco D (Fase 6): criação dos tipos novos pela paleta + revalidação
 * do export com a estrutura de grupos do Modelo B. Roda sem tocar API.
 *
 * Cobre:
 *  - a paleta oferece os 11 ActionTypes (6 de fluxo + 5 avançados);
 *  - criar um nó terminal (Encerrar conversa) e um de Chamada de API pela paleta;
 *  - o JSON exportado tem as intenções criadas com o action.type certo e NÃO
 *    vaza filhos de grupo (`::c{idx}`) como intenções;
 *  - exportar PNG de um fluxo COM grupos não quebra (valida o fix de bounds com
 *    nós aninhados em exportImage.boundsNodes).
 *
 * Uso: node scripts/smoke-phase6-create.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson, readToast } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
// sample01-v2 tem intenções multi-condição → grupos (exercita o fix de export).
const sample = readFileSync(new URL('../samples/sample01-v2.json', import.meta.url), 'utf-8')

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

/** Dispara um drop sintético da paleta no canvas, num offset vertical dado. */
async function dropKind(page, kind, dy) {
  await page.evaluate(({ kind, dy }) => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', kind)
    const canvas = document.querySelector('.react-flow')
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.x + r.width / 2, clientY: r.y + dy,
    }))
  }, { kind, dy })
  await page.waitForTimeout(300)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, sample)

  // 1. Paleta com os 11 tipos e os 5 rótulos avançados
  const paletteItems = await page.locator('[title^="Arraste para o canvas"]').count()
  console.log(`itens na paleta: ${paletteItems}`)
  if (paletteItems !== 11) fail(`esperava 11 itens na paleta, veio ${paletteItems}`)
  for (const label of ['Encerrar conversa', 'Chamada de API', 'Pedido', 'Captura CSAT', 'Loja física']) {
    if (!(await page.locator(`[title="Arraste para o canvas para criar um nó de ${label}"]`).count())) {
      fail(`item avançado ausente na paleta: ${label}`)
    }
  }

  // 2. Criar um nó terminal (end) e um de API
  const nodesBefore = await page.locator('.react-flow__node').count()
  await dropKind(page, 'endNode', 150)
  await dropKind(page, 'apiCallNode', 320)
  const nodesAfter = await page.locator('.react-flow__node').count()
  console.log(`nós: ${nodesBefore} -> ${nodesAfter} (esperado +2)`)
  if (nodesAfter !== nodesBefore + 2) fail('drops da paleta não criaram 2 nós')

  // 3. Exportar PNG de um fluxo COM grupos — não pode quebrar (fix de bounds)
  const pngDownload = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
  await page.locator('nav').getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('button', { name: 'Imagem PNG' }).click()
  const png = await pngDownload
  console.log(`download PNG: ${png ? png.suggestedFilename() : 'NENHUM'}`)
  if (!png) fail('export PNG não disparou download (fluxo com grupos)')
  const toast = await readToast(page)
  if (toast && /não foi possível exportar/i.test(toast)) fail(`export PNG falhou: ${toast}`)

  // 4. Exportar JSON e validar o modelo
  const exported = await exportJson(page)
  const original = JSON.parse(sample)
  console.log(`intenções: ${original.list.length} -> ${exported.list.length} (esperado +2)`)
  if (exported.list.length !== original.list.length + 2) fail('export não tem as 2 intenções criadas')

  const end = exported.list.find(i => i.conditions?.[0]?.action?.type === 'endConversation')
  const api = exported.list.find(i => i.conditions?.[0]?.action?.type === 'external')
  if (!end) fail('intenção endConversation não está no export')
  if (!api) fail('intenção external (API) não está no export')

  // 5. Filhos de grupo (::c{idx}) NÃO podem virar intenções no JSON
  if (exported.list.some(i => i.id.includes('::c'))) fail('filho de grupo vazou como intenção no JSON')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (process.exitCode !== 1) console.log('SMOKE PHASE 6 (Marco D) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
