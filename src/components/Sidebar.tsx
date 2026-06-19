import { useState, useRef, useEffect, type ReactNode } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import type { ValidationReport } from '../utils/validateFlow'

export type ExportFormat = 'json' | 'png' | 'svg'

interface SidebarProps {
  /** Versão da plataforma (exibida no pé do rail). */
  version: string
  /** Relatório de validação do fluxo — indicador de status no pé do rail. */
  report: ValidationReport | null
  hasFlow: boolean
  exporting: boolean
  canUndo: boolean
  canRedo: boolean
  /** Habilita "Enviar para OmniChat": fluxo carregado e sem erros de validação. */
  canPush: boolean
  /** Token de sessão GLOBAL (só em memória) — reaproveitado por push/restore/times. */
  sessionToken: string
  onSessionTokenChange: (token: string) => void
  /** Popover do token controlado pelo App (o picker pode abri-lo via aviso). */
  tokenOpen: boolean
  onTokenOpenChange: (open: boolean) => void
  /** Toggle de tema (sol/lua), renderizado pelo App. */
  themeToggle: ReactNode
  onUndo: () => void
  onRedo: () => void
  onImport: () => void
  onNewFlow: () => void
  onExport: (format: ExportFormat) => void
  onPush: () => void
  onRestore: () => void
  onSpacingIncrease: () => void
  onSpacingDecrease: () => void
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

/**
 * Rail de ações vertical (Fase 11D/11E — "cara de Omni"): barra escura estreita à
 * esquerda com TODAS as ações do app como ícones (tooltip + aria-label), o status
 * de validação e a versão no pé. Não há mais barra superior — o canvas ocupa a
 * altura toda. É um `<nav>` para os smokes scoparem por ele (antes `header`).
 *
 * O rail é SEMPRE escuro (independente do tema), como o da plataforma — só os
 * popovers que ele abre (Exportar, Token, validação) acompanham o tema do app.
 */
export function Sidebar(props: SidebarProps) {
  const { version, report, hasFlow, exporting, canUndo, canRedo, canPush, sessionToken, onSessionTokenChange, tokenOpen, onTokenOpenChange, themeToggle, onUndo, onRedo, onImport, onNewFlow, onExport, onPush, onRestore, onSpacingIncrease, onSpacingDecrease } = props
  const isDark = useTheme()
  const [exportOpen, setExportOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const exportRef = useClickOutside(() => setExportOpen(false))
  const tokenRef = useClickOutside(() => onTokenOpenChange(false))
  const reportRef = useClickOutside(() => setReportOpen(false))

  const issueCount = (report?.errors.length ?? 0) + (report?.warnings.length ?? 0)

  // Popovers (Exportar / Token) acompanham o tema — useTheme + ternário (regra do projeto:
  // nunca `dark:` do Tailwind). O rail em si é sempre escuro, sem theming.
  const popoverCls = `absolute left-full ml-2 z-40 rounded-lg border shadow-lg overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`
  const menuItemCls = `w-full text-left px-3 py-2 text-xs font-medium transition-colors ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-50'}`

  return (
    <nav className="flex flex-col items-center gap-1 w-14 shrink-0 py-3 bg-zinc-950 rounded-r-2xl shadow-lg shadow-black/40 z-20">
      {/* Identidade */}
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-400 text-zinc-900 mb-1" title="Fluxo" aria-hidden>
        <FlowMark />
      </div>

      <Divider />

      {/* Documento */}
      <RailButton label="Novo fluxo" icon={<PlusIcon />} onClick={onNewFlow} />
      <RailButton label="Importar" icon={<UploadIcon />} onClick={onImport} />

      <div className="relative" ref={exportRef}>
        <RailButton
          label="Exportar"
          icon={<DownloadIcon />}
          onClick={() => setExportOpen(o => !o)}
          disabled={!hasFlow || exporting}
          active={exportOpen}
        />
        {exportOpen && (
          <div className={`${popoverCls} min-w-[160px] top-0`}>
            {([['json', 'JSON (plataforma)'], ['png', 'Imagem PNG'], ['svg', 'Imagem SVG']] as const).map(([fmt, label]) => (
              <button
                key={fmt}
                className={menuItemCls}
                onClick={() => { setExportOpen(false); onExport(fmt) }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <RailButton label="Restaurar" icon={<RestoreIcon />} onClick={onRestore} />

      <Divider />

      {/* Enviar (ação de destaque — push para a OmniChat) */}
      <RailButton label="Enviar" icon={<SendIcon />} onClick={onPush} disabled={!canPush} accent />

      <Divider />

      {/* Edição */}
      <RailButton label="Desfazer" icon={<UndoIcon />} onClick={onUndo} disabled={!canUndo} />
      <RailButton label="Refazer" icon={<RedoIcon />} onClick={onRedo} disabled={!canRedo} />

      <Divider />

      {/* Espaçamento do layout */}
      <RailButton label="Diminuir espaçamento" icon={<MinusIcon />} onClick={onSpacingDecrease} disabled={!hasFlow} />
      <RailButton label="Aumentar espaçamento" icon={<PlusIcon />} onClick={onSpacingIncrease} disabled={!hasFlow} />

      {/* Rodapé */}
      <div className="mt-auto flex flex-col items-center gap-1">
        {hasFlow && report && (
          <div className="relative" ref={reportRef}>
            <button
              onClick={() => issueCount > 0 && setReportOpen(o => !o)}
              title={issueCount ? 'Ver problemas do fluxo' : 'Fluxo válido'}
              aria-label="Status de validação"
              className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors hover:bg-white/10 ${
                report.errors.length ? 'text-rose-400' : report.warnings.length ? 'text-amber-400' : 'text-emerald-400'
              }`}
            >
              {report.errors.length ? <XCircleIcon /> : report.warnings.length ? <AlertIcon /> : <CheckCircleIcon />}
              {issueCount > 0 && (
                <span className={`absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 flex items-center justify-center rounded-full text-[9px] font-bold text-white ${report.errors.length ? 'bg-rose-500' : 'bg-amber-500'}`}>
                  {issueCount}
                </span>
              )}
            </button>
            {reportOpen && (
              <div className={`${popoverCls} w-[320px] bottom-0 max-h-[320px] overflow-y-auto py-1`}>
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

        <div className="relative" ref={tokenRef}>
          <button
            onClick={() => onTokenOpenChange(!tokenOpen)}
            title={sessionToken ? 'Token de sessão definido (clique para editar)' : 'Definir token de sessão (push, restore e times)'}
            aria-label="Token"
            className={`relative flex items-center justify-center w-10 h-10 rounded-xl transition-colors ${
              sessionToken ? 'text-emerald-400 hover:bg-white/10' : 'text-zinc-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <KeyIcon />
            <span className={`absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full ${sessionToken ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
          </button>
          {tokenOpen && (
            <div className={`${popoverCls} w-[280px] bottom-0 p-3 flex flex-col gap-2`}>
              <span className={`text-xs font-medium ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>Token de sessão</span>
              <input
                type="password"
                value={sessionToken}
                onChange={e => onSessionTokenChange(e.target.value)}
                onPaste={() => { window.setTimeout(() => onTokenOpenChange(false), 0) }}
                placeholder="r:•••••• (só em memória)"
                spellCheck={false}
                autoComplete="off"
                autoFocus
                className={`w-full font-mono text-xs rounded-lg p-2 border focus:outline-none focus:ring-2 focus:ring-amber-400 transition-colors ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700 placeholder:text-slate-600' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400'}`}
              />
              <span className={`text-[11px] leading-snug ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                Usado por <strong>Enviar</strong>, <strong>Restaurar</strong> e pelo carregamento dos <strong>times</strong> (variável @team). Nunca é salvo, logado nem incluído em relatórios.
              </span>
              {sessionToken && (
                <button
                  onClick={() => onSessionTokenChange('')}
                  className={`self-start text-[11px] font-medium rounded px-2 py-1 border transition-colors ${isDark ? 'text-rose-300 border-rose-800 hover:bg-rose-950' : 'text-rose-600 border-rose-200 hover:bg-rose-50'}`}
                >
                  Limpar token
                </button>
              )}
            </div>
          )}
        </div>

        <a
          href="https://github.com/andrewsmartins/Fluxo-Bot"
          target="_blank"
          rel="noopener noreferrer"
          title="Documentação"
          aria-label="Documentação"
          className="flex items-center justify-center w-10 h-10 rounded-xl text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <HelpIcon />
        </a>

        {themeToggle}

        <span className="text-[10px] font-medium text-zinc-500 tabular-nums mt-0.5" title="Versão da plataforma">v{version}</span>
      </div>
    </nav>
  )
}

/** Botão de ícone padrão do rail (tooltip + aria-label; estados accent/active/disabled). */
function RailButton({ label, icon, onClick, disabled, active, accent }: {
  label: string; icon: ReactNode; onClick: () => void; disabled?: boolean; active?: boolean; accent?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex items-center justify-center w-10 h-10 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
        accent
          ? 'bg-emerald-600 text-white enabled:hover:bg-emerald-500'
          : active
            ? 'bg-amber-400 text-zinc-900'
            : 'text-zinc-400 enabled:hover:text-white enabled:hover:bg-white/10'
      }`}
    >
      {icon}
    </button>
  )
}

function Divider() {
  return <div className="w-6 h-px bg-white/10 my-1.5" />
}

function FlowMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="4" rx="1" /><rect x="14" y="3" width="7" height="4" rx="1" />
      <rect x="8" y="17" width="8" height="4" rx="1" />
      <line x1="6.5" y1="7" x2="6.5" y2="10" /><line x1="17.5" y1="7" x2="17.5" y2="10" />
      <line x1="6.5" y1="10" x2="17.5" y2="10" /><line x1="12" y1="10" x2="12" y2="17" />
    </svg>
  )
}

function PlusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function MinusIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12" /></svg>
}
function UploadIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
}
function DownloadIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
}
function RestoreIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
}
function SendIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
}
function UndoIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
}
function RedoIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></svg>
}
function KeyIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.778-7.778zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3" /></svg>
}
function HelpIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
}
function CheckCircleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
}
function AlertIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
}
function XCircleIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
}
