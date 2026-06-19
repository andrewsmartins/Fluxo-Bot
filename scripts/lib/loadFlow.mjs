/**
 * Helpers compartilhados dos smoke tests — encapsulam a UI da v0.10+
 * (toolbar + modal de importação + dropdown de exportação).
 */
import { readFileSync } from 'node:fs'

/** Abre o app, importa o JSON pelo modal e espera o fluxo renderizar. */
export async function loadFlow(page, baseUrl, sampleText) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('nav').getByRole('button', { name: 'Importar' }).click()
  await page.getByPlaceholder('{ "list": [...] }').fill(sampleText)
  await page.getByRole('button', { name: 'Gerar fluxo' }).click()
  await page.waitForSelector('.react-flow__node')
  await page.waitForTimeout(800) // animação do fitView
}

/** Exporta o JSON pelo dropdown da toolbar e devolve o conteúdo parseado. */
export async function exportJson(page) {
  const downloadPromise = page.waitForEvent('download')
  await page.locator('nav').getByRole('button', { name: 'Exportar' }).click()
  await page.getByRole('button', { name: 'JSON (plataforma)' }).click()
  const download = await downloadPromise
  return JSON.parse(readFileSync(await download.path(), 'utf-8'))
}

/** Texto do toast de erro/aviso visível, ou null. */
export async function readToast(page) {
  return page.evaluate(() =>
    document.querySelector('[role="status"]')?.textContent?.trim() ?? null)
}
