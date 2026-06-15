import { useState, useRef, useMemo, type ChangeEvent } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import type { BotFlowJson } from '../types'
import {
  restoreToBackup,
  planRestore,
  type RestorePlan,
  type RestoreReport,
} from '../utils/restoreFlow'
import { fetchServerIntents, type FetchLike } from '../utils/pushFlow'

/** Quantos caracteres finais do botId o usuário precisa digitar para confirmar o alvo. */
const CONFIRM_LEN = 6

const browserFetch: FetchLike = (url, init) => fetch(url, init)

interface RestoreDialogProps {
  onClose: () => void
}

/** Baixa um snapshot .json (estado atual antes do restore, ou qualquer backup). */
function downloadSnapshot(data: BotFlowJson, prefix: string, botId: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.download = `${prefix}-${botId}-${stamp}.json`
  a.href = url
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Modal de restore pela UI. Sobe o backup .json e restaura o bot ao ESTADO REAL
 * do arquivo: exclui o excedente, recria o que falta (com remap de IDs) e
 * sobrescreve o resto. Antes de tocar no servidor, baixa um snapshot de
 * segurança do estado atual. Guardrails do push (token em memória, confirmação
 * do botId, trava de bot de testes, dry-run) + aviso destrutivo. Só rascunho.
 */
export function RestoreDialog({ onClose }: RestoreDialogProps) {
  const isDark = useTheme()
  const [backup, setBackup] = useState<BotFlowJson | null>(null)
  const [backupName, setBackupName] = useState<string>('')
  const [token, setToken] = useState('')
  const [confirmTail, setConfirmTail] = useState('')
  const [isTestBot, setIsTestBot] = useState(false)
  const [busy, setBusy] = useState<false | 'preview' | 'restore'>(false)
  const [plan, setPlan] = useState<RestorePlan | null>(null)
  const [progress, setProgress] = useState<string[]>([])
  const [result, setResult] = useState<RestoreReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const botId = useMemo(() => {
    if (!backup) return ''
    return backup.list.find(i => i.category === 'start')?.botId ?? backup.list[0]?.botId ?? ''
  }, [backup])

  const tail = botId.slice(-CONFIRM_LEN)
  const tailOk = confirmTail.trim().toLowerCase() === tail.toLowerCase()
  const ready = !!backup && !!token.trim() && tailOk && botId.length > 0 && busy === false
  const canPreview = ready
  const canRestore = ready && isTestBot && !result

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target?.result as string) as BotFlowJson
        if (!data?.list || !Array.isArray(data.list) || data.list.length === 0) {
          setError('O backup precisa ter { "list": [...] } com ao menos uma intenção.')
          return
        }
        setBackup(data)
        setBackupName(file.name)
        setPlan(null)
        setError(null)
      } catch {
        setError('Arquivo inválido — não é um JSON de backup.')
      }
    }
    reader.onerror = () => setError('Não foi possível ler o arquivo.')
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handlePreview() {
    if (!backup) return
    setBusy('preview')
    setError(null)
    try {
      const serverIntents = await fetchServerIntents({ fetch: browserFetch, token: token.trim(), botId })
      setPlan(planRestore(backup.list, serverIntents))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao ler o estado do bot.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestore() {
    if (!backup) return
    setBusy('restore')
    setError(null)
    setProgress([])
    try {
      const report = await restoreToBackup({
        fetch: browserFetch,
        token: token.trim(),
        botId,
        backup,
        onSafetyBackup: snapshot => downloadSnapshot(snapshot, 'pre-restore', botId),
        onProgress: e => setProgress(p => [
          ...p,
          e.phase === 'delete'
            ? `rodada ${e.round}: excluir ${e.name} → HTTP ${e.status}`
            : `${e.phase === 'create' ? 'recriar' : 'sobrescrever'} ${e.name} → HTTP ${e.status}`,
        ]),
      })
      setResult(report)
      if (!report.ok) {
        const remaining = report.deletePhase.remaining.length
        setError(
          remaining
            ? `Sobraram ${remaining} intenção(ões) a excluir após ${report.deletePhase.rounds} rodadas — verifique na tela da Omni.`
            : 'O push do backup teve falhas — veja o relatório abaixo.',
        )
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha no restore.')
    } finally {
      setBusy(false)
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
        aria-label="Restaurar backup"
      >
        <div className={`flex items-center justify-between px-4 py-3 border-b sticky top-0 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-100'}`}>
          <h2 className={`text-sm font-semibold ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>Restaurar backup</h2>
          <button onClick={onClose} aria-label="Fechar" className={isDark ? 'text-slate-500 hover:text-slate-300' : 'text-slate-400 hover:text-slate-600'}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <p className={`text-[11px] leading-snug rounded-lg px-3 py-2 border ${isDark ? 'text-amber-300 bg-amber-950 border-amber-800' : 'text-amber-700 bg-amber-50 border-amber-200'}`}>
            ⚠ Operação destrutiva. Restaura o bot ao <strong>estado do backup</strong>: exclui o que sobra, recria o que falta
            (com remap de IDs) e sobrescreve o resto. Antes de tocar no servidor, baixa um <strong>snapshot de segurança</strong>
            do estado atual. Só altera o rascunho — não publica. O <code className="font-mono">DELETE</code> é de consistência
            eventual, então a exclusão reverifica em rodadas.
          </p>

          {/* Upload do backup */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Arquivo de backup (.json baixado antes do push)</span>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={busy !== false || !!result}
              className={`py-2 px-3 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700 hover:bg-slate-700' : 'text-slate-600 bg-white border-slate-200 hover:bg-slate-50'}`}
            >
              {backup ? `✓ ${backupName} (${backup.list.length} intenção(ões))` : 'Selecionar arquivo de backup…'}
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={handleFile} className="hidden" />
          </div>

          {/* Alvo */}
          <div className="flex flex-col gap-1">
            <span className={labelCls}>Bot de destino (lido do backup)</span>
            <code className={`font-mono text-xs px-2.5 py-2 rounded-lg border ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-700 bg-slate-50 border-slate-200'}`}>{botId || '— selecione um backup —'}</code>
          </div>

          {/* Token */}
          <label className="flex flex-col gap-1">
            <span className={labelCls}>Token de sessão</span>
            <input
              type="password"
              value={token}
              onChange={e => { setToken(e.target.value); setError(null) }}
              placeholder="r:•••••••• (só em memória — some ao fechar)"
              spellCheck={false}
              autoComplete="off"
              className={inputCls}
              disabled={busy !== false || !!result}
            />
            <span className={hintCls}>Nunca é salvo, logado nem incluído no relatório.</span>
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
              disabled={busy !== false || !!result || !backup}
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
            <span>Confirmo que este é um <strong>bot de testes</strong> e que o conteúdo será sobrescrito (com exclusões).</span>
          </label>

          {/* Dry-run / preview */}
          {plan && (
            <div className={`text-[11px] rounded-lg px-3 py-2 border ${isDark ? 'text-slate-300 bg-slate-800 border-slate-700' : 'text-slate-600 bg-slate-50 border-slate-200'}`}>
              <p className="font-semibold mb-1">
                Servidor tem {plan.serverTotal}; backup define {plan.keepCount}.
                Excluir {plan.extras.length} · recriar {plan.creates.length} · sobrescrever {plan.updates.length}
              </p>
              <div className="max-h-28 overflow-y-auto font-mono leading-relaxed">
                {plan.extras.map(i => <div key={`d${i.id}`}>− {i.name}</div>)}
                {plan.creates.map(i => <div key={`c${i.id}`}>+ {i.name}</div>)}
                {plan.updates.map(i => <div key={`u${i.id}`}>~ {i.name}</div>)}
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
              <p className="font-semibold">{result.ok ? '✓ Restore concluído' : '✕ Restore incompleto'}</p>
              <p className="mt-1 text-[11px] opacity-80">
                Excluídas {result.deletePhase.deleted.length} em {result.deletePhase.rounds} rodada(s);
                recriadas/sobrescritas {result.pushPhase.okCount}/{result.pushPhase.results.length}.
                {result.ok ? ' O bot está no estado do backup.' : ' Verifique na tela da Omni.'}
              </p>
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
                  onClick={handleRestore}
                  disabled={!canRestore}
                  className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-rose-600 rounded-lg hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {busy === 'restore' ? 'Restaurando…' : 'Restaurar para o backup'}
                </button>
              </>
            ) : (
              <button
                onClick={onClose}
                className="flex-1 py-2 px-3 text-xs font-semibold text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors"
              >
                Fechar
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
