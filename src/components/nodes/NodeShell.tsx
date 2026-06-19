import { Handle, Position } from '@xyflow/react'
import type { ReactNode } from 'react'
import type { NodeKind } from '../../types'
import { useTheme } from '../../contexts/ThemeContext'
import { nodeColor } from '../../utils/nodeVisual'
import { nodeIcon } from './nodeIcons'

/**
 * Moldura comum dos nós-card (Fase 11B — "cara de Omni"). Antes cada um dos ~11
 * componentes de nó repetia a MESMA estrutura: card + faixa colorida no topo +
 * preview + pill, com o par de classes claro/escuro duplicado em todo lugar.
 *
 * O padrão da OmniChat NÃO usa faixa colorida: card branco arredondado + um
 * **chip-ícone** colorido à esquerda + título + subtítulo. A cor vem da fonte
 * única `nodeVisual.ts`; o chip usa a cor crua (com alpha) via `style` porque
 * gerar 14×2 pares de classe Tailwind seria muito mais código que um inline.
 * Seleção = anel violeta (distinto do esmeralda da duplicação e do índigo do merge).
 */
interface NodeShellProps {
  kind: NodeKind
  title: string
  subtitle?: string
  selected?: boolean
  /** Sobrescreve o ícone padrão do tipo (ex.: Escolha em modo lista). */
  icon?: ReactNode
  /** Handle de entrada (topo). Padrão: true. */
  hasTarget?: boolean
  /** Handle de saída (base). Padrão: true. Nós terminais (Transfer/End/Externo) passam false. */
  hasSource?: boolean
  /** Borda tracejada (nó sintético "Outro Bot"). */
  dashed?: boolean
  children?: ReactNode
}

export function NodeShell({ kind, title, subtitle, selected, icon, hasTarget = true, hasSource = true, dashed = false, children }: NodeShellProps) {
  const isDark = useTheme()
  const color = nodeColor(kind)
  const handleCls = isDark ? '!bg-slate-500' : '!bg-slate-400'

  return (
    <div
      className={`w-[240px] rounded-2xl overflow-hidden border transition-shadow ${dashed ? 'border-2 border-dashed' : ''} ${
        selected ? 'ring-2 ring-violet-500 shadow-lg' : 'shadow-sm'
      } ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
      style={dashed ? { borderColor: color } : undefined}
    >
      {hasTarget && <Handle type="target" position={Position.Top} className={handleCls} />}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <span
          className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
          style={{ backgroundColor: color + (isDark ? '33' : '1f'), color }}
        >
          {icon ?? nodeIcon(kind)}
        </span>
        <div className="min-w-0">
          <p className={`text-xs font-semibold leading-tight truncate ${isDark ? 'text-slate-100' : 'text-slate-800'}`}>{title}</p>
          {subtitle && <p className={`text-[10px] leading-tight truncate ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{subtitle}</p>}
        </div>
      </div>

      {/* Corpo: preview/chips. `empty:hidden` colapsa o espaço quando o nó não tem
          corpo (ex.: mensagem sem preview) — o card fica só com o cabeçalho. */}
      <div className="px-3 pb-2.5 flex flex-col gap-1.5 empty:hidden">{children}</div>

      {hasSource && <Handle type="source" position={Position.Bottom} className={handleCls} />}
    </div>
  )
}

/** Preview de mensagem do nó (3 linhas, com `@var` exibido como `[var]`). Nulo se vazio. */
export function NodePreview({ text }: { text?: string | null }) {
  const isDark = useTheme()
  if (!text) return null
  const formatted = text.replace(/@[\w.#]+/g, m => `[${m.slice(1)}]`)
  return <p className={`text-xs leading-relaxed line-clamp-3 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{formatted}</p>
}

/** Pill de status/atributo, tingido pela cor do tipo de nó (bg suave + texto da cor). */
export function NodePill({ kind, children, className = '', title }: { kind: NodeKind; children: ReactNode; className?: string; title?: string }) {
  const isDark = useTheme()
  const color = nodeColor(kind)
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 truncate ${className}`}
      style={{ backgroundColor: color + (isDark ? '26' : '14'), color }}
    >
      {children}
    </span>
  )
}

/** Texto auxiliar discreto (ex.: "+N opções", separadores). */
export function NodeNote({ children }: { children: ReactNode }) {
  const isDark = useTheme()
  return <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{children}</span>
}
