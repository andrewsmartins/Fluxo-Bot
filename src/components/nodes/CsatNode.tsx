import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'
import { CSAT_CAPTURE_TYPES } from '../DetailPanel'

// Rótulos do pill derivam da MESMA fonte do dropdown do editor (CSAT_CAPTURE_TYPES) —
// `labelPill` é o texto curto (o dropdown usa o `labelDropdown`, mais descritivo).
// Pill e editor nunca divergem.
const CSAT_LABELS: Record<string, string> = Object.fromEntries(
  CSAT_CAPTURE_TYPES.map(t => [t.value, t.labelPill]),
)

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
