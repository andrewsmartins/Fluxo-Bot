import { Handle, Position } from '@xyflow/react'
import type { FlowNodeData } from '../../types'
import { useTheme } from '../../contexts/ThemeContext'
import { priorityLabel } from '../../utils/nodeMeta'

/**
 * Container de agrupamento por intenção (Modelo B, Fase 6). Renderiza o cabeçalho
 * comum da intenção — Nome · Categoria · Prioridade (sempre visível) · Keywords ·
 * ícones de Contexto e de tempo de resposta — e serve de "pai" React Flow para os
 * nós-condição, que o React Flow posiciona sobre o corpo transparente.
 */
export function IntentGroupNode({ data }: { data: FlowNodeData }) {
  const isDark = useTheme()
  const keywords = data.keywords ?? []

  return (
    <div className={`h-full w-full rounded-2xl border-2 shadow-sm ${isDark ? 'bg-slate-900/60 border-slate-700' : 'bg-slate-50/80 border-slate-300'}`}>
      <Handle type="target" position={Position.Top} className={isDark ? '!bg-slate-400' : '!bg-slate-500'} />
      {/* Handles laterais EXCLUSIVOS da aresta de Contexto (Modelo B): o grupo
          pode ter contexto próprio (entrada à esquerda) ou ser a intenção-de-
          contexto de outra (saída à direita). As arestas de fluxo entram pelo
          topo e saem dos filhos — o container não é origem de fluxo. */}
      <Handle id="ctx-target" type="target" position={Position.Left} isConnectable={false} className="!bg-slate-300 !w-2 !h-2 !border-0" />
      <Handle id="ctx-source" type="source" position={Position.Right} isConnectable={false} className="!bg-slate-300 !w-2 !h-2 !border-0" />

      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className={`text-sm font-bold leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{data.name}</p>
            <p className={`text-[11px] leading-tight truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{data.category}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {data.hasContext && (
              <span title="Ativa apenas vindo da intenção de contexto" className={isDark ? 'text-amber-400' : 'text-amber-500'}>
                <ContextIcon />
              </span>
            )}
            {data.hasDelay && (
              <span title="Tempo de resposta configurado" className={isDark ? 'text-cyan-400' : 'text-cyan-500'}>
                <DelayIcon />
              </span>
            )}
            <span
              title="Prioridade da intenção"
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${isDark ? 'bg-slate-800 text-slate-300 border border-slate-600' : 'bg-white text-slate-600 border border-slate-300'}`}
            >
              {priorityLabel(data.priority)}
            </span>
          </div>
        </div>

        {keywords.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {keywords.slice(0, 5).map((kw, i) => (
              <span
                key={i}
                className={`text-[9px] rounded px-1.5 py-0.5 truncate max-w-[120px] ${isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-600'}`}
                title={kw}
              >
                {kw}
              </span>
            ))}
            {keywords.length > 5 && (
              <span className={`text-[9px] px-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>+{keywords.length - 5}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function ContextIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function DelayIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="shrink-0">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}
