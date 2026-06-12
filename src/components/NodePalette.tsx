import { Panel } from '@xyflow/react'
import { useTheme } from '../contexts/ThemeContext'
import { CREATABLE_KINDS, type CreatableKind } from '../utils/intentTemplates'

/** MIME type interno usado no drag & drop da paleta para o canvas. */
export const PALETTE_DRAG_TYPE = 'application/fluxo-node-kind'

const KIND_LABELS: Record<CreatableKind, string> = {
  defaultNode:  'Mensagem',
  choiceNode:   'Escolha',
  captureNode:  'Captura',
  transferNode: 'Transferência',
  waitNode:     'Espera',
  setDataNode:  'Definir dados',
}

const KIND_COLORS: Record<CreatableKind, string> = {
  defaultNode:  '#64748b',
  choiceNode:   '#3b82f6',
  captureNode:  '#8b5cf6',
  transferNode: '#f43f5e',
  waitNode:     '#06b6d4',
  setDataNode:  '#6366f1',
}

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
        {CREATABLE_KINDS.map(kind => (
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
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: KIND_COLORS[kind] }} />
            {KIND_LABELS[kind]}
          </div>
        ))}

        {/* Tipos que existem no fluxo mas não são criáveis — papel de legenda */}
        <div className={`flex flex-col gap-1 pt-1 mt-0.5 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
          {[{ color: '#10b981', label: 'Início' }, { color: '#f59e0b', label: 'Outro Bot' }].map(item => (
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
