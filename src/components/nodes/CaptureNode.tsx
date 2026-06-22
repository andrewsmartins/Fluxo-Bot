import type { FlowNodeData } from '../../types'
import { captureFieldLabel } from '../../utils/captureFields'
import { NodeShell, NodePreview, NodePill, NodeNote } from './NodeShell'

export function CaptureNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const multiple = data.captureMultipleFields ?? []
  const isMultiple = multiple.length > 0
  // No single, lista o único dado (se houver); no múltiplo, todos os marcados.
  const fields = isMultiple ? multiple : (data.captureDataType ? [data.captureDataType] : [])

  return (
    <NodeShell kind="captureNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      {fields.length > 0 && (
        <div className="flex flex-col gap-1">
          {/* Cabeçalho do modo, acima das TAGs dos campos. */}
          <NodeNote>
            {isMultiple ? 'Captura de múltiplas informações:' : 'Captura de uma informação:'}
          </NodeNote>
          {/* Todos os campos selecionados como pílulas (o nó cresce conforme a seleção). */}
          <div className="flex flex-wrap gap-1">
            {fields.map(field => (
              <NodePill key={field} kind="captureNode">
                <span className="font-semibold">{captureFieldLabel(field)}</span>
              </NodePill>
            ))}
          </div>
        </div>
      )}
    </NodeShell>
  )
}
