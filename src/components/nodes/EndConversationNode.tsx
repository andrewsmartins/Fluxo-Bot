import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

export function EndConversationNode({ data }: { data: FlowNodeData }) {
  return (
    <div className="bg-white border-2 border-rose-400 rounded-xl shadow-sm w-[200px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-rose-400" />

      <div className="bg-rose-500 text-white px-3 py-2.5 flex items-center gap-2">
        <StopIcon />
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight truncate">{data.name}</p>
          <p className="text-[10px] opacity-80">Encerrar conversa</p>
        </div>
      </div>
    </div>
  )
}

function StopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 opacity-90">
      <rect x="3" y="3" width="18" height="18" rx="3" />
    </svg>
  )
}
