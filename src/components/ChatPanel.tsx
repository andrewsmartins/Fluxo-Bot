import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { useChatSocket, type ChatMessage, type ConnStatus } from '../hooks/useChatSocket'
import type { BotFlowJson } from '../types'

/**
 * Caixinha de chat do agente construtor (PoC local, passo 4 — PLANS §
 * "Caixinha de chat"). Widget flutuante no canto inferior direito: overlay sobre
 * o canvas, sem mexer no layout. Só renderizada no dev build (o App a monta sob
 * `import.meta.env.DEV`), pois depende do backend local.
 *
 * Encapsula o `useChatSocket` (uma sessão do Agent SDK por chat). Ao ENVIAR,
 * serializa o canvas atual via `getFlow` e manda no flush (decisão 5); o turno
 * trava a UI (`onRunningChange` propaga o lock pro canvas). Ao fim, o
 * `onFlowUpdated` (já no App) re-renderiza o canvas com guard de parse.
 */

interface ChatPanelProps {
  /** Serializa o canvas atual para o flush (decisão 5). Null = sem fluxo carregado. */
  getFlow: () => string | null
  /** Recebe o fluxo novo ao fim do turno (decisão 3) — App faz parseFlow + guard. */
  onFlowUpdated: (flow: BotFlowJson) => void
  /** Propaga o estado do turno para o App travar/destravar o canvas. */
  onRunningChange: (running: boolean) => void
}

const STATUS_DOT: Record<ConnStatus, string> = {
  connecting: 'bg-amber-400',
  open:       'bg-emerald-400',
  closed:     'bg-rose-500',
}

const STATUS_LABEL: Record<ConnStatus, string> = {
  connecting: 'Conectando…',
  open:       'Conectado',
  closed:     'Offline — rode `npm run ws:dev`',
}

export function ChatPanel({ getFlow, onFlowUpdated, onRunningChange }: ChatPanelProps) {
  const isDark = useTheme()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const { status, messages, running, statusText, send } = useChatSocket({ onFlowUpdated })
  const scrollRef = useRef<HTMLDivElement>(null)

  // Propaga o lock do turno para o App (canvas read-only durante o turno).
  useEffect(() => { onRunningChange(running) }, [running, onRunningChange])

  // Auto-scroll para a última mensagem a cada novo conteúdo.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, statusText])

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || running || status !== 'open') return
    send(text, getFlow())
    setDraft('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  // ── Launcher recolhido ────────────────────────────────────────────────────
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Abrir o agente construtor"
        className={`fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-colors ${isDark ? 'bg-indigo-600 text-white hover:bg-indigo-500' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        Agente
        <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]} ${running ? 'animate-pulse' : ''}`} />
      </button>
    )
  }

  // ── Painel aberto ──────────────────────────────────────────────────────────
  return (
    <div
      className={`fixed bottom-4 right-4 z-30 flex flex-col rounded-2xl border shadow-2xl w-[400px] max-w-[92vw] h-[600px] max-h-[80vh] ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
      role="dialog"
      aria-label="Agente construtor de fluxo"
    >
      {/* Header */}
      <div className={`flex items-center gap-2 px-4 py-3 border-b ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${STATUS_DOT[status]} ${running ? 'animate-pulse' : ''}`} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Agente construtor</p>
          <p className={`text-[11px] leading-tight truncate ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            {running && statusText ? statusText : STATUS_LABEL[status]}
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Recolher o agente"
          className={isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2">
        {messages.length === 0 && (
          <p className={`m-auto max-w-[260px] text-center text-xs leading-relaxed ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Instrua o agente em linguagem natural — ex.: <em>"crie um nó de mensagem chamado boas_vindas e conecte ao início"</em>. As mudanças aparecem no canvas ao fim de cada turno.
          </p>
        )}
        {messages.map(m => <Bubble key={m.id} msg={m} isDark={isDark} />)}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className={`flex items-end gap-2 p-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-100'}`}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={status === 'open' ? 'Instrua o agente…' : 'Aguardando o backend…'}
          rows={1}
          disabled={running || status !== 'open'}
          spellCheck={false}
          className={`flex-1 resize-none rounded-lg px-3 py-2 text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors max-h-28 disabled:opacity-50 ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700 placeholder:text-slate-600' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400'}`}
        />
        <button
          type="submit"
          disabled={running || status !== 'open' || !draft.trim()}
          className="shrink-0 rounded-lg px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {running ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  )
}

/** Uma bolha do chat — estilo por papel (usuário/agente/tool/fluxo/erro). */
function Bubble({ msg, isDark }: { msg: ChatMessage; isDark: boolean }) {
  if (msg.role === 'user') {
    return (
      <div className="self-end max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-600 text-white text-sm px-3 py-2 whitespace-pre-wrap break-words">
        {msg.text}
      </div>
    )
  }
  if (msg.role === 'tool') {
    return (
      <div className={`self-start max-w-[90%] rounded-lg px-3 py-1.5 font-mono text-[11px] break-words ${isDark ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-900' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
        <span className="font-bold">{msg.toolName}</span>
        <span className="opacity-70">({msg.toolInput})</span>
      </div>
    )
  }
  if (msg.role === 'flow') {
    return (
      <div className={`self-start max-w-[90%] rounded-lg px-3 py-1.5 text-[11px] font-medium ${isDark ? 'bg-blue-950/60 text-blue-300 border border-blue-900' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
        ✓ {msg.text}
      </div>
    )
  }
  if (msg.role === 'error') {
    return (
      <div className={`self-start max-w-[90%] rounded-lg px-3 py-2 text-xs leading-relaxed ${isDark ? 'bg-rose-950 text-rose-300 border border-rose-800' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
        <strong>Erro:</strong> {msg.text}
      </div>
    )
  }
  // assistant
  return (
    <div className={`self-start max-w-[85%] rounded-2xl rounded-bl-sm text-sm px-3 py-2 whitespace-pre-wrap break-words ${isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-800'}`}>
      {msg.text}
    </div>
  )
}
