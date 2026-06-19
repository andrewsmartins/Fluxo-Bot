import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

/** Nó terminal: action.type = endConversation (Terminar conversa). Sem saída. */
export function EndNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell kind="endNode" title={data.name} subtitle={data.category} selected={selected} hasSource={false}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="endNode">Encerra a conversa</NodePill>
    </NodeShell>
  )
}
