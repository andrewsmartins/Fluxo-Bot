import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

/** Transferência para atendente — nó terminal (sem saída de fluxo). */
export function TransferNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell kind="transferNode" title={data.name} subtitle={data.category} selected={selected} hasSource={false}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="transferNode">Transferência para atendente</NodePill>
    </NodeShell>
  )
}
