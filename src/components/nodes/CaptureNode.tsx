import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

const CAPTURE_LABELS: Record<string, string> = {
  name: 'Nome',
  fullName: 'Nome completo',
  zipcode: 'CEP',
  addressNumber: 'Número do endereço',
  addressComplement: 'Complemento',
  email: 'E-mail',
  phone: 'Telefone',
  cpf: 'CPF',
}

export function CaptureNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const captureLabel = data.captureDataType
    ? (CAPTURE_LABELS[data.captureDataType] ?? data.captureDataType)
    : null

  return (
    <NodeShell kind="captureNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      {captureLabel && (
        <NodePill kind="captureNode">
          <span>Captura:</span>
          <span className="font-semibold">{captureLabel}</span>
        </NodePill>
      )}
    </NodeShell>
  )
}
