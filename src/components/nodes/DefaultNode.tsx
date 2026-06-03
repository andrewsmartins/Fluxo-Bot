import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

export function DefaultNode({ data }: { data: FlowNodeData }) {
  const preview = data.messagePreview?.replace(/@[\w.#]+/g, match => `[${match.slice(1)}]`) ?? ''

  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-xl shadow-sm w-[240px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-slate-400" />

      <div className="bg-slate-500 text-white px-3 py-2">
        <p className="text-xs font-semibold leading-tight truncate">{data.name}</p>
        <p className="text-[10px] opacity-75 truncate">{data.category}</p>
      </div>

      {preview && (
        <div className="px-3 py-2">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{preview}</p>
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-slate-400" />
    </div>
  )
}
