/**
 * Smoke test da Fase 3b: cria nó de escolha, monta mensagem de botões + botão
 * pelo painel, conecta o botão a um nó, e exclui uma intenção pelo painel
 * validando a limpeza de referências no JSON exportado.
 *
 * Uso: node scripts/smoke-phase3b.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'

const baseUrl = process.argv[2] ?? 'http://localhost:5174/Fluxo-Bot/'
const sample = readFileSync(new URL('../samples/sample01.json', import.meta.url), 'utf-8')

function fail(msg) {
  console.error(`FALHOU: ${msg}`)
  process.exitCode = 1
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('pageerror', err => console.log('[pageerror]', err.message))
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('textarea').fill(sample)
  await page.getByRole('button', { name: /gerar fluxo/i }).click()
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(800)

  // 1. Cria nó de escolha num espaço livre (canto inferior direito)
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', 'choiceNode')
    const canvas = document.querySelector('.react-flow')
    const r = canvas.getBoundingClientRect()
    // centro-inferior: livre de MiniMap (canto inf. direito) e Controls (inf. esquerdo)
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.x + r.width * 0.45, clientY: r.y + r.height - 160,
    }))
  })
  await page.waitForTimeout(300)

  // 2. Abre o painel e monta mensagem de botões + botão
  await page.locator('.react-flow__node', { hasText: 'nova_intencao_1' }).click()
  await page.waitForSelector('text=Aplicar alterações')
  await page.getByRole('button', { name: '+ Criar mensagem de botões' }).click()
  await page.getByPlaceholder('Texto que acompanha os botões…').fill('Escolha uma opção:')
  await page.getByRole('button', { name: '+ Adicionar botão' }).click()
  await page.getByPlaceholder('Texto do botão').fill('Falar com atendente')
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(300)
  const panelErr = await page.evaluate(() =>
    document.body.innerText.match(/Falha ao aplicar[^\n]*/)?.[0] ?? null)
  if (panelErr) fail(`painel: ${panelErr}`)
  await page.getByLabel('Fechar').click()

  // A vítima da exclusão é escolhida ANTES para o connect não apontar para ela
  const original = JSON.parse(sample)
  const inboundIds = new Set()
  for (const i of original.list) {
    for (const c of i.conditions) {
      if (c.next?.intent?.id) inboundIds.add(c.next.intent.id)
    }
  }
  const victimId = [...inboundIds].find(id => original.list.some(i => i.id === id && i.category !== 'start'))

  // 3. Conecta o botão (slot vazio) a um nó livre (≠ vítima)
  const newNode = page.locator('.react-flow__node', { hasText: 'nova_intencao_1' })
  const srcHandle = await newNode.locator('.react-flow__handle.source').boundingBox()
  const targetHandle = await page.evaluate((excludeId) => {
    const nodes = [...document.querySelectorAll('.react-flow__node')]
    const fresh = nodes.find(el => el.textContent.includes('nova_intencao'))
    const fr = fresh.getBoundingClientRect()
    const overlaps = r => !(r.right < fr.left - 20 || r.left > fr.right + 20 || r.bottom < fr.top - 20 || r.top > fr.bottom + 20)
    for (const el of nodes) {
      const id = el.getAttribute('data-id')
      if (el === fresh || id === excludeId || id?.startsWith('ext-')) continue
      const h = el.querySelector('.react-flow__handle.target')
      if (!h) continue
      if (overlaps(el.getBoundingClientRect())) continue
      const hr = h.getBoundingClientRect()
      if (hr.y < 60) continue
      return { x: hr.x + hr.width / 2, y: hr.y + hr.height / 2, node: id }
    }
    return null
  }, victimId)
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

  const newNodeId = await newNode.getAttribute('data-id')
  const choiceEdgeLabel = await page.evaluate((srcId) => {
    const edge = [...document.querySelectorAll('.react-flow__edge')]
      .find(e => e.getAttribute('data-id') === `${srcId}-c0-ch0`)
    return edge ? edge.textContent.trim() : null
  }, newNodeId)
  console.log(`aresta de escolha criada com label: "${choiceEdgeLabel}"`)
  if (choiceEdgeLabel !== 'Falar com atendente') fail('conexão do botão não criou aresta com o label esperado')

  // 4. Exclui uma intenção que tem referências de entrada, pelo painel
  console.log('vítima:', victimId)
  await page.locator(`.react-flow__node[data-id="${victimId}"]`).click()
  await page.waitForSelector('text=Excluir intenção')
  await page.getByRole('button', { name: 'Excluir intenção' }).click()
  await page.waitForTimeout(300)
  const victimGone = (await page.locator(`.react-flow__node[data-id="${victimId}"]`).count()) === 0
  console.log('nó excluído do canvas:', victimGone)
  if (!victimGone) fail('nó não sumiu do canvas')

  // 5. Exporta e valida tudo
  const downloadPromise = page.waitForEvent('download')
  await page.getByTitle('Exportar o JSON do fluxo (inclui edições de conexões)').click()
  const exported = JSON.parse(readFileSync(await (await downloadPromise).path(), 'utf-8'))

  const choiceIntent = exported.list.find(i => i.name === 'nova_intencao_1')
  const btns = choiceIntent?.conditions[0]?.assistant_says[0]?.messages[0]?.messageConfig?.buttons ?? []
  const choices = choiceIntent?.conditions[0]?.action?.choices ?? []
  console.log(`export: botões=${btns.map(b => b.text)}, choices=${JSON.stringify(choices)}`)
  if (btns[0]?.text !== 'Falar com atendente') fail('botão não está no export')
  if (choices[0] !== targetHandle.node) fail('choice não aponta para o nó conectado')

  if (exported.list.some(i => i.id === victimId)) fail('vítima ainda está no export')
  if (JSON.stringify(exported).includes(victimId)) fail('ainda há referências à vítima no export')
  console.log('vítima e referências limpas no export: true')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 3B OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
