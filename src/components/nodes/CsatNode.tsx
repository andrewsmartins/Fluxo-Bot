import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

const CSAT_LABELS: Record<string, string> = {
  supportRate:        'Nota da avaliação',
  supportRateComment: 'Comentário da avaliação',
}

/** action.type = captureCsat — captura da pesquisa de satisfação (CSAT). */
export function CsatNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const csatLabel = data.captureDataType ? (CSAT_LABELS[data.captureDataType] ?? data.captureDataType) : 'CSAT'

  return (
    <NodeShell kind="csatNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="csatNode">{csatLabel}</NodePill>
    </NodeShell>
  )
}
