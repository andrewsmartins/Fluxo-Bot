import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

/** action.type = external — chamada de API externa (≠ redirecionamento a outro bot). */
export function ApiCallNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell kind="apiCallNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="apiCallNode">
        <span>Chamada API</span>
        {data.apiName && <span className="font-semibold font-mono truncate max-w-[120px]">{data.apiName}</span>}
      </NodePill>
    </NodeShell>
  )
}
