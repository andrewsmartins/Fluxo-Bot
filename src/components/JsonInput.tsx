import { useRef, type ChangeEvent } from 'react'

interface JsonInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  error: string | null
  isDark: boolean
  onToggleDark: () => void
}

export function JsonInput({ value, onChange, onSubmit, error, isDark, onToggleDark }: JsonInputProps) {
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Fluxo Bot</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Cole ou importe o JSON do bot para visualizar o fluxo.</p>
        </div>
        <button
          onClick={onToggleDark}
          className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={isDark ? 'Modo claro' : 'Modo escuro'}
        >
          {isDark ? <SunIcon /> : <MoonIcon />}
        </button>
      </div>

      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder='{ "list": [...] }'
        spellCheck={false}
        className="flex-1 w-full font-mono text-xs bg-slate-900 text-slate-200 rounded-lg p-3 resize-none border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-600"
      />

      {error && (
        <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-lg px-3 py-2 leading-relaxed">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2 px-3 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
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

      <div className="flex flex-wrap gap-2 pt-1">
        {[
          { kind: 'startNode', color: 'bg-emerald-500', label: 'Início' },
          { kind: 'choiceNode', color: 'bg-blue-500', label: 'Escolha' },
          { kind: 'captureNode', color: 'bg-violet-500', label: 'Captura' },
          { kind: 'transferNode', color: 'bg-rose-500', label: 'Transferência' },
          { kind: 'defaultNode', color: 'bg-slate-500', label: 'Padrão' },
        ].map(item => (
          <span key={item.kind} className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  )
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  )
}
