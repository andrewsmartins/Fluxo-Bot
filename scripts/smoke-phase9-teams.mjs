/**
 * Validação da Fase 9 (variável dinâmica @team) na UI real.
 * Carrega o fluxo do bot de testes, define o token GLOBAL na barra, abre o picker
 * de variáveis numa mensagem, navega Categoria "Time" → "Carregar times…" →
 * escolhe um time real → campo "Aberto Agora", e confere que o token gravado é
 * `@team.{id}.isOpenNow`. TOCA A API REAL (times) — precisa de OMNI_TOKEN.
 *
 * Uso (PowerShell):
 *   $env:OMNI_TOKEN = 'r:...'   # ou deixe o flow-viewer.env e carregue antes
 *   node scripts/smoke-phase9-teams.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01-v2.json', import.meta.url), 'utf-8')
const MESSAGE_NODE = '56de7e03-b998-4bad-972f-a4d829b2715c' // nó solo com mensagem TEXT (aguardar_atendente)
const token = process.env.OMNI_TOKEN

let failed = false
function fail(msg) { console.error(`FALHOU: ${msg}`); failed = true }

if (!token) {
  console.error("Defina o token antes:  $env:OMNI_TOKEN = 'r:...'")
  process.exit(1)
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, sample)

  // ── Token GLOBAL na barra ──────────────────────────────────────────────────
  await page.locator('nav').getByRole('button', { name: 'Token' }).click()
  await page.locator('nav input[type="password"]').fill(token)
  if (!(await page.locator('nav input[type="password"]').inputValue())) fail('token não preencheu')
  // Fecha o popover clicando fora
  await page.locator('.react-flow__pane').click({ position: { x: 900, y: 700 } })
  await page.waitForTimeout(150)

  // ── Abre o painel do nó e o picker numa mensagem ────────────────────────────
  await page.locator(`.react-flow__node[data-id="${MESSAGE_NODE}"]`).click()
  await page.waitForTimeout(250)
  const ta = page.locator('[data-testid="detail-panel"] textarea').first()
  if (await ta.count() === 0) fail('nó não expôs textarea de mensagem')
  await ta.focus()
  await ta.type('@')
  await page.waitForTimeout(150)

  // ── Navega até Time: com token definido, os times carregam sozinhos ─────────
  await page.getByRole('button', { name: /^Time/ }).click()
  // Espera a lista (algum botão de time com " ›") aparecer — toca a API real.
  await page.waitForFunction(() => {
    const txt = document.body.innerText
    return /Carregando/.test(txt) === false && (/›/.test(txt))
  }, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(500)

  // Os botões de time terminam com " ›"; pega o primeiro abaixo do header "Times da loja".
  const teamButtons = page.locator('button', { hasText: '›' })
  const count = await teamButtons.count()
  if (count === 0) fail('nenhum time carregado na coluna (verifique token/CORS)')

  // Clica o primeiro time real (que não seja uma categoria do nível 1).
  // As categorias (Consumidor, Bot, Time…) também têm "›"; filtramos pelo texto conhecido.
  const teamName = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('button')]
    const header = btns.findIndex(b => false) // placeholder
    void header
    // Acha o header "Times da loja" e pega o próximo botão de time.
    const lis = [...document.querySelectorAll('li')]
    const hi = lis.findIndex(li => /Times da loja/.test(li.textContent || ''))
    for (let i = hi + 1; i < lis.length; i++) {
      const b = lis[i].querySelector('button')
      if (b && /›/.test(b.textContent || '') && !/Carregar/.test(b.textContent || '')) return b.textContent.replace('›', '').trim()
    }
    return null
  })
  if (!teamName) { fail('não achei um botão de time sob "Times da loja"'); throw new Error('sem time') }
  console.log(`  time encontrado: ${teamName}`)
  await page.getByRole('button', { name: new RegExp(`^${teamName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }).first().click()

  // Campo "Aberto Agora" (folha) → grava @team.{id}.isOpenNow
  await page.getByRole('button', { name: 'Aberto Agora' }).click()
  await page.waitForTimeout(200)

  const value = await ta.inputValue()
  if (!/@team\.[A-Za-z0-9]+\.isOpenNow/.test(value)) {
    fail(`token gravado não bate: "${value}"`)
  } else {
    console.log(`  token gravado: ${value.trim()}`)
  }

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (!failed) console.log('VALIDAÇÃO FASE 9 (variável @team) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
