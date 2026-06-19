import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

/** action.type = store — ações sobre a loja física. */
export function StoreNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell kind="storeNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="storeNode">
        <span>Loja física</span>
        {data.storeType && <span className="font-semibold">{data.storeType}</span>}
      </NodePill>
    </NodeShell>
  )
}
