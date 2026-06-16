import { createContext, useContext } from 'react'
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react'

/**
 * Ações de aresta expostas pelo FlowCanvas às arestas customizadas. Usado para
 * que o botão de remover (na DeletableEdge) caia no mesmo caminho de exclusão do
 * App (patch no modelo + histórico), sem passar callbacks pelo `data` da aresta.
 */
export const EdgeActionsContext = createContext<{ onDeleteEdge: (edgeId: string) => void }>({
  onDeleteEdge: () => {},
})

/**
 * Aresta de fluxo (`-next` / escolha) com um botão "×" no meio para remover a
 * conexão — forma descobrível de desfazer uma ligação (o atalho Delete continua
 * valendo). Só as arestas deletáveis usam este tipo; externas e de contexto
 * seguem como smoothstep simples (sem botão), pois não são removíveis aqui.
 */
export function DeletableEdge({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label,
}: EdgeProps) {
  const { onDeleteEdge } = useContext(EdgeActionsContext)
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
  })

  return (
    <>
      <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          data-edge-id={id}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          {label && (
            <span className="react-flow__edge-label" style={{ fontSize: 11, color: '#475569', background: '#f8fafc', opacity: 0.95, padding: '1px 5px', borderRadius: 4 }}>
              {label}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onDeleteEdge(id) }}
            title="Remover conexão"
            aria-label="Remover conexão"
            className="flex items-center justify-center w-4 h-4 rounded-full text-[11px] leading-none border border-slate-300 bg-white text-slate-400 shadow-sm hover:bg-rose-500 hover:text-white hover:border-rose-500 transition-colors"
          >×</button>
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
