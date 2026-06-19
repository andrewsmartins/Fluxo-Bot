import { Panel } from '@xyflow/react'
import { useTheme } from '../contexts/ThemeContext'
import { CREATABLE_KIND_LABELS as KIND_LABELS, type CreatableKind } from '../utils/intentTemplates'
import { nodeColor } from '../utils/nodeVisual'

/** MIME type interno usado no drag & drop da paleta para o canvas. */
export const PALETTE_DRAG_TYPE = 'application/fluxo-node-kind'

/**
 * A paleta agrupa os 11 tipos em dois blocos: "Fluxo" (os 6 do dia a dia) e
 * "Avançado" (os 5 da Fase 6). Mantém a lista navegável agora que dobrou de tamanho.
 */
const PALETTE_GROUPS: { title: string; kinds: CreatableKind[] }[] = [
  { title: 'Fluxo',    kinds: ['defaultNode', 'choiceNode', 'captureNode', 'transferNode', 'waitNode', 'setDataNode'] },
  { title: 'Avançado', kinds: ['endNode', 'apiCallNode', 'orderNode', 'csatNode', 'storeNode'] },
]

/**
 * Paleta de criação de nós: arraste um tipo para o canvas para criar uma
 * intenção nova (template canônico mínimo) naquela posição.
 */
export function NodePalette() {
  const isDark = useTheme()

  return (
    <Panel position="top-left">
      <div className={`flex flex-col gap-1 border rounded-lg shadow-sm p-2 ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>
        <p className={`text-[10px] font-semibold uppercase tracking-wide px-1 pb-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
          Criar nó (arraste)
        </p>
        {PALETTE_GROUPS.map((group, gi) => (
          <div key={group.title} className={`flex flex-col gap-1 ${gi > 0 ? `pt-1.5 mt-0.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}` : ''}`}>
            <p className={`text-[9px] font-semibold uppercase tracking-wider px-1 ${isDark ? 'text-slate-600' : 'text-slate-300'}`}>
              {group.title}
            </p>
            {group.kinds.map(kind => (
              <div
                key={kind}
                draggable
                onDragStart={e => {
                  e.dataTransfer.setData(PALETTE_DRAG_TYPE, kind)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                className={`flex items-center gap-2 px-2 py-1.5 text-xs font-medium rounded-md cursor-grab active:cursor-grabbing border transition-colors ${
                  isDark
                    ? 'text-slate-300 border-slate-700 hover:bg-slate-800'
                    : 'text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
                title={`Arraste para o canvas para criar um nó de ${KIND_LABELS[kind]}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: nodeColor(kind) }} />
                {KIND_LABELS[kind]}
              </div>
            ))}
          </div>
        ))}

        {/* Tipos que existem no fluxo mas não são criáveis — papel de legenda */}
        <div className={`flex flex-col gap-1 pt-1 mt-0.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          {[{ color: nodeColor('startNode'), label: 'Início' }, { color: nodeColor('externalBotNode'), label: 'Outro Bot' }].map(item => (
            <div key={item.label} className={`flex items-center gap-2 px-2 py-0.5 text-[11px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  )
}
