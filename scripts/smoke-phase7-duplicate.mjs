/**
 * Smoke da Fase 7 (duplicação de nós). Cobre as 3 formas, sem tocar API:
 *  (a) botão "Duplicar dentro da intenção" num nó solto → +1 condição (vira grupo),
 *      sem criar intenção nova;
 *  (b) botão "Duplicar fora da intenção" numa condição-filha → +1 intenção;
 *  (c) Ctrl+arrastar um nó solto → +1 intenção, com o original permanecendo;
 *  (d) IDs de botão sem colisão e export sem erro de validação.
 *
 * Uso: node scripts/smoke-phase7-duplicate.mjs [url]
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

/** IDs de todos os botões (BUTTON/LIST) de um fluxo exportado. */
function allButtonIds(flow) {
  const ids = []
  for (const intent of flow.list)
    for (const cond of intent.conditions)
      for (const say of cond.assistant_says)
        for (const msg of say.messages)
          for (const b of msg.messageConfig?.buttons ?? []) ids.push(b.id)
  return ids
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
  const soloA = solos[0]  // alvo do "duplicar dentro"
  const soloB = solos[1]  // alvo do Ctrl+arrastar

  // ── (a) Duplicar dentro da intenção (nó solto → grupo) ──────────────────────
  await page.locator(`.react-flow__node[data-id="${soloA.id}"]`).click()
  await page.waitForSelector('[data-testid="detail-panel"]')
  await page.locator('[data-testid="detail-panel"]').getByRole('button', { name: 'Duplicar Condição' }).click()
  await page.waitForTimeout(400)
  const afterIn = await exportJson(page)
  if (afterIn.list.length !== before.list.length) fail('(a) duplicar-dentro criou intenção nova')
  const grownA = afterIn.list.find(i => i.id === soloA.id)
  console.log(`(a) condições de ${soloA.name}: 1 -> ${grownA?.conditions.length} (esperado 2)`)
  if (grownA?.conditions.length !== 2) fail('(a) intenção não ganhou a 2ª condição')

  // ── (b) Duplicar fora da intenção (condição-filha → intenção nova) ──────────
  await page.locator(`.react-flow__node[data-id="${soloA.id}::c1"]`).click()
  await page.waitForSelector('[data-testid="detail-panel"]')
  await page.locator('[data-testid="detail-panel"]').getByRole('button', { name: 'Duplicar Intenção', exact: true }).click()
  await page.waitForTimeout(400)
  const afterOut = await exportJson(page)
  console.log(`(b) intenções: ${afterIn.list.length} -> ${afterOut.list.length} (esperado +1)`)
  if (afterOut.list.length !== afterIn.list.length + 1) fail('(b) duplicar-fora não criou intenção nova')

  // ── (c) Ctrl+arrastar um nó solto → duplica a intenção ──────────────────────
  const box = await page.locator(`.react-flow__node[data-id="${soloB.id}"]`).boundingBox()
  if (!box) { fail('(c) nó solto B não renderizou'); throw new Error('sem nó B') }
  const sx = box.x + box.width / 2, sy = box.y + box.height / 2
  const tx = Math.min(sx + 240, 1200), ty = Math.min(sy + 80, 760) // longe do minimap/paleta
  await page.keyboard.down('Control')
  await page.mouse.move(sx, sy)
  await page.mouse.down()
  await page.mouse.move(tx, ty, { steps: 12 })
  await page.mouse.up()
  await page.keyboard.up('Control')
  await page.waitForTimeout(400)
  const afterDrag = await exportJson(page)
  console.log(`(c) intenções: ${afterOut.list.length} -> ${afterDrag.list.length} (esperado +1)`)
  if (afterDrag.list.length !== afterOut.list.length + 1) fail('(c) Ctrl+arrastar não duplicou a intenção')
  if (!afterDrag.list.some(i => i.id === soloB.id)) fail('(c) intenção original sumiu após Ctrl+arrastar')

  // ── (d) IDs de botão sem colisão ────────────────────────────────────────────
  const ids = allButtonIds(afterDrag)
  const unique = new Set(ids)
  console.log(`(d) botões: ${ids.length} ids, ${unique.size} únicos`)
  if (ids.length !== unique.size) fail('(d) IDs de botão colidiram após duplicação')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (process.exitCode !== 1) console.log('SMOKE PHASE 7 (duplicação de nós) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
