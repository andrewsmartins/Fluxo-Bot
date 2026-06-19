/**
 * Validação do Marco C (Fase 6): o DetailPanel em dois modos.
 * - Clicar no GRUPO edita a meta da intenção (Geral com Prioridade + Contexto).
 * - Clicar num FILHO edita a condição (seção "Gatilho da condição" + mensagens).
 * Aplica uma edição em cada modo e confere o efeito. Sem API.
 *
 * Uso: node scripts/smoke-phase6-edit.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01-v2.json', import.meta.url), 'utf-8')
const CONFIRMAR_NOME = '0138d0b0-74c8-432d-b33a-5553456c2195' // grupo, 2 condições

let failed = false
function fail(msg) { console.error(`FALHOU: ${msg}`); failed = true }

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, sample)

  // ── Modo CONDIÇÃO: clica num filho (sem painel aberto cobrindo) ──
  await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}::c0"]`).click()
  await page.waitForTimeout(250)
  let panel = await page.evaluate(() => document.body.innerText)
  if (!/Gatilho da condição/i.test(panel)) fail('modo condição não mostrou o editor de gatilho')
  if (/Prioridade/.test(panel)) fail('modo condição não deveria mostrar a meta (Prioridade)')
  const applyVisible = await page.getByRole('button', { name: 'Aplicar alterações' }).isVisible()
  if (!applyVisible) fail('botão Aplicar ausente no modo condição')

  // Aplica sem mudanças não deve quebrar (re-parse preservando posições)
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(300)
  const stillThere = await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}::c0"]`).count()
  if (stillThere !== 1) fail('o nó-condição sumiu após aplicar sem mudanças')

  // Deseleciona (fecha o painel) clicando numa área vazia do canvas, longe da paleta
  await page.locator('.react-flow__pane').click({ position: { x: 900, y: 700 } })
  await page.waitForTimeout(200)

  // ── Modo GRUPO: clica no cabeçalho (topo do container, fora dos filhos) ──
  await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}"]`).click({ position: { x: 40, y: 10 } })
  await page.waitForTimeout(250)
  panel = await page.evaluate(() => document.body.innerText)
  if (!/Prioridade/.test(panel) || !/Contexto/.test(panel)) {
    fail('modo grupo não mostrou os campos de meta (Prioridade/Contexto)')
  }
  if (/Gatilho da condição/i.test(panel)) fail('modo grupo não deveria mostrar editor de condição')

  // Edita o nome da intenção (primeiro input do painel) e aplica
  const firstInput = page.locator('.absolute.right-0 input').first()
  await firstInput.fill('Confirmar_nome_EDIT')
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(300)
  const groupText = await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}"]`).innerText()
  if (!/Confirmar_nome_EDIT/.test(groupText)) fail('edição de nome no modo grupo não refletiu no cabeçalho')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (!failed) console.log('VALIDAÇÃO MARCO C OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
