import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import type { ValidationReport } from '../utils/validateFlow'

export type ExportFormat = 'json' | 'png' | 'svg'

interface TopBarProps {
  version: string
  hasFlow: boolean
  report: ValidationReport | null
  exporting: boolean
  themeToggle: React.ReactNode
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onImport: () => void
  onNewFlow: () => void
  onExport: (format: ExportFormat) => void
}

/** Fecha o dropdown ao clicar fora dele. */
function useClickOutside(onOutside: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onOutside])
  return ref
}

export function TopBar({ version, hasFlow, report, exporting, themeToggle, canUndo, canRedo, onUndo, onRedo, onImport, onNewFlow, onExport }: TopBarProps) {
  const isDark = useTheme()
  const [exportOpen, setExportOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const exportRef = useClickOutside(() => setExportOpen(false))
  const reportRef = useClickOutside(() => setReportOpen(false))

  const btnCls = `flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
    isDark
      ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700'
      : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'
  }`
  const menuCls = `absolute right-0 top-full mt-1 z-30 min-w-[160px] rounded-lg border shadow-lg overflow-hidden ${
    isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
  }`
  const menuItemCls = `w-full text-left px-3 py-2 text-xs font-medium transition-colors ${
    isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'
  }`

  const issueCount = (report?.errors.length ?? 0) + (report?.warnings.length ?? 0)

  return (
    <header className={`flex items-center gap-3 px-4 h-12 border-b shrink-0 z-20 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
      <div className="flex items-center gap-2">
        <h1 className={`text-base font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Fluxo</h1>
        <span className={`text-[11px] font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>v{version}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${isDark ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>Beta</span>
      </div>

      <div className="flex items-center gap-2 ml-4">
        <button className={btnCls} onClick={onNewFlow}>
          <PlusIcon /> Novo fluxo
        </button>

        <button className={btnCls} onClick={onImport}>
          <UploadIcon /> Importar
        </button>

        <div className="relative" ref={exportRef}>
          <button
            className={btnCls}
            disabled={!hasFlow || exporting}
            onClick={() => setExportOpen(o => !o)}
            title="Exportar o fluxo (inclui edições)"
          >
            <DownloadIcon /> Exportar <Chevron />
          </button>
          {exportOpen && (
            <div className={menuCls}>
              {([['json', 'JSON (plataforma)'], ['png', 'Imagem PNG'], ['svg', 'Imagem SVG']] as const).map(([fmt, label]) => (
                <button key={fmt} className={menuItemCls} onClick={() => { setExportOpen(false); onExport(fmt) }}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className={`w-px h-5 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`} />

        <button className={btnCls} disabled={!canUndo} onClick={onUndo} title="Desfazer (Ctrl+Z)" aria-label="Desfazer">
          ↶
        </button>
        <button className={btnCls} disabled={!canRedo} onClick={onRedo} title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">
          ↷
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        {hasFlow && report && (
          <div className="relative" ref={reportRef}>
            <button
              onClick={() => issueCount > 0 && setReportOpen(o => !o)}
              title={issueCount ? 'Ver problemas do fluxo' : 'Fluxo válido'}
              className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-colors ${
                report.errors.length
                  ? (isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-700 bg-rose-50 border-rose-200')
                  : report.warnings.length
                    ? (isDark ? 'text-amber-300 bg-amber-950 border-amber-800' : 'text-amber-700 bg-amber-50 border-amber-200')
                    : (isDark ? 'text-emerald-300 bg-emerald-950 border-emerald-800' : 'text-emerald-700 bg-emerald-50 border-emerald-200')
              }`}
            >
              {report.errors.length ? `✕ ${report.errors.length} erro(s)`
                : report.warnings.length ? `⚠ ${report.warnings.length} aviso(s)`
                : '✓ válido'}
            </button>
            {reportOpen && (
              <div className={`${menuCls} max-w-[420px] max-h-[320px] overflow-y-auto`}>
                {report.errors.map((e, i) => (
                  <p key={`e${i}`} className={`px-3 py-1.5 text-[11px] leading-snug ${isDark ? 'text-rose-300' : 'text-rose-600'}`}>✕ {e}</p>
                ))}
                {report.warnings.map((w, i) => (
                  <p key={`w${i}`} className={`px-3 py-1.5 text-[11px] leading-snug ${isDark ? 'text-amber-300' : 'text-amber-600'}`}>⚠ {w}</p>
                ))}
              </div>
            )}
          </div>
        )}

        <a
          href="https://github.com/andrewsmartins/Fluxo-Bot"
          target="_blank"
          rel="noopener noreferrer"
          className={`text-[11px] font-medium rounded px-2 py-1 border transition-colors ${isDark ? 'text-slate-400 border-slate-700 hover:text-blue-400 hover:border-blue-700' : 'text-slate-500 border-slate-200 hover:text-blue-600 hover:border-blue-300'}`}
        >
          Documentação
        </a>
        {themeToggle}
      </div>
    </header>
  )
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  )
}

function UploadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

function DownloadIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

function Chevron() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
