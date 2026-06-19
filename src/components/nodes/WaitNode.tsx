import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

export function WaitNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell kind="waitNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="waitNode">Aguarda interação do usuário</NodePill>
    </NodeShell>
  )
}
