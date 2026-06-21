/**
 * Smoke test da Fase 12: resposta "Modelo de mensagem com Flow" (TEMPLATE).
 *
 * NÃO TOCA A API REAL — `window.fetch` é interceptado por `addInitScript` e devolve
 * um servidor falso (GET /v2/bots → loja; POST findMessageTemplates → 1 modelo com
 * Flow). Cobre o fluxo ponta a ponta na UI: adicionar resposta → escolher modelo →
 * preencher a variável → preview → salvar → aplicar → conferir a serialização no
 * export JSON → editar (trocar valor) → excluir.
 *
 * Uso: node scripts/smoke-phase12-template.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow, exportJson } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01-v2.json', import.meta.url), 'utf-8')
const BOT_ID = '2a3859ff-62d5-4c01-ae60-6ae2f812e786'
const MESSAGE_NODE = '56de7e03-b998-4bad-972f-a4d829b2715c' // nó solo com mensagem TEXT
const TOKEN = 'r:SMOKE_SECRET_TOKEN_NAO_DEVE_VAZAR'

let failed = false
function fail(msg) { console.error(`FALHOU: ${msg}`); failed = true }

/** Localiza a mensagem TEMPLATE no JSON exportado (varre intents → conditions → says). */
function findTemplate(json, intentId) {
  const intent = json.list.find(i => i.id === intentId)
  for (const cond of intent?.conditions ?? []) {
    for (const say of cond.assistant_says ?? []) {
      const m = (say.messages ?? []).find(msg => msg.type === 'TEMPLATE')
      if (m) return m
    }
  }
  return null
}

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))

  // Servidor falso ANTES de carregar a app: bots + findMessageTemplates, sem rede.
  await page.addInitScript((botId) => {
    window.__tplCalls = []
    const realFetch = window.fetch
    window.fetch = async (url, init = {}) => {
      const u = String(url)
      const method = init.method || 'GET'
      window.__tplCalls.push({ url: u, method, body: init.body || null })
      const json = (obj, status = 200) =>
        new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } })
      if (u.includes('/v2/bots')) return json({ list: [{ botId, retailerId: 'RET123' }] })
      if (u.includes('findMessageTemplates')) return json({ result: [
        {
          objectId: 'mt-001', title: 'Pedido confirmado', text: 'Olá {{1}}, seu pedido foi recebido!',
          status: 'READY', type: 'CUSTOM', userVisible: true,
          components: [
            { type: 'BODY', text: 'Olá {{1}}, seu pedido foi recebido!', examples: ['João'] },
            { type: 'BUTTONS', buttons: [{ text: 'Abrir formulário', type: 'FLOW', flow_id: 'f1', flow_action: 'navigate' }] },
          ],
        },
        { // modelo SEM Flow — deve ser filtrado fora do picker
          objectId: 'p-1', title: 'Promo sem flow', text: 'Oferta {{1}}', status: 'READY', type: 'MARKETING', userVisible: true,
          components: [{ type: 'BODY', text: 'Oferta {{1}}', examples: ['10%'] }, { type: 'BUTTONS', buttons: [{ text: 'Ver', type: 'URL', url: 'https://x' }] }],
        },
      ] })
      return realFetch ? realFetch(url, init) : json({})
    }
  }, BOT_ID)

  await loadFlow(page, baseUrl, sample)

  // ── Token GLOBAL na barra (o picker carrega os modelos sozinho) ──
  await page.locator('nav').getByRole('button', { name: 'Token' }).click()
  await page.locator('nav input[type="password"]').fill(TOKEN)
  await page.locator('.react-flow__pane').click({ position: { x: 900, y: 700 } })
  await page.waitForTimeout(150)

  // ── Abre o painel do nó de mensagem e adiciona uma resposta TEMPLATE ──
  await page.locator(`.react-flow__node[data-id="${MESSAGE_NODE}"]`).click()
  await page.waitForTimeout(250)
  await page.getByRole('button', { name: '+ Adicionar Resposta' }).click()
  await page.getByRole('button', { name: /Modelo de mensagem com Flow/ }).click()
  await page.waitForTimeout(300)

  // Abre o dropdown do picker (gatilho "Selecionar modelo…")
  await page.getByRole('button', { name: /Selecionar modelo/ }).click()
  // Dropdown carregado: só o modelo COM Flow aparece (o sem-flow foi filtrado)
  await page.waitForFunction(() => /Pedido confirmado/.test(document.body.innerText), { timeout: 8000 })
    .catch(() => fail('dropdown não listou o modelo com Flow'))
  if (/Promo sem flow/.test(await page.evaluate(() => document.body.innerText))) {
    fail('modelo SEM Flow vazou para o picker (filtro client-side falhou)')
  }

  // Seleciona o modelo → o dropdown fecha e aparece 1 campo de variável (placeholder "João")
  await page.getByRole('button', { name: 'Pedido confirmado' }).click()
  await page.waitForTimeout(200)
  const saveBtn = page.getByRole('button', { name: /Salvar modelo/ })
  if (!(await saveBtn.isDisabled())) fail('Salvar modelo deveria começar desabilitado (variável vazia)')

  const varField = page.getByPlaceholder('João')
  if (await varField.count() === 0) fail('campo de variável {{1}} não apareceu')
  await varField.fill('Maria')
  await page.waitForTimeout(150)

  // Preview mostra o valor preenchido e o botão Flow
  const panelText = await page.evaluate(() => document.body.innerText)
  if (!/Maria/.test(panelText)) fail('preview não refletiu o valor da variável')
  if (!/Abrir formulário/.test(panelText)) fail('preview não mostrou o botão Flow')
  if (await saveBtn.isDisabled()) fail('Salvar modelo deveria habilitar com a variável preenchida')

  await saveBtn.click()
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(400)

  // ── Export: confere a serialização da mensagem TEMPLATE ──
  const json1 = await exportJson(page)
  const tpl = findTemplate(json1, MESSAGE_NODE)
  if (!tpl) {
    fail('mensagem TEMPLATE não foi serializada no export')
  } else {
    if (tpl.messageTemplateId !== 'mt-001') fail(`messageTemplateId errado: ${tpl.messageTemplateId}`)
    if (tpl.title !== 'Pedido confirmado') fail(`title errado: ${tpl.title}`)
    if (tpl.content !== 'Olá {{1}}, seu pedido foi recebido!') fail(`content errado: ${tpl.content}`)
    if (JSON.stringify(tpl.messageTemplateTokens) !== JSON.stringify(['Maria'])) fail(`tokens errados: ${JSON.stringify(tpl.messageTemplateTokens)}`)
    if (tpl.messageTemplateHeaderToken !== '') fail('messageTemplateHeaderToken deveria ser vazio')
    const btn = tpl.messageConfig?.buttons?.[0]
    if (!btn || btn.type !== 'FLOW' || btn.text !== 'Abrir formulário') fail(`botão Flow errado: ${JSON.stringify(btn)}`)
    console.log('  TEMPLATE serializado OK')
  }

  // ── Editar: o painel segue aberto após o Apply — troca o valor da variável ──
  await page.getByRole('button', { name: 'editar' }).first().click()
  await page.waitForTimeout(200)
  const varField2 = page.getByPlaceholder('João')
  await varField2.fill('Ana')
  await page.getByRole('button', { name: /Salvar modelo/ }).click()
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(400)
  const json2 = await exportJson(page)
  const tpl2 = findTemplate(json2, MESSAGE_NODE)
  if (JSON.stringify(tpl2?.messageTemplateTokens) !== JSON.stringify(['Ana'])) {
    fail(`edição da variável não refletiu: ${JSON.stringify(tpl2?.messageTemplateTokens)}`)
  } else {
    console.log('  edição da variável OK')
  }

  // ── Excluir: remove a resposta TEMPLATE (último "remover" = o do campo do modelo) ──
  await page.getByRole('button', { name: 'remover' }).last().click()
  await page.getByRole('button', { name: 'Aplicar alterações' }).click()
  await page.waitForTimeout(400)
  const json3 = await exportJson(page)
  if (findTemplate(json3, MESSAGE_NODE)) fail('resposta TEMPLATE não foi removida')
  else console.log('  remoção OK')

  // Sanitização: o token nunca aparece na UI
  if ((await page.evaluate(() => document.body.innerText)).includes(TOKEN)) fail('o token VAZOU na interface')

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (!failed) console.log('SMOKE PHASE 12 (modelo de mensagem com Flow) OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
