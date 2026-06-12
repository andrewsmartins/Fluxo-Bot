import { useState } from 'react'
import { Panel, useReactFlow, getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'
import { useTheme } from '../contexts/ThemeContext'

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
  onExportJson: () => void
  onSpacingIncrease: () => void
  onSpacingDecrease: () => void
}

export function ExportControls({ onExportJson, onSpacingIncrease, onSpacingDecrease }: ExportControlsProps) {
  const isDark = useTheme()
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

  const panelBg  = isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
  const btnText  = isDark ? 'text-slate-300' : 'text-slate-600'
  const btnHover = isDark ? 'hover:bg-slate-800' : 'hover:bg-slate-50'
  const divider  = isDark ? 'bg-slate-700' : 'bg-slate-200'
  const spaceTxt = isDark ? 'text-slate-500' : 'text-slate-400'

  return (
    // top-center: o canto direito fica coberto quando o DetailPanel está aberto
    <Panel position="top-center">
      <div className={`flex gap-2 border rounded-lg shadow-sm p-1.5 ${panelBg}`}>
        <button
          onClick={() => handleExport('png')}
          disabled={busy}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${btnText} ${btnHover}`}
          title="Exportar como PNG (dimensões dinâmicas baseadas no fluxo)"
        >
          {exporting === 'png' ? <Spinner /> : <ImageIcon />}
          PNG
        </button>

        <div className={`w-px ${divider}`} />

        <button
          onClick={() => handleExport('svg')}
          disabled={busy}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${btnText} ${btnHover}`}
          title="Exportar como SVG (vetor)"
        >
          {exporting === 'svg' ? <Spinner /> : <VectorIcon />}
          SVG
        </button>

        <div className={`w-px ${divider}`} />

        <button
          onClick={onExportJson}
          disabled={busy}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${btnText} ${btnHover}`}
          title="Exportar o JSON do fluxo (inclui edições de conexões)"
        >
          <JsonIcon />
          JSON
        </button>

        <div className={`w-px ${divider}`} />

        <button
          onClick={onSpacingDecrease}
          className={`w-7 h-7 flex items-center justify-center rounded-md text-base font-medium leading-none transition-colors ${btnText} ${btnHover}`}
          title="Diminuir espaçamento"
        >−</button>
        <span className={`text-xs select-none self-center ${spaceTxt}`}>espaço</span>
        <button
          onClick={onSpacingIncrease}
          className={`w-7 h-7 flex items-center justify-center rounded-md text-base font-medium leading-none transition-colors ${btnText} ${btnHover}`}
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

function JsonIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
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
