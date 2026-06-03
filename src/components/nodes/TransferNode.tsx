import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

export function TransferNode({ data }: { data: FlowNodeData }) {
  const preview = data.messagePreview?.replace(/@[\w.#]+/g, match => `[${match.slice(1)}]`) ?? ''

  return (
    <div className="bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800/60 rounded-xl shadow-sm w-[240px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-rose-400" />

      <div className="bg-rose-500 text-white px-3 py-2">
        <p className="text-xs font-semibold leading-tight truncate">{data.name}</p>
        <p className="text-[10px] opacity-75 truncate">{data.category}</p>
      </div>

      {preview && (
        <div className="px-3 pt-2 pb-1">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-3">{preview}</p>
        </div>
      )}

      <div className="px-3 pb-2 pt-1">
        <span className="inline-flex items-center gap-1 text-[10px] bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 rounded-full px-2 py-0.5">
          Transferência para atendente
        </span>
      </div>
    </div>
  )
}
