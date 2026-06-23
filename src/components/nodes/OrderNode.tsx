import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill } from './NodeShell'
import { ORDER_ACTIONS } from '../DetailPanel'

// Rótulos do pill derivam da MESMA fonte do dropdown do editor (ORDER_ACTIONS) —
// dropdown e canvas nunca divergem (ex.: "Adicionar item" para addToCart).
const ORDER_LABELS: Record<string, string> = Object.fromEntries(
  ORDER_ACTIONS.map(a => [a.value, a.label]),
)

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
