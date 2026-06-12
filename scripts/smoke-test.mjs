/**
 * Smoke test da Fase 1 (round-trip): carrega o app no Vite dev server,
 * importa o sample01, gera o fluxo e valida que os nós renderizam, que as
 * arestas internas são reconectáveis e que o botão de exportar JSON baixa
 * um arquivo idêntico ao importado (round-trip sem edições).
 *
 * Uso: node scripts/smoke-test.mjs [url]
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
  const page = await browser.newPage()
  await loadFlow(page, baseUrl, sample)

  const nodeCount = await page.locator('.react-flow__node').count()
  const edgeCount = await page.locator('.react-flow__edge').count()
  console.log(`nós renderizados: ${nodeCount}, arestas: ${edgeCount}`)
  if (nodeCount < 12) fail(`esperava >= 12 nós (sample01 tem 12 intenções), veio ${nodeCount}`)
  if (edgeCount < 1) fail('nenhuma aresta renderizada')

  // Arestas internas devem expor a âncora de reconexão no destino
  const reconnectAnchors = await page.locator('.react-flow__edgeupdater-target').count()
  console.log(`âncoras de reconexão (destino): ${reconnectAnchors}`)
  if (reconnectAnchors < 1) fail('nenhuma aresta reconectável encontrada')

  // Exportar JSON e comparar com o importado (round-trip)
  const exported = await exportJson(page)
  const original = JSON.parse(sample)
  const equal = JSON.stringify(exported) === JSON.stringify(original)
  console.log(`round-trip exportado idêntico ao importado: ${equal}`)
  if (!equal) fail('JSON exportado difere do importado')

  if (process.exitCode !== 1) console.log('SMOKE TEST OK')
} catch (err) {
  fail(err.message)
} finally {
  await browser.close()
}
