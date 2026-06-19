/**
 * Smoke test da Fase 3b (atualizado p/ Fase 10c): cria nó de Escolha, monta o
 * Menu (Botão/Lista) com 1 item, define o destino da Escolha pelo dropdown da
 * seção "Escolhas" (liga por ordem ao item do menu), confere a aresta de escolha
 * resultante no canvas, e exclui uma intenção pelo painel validando a limpeza de
 * referências no JSON exportado.
 *
 * Uso: node scripts/smoke-phase3b.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson } from './lib/loadFlow.mjs'

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

  // Alvos calculados a partir do sample: a vítima (tem refs de entrada, ≠ start) e
  // o destino da Escolha (≠ vítima, ≠ start) — para a exclusão não derrubar a aresta.
  const original = JSON.parse(sample)
  const inboundIds = new Set()
  for (const i of original.list)
    for (const c of i.conditions)
      if (c.next?.intent?.id) inboundIds.add(c.next.intent.id)
  const victimId = [...inboundIds].find(id => original.list.some(i => i.id === id && i.category !== 'start'))
  const targetId = original.list.find(i => i.category !== 'start' && !i.id.endsWith('-start') && i.id !== victimId)?.id
  if (!victimId || !targetId) { fail('sample sem vítima/destino adequados'); throw new Error('sem alvos') }

  // 1. Cria nó de escolha num espaço livre (centro-inferior)
  await page.evaluate(() => {
    const dt = new DataTransfer()
    dt.setData('application/fluxo-node-kind', 'choiceNode')
    const canvas = document.querySelector('.react-flow')
    const r = canvas.getBoundingClientRect()
    canvas.dispatchEvent(new DragEvent('drop', {
      bubbles: true, cancelable: true, dataTransfer: dt,
      clientX: r.x + r.width * 0.45, clientY: r.y + r.height - 160,
    }))
  })
  await page.waitForTimeout(300)

  // 2. Abre o painel: cria o Menu (Botão/Lista) com 1 item e uma Escolha com destino
  const newNode = page.locator('.react-flow__node', { hasText: 'nova_intencao_1' })
  await newNode.click()
  await page.waitForSelector('text=Aplicar alterações')
  // Menu (Fase 10c): nasce com 1 item; corpo é obrigatório.
  await page.getByRole('button', { name: '+ Criar menu Botão/Lista' }).click()
  await page.getByPlaceholder('Mensagem principal (obrigatório)').fill('Escolha uma opção:')
  await page.getByPlaceholder('Texto do item').first().fill('Falar com atendente')
  // Escolha: "+ Adicionar Escolha" cria o slot ligado ao 1º item; destino via dropdown.
  await page.getByRole('button', { name: '+ Adicionar Escolha' }).click()
  // O IntentSelect da Escolha é o único <select> com a opção "Sem destino (palavra-chave)".
  const choiceSelect = page.locator('select').filter({ has: page.locator('option:has-text("Sem destino (palavra-chave)")') }).first()
  await choiceSelect.selectOption(targetId)
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(300)
  const panelErr = await page.evaluate(() =>
    document.body.innerText.match(/Falha ao aplicar[^\n]*/)?.[0] ?? null)
  if (panelErr) fail(`painel: ${panelErr}`)
  await page.getByLabel('Fechar').click()

  // 3. A aresta de escolha (slot 0) deve existir com o label do item do menu
  const newNodeId = await newNode.getAttribute('data-id')
  const choiceEdgeLabel = await page.evaluate((srcId) => {
    const el = document.querySelector(`[data-edge-id="${srcId}-c0-ch0"] .react-flow__edge-label`)
    return el ? el.textContent.trim() : null
  }, newNodeId)
  console.log(`aresta de escolha criada com label: "${choiceEdgeLabel}"`)
  if (choiceEdgeLabel !== 'Falar com atendente') fail('escolha não criou aresta com o label esperado')

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
  const exported = await exportJson(page)

  const choiceIntent = exported.list.find(i => i.name === 'nova_intencao_1')
  const btns = choiceIntent?.conditions[0]?.assistant_says[0]?.messages[0]?.messageConfig?.buttons ?? []
  const choices = choiceIntent?.conditions[0]?.action?.choices ?? []
  console.log(`export: botões=${btns.map(b => b.text)}, choices=${JSON.stringify(choices)}`)
  if (btns[0]?.text !== 'Falar com atendente') fail('item do menu não está no export')
  if (choices[0] !== targetId) fail('choice não aponta para o destino selecionado')

  if (exported.list.some(i => i.id === victimId)) fail('vítima ainda está no export')
  if (JSON.stringify(exported).includes(victimId)) fail('ainda há referências à vítima no export')
  console.log('vítima e referências limpas no export: true')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 3B OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
