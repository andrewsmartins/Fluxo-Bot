import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

export function WaitNode({ data }: { data: FlowNodeData }) {
  const preview = data.messagePreview?.replace(/@[\w.#]+/g, m => `[${m.slice(1)}]`) ?? ''

  return (
    <div className="bg-white border border-cyan-200 rounded-xl shadow-sm w-[240px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-cyan-400" />

      <div className="bg-cyan-500 text-white px-3 py-2 flex items-center gap-2">
        <WaitIcon />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">{data.name}</p>
          <p className="text-[10px] opacity-75 truncate">{data.category}</p>
        </div>
      </div>

      {preview && (
        <div className="px-3 py-2">
          <p className="text-xs text-slate-600 leading-relaxed line-clamp-3">{preview}</p>
        </div>
      )}

      <div className="px-3 pb-2">
        <span className="inline-flex items-center gap-1 text-[10px] bg-cyan-50 text-cyan-700 border border-cyan-200 rounded-full px-2 py-0.5">
          Aguarda interação do usuário
        </span>
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400" />
    </div>
  )
}

function WaitIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
