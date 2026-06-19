import { useState, useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import type { BotFlowJson } from '../types'
import type { ValidationReport } from '../utils/validateFlow'
import {
  pushFlow,
  planPush,
  fetchServerIntents,
  type FetchLike,
  type PushPlan,
  type PushReport,
} from '../utils/pushFlow'

/** Quantos caracteres finais do botId o usuário precisa digitar para confirmar o alvo. */
const CONFIRM_LEN = 6

/** O `fetch` do navegador adaptado à assinatura mínima que o módulo espera. */
const browserFetch: FetchLike = (url, init) => fetch(url, init)

interface PushDialogProps {
  /** Modelo a enviar (fonte de verdade do App). Não é mutado — o push clona. */
  model: BotFlowJson
  /** Validação viva: erros bloqueiam o envio (o servidor não barra payload inválido). */
  report: ValidationReport
  /** Token de sessão GLOBAL (App) — compartilhado com restore/times. Só em memória. */
  token: string
  onTokenChange: (token: string) => void
  onClose: () => void
}

/** Baixa o estado atual do bot como backup .json antes do primeiro POST. */
function downloadBackup(data: BotFlowJson, botId: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = `backup-${botId}-${stamp}.json`
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}

/** Monta o relatório textual SANITIZADO (sem token) para o botão "copiar". */
function buildReportText(result: PushReport, botId: string): string {
  const lines: string[] = [
    `Push OmniChat — ${new Date().toISOString()}`,
    `Bot: ${botId}`,
    `Operações OK: ${result.okCount}/${result.results.length}${result.failed ? ' — INTERROMPIDO no primeiro erro' : ''}`,
  ]
  for (const r of result.results) {
    const idInfo = r.op === 'criar' ? `${r.sent} -> ${r.got ?? '?'}` : r.sent
    lines.push(`- [${r.op}] ${r.name} (${idInfo}) -> HTTP ${r.status}`)
  }
  const map = Object.entries(result.idMap)
  if (map.length) {
    lines.push('Mapa de IDs (cliente -> servidor):')
    for (const [from, to] of map) lines.push(`  ${from} -> ${to}`)
  }
  return lines.join('\n')
}

/**
 * Modal de push pela UI (Fase 4b). Faz o mesmo envio do `scripts/push-flow.mjs`
 * direto do navegador, com guardrails conscientes: token só em memória,
 * confirmação do alvo digitando o fim do botId, trava de "bot de testes",
 * dry-run antes de enviar e backup baixado antes do primeiro POST. Só altera o
 * RASCUNHO — publicar continua manual na plataforma.
 */
export function PushDialog({ model, report, token, onTokenChange, onClose }: PushDialogProps) {
  const isDark = useTheme()
  const [confirmTail, setConfirmTail] = useState('')
  const [isTestBot, setIsTestBot] = useState(false)
  const [busy, setBusy] = useState<false | 'preview' | 'push'>(false)
  const [plan, setPlan] = useState<PushPlan | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [result, setResult] = useState<PushReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const botId = useMemo(
    () => model.list.find(i => i.category === 'start')?.botId ?? model.list[0]?.botId ?? '',
    [model],
  )

  const hasErrors = report.errors.length > 0
  const tail = botId.slice(-CONFIRM_LEN)
  const tailOk = confirmTail.trim().toLowerCase() === tail.toLowerCase()
  const canPreview = !!token.trim() && tailOk && botId.length > 0 && busy === false
  const canPush = canPreview && isTestBot && !hasErrors && !result

  async function handlePreview() {
    setBusy('preview')
    setError(null)
    try {
      const serverIntents = await fetchServerIntents({ fetch: browserFetch, token: token.trim(), botId })
      setPlan(planPush(model.list, serverIntents))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o estado do bot.')
    } finally {
      setBusy(false)
    }
  }

  async function handlePush() {
    setBusy('push')
    setError(null)
    setProgress([])
    try {
      const pushReport = await pushFlow(model, {
        fetch: browserFetch,
        token: token.trim(),
        botId,
        onBackup: data => downloadBackup(data, botId),
        onProgress: e => setProgress(p => [...p, `[${e.op}] ${e.name} → HTTP ${e.status}`]),
      })
      setResult(pushReport)
      if (pushReport.failed) setError('Push interrompido no primeiro erro — veja o relatório abaixo.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no push.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(buildReportText(result, botId))
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar — copie manualmente do relatório acima.')
    }
  }

  const inputCls = `w-full font-mono text-xs rounded-lg p-2.5 border focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${isDark ? 'bg-slate-800 text-slate-200 border-slate-700 placeholder:text-slate-600' : 'bg-slate-50 text-slate-900 border-slate-200 placeholder:text-slate-400'}`
  const labelCls = `text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`
  const hintCls = `text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className={`w-[560px] max-w-[92vw] max-h-[90vh] overflow-y-auto rounded-xl border shadow-2xl flex flex-col ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-label="Enviar para OmniChat"
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b sticky top-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Enviar para OmniChat</h2>
          <button onClick={onClose} aria-label="Fechar" className={isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className={`text-[11px] leading-snug rounded-lg px-3 py-2 border ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
            O envio altera apenas o <strong>rascunho</strong> do bot (publicar continua manual na plataforma).
            Um <strong>backup</strong> do estado atual é baixado antes do primeiro envio. O envio é em 2 passadas
            (cria → remapeia IDs → atualiza). Reenviar o mesmo fluxo cria cópias — o servidor gera IDs novos.
          </p>

          {hasErrors && (
            <p className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
              ✕ Corrija os {report.errors.length} erro(s) de validação antes de enviar — a API aceita payloads inválidos silenciosamente.
            </p>
          )}

          {/* Alvo */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Bot de destino</span>
            <code className={`font-mono text-xs px-2.5 py-2 rounded-lg border ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-700 bg-slate-50 border-slate-200'}`}>{botId || '— sem botId —'}</code>
          </div>

          {/* Token */}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Token de sessão</span>
            <input
              type="password"
              value={token}
              onChange={e => { onTokenChange(e.target.value); setError(null) }}
              placeholder="r:•••••••• (token global da sessão — só em memória)"
              spellCheck={false}
              autoComplete="off"
              autoFocus
              className={inputCls}
              disabled={busy !== false || !!result}
            />
            <span className={hintCls}>Copie da aba Network de uma sessão logada. Nunca é salvo, logado nem incluído no relatório.</span>
          </label>

          {/* Confirmação do alvo */}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Confirme o alvo: digite os últimos {CONFIRM_LEN} caracteres do botId</span>
            <input
              value={confirmTail}
              onChange={e => { setConfirmTail(e.target.value); setError(null) }}
              placeholder={tail ? `…${tail}` : ''}
              spellCheck={false}
              autoComplete="off"
              className={`${inputCls} ${confirmTail && !tailOk ? (isDark ? 'border-rose-700' : 'border-rose-300') : ''}`}
              disabled={busy !== false || !!result}
            />
            {confirmTail && !tailOk && (
              <span className={`text-[11px] ${isDark ? 'text-rose-400' : 'text-rose-500'}`}>Não confere com o fim do botId.</span>
            )}
          </label>

          {/* Trava de bot de testes */}
          <label className={`flex items-start gap-2 text-xs cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            <input
              type="checkbox"
              checked={isTestBot}
              onChange={e => setIsTestBot(e.target.checked)}
              className="mt-0.5"
              disabled={busy !== false || !!result}
            />
            <span>Confirmo que este é um <strong>bot de testes</strong> e estou ciente de que o envio altera o rascunho.</span>
          </label>

          {/* Dry-run / preview */}
          {plan && (
            <div className={`text-[11px] rounded-lg px-3 py-2 border ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
              <p className="font-semibold mb-1">Prévia: {plan.creates.length} criação(ões), {plan.updates.length} atualização(ões)</p>
              <div className="max-h-28 overflow-y-auto font-mono leading-relaxed">
                {plan.creates.map(i => <div key={i.id}>+ {i.name}</div>)}
                {plan.updates.map(i => <div key={i.id}>~ {i.name}</div>)}
              </div>
            </div>
          )}

          {/* Progresso / relatório */}
          {progress.length > 0 && (
            <div className={`text-[11px] font-mono rounded-lg px-3 py-2 border max-h-32 overflow-y-auto leading-relaxed ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
              {progress.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}

          {result && (
            <div className={`text-xs rounded-lg px-3 py-2 border ${result.ok ? (isDark ? 'text-emerald-300 bg-emerald-950 border-emerald-800' : 'text-emerald-700 bg-emerald-50 border-emerald-200') : (isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-600 bg-rose-50 border-rose-200')}`}>
              <p className="font-semibold">{result.ok ? '✓ Push concluído' : '✕ Push com falhas'} — {result.okCount}/{result.results.length} operações OK</p>
              <p className="mt-1 text-[11px] opacity-80">Valide na tela da Omni (lista, formulário, simulador). O backup foi baixado.</p>
            </div>
          )}

          {error && (
            <p className={`text-xs rounded-lg px-3 py-2 leading-relaxed border ${isDark ? 'text-rose-300 bg-rose-950 border-rose-800' : 'text-rose-600 bg-rose-50 border-rose-200'}`}>
              {error}
            </p>
          )}

          {/* Ações */}
          <div className="flex gap-2">
            {!result ? (
              <>
                <button
                  onClick={handlePreview}
                  disabled={!canPreview}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
                >
                  {busy === 'preview' ? 'Lendo…' : 'Pré-visualizar (dry-run)'}
                </button>
                <button
                  onClick={handlePush}
                  disabled={!canPush}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === 'push' ? 'Enviando…' : 'Enviar para OmniChat'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleCopy}
                  className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
                >
                  {copied ? 'Copiado ✓' : 'Copiar relatório'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-slate-900 bg-amber-400 rounded-lg hover:bg-amber-500 transition-colors"
                >
                  Fechar
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
