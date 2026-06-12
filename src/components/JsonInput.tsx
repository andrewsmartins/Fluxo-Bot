import { useRef, type ChangeEvent, type ReactNode } from 'react'
import { useTheme } from '../contexts/ThemeContext'

interface JsonInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  error: string | null
  themeToggle?: ReactNode
}

export function JsonInput({ value, onChange, onSubmit, error, themeToggle }: JsonInputProps) {
  const isDark = useTheme()
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      onChange(text)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') onSubmit()
  }

  return (
    <div className="flex flex-col h-full gap-3 p-4">
      <div>
        <div className="flex items-center gap-2">
          <h1 className={`text-lg font-bold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Flow Viewer</h1>
          <span className={`text-xs font-medium ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>v0.9.0</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border ${isDark ? 'bg-amber-950 text-amber-300 border-amber-800' : 'bg-amber-100 text-amber-700 border-amber-200'}`}>Beta</span>
          <a
            href="https://github.com/andrewsmartins/Fluxo-Bot"
            target="_blank"
            rel="noopener noreferrer"
            className={`text-[10px] font-medium rounded px-1.5 py-0.5 border transition-colors ${isDark ? 'text-slate-400 border-slate-700 hover:text-blue-400 hover:border-blue-700' : 'text-slate-500 border-slate-200 hover:text-blue-600 hover:border-blue-300'}`}
          >
            Documentação
          </a>
          {themeToggle && <span className="ml-auto">{themeToggle}</span>}
        </div>
        <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Cole ou importe o JSON do bot para visualizar o fluxo.</p>
      </div>

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='{ "list": [...] }'
        spellCheck={false}
        className={`flex-1 w-full font-mono text-xs rounded-lg p-3 resize-none border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700 placeholder:text-slate-600' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400'}`}
      />

      {error && (
        <div className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
        >
          Importar .json
        </button>
        <button
          onClick={onSubmit}
          className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
        >
          Gerar Fluxo
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex flex-wrap gap-2 pt-1 justify-center">
        {[
          { kind: 'startNode', color: 'bg-emerald-500', label: 'Início' },
          { kind: 'choiceNode', color: 'bg-blue-500', label: 'Escolha' },
          { kind: 'captureNode', color: 'bg-violet-500', label: 'Captura' },
          { kind: 'transferNode', color: 'bg-rose-500', label: 'Transferência' },
          { kind: 'defaultNode', color: 'bg-slate-500', label: 'Padrão' },
        ].map(item => (
          <span key={item.kind} className={`flex items-center gap-1.5 text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
