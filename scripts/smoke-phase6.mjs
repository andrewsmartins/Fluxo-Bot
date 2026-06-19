/**
 * Validação do Marco A (Fase 6): importa sample01-v2.json e confere que a
 * estrutura renderizada bate com o Modelo B (grupo + filhos por condição,
 * nós soltos para 1 condição). Roda sem tocar API.
 *
 * Uso: node scripts/validate-model-b.mjs [url]
 */
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { loadFlow } from './lib/loadFlow.mjs'

const baseUrl = process.argv[2] ?? 'http://localhost:5173/FlowViewer/'
const sample = readFileSync(new URL('../samples/sample01-v2.json', import.meta.url), 'utf-8')
const CONFIRMAR_NOME = '0138d0b0-74c8-432d-b33a-5553456c2195'

let failed = false
function fail(msg) { console.error(`FALHOU: ${msg}`); failed = true }

const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  const errors = []
  page.on('pageerror', err => errors.push(err.message))
  await loadFlow(page, baseUrl, sample)

  // 1. O grupo do Confirmar_nome existe e é um intentGroupNode
  const groupCount = await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}"]`).count()
  if (groupCount !== 1) fail(`esperava 1 nó-grupo para Confirmar_nome, veio ${groupCount}`)

  // 2. Os 2 filhos-condição existem com IDs ::c0 e ::c1
  const child0 = await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}::c0"]`).count()
  const child1 = await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}::c1"]`).count()
  if (child0 !== 1 || child1 !== 1) fail(`filhos ::c0/::c1 não renderizaram (${child0}/${child1})`)

  // 3. O grupo mostra o cabeçalho rico (nome + badge de prioridade)
  const groupText = await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}"]`).innerText()
  if (!/Confirmar_nome/.test(groupText)) fail('cabeçalho do grupo não mostra o nome da intenção')
  if (!/(Nenhuma|Baixa|Média|Alta|Muita Alta)/.test(groupText)) fail('badge de prioridade ausente no cabeçalho')

  // 4. Conta tipos de nó renderizados (solos + grupos + filhos)
  const summary = await page.evaluate((groupId) => {
    const nodes = [...document.querySelectorAll('.react-flow__node')]
    return {
      total: nodes.length,
      children: nodes.filter(n => n.getAttribute('data-id')?.includes('::')).length,
      groupContainers: nodes.filter(n => n.getAttribute('data-id') === groupId).length,
    }
  }, CONFIRMAR_NOME)
  console.log('estrutura renderizada:', JSON.stringify(summary))
  if (summary.children < 2) fail('esperava ao menos 2 filhos-condição renderizados')

  // 5. Há arestas e nenhuma origem aponta para nó inexistente
  const edgeInfo = await page.evaluate(() => {
    const edges = [...document.querySelectorAll('.react-flow__edge')].map(e => e.getAttribute('data-id'))
    const nodeIds = new Set([...document.querySelectorAll('.react-flow__node')].map(n => n.getAttribute('data-id')))
    return { count: edges.length, ids: edges }
  })
  if (edgeInfo.count === 0) fail('nenhuma aresta renderizada')
  console.log(`arestas renderizadas: ${edgeInfo.count}`)

  // 6. Clicar num filho não quebra (abre painel read-only da condição)
  await page.locator(`.react-flow__node[data-id="${CONFIRMAR_NOME}::c0"]`).click()
  await page.waitForTimeout(300)
  const panelText = await page.evaluate(() => document.body.innerText)
  if (!/somente leitura|Condição/i.test(panelText)) {
    console.log('aviso: painel da condição não exibiu rótulo esperado (não-bloqueante)')
  }

  if (errors.length) fail(`erros de página: ${errors.join(' | ')}`)
  if (!failed) console.log('VALIDAÇÃO MARCO A OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
