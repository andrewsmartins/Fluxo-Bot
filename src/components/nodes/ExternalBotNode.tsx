import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'

function truncate(str: string, len = 12) {
  return str.length > len ? str.slice(0, len) + '…' : str
}

export function ExternalBotNode({ data }: { data: FlowNodeData }) {
  const botId    = data.externalBotId    ?? ''
  const intentId = data.externalIntentId ?? ''

  return (
    <div className="bg-white border-2 border-amber-400 border-dashed rounded-xl shadow-sm w-[240px] overflow-hidden">
      <Handle type="target" position={Position.Top} className="!bg-amber-400" />

      <div className="bg-amber-400 text-white px-3 py-2 flex items-center gap-2">
        <ExternalIcon />
        <div className="min-w-0">
          <p className="text-xs font-bold leading-tight truncate">{data.name || 'Outro Bot'}</p>
          <p className="text-[10px] opacity-80">Redirecionamento externo</p>
        </div>
      </div>

      <div className="px-3 py-2 flex flex-col gap-1.5">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Bot ID</span>
          <span
            className="text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 truncate cursor-default"
            title={botId}
          >
            {truncate(botId, 22)}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] uppercase tracking-wider text-slate-400 font-semibold">Intent ID</span>
          <span
            className="text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 truncate cursor-default"
            title={intentId}
          >
            {truncate(intentId, 22)}
          </span>
        </div>
      </div>
    </div>
  )
}

function ExternalIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  )
}
