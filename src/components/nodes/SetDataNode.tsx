import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

export function SetDataNode({ data }: { data: FlowNodeData }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/60 rounded-xl shadow-sm w-[240px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-indigo-400" />

      <div className="bg-indigo-500 text-white px-3 py-2 flex items-center gap-2">
        <SetIcon />
        <div className="min-w-0">
          <p className="text-xs font-semibold leading-tight truncate">{data.name}</p>
          <p className="text-[10px] opacity-75 truncate">{data.category}</p>
        </div>
      </div>

      {data.setDataItems.length > 0 && (
        <div className="px-3 py-2 flex flex-col gap-1">
          {data.setDataItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px]">
              <span className="font-mono text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 rounded px-1 py-0.5 truncate max-w-[110px]">
                {item.variable}
              </span>
              <span className="text-slate-400 dark:text-slate-500">=</span>
              <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-indigo-400" />
    </div>
  )
}

function SetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  )
}
