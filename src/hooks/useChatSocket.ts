import { useState, useRef, useEffect, useCallback } from 'react'
import type { BotFlowJson } from '../types'

/**
 * Hook da caixinha de chat (PoC local, passo 4 — PLANS § "Caixinha de chat").
 *
 * Mantém UMA conexão WebSocket viva com o backend local (`npm run ws:dev`, via
 * proxy `/agent-ws` do Vite) = UMA sessão do Agent SDK por chat (decisão 8;
 * contexto + MCP persistem entre turnos). Acumula o texto streaming do agente,
 * registra a atividade de tools e, ao fim do turno, entrega o fluxo novo ao App
 * via `onFlowUpdated` para o canvas re-renderizar (decisão 3).
 *
 * Só é usado no dev build — o gh-pages publicado não alcança o backend local.
 */

export type ChatRole = 'user' | 'assistant' | 'tool' | 'flow' | 'error'

export interface ChatMessage {
  id: number
  role: ChatRole
  /** Texto da bolha (user/assistant/error/flow). */
  text: string
  /** Nome da tool, quando role === 'tool'. */
  toolName?: string
  /** Prévia (truncada) do input da tool, quando role === 'tool'. */
  toolInput?: string
}

export type ConnStatus = 'connecting' | 'open' | 'closed'

interface UseChatSocketOpts {
  /**
   * Chamado ao fim do turno com o fluxo lido do arquivo (decisão 3). O App faz
   * `parseFlow` com guard e re-renderiza o canvas (mantém o último bom se falhar).
   */
  onFlowUpdated: (flow: BotFlowJson) => void
}

/** Caminho do proxy WS do Vite → backend local (ver vite.config.ts). */
const WS_PATH = '/agent-ws'
/** Limite de caracteres da prévia do input de tool na bolha de atividade. */
const TOOL_INPUT_PREVIEW = 140

export function useChatSocket({ onFlowUpdated }: UseChatSocketOpts) {
  const [status, setStatus]     = useState<ConnStatus>('connecting')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [running, setRunning]   = useState(false)
  const [statusText, setStatusText] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const idRef = useRef(0)
  // ID da bolha do agente que está acumulando texto streaming; null entre turnos
  // ou após uma tool/flow (o próximo texto abre uma bolha nova).
  const streamingIdRef = useRef<number | null>(null)
  // Mantém o callback atual sem reconectar o WS a cada render do App.
  const onFlowUpdatedRef = useRef(onFlowUpdated)
  useEffect(() => { onFlowUpdatedRef.current = onFlowUpdated }, [onFlowUpdated])

  const nextId = () => ++idRef.current

  const push = useCallback((msg: Omit<ChatMessage, 'id'>) => {
    setMessages(prev => [...prev, { id: nextId(), ...msg }])
  }, [])

  // ── Conexão (uma só, persistente pela vida do componente) ───────────────────
  useEffect(() => {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const ws = new WebSocket(`${proto}://${location.host}${WS_PATH}`)
    wsRef.current = ws

    ws.onopen  = () => setStatus('open')
    ws.onclose = () => { setStatus('closed'); setRunning(false) }
    // Reseta `running` também aqui: um erro de socket nem sempre é seguido de
    // `close`, e sem isto o canvas ficaria travado para sempre (lock preso).
    ws.onerror = () => { setStatus('closed'); setRunning(false) }

    ws.onmessage = (ev: MessageEvent) => {
      let msg: Record<string, unknown>
      try {
        msg = JSON.parse(ev.data as string)
      } catch {
        return  // mensagem malformada — ignora em vez de quebrar o stream
      }

      switch (msg.type) {
        case 'status':
          setStatusText(String(msg.text ?? ''))
          break

        case 'text': {
          const text = String(msg.text ?? '')
          if (!text) break
          // Acumula na mesma bolha do agente até uma tool/flow/fim quebrar o fluxo.
          if (streamingIdRef.current !== null) {
            const id = streamingIdRef.current
            setMessages(prev => prev.map(m => m.id === id ? { ...m, text: m.text + text } : m))
          } else {
            const id = nextId()
            streamingIdRef.current = id
            setMessages(prev => [...prev, { id, role: 'assistant', text }])
          }
          break
        }

        case 'tool':
          streamingIdRef.current = null
          push({
            role: 'tool',
            text: '',
            toolName: String(msg.name ?? '?'),
            toolInput: JSON.stringify(msg.input ?? {}).slice(0, TOOL_INPUT_PREVIEW),
          })
          break

        case 'flow-updated': {
          streamingIdRef.current = null
          const n = typeof msg.nodeCount === 'number' ? msg.nodeCount : 0
          push({ role: 'flow', text: `Fluxo atualizado — ${n} nó${n === 1 ? '' : 's'}` })
          // Entrega o fluxo ao App (guard de parse + re-render ficam lá, decisão 7).
          if (msg.flow) onFlowUpdatedRef.current(msg.flow as BotFlowJson)
          break
        }

        case 'done':
          streamingIdRef.current = null
          setRunning(false)
          setStatusText(null)
          break

        case 'error':
          streamingIdRef.current = null
          push({ role: 'error', text: String(msg.message ?? 'Erro desconhecido') })
          setRunning(false)
          setStatusText(null)
          break
      }
    }

    return () => ws.close()
  }, [push])

  /**
   * Envia um turno: empilha a bolha do usuário, trava (running) e manda
   * `{ prompt, flow? }` — `flow` é o canvas serializado (flush, decisão 5). Só
   * vai quando há fluxo carregado; sem ele o backend parte do estado já em disco
   * (evita gravar string vazia e corromper o arquivo no reload do MCP).
   */
  const send = useCallback((prompt: string, flow: string | null) => {
    const ws = wsRef.current
    const text = prompt.trim()
    if (!text || running || !ws || ws.readyState !== WebSocket.OPEN) return
    push({ role: 'user', text })
    streamingIdRef.current = null
    setRunning(true)
    setStatusText('Pensando…')
    const payload: { prompt: string; flow?: string } = { prompt: text }
    if (flow && flow.trim()) payload.flow = flow
    ws.send(JSON.stringify(payload))
  }, [running, push])

  return { status, messages, running, statusText, send }
}
