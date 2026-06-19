import type { FlowNodeData } from '../../types'
import { NodeShell, NodePill, NodeNote } from './NodeShell'

function truncate(str: string, len = 22) {
  return str.length > len ? str.slice(0, len) + '…' : str
}

/** Nó sintético de redirecionamento para outro bot (read-only, borda tracejada, sem saída). */
export function ExternalBotNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const botId    = data.externalBotId    ?? ''
  const intentId = data.externalIntentId ?? ''

  return (
    <NodeShell
      kind="externalBotNode"
      title="Outro Bot"
      subtitle="Redirecionamento externo"
      selected={selected}
      hasSource={false}
      dashed
    >
      <div className="flex flex-col gap-0.5">
        <NodeNote>Bot ID</NodeNote>
        <NodePill kind="externalBotNode" className="font-mono" title={botId}>{truncate(botId)}</NodePill>
      </div>
      <div className="flex flex-col gap-0.5">
        <NodeNote>Intent ID</NodeNote>
        <NodePill kind="externalBotNode" className="font-mono" title={intentId}>{truncate(intentId)}</NodePill>
      </div>
    </NodeShell>
  )
}
