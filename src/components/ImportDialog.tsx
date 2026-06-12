import { useState, useRef, type ChangeEvent } from 'react'
import { useTheme } from '../contexts/ThemeContext'

interface ImportDialogProps {
  /** Há fluxo carregado — importar substitui edições não exportadas. */
  hasFlow: boolean
  /** Recebe o texto; retorna mensagem de erro ou null em caso de sucesso. */
  onGenerate: (text: string) => string | null
  onClose: () => void
}

/**
 * Modal de importação: colar o JSON (fluxo típico — resposta da aba Network)
 * ou carregar um arquivo .json. Erros de parse aparecem no próprio modal.
 */
export function ImportDialog({ hasFlow, onGenerate, onClose }: ImportDialogProps) {
  const isDark = useTheme()
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => setText(ev.target?.result as string)
    reader.onerror = () => setError('Não foi possível ler o arquivo.')
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleGenerate() {
    const result = onGenerate(text)
    if (result) setError(result)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleGenerate()
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={`w-[560px] max-w-[92vw] rounded-xl border shadow-2xl flex flex-col ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Importar fluxo"
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Importar fluxo</h2>
          <button onClick={onClose} aria-label="Fechar" className={isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            Cole o JSON do bot (resposta de <code className="font-mono">GET /v1/{'{botId}'}/intents</code>) ou carregue um arquivo.
          </p>

          <textarea
            value={text}
            onChange={e => { setText(e.target.value); setError(null) }}
            onKeyDown={handleKeyDown}
            placeholder='{ "list": [...] }'
            spellCheck={false}
            autoFocus
            className={`h-56 w-full font-mono text-xs rounded-lg p-3 resize-none border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700 placeholder:text-slate-600' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400'}`}
          />

          {hasFlow && (
            <p className={`text-[11px] leading-snug rounded-lg px-3 py-2 border ${isDark ? 'text-amber-300 bg-amber-950 border-amber-800' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
              ⚠ Importar substitui o fluxo atual — edições não exportadas serão perdidas.
            </p>
          )}

          {error && (
            <p className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              Carregar arquivo .json
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Gerar fluxo
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    </div>
  )
}
