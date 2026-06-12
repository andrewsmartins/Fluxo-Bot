import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'

const MAX_EXPORT_PX = 8000

function triggerDownload(dataUrl: string, format: 'png' | 'svg'): void {
  const a = document.createElement('a')
  a.download = `fluxo.${format}`
  a.href = dataUrl
  a.click()
}

/**
 * Captura o viewport do React Flow e baixa como PNG/SVG, com dimensões
 * calculadas pelos bounds reais dos nós (2× para nitidez, cap de 8000 px).
 * Movido do antigo ExportControls — agora é disparado pela TopBar.
 */
export async function exportFlowImage(nodes: Node[], format: 'png' | 'svg'): Promise<void> {
  if (!nodes.length) return
  const el = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!el) throw new Error('Viewport não encontrado')

  const bounds = getNodesBounds(nodes)
  let w = (bounds.width || 400) * 2
  let h = (bounds.height || 300) * 2
  if (w > MAX_EXPORT_PX || h > MAX_EXPORT_PX) {
    const factor = MAX_EXPORT_PX / Math.max(w, h)
    w *= factor
    h *= factor
  }
  const exportWidth  = Math.max(800, Math.round(w))
  const exportHeight = Math.max(600, Math.round(h))

  const { x, y, zoom } = getViewportForBounds(bounds, exportWidth, exportHeight, 0.01, 10, 0.05)

  const options = {
    backgroundColor: '#f8fafc',
    width: exportWidth,
    height: exportHeight,
    style: {
      width: `${exportWidth}px`,
      height: `${exportHeight}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  }

  const dataUrl = format === 'png' ? await toPng(el, options) : await toSvg(el, options)
  triggerDownload(dataUrl, format)
}
