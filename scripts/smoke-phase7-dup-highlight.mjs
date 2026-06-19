/**
 * Smoke do feedback visual da duplicação (Fase 7, polish). Sem API.
 *  (a) Duplicar por botão ("Duplicar intenção") destaca o nó recém-criado
 *      (classe `fluxo-dup`); clicar nele REMOVE o destaque.
 *  (b) Ctrl+arrastar (com a cópia nascendo no início do gesto) ainda gera +1
 *      intenção e, ao soltar, NÃO deixa nenhum nó destacado.
 *
 * A animação em si (marching ants / arestas) é verificação visual manual.
 *
 * Uso: node scripts/smoke-phase7-dup-highlight.mjs [url]
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

  const before = await exportJson(page)
  const solos = before.list.filter(i => i.conditions.length === 1 && i.category !== 'start' && !i.id.endsWith('-start'))
  if (solos.length < 2) { fail('preciso de 2 intenções solo no sample'); throw new Error('sem alvos') }
  const soloA = solos[0]  // duplicar por botão
  const soloB = solos[1]  // Ctrl+arrastar

  // ── (a) Botão "Duplicar intenção" destaca a cópia; clicar limpa ─────────────
  await page.locator(`.react-flow__node[data-id="${soloA.id}"]`).click()
  await page.waitForSelector('[data-testid="detail-panel"]')
  await page.locator('[data-testid="detail-panel"]').getByRole('button', { name: 'Duplicar Intenção', exact: true }).click()
  await page.waitForTimeout(400)

  const highlighted = page.locator('.react-flow__node.fluxo-dup')
  const hlCount = await highlighted.count()
  console.log(`(a) nós destacados após duplicar: ${hlCount} (esperado 1)`)
  if (hlCount !== 1) fail('(a) cópia por botão não recebeu o destaque fluxo-dup')
  const dupId = await highlighted.first().getAttribute('data-id')
  if (dupId === soloA.id) fail('(a) o destaque ficou no original, não na cópia')

  // clicar no nó destacado deve LIMPAR o destaque
  await page.locator(`.react-flow__node[data-id="${dupId}"]`).click()
  await page.waitForTimeout(200)
  const afterClick = await page.locator('.react-flow__node.fluxo-dup').count()
  console.log(`(a) nós destacados após clicar na cópia: ${afterClick} (esperado 0)`)
  if (afterClick !== 0) fail('(a) destaque não sumiu ao clicar na cópia')

  // ── (b) Ctrl+arrastar: +1 intenção e sem destaque remanescente ──────────────
  const box = await page.locator(`.react-flow__node[data-id="${soloB.id}"]`).boundingBox()
  if (!box) { fail('(b) nó solto B não renderizou'); throw new Error('sem nó B') }
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2
  const tx = Math.min(sx + 240, 1200), ty = Math.min(sy + 80, 760)
  await page.keyboard.down('Control')
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(tx, ty, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up('Control')
  await page.waitForTimeout(400)

  const afterDrag = await exportJson(page)
  console.log(`(b) intenções: ${before.list.length + 1} -> ${afterDrag.list.length} (esperado +2 no total)`)
  if (afterDrag.list.length !== before.list.length + 2) fail('(b) total de intenções inesperado (botão + Ctrl = +2)')
  const stillHighlighted = await page.locator('.react-flow__node.fluxo-dup').count()
  console.log(`(b) nós destacados após soltar: ${stillHighlighted} (esperado 0)`)
  if (stillHighlighted !== 0) fail('(b) destaque não voltou ao normal ao soltar')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (process.exitCode !== 1) console.log('SMOKE PHASE 7 (feedback visual da duplicação) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
