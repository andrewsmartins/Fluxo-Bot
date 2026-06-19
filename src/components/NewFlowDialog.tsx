import { useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface NewFlowDialogProps {
  /** Há fluxo carregado — criar um novo substitui edições não exportadas. */
  hasFlow: boolean
  onCreate: (botId: string) => void
  onClose: () => void
}

/**
 * Cria um fluxo do zero a partir do botId do bot de destino (copiado da URL
 * da plataforma). O start canônico nasce com ID `{botId}-start`, então o
 * export já sai compatível com a importação/push na OmniChat.
 */
export function NewFlowDialog({ hasFlow, onCreate, onClose }: NewFlowDialogProps) {
  const isDark = useTheme()
  // Pré-preenche o bot de testes padrão; o usuário ainda pode trocar antes de criar.
  const [botId, setBotId] = useState('2a3859ff-62d5-4c01-ae60-6ae2f812e786')
  const [error, setError] = useState<string | null>(null)

  function handleCreate() {
    const trimmed = botId.trim()
    if (!UUID_RE.test(trimmed)) {
      setError('O botId deve ser um UUID (ex: 8df3c1e7-a8c9-4bad-ac5a-2855462da840). Copie-o da URL do bot na plataforma.')
      return
    }
    onCreate(trimmed.toLowerCase())
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={`w-[480px] max-w-[92vw] rounded-xl border shadow-2xl ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Novo fluxo"
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Novo fluxo</h2>
          <button onClick={onClose} aria-label="Fechar" className={isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              botId do bot de destino
            </span>
            <input
              value={botId}
              onChange={e => { setBotId(e.target.value); setError(null) }}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="8df3c1e7-a8c9-4bad-ac5a-2855462da840"
              spellCheck={false}
              autoFocus
              className={`w-full font-mono text-xs rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700 placeholder:text-slate-600' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400'}`}
            />
            <span className={`text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              Copie da URL do bot na plataforma. O fluxo nasce com a intenção de início (<code className="font-mono">{'{botId}'}-start</code>) e o JSON exportado já sai com IDs reais.
            </span>
          </label>

          {hasFlow && (
            <p className={`text-[11px] leading-snug rounded-lg px-3 py-2 border ${isDark ? 'text-amber-300 bg-amber-950 border-amber-800' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
              ⚠ Criar um fluxo novo substitui o atual — edições não exportadas serão perdidas.
            </p>
          )}

          {error && (
            <p className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
              {error}
            </p>
          )}

          <button
            onClick={handleCreate}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-900 bg-amber-400 rounded-lg hover:bg-amber-500 transition-colors"
          >
            Criar fluxo
          </button>
        </div>
      </div>
    </div>
  )
}
