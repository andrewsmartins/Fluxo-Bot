import type { FlowNodeData } from '../../types'
import { NodeShell, NodePreview, NodePill, NodeNote } from './NodeShell'
import { listIcon } from './nodeIcons'

export function ChoiceNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const isList = data.actionType === 'list'

  return (
    <NodeShell
      kind="choiceNode"
      title={data.name}
      subtitle={data.category}
      selected={selected}
      icon={isList ? listIcon() : undefined}
    >
      <NodePreview text={data.messagePreview} />
      {data.buttons.length > 0 && (
        <div className="flex flex-col gap-1">
          {data.buttons.slice(0, 4).map(btn => (
            <NodePill key={btn.id} kind="choiceNode" className="w-full">
              <span className="truncate" title={btn.description ?? btn.text}>{btn.text}</span>
            </NodePill>
          ))}
          {data.buttons.length > 4 && <NodeNote>+{data.buttons.length - 4} opções</NodeNote>}
        </div>
      )}
    </NodeShell>
  )
}
