/**
 * Smoke test da Fase 3: abre o painel de um nó, edita nome/mensagem/botão,
 * aplica e valida no canvas (nome do nó, label da aresta) e no JSON exportado.
 *
 * Uso: node scripts/smoke-phase3.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson } from './lib/loadFlow.mjs'

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
  await loadFlow(page, baseUrl, sample)

  // Abre o painel de um nó SOLO com mensagem de texto (editável via textarea).
  // (Antes mirava um nó de escolha + botão; na Fase 10c botões viraram "Escolhas"
  //  e a mensagem do choice é Botão/Lista, sem textarea — o phase3b cobre escolhas.)
  const target = JSON.parse(sample).list.find(i =>
    i.category !== 'start' && !i.id.endsWith('-start') &&
    i.conditions.length === 1 &&
    (i.conditions[0].assistant_says ?? []).some(s => (s.messages ?? []).some(m => m.type === 'TEXT')))
  const targetId = target?.id
  console.log('nó escolhido:', target?.name, targetId)
  if (!targetId) { fail('sample sem nó solo com mensagem TEXT'); throw new Error('sem alvo') }
  await page.locator(`.react-flow__node[data-id="${targetId}"]`).click()
  await page.waitForSelector('text=Aplicar alterações')

  // Edita nome e a primeira mensagem (textarea do painel)
  const nameInput = page.locator('label:has-text("Nome") input').first()
  await nameInput.fill('editado_pelo_fluxo')
  const firstMsg = page.locator('[data-testid="detail-panel"] textarea').first()
  await firstMsg.fill('Mensagem editada pelo Fluxo!')

  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(400)

  // Nome refletiu no nó do canvas?
  const nodeText = await page.locator(`.react-flow__node[data-id="${targetId}"]`).innerText()
  console.log('nome no canvas atualizado:', nodeText.includes('editado_pelo_fluxo'))
  if (!nodeText.includes('editado_pelo_fluxo')) fail('nome não refletiu no nó')

  // Exporta pela toolbar (não é mais coberta pelo painel) e confere o modelo
  const exported = await exportJson(page)
  const edited = exported.list.find(i => i.id === targetId)
  console.log('nome no export:', edited?.name)
  if (edited?.name !== 'editado_pelo_fluxo') fail('nome não está no export')

  const texts = JSON.stringify(edited)
  if (!texts.includes('Mensagem editada pelo Fluxo!')) fail('mensagem editada não está no export')

  // Demais intenções intactas
  const original = JSON.parse(sample)
  const untouchedBefore = original.list.filter(i => i.id !== targetId)
  const untouchedAfter = exported.list.filter(i => i.id !== targetId)
  const intact = JSON.stringify(untouchedBefore) === JSON.stringify(untouchedAfter)
  console.log('demais intenções intactas:', intact)
  if (!intact) fail('edição vazou para outras intenções')

  if (process.exitCode !== 1) console.log('SMOKE PHASE 3 OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
