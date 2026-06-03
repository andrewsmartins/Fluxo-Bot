import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

export function ApiCallNode({ data }: { data: FlowNodeData }) {
  const apiName = data.apiName ?? null
  const preview = data.messagePreview?.replace(/@[\w.#]+/g, match => `[${match.slice(1)}]`) ?? ''

  return (
    <div className="bg-white dark:bg-slate-800 border border-teal-300 dark:border-teal-800/60 rounded-xl shadow-sm w-[240px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-teal-500" />

      <div className="bg-teal-600 text-white px-3 py-2 flex items-center gap-2">
        <ApiIcon />
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight truncate">{data.name}</p>
          <p className="text-[10px] opacity-80">Chamada de API</p>
        </div>
      </div>

      <div className="px-3 py-2 flex flex-col gap-1.5">
        {apiName && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 font-semibold">API</span>
            <span className="text-[10px] font-mono bg-teal-50 dark:bg-teal-900/30 text-teal-800 dark:text-teal-300 border border-teal-200 dark:border-teal-800 rounded px-1.5 py-0.5 truncate" title={apiName}>
              {apiName}
            </span>
          </div>
        )}
        {preview && (
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">{preview}</p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-teal-500" />
    </div>
  )
}

function ApiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}
