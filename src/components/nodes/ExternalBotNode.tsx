import { useEffect } from 'react'
import type { FlowNodeData } from '../../types'
import { NodeShell, NodePill, NodeNote } from './NodeShell'
import { useTeams } from '../../contexts/TeamsContext'

// Corte em JS (e não CSS): dentro do `NodePill` (inline-flex) o `text-overflow:
// ellipsis` não age de forma confiável. 32 ≈ o que cabe na largura do card (240px)
// a 10px de fonte; o `title` do pill mantém o valor completo no hover.
function truncate(str: string, len = 32) {
  return str.length > len ? str.slice(0, len) + '…' : str
}

/**
 * Nó sintético de redirecionamento para outro bot (read-only, cinza, sem saída).
 * Resolve os nomes do bot e da intenção pelo `TeamsContext` (mesma fonte do picker
 * "Próximo Fluxo"): com token de sessão, dispara os fetchs idempotentes e troca os
 * IDs crus pelos nomes legíveis; sem token (ou ainda não resolvido) cai para o ID.
 */
export function ExternalBotNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const botId    = data.externalBotId    ?? ''
  const intentId = data.externalIntentId ?? ''

  const {
    bots, botsStatus, loadBots,
    botIntents, botIntentsStatus, loadBotIntents,
    hasToken,
  } = useTeams()

  // Com token, resolve o nome do bot (lista da conta, carregada uma vez por sessão).
  useEffect(() => {
    if (hasToken && botId && botsStatus === 'idle') loadBots()
  }, [hasToken, botId, botsStatus, loadBots])

  // ...e as intenções do bot de destino (cache por bot, idempotente).
  useEffect(() => {
    if (hasToken && botId && !botIntentsStatus[botId]) loadBotIntents(botId)
  }, [hasToken, botId, botIntentsStatus, loadBotIntents])

  const botName    = bots.find(b => b.botId === botId)?.name ?? null
  const intentName = (botIntents[botId] ?? []).find(i => i.id === intentId)?.name ?? null

  // Nome quando resolvido (legível); senão o ID cru (monoespaçado, rastreável).
  const botLabel     = botName    ?? botId
  const intentLabel  = intentName ?? intentId
  const botTitle     = botName    ? `${botName} (${botId})`       : botId
  const intentTitle  = intentName ? `${intentName} (${intentId})` : intentId

  return (
    <NodeShell
      kind="externalBotNode"
      title="Outro Bot"
      subtitle="Redirecionamento externo"
      selected={selected}
      hasSource={false}
    >
      <div className="flex flex-col gap-0.5">
        <NodeNote>Bot</NodeNote>
        <NodePill kind="externalBotNode" className={botName ? '' : 'font-mono'} title={botTitle}>
          {truncate(botLabel)}
        </NodePill>
      </div>
      <div className="flex flex-col gap-0.5">
        <NodeNote>Intenção</NodeNote>
        <NodePill kind="externalBotNode" className={intentName ? '' : 'font-mono'} title={intentTitle}>
          {truncate(intentLabel)}
        </NodePill>
      </div>
    </NodeShell>
  )
}
