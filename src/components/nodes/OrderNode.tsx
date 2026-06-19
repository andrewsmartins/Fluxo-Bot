import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'

const ORDER_LABELS: Record<string, string> = {
  generateOrder: 'Gerar pedido',
  addToCart:     'Adicionar ao carrinho',
}

/** action.type = order — pedido (gerar pedido / adicionar ao carrinho). */
export function OrderNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const orderLabel = data.orderType ? (ORDER_LABELS[data.orderType] ?? data.orderType) : 'Pedido'

  return (
    <NodeShell kind="orderNode" title={data.name} subtitle={data.category} selected={selected}>
      <NodePreview text={data.messagePreview} />
      <NodePill kind="orderNode">{orderLabel}</NodePill>
    </NodeShell>
  )
}
