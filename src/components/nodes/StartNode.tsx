import type { FlowNodeData } from '../../types'
import { NodeShell } from './NodeShell'

/** Nó de início do fluxo — card no mesmo padrão dos demais, com chip play esmeralda
 *  e sem handle de entrada (o fluxo só SAI do start). */
export function StartNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  return (
    <NodeShell
      kind="startNode"
      title={data.name}
      subtitle="Início do fluxo"
      selected={selected}
      hasTarget={false}
    />
  )
}
