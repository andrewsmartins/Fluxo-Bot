import type { FlowNodeData } from '../../types'
import { useTheme } from '../../contexts/ThemeContext'
import { NodeShell, NodePill, NodeNote } from './NodeShell'

export function SetDataNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const isDark = useTheme()

  return (
    <NodeShell kind="setDataNode" title={data.name} subtitle={data.category} selected={selected}>
      {data.setDataItems.length > 0 && (
        <div className="flex flex-col gap-1">
          {data.setDataItems.map((item, i) => (
            <div key={i} className="flex items-center gap-1 text-[10px] min-w-0">
              <NodePill kind="setDataNode" className="font-mono max-w-[110px]">{item.variable}</NodePill>
              <NodeNote>=</NodeNote>
              <span className={`font-medium truncate ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </NodeShell>
  )
}
