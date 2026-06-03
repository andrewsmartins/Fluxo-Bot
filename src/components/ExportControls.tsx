import { useState } from 'react'
import { Panel, useReactFlow, getNodesBounds, getViewportForBounds } from '@xyflow/react'
import { toPng, toSvg } from 'html-to-image'

const EXPORT_WIDTH = 2400
const EXPORT_HEIGHT = 1600

async function captureViewport(format: 'png' | 'svg', x: number, y: number, zoom: number) {
  const el = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!el) throw new Error('Viewport não encontrado')

  const options = {
    backgroundColor: '#f8fafc',
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    style: {
      width: `${EXPORT_WIDTH}px`,
      height: `${EXPORT_HEIGHT}px`,
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
  layoutMode: 'bottom' | 'left'
  onToggleLayout: () => void
  mainFlowNodeIds: string[]
}

export function ExportControls({ layoutMode, onToggleLayout, mainFlowNodeIds }: ExportControlsProps) {
  const { getNodes, fitView } = useReactFlow()
  const [exporting, setExporting] = useState<'png' | 'svg' | null>(null)

  async function handleExport(format: 'png' | 'svg') {
    const nodes = getNodes()
    if (!nodes.length) return

    setExporting(format)
    try {
      const bounds = getNodesBounds(nodes)
      const { x, y, zoom } = getViewportForBounds(
        bounds,
        EXPORT_WIDTH,
        EXPORT_HEIGHT,
        0.3,
        2,
        0.1
      )
      const dataUrl = await captureViewport(format, x, y, zoom)
      triggerDownload(dataUrl, format)
    } catch (err) {
      console.error('Erro ao exportar:', err)
    } finally {
      setExporting(null)
    }
  }

  function handleToggle() {
    onToggleLayout()
    // LayoutFitter handles the fitView after reposition; no need to duplicate here
  }

  const busy = exporting !== null

  const layoutLabel = layoutMode === 'bottom' ? 'Isolados à esquerda' : 'Isolados abaixo'

  return (
    <Panel position="top-right">
      <div className="flex gap-2 bg-white border border-slate-200 rounded-lg shadow-sm p-1.5">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-slate-50 transition-colors"
          title={layoutLabel}
        >
          <LayoutToggleIcon mode={layoutMode} />
          Layout
        </button>

        <div className="w-px bg-slate-200" />

        <button
          onClick={() => handleExport('png')}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Exportar como PNG (2400×1600)"
        >
          {exporting === 'png' ? (
            <Spinner />
          ) : (
            <ImageIcon />
          )}
          PNG
        </button>

        <div className="w-px bg-slate-200" />

        <button
          onClick={() => handleExport('svg')}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 rounded-md hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Exportar como SVG (vetor)"
        >
          {exporting === 'svg' ? (
            <Spinner />
          ) : (
            <VectorIcon />
          )}
          SVG
        </button>
      </div>
    </Panel>
  )
}

function LayoutToggleIcon({ mode }: { mode: 'bottom' | 'left' }) {
  // Rotates 90deg depending on current mode to hint the next state
  const rotate = mode === 'bottom' ? '0' : '90'
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: `rotate(${rotate}deg)`, transition: 'transform 0.3s ease' }}
    >
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
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
