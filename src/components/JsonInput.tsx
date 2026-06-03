import { useRef, type ChangeEvent } from 'react'

interface JsonInputProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  error: string | null
}

export function JsonInput({ value, onChange, onSubmit, error }: JsonInputProps) {
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
        <h1 className="text-lg font-bold text-slate-800">Flow Viewer</h1>
        <p className="text-xs text-slate-500 mt-0.5">Cole ou importe o JSON do bot para visualizar o fluxo.</p>
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
        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 leading-relaxed">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 py-2 px-3 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
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
          <span key={item.kind} className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  )
}
