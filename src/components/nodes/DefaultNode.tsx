import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview } from './NodeShell'

export function DefaultNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell kind="defaultNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
    </NodeShell>
  )
}
