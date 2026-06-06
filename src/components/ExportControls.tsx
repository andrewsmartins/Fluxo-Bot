import { useState } from 'react'
import { Panel, useReactFlow, getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'

const MAX_EXPORT_PX = 8000

async function captureViewport(
  format: 'png' | 'svg',
  x: number,
  y: number,
  zoom: number,
  width: number,
  height: number,
) {
  const el = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!el) throw new Error('Viewport não encontrado')

  const options = {
    backgroundColor: '#f8fafc',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${x}px, ${y}px) scale(${zoom})`,
    },
  }

  return format === 'png' ? toPng(el, options) : toSvg(el, options)
}

function triggerDownload(dataUrl: string, format: 'png' | 'svg') {
  const a = document.createElement('a')
  a.download = `fluxo.${format}`
  a.href = dataUrl
  a.click()
}

interface ExportControlsProps {
  onSpacingIncrease: () => void
  onSpacingDecrease: () => void
}

export function ExportControls({ onSpacingIncrease, onSpacingDecrease }: ExportControlsProps) {
  const { getNodes } = useReactFlow()
  const [exporting, setExporting] = useState<'png' | 'svg' | null>(null)

  async function handleExport(format: 'png' | 'svg') {
    const nodes = getNodes()
    if (!nodes.length) return

    setExporting(format)
    try {
      const bounds = getNodesBounds(nodes)

      // Scale to 2× resolution for sharpness, capped to avoid browser memory limits
      let w = (bounds.width || 400) * 2
      let h = (bounds.height || 300) * 2
      if (w > MAX_EXPORT_PX || h > MAX_EXPORT_PX) {
        const factor = MAX_EXPORT_PX / Math.max(w, h)
        w *= factor
        h *= factor
      }
      const exportWidth = Math.max(800, Math.round(w))
      const exportHeight = Math.max(600, Math.round(h))

      const { x, y, zoom } = getViewportForBounds(
        bounds,
        exportWidth,
        exportHeight,
        0.01, // minZoom muito baixo para fluxos grandes caberem
        10,
        0.05  // 5% de padding ao redor do conteúdo
      )

      const dataUrl = await captureViewport(format, x, y, zoom, exportWidth, exportHeight)
      triggerDownload(dataUrl, format)
    } catch (err) {
      console.error('Erro ao exportar:', err)
    } finally {
      setExporting(null)
    }
  }

  const busy = exporting !== null

  return (
    <Panel position="top-right">
      <div className="flex gap-2 bg-white border border-slate-200 rounded-lg shadow-sm p-1.5">
        <button
          onClick={() => handleExport('png')}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Exportar como PNG (dimensões dinâmicas baseadas no fluxo)"
        >
          {exporting === 'png' ? <Spinner /> : <ImageIcon />}
          PNG
        </button>

        <div className="w-px bg-slate-200" />

        <button
          onClick={() => handleExport('svg')}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Exportar como SVG (vetor)"
        >
          {exporting === 'svg' ? <Spinner /> : <VectorIcon />}
          SVG
        </button>

        <div className="w-px bg-slate-200" />

        <button
          onClick={onSpacingDecrease}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 active:bg-slate-100 text-base font-medium leading-none transition-colors"
          title="Diminuir espaçamento"
        >−</button>
        <span className="text-xs text-slate-400 select-none self-center">espaço</span>
        <button
          onClick={onSpacingIncrease}
          className="w-7 h-7 flex items-center justify-center rounded-md text-slate-600 hover:bg-slate-50 active:bg-slate-100 text-base font-medium leading-none transition-colors"
          title="Aumentar espaçamento"
        >+</button>
      </div>
    </Panel>
  )
}

function Spinner() {
  return (
    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  )
}

function ImageIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  )
}

function VectorIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  )
}
