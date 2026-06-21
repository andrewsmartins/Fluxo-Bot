/**
 * Validação da Fase 13 (UX do picker de variáveis @) na UI real — SEM tocar a API.
 * Regressão central: clicar num item com modificadores (#) grava a BASE em UM clique
 * (antes exigia duplo-clique). Também cobre: o "#" abre os modificadores; categoria
 * com campos só navega; namespace livre grava no clique; hover navega entre colunas.
 *
 * Uso (PowerShell):
 *   node scripts/smoke-phase13-variable-picker.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01-v2.json', import.meta.url), 'utf-8')
const MESSAGE_NODE = '56de7e03-b998-4bad-972f-a4d829b2715c' // nó solo com mensagem TEXT (aguardar_atendente)

let failed = false
function fail(msg) { console.error(`FALHOU: ${msg}`); failed = true }
function ok(msg) { console.log(`  ok: ${msg}`) }

/** Clica o botão PRINCIPAL de uma linha cujo rótulo (sem "›") é exatamente `label`. */
function clickMain(page, label) {
  return page.evaluate((lbl) => {
    for (const li of document.querySelectorAll('li')) {
      const b = li.querySelector(':scope > button')
      if (b && b.textContent.replace('›', '').trim() === lbl) { b.click(); return true }
    }
    return false
  }, label)
}

/** Clica o afford. "#" de uma linha cujo rótulo principal é `label`. */
function clickHash(page, label) {
  return page.evaluate((lbl) => {
    for (const li of document.querySelectorAll('li')) {
      const btns = li.querySelectorAll(':scope > button')
      if (btns.length >= 2 && btns[0].textContent.replace('›', '').trim() === lbl && btns[1].textContent.trim() === '#') {
        btns[1].click(); return true
      }
    }
    return false
  }, label)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, sample)

  await page.locator(`.react-flow__node[data-id="${MESSAGE_NODE}"]`).click()
  await page.waitForTimeout(250)
  const ta = page.locator('[data-testid="detail-panel"] textarea').first()
  if (await ta.count() === 0) { fail('nó não expôs textarea de mensagem'); throw new Error('sem textarea') }

  // Abre o picker no textarea (digita '@'); devolve true se o menu apareceu.
  async function openMenu() {
    await ta.fill('')
    await ta.focus()
    await ta.type('@')
    await page.waitForTimeout(150)
  }

  // ── Teste A: item com # grava a BASE em 1 clique (regressão central) ─────────
  await openMenu()
  if (!(await clickMain(page, 'Consumidor'))) fail('categoria "Consumidor" não encontrada')
  await page.waitForTimeout(120)
  if (!(await clickMain(page, 'Nome'))) fail('item "Nome" não encontrado')
  await page.waitForTimeout(150)
  let v = await ta.inputValue()
  if (v.trim() !== '@customer.name') fail(`A: esperava "@customer.name", veio "${v.trim()}"`)
  else ok('item com # grava a base em 1 clique (@customer.name)')

  // ── Teste B: o "#" abre os modificadores e grava base+sufixo ─────────────────
  await openMenu()
  await clickMain(page, 'Consumidor')
  await page.waitForTimeout(120)
  if (!(await clickHash(page, 'Nome'))) fail('B: afford. "#" da linha "Nome" não encontrado')
  await page.waitForTimeout(120)
  if (!(await clickMain(page, 'Texto normalizado'))) fail('B: modificador "Texto normalizado" não apareceu')
  await page.waitForTimeout(150)
  v = await ta.inputValue()
  if (v.trim() !== '@customer.name#normalizeQuery') fail(`B: esperava "@customer.name#normalizeQuery", veio "${v.trim()}"`)
  else ok('"#" abre modificadores e grava base+sufixo')

  // ── Teste C: categoria com campos só NAVEGA (não grava) ──────────────────────
  await openMenu()
  await clickMain(page, 'Consumidor')
  await page.waitForTimeout(120)
  v = await ta.inputValue()
  if (v.trim() !== '@') fail(`C: categoria gravou em vez de navegar (veio "${v.trim()}")`)
  else ok('categoria com campos só navega (textarea continua "@")')
  // confirma que a coluna de itens abriu
  const itemsVisible = await page.evaluate(() => [...document.querySelectorAll('li > button')].some(b => b.textContent.includes('Sobrenome')))
  if (!itemsVisible) fail('C: coluna de itens não abriu ao navegar')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(100)

  // ── Teste D: namespace livre grava no clique ─────────────────────────────────
  await openMenu()
  if (!(await clickMain(page, 'API'))) fail('categoria "API" (namespace livre) não encontrada')
  await page.waitForTimeout(150)
  v = await ta.inputValue()
  if (v.trim() !== '@api') fail(`D: esperava "@api", veio "${v.trim()}"`)
  else ok('namespace livre grava no clique (@api)')

  // ── Teste F: caixa MÓVEL ancorada no campo (não reserva largura máxima) ───────
  await openMenu()
  const offsets = await page.evaluate(() => {
    const field = document.querySelector('[data-testid="detail-panel"] textarea')
    const menu = document.querySelector('body > div.fixed.z-50.flex')
    if (!field || !menu) return null
    return { fieldLeft: field.getBoundingClientRect().left, menuLeft: menu.getBoundingClientRect().left }
  })
  if (!offsets) fail('F: não localizei campo/menu para medir a posição')
  else if (Math.abs(offsets.menuLeft - offsets.fieldLeft) > 40) {
    fail(`F: menu não ancorou no campo (fieldLeft=${offsets.fieldLeft|0}, menuLeft=${offsets.menuLeft|0})`)
  } else ok(`caixa ancorada no campo (Δleft=${Math.abs(offsets.menuLeft - offsets.fieldLeft)|0}px)`)
  await page.keyboard.press('Escape')

  // ── Teste E: hover navega entre colunas ──────────────────────────────────────
  // Usa o hover REAL do Playwright: o React deriva onMouseEnter de mouseover
  // delegado, então um mouseenter sintético via dispatchEvent não dispara.
  await openMenu()
  await page.locator('li > button').filter({ hasText: 'Bot' }).first().hover()
  await page.waitForTimeout(150)
  const botFieldVisible = await page.evaluate(() => [...document.querySelectorAll('li > button')].some(b => b.textContent.includes('Aberto Agora')))
  if (!botFieldVisible) fail('E: hover na categoria "Bot" não abriu os campos')
  else ok('hover navega entre colunas (campos do Bot apareceram)')
  await page.keyboard.press('Escape')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (!failed) console.log('VALIDAÇÃO FASE 13 (picker de variáveis) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
