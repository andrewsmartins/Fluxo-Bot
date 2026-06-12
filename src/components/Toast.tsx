import { useEffect } from 'react'
import { useTheme } from '../contexts/ThemeContext'

export interface Notice {
  level: 'error' | 'warning' | 'success'
  text: string
}

const AUTO_DISMISS_MS = 6000

const STYLES_LIGHT: Record<Notice['level'], string> = {
  error:   'bg-rose-50 text-rose-700 border-rose-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

const STYLES_DARK: Record<Notice['level'], string> = {
  error:   'bg-rose-950 text-rose-300 border-rose-800',
  warning: 'bg-amber-950 text-amber-300 border-amber-800',
  success: 'bg-emerald-950 text-emerald-300 border-emerald-800',
}

/**
 * Notificação flutuante no rodapé do canvas. Erros persistem até serem
 * fechados; avisos e sucessos somem sozinhos.
 */
export function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  const isDark = useTheme()

  useEffect(() => {
    if (notice.level === 'error') return
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [notice, onDismiss])

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 max-w-[640px]" role="status">
      <div className={`flex items-start gap-2 text-xs leading-relaxed rounded-lg border shadow-lg px-3 py-2 ${(isDark ? STYLES_DARK : STYLES_LIGHT)[notice.level]}`}>
        <span className="whitespace-pre-wrap">{notice.text}</span>
        <button onClick={onDismiss} aria-label="Fechar aviso" className="shrink-0 opacity-60 hover:opacity-100 transition-opacity">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}
