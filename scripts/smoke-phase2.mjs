/**
 * Smoke test da Fase 2: cria um nó via drop da paleta, conecta-o a um nó
 * existente arrastando do handle de origem, deleta uma aresta com a tecla
 * Delete e valida tudo no JSON exportado.
 *
 * Uso: node scripts/smoke-phase2.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson, readToast } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5174/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01.json', import.meta.url), 'utf-8')

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))
  await loadFlow(page, baseUrl, sample)

  // 1. Paleta visível
  const paletteItems = await page.locator('[title^="Arraste para o canvas"]').count()
  console.log(`itens na paleta: ${paletteItems}`)
  // Fase 6 Marco D: a paleta passou a oferecer os 11 ActionTypes (6 de fluxo + 5 avançados).
  if (paletteItems !== 11) fail(`esperava 11 itens na paleta, veio ${paletteItems}`)

  // 2. Criar nó via evento de drop sintético no canvas
  const nodesBefore = await page.locator('.react-flow__node').count()
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', 'defaultNode')
    const canvas = document.querySelector('.react-flow')
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.x + r.width / 2, clientY: r.y + 120,
    }))
  })
  await page.waitForTimeout(300)
  const nodesAfter = await page.locator('.react-flow__node').count()
  console.log(`nós: ${nodesBefore} -> ${nodesAfter}`)
  if (nodesAfter !== nodesBefore + 1) fail('drop da paleta não criou nó')

  // 3. Conectar o nó novo a um existente: drag do handle source até outro nó
  const newNode = page.locator('.react-flow__node', { hasText: 'nova_intencao_1' })
  if (!(await newNode.count())) fail('nó criado não encontrado pelo nome')
  // Handle de FLUXO (base): desde a Fase 6 Marco B os nós têm 2 handles `.source`
  // (o de fluxo `-bottom` + o `ctx-source` `-right` da aresta de contexto), então
  // `.react-flow__handle.source` sozinho viola o strict mode. Qualifica pelo `-bottom`.
  const srcHandle = await newNode.locator('.react-flow__handle-bottom.source').boundingBox()
  // Alvo: handle target de um nó interno que NÃO sobreponha o nó recém-criado
  // (um drop sobre o nó novo seria capturado por ele, não pelo alvo)
  const targetHandle = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')]
    const fresh = nodes.find(el => el.textContent.includes('nova_intencao'))
    const fr = fresh.getBoundingClientRect()
    const overlaps = (r) => !(r.right < fr.left - 20 || r.left > fr.right + 20 || r.bottom < fr.top - 20 || r.top > fr.bottom + 20)
    for (const el of nodes) {
      if (el === fresh || el.getAttribute('data-id')?.startsWith('ext-')) continue
      // Handle de FLUXO (topo): desde a Fase 11G os nós têm um `ctx-target` (`-left`,
      // âncora de contexto) além do alvo de fluxo. O start, por ex., só tem o ctx-target
      // (nada flui PARA ele) — qualificar por `-top` evita escolhê-lo como destino.
      const h = el.querySelector('.react-flow__handle-top.target')
      if (!h) continue
      const r = el.getBoundingClientRect()
      if (overlaps(r)) continue
      const hr = h.getBoundingClientRect()
      return { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2 }
    }
    return null
  })
  if (!targetHandle) fail('nenhum nó-alvo livre encontrado')
  const edgesBefore = await page.locator('.react-flow__edge').count()
  await page.mouse.move(srcHandle.x + srcHandle.width / 2, srcHandle.y + srcHandle.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(
      srcHandle.x + (targetHandle.x - srcHandle.x) * (i / 10),
      srcHandle.y + (targetHandle.y - srcHandle.y) * (i / 10),
    )
    await page.waitForTimeout(20)
  }
  await page.mouse.up()
  await page.waitForTimeout(300)
  const edgesAfterConnect = await page.locator('.react-flow__edge').count()
  console.log(`arestas: ${edgesBefore} -> ${edgesAfterConnect} (esperado +1)`)
  if (edgesAfterConnect !== edgesBefore + 1) {
    console.log('diagnóstico (toast):', await readToast(page))
    console.log('srcHandle:', JSON.stringify(srcHandle), 'targetHandle:', JSON.stringify(targetHandle))
    fail('conexão não criou aresta')
  }

  // 4. Deletar uma aresta -next existente com a tecla Delete
  const nextEdgeId = await page.evaluate(() => {
    const e = [...document.querySelectorAll('.react-flow__edge')]
      .find(el => el.getAttribute('data-id')?.endsWith('-start-c0-next'))
    return e?.getAttribute('data-id') ?? null
  })
  console.log(`aresta a deletar: ${nextEdgeId}`)
  // Clica num ponto que está DE FATO sobre o path (o centro do bounding box
  // de um smoothstep geralmente cai fora da linha e seleciona outra coisa).
  // EVITA o meio (frac ~0.5): ali fica o botão "×" de remover (Fase 6) — clicar
  // no centro acionaria a remoção em vez de só selecionar.
  let selected = false
  for (const frac of [0.2, 0.8, 0.3, 0.7]) {
    const pt = await page.evaluate(({ id, frac }) => {
      const path = document.querySelector(`.react-flow__edge[data-id="${id}"] .react-flow__edge-path`)
      if (!path) return null
      const p = path.getPointAtLength(path.getTotalLength() * frac)
      const sp = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM())
      return { x: sp.x, y: sp.y }
    }, { id: nextEdgeId, frac })
    if (!pt) break  // aresta já removida (não deveria ocorrer aqui)
    await page.mouse.click(pt.x, pt.y)
    await page.waitForTimeout(150)
    selected = await page.evaluate(id =>
      document.querySelector(`.react-flow__edge[data-id="${id}"]`)?.classList.contains('selected') ?? false, nextEdgeId)
    if (selected) break
  }
  console.log(`aresta selecionada: ${selected}`)
  if (!selected) fail('não conseguiu selecionar a aresta para deletar')
  await page.keyboard.press('Delete')
  await page.waitForTimeout(300)
  const edgesAfterDelete = await page.locator('.react-flow__edge').count()
  console.log(`arestas após delete: ${edgesAfterDelete} (esperado -1)`)
  if (edgesAfterDelete !== edgesAfterConnect - 1) fail('Delete não removeu a aresta')

  // 5. Exportar e validar o modelo
  const exported = await exportJson(page)
  const original = JSON.parse(sample)

  const created = exported.list.find(i => i.name === 'nova_intencao_1')
  console.log(`intenção criada no export: ${created ? created.id : 'NÃO'}`)
  if (!created) fail('intenção criada não está no export')
  if (created && created.conditions[0].next?.intent?.id == null) fail('intenção criada não tem next ref após conectar')

  const startBefore = original.list.find(i => i.id.endsWith('-start'))
  const startAfter = exported.list.find(i => i.id.endsWith('-start'))
  const refRemoved = !!startBefore.conditions[0].next.intent && !startAfter.conditions[0].next.intent
  console.log(`ref do start removida no export: ${refRemoved}`)
  if (!refRemoved) fail('deleção da aresta não refletiu no modelo')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 2 OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
