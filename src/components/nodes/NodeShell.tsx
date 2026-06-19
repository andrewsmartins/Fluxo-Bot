import { Handle, Position } from '@xyflow/react'
import { useLayoutEffect, useRef, type ReactNode } from 'react'
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
  children?: ReactNode
}

export function NodeShell({ kind, title, subtitle, selected, icon, hasTarget = true, hasSource = true, children }: NodeShellProps) {
  const isDark = useTheme()
  const color = nodeColor(kind)
  const handleCls = isDark ? '!bg-slate-500' : '!bg-slate-400'

  // Publica a cor do tipo como CSS var no WRAPPER do React Flow (ancestral do
  // card). É lá que vive o `::after` da seleção (marching ants) — que herda a
  // variável e a usa, mantendo a fonte única de cor em `nodeVisual.ts` em vez de
  // duplicar a tabela no CSS. `closest` é robusto a aninhamento futuro da lib.
  const cardRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const wrapper = cardRef.current?.closest('.react-flow__node') as HTMLElement | null
    wrapper?.style.setProperty('--node-color', color)
  }, [color])

  // Sombra tingida com a cor do tipo (estilo construtor da Omni). Selecionado:
  // anel violeta (composto no box-shadow porque o `ring` do Tailwind também é
  // box-shadow e seria sobrescrito pelo inline) + sombra mais forte da cor.
  // Os 2 últimos dígitos hex são o alpha (mais opaco no escuro para a cor "pegar").
  // Contorno fino (1px) na cor do nó + sombra tingida. A SELEÇÃO em si é uma
  // borda violeta pontilhada animada (CSS `.react-flow__node.selected::after`);
  // aqui o estado selecionado só reforça a sombra (contorno da cor mantido).
  const boxShadow = selected
    ? `0 0 0 1px ${color}${isDark ? 'a6' : '80'}, 0 10px 28px ${color}${isDark ? '66' : '4d'}`
    : isDark
      ? `0 0 0 1px ${color}a6, 0 1px 2px ${color}40, 0 6px 16px ${color}33`
      : `0 0 0 1px ${color}80, 0 1px 2px ${color}29, 0 6px 16px ${color}24`

  return (
    <div
      ref={cardRef}
      className={`w-[240px] rounded-2xl overflow-hidden border transition-shadow ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}
      style={{ boxShadow }}
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

      {/* Handles laterais EXCLUSIVOS da aresta de Contexto (esquerda = entrada,
          direita = saída). Renderizados DEPOIS dos de fluxo (topo/base, sem id)
          porque a lib usa o 1º handle de cada tipo quando a aresta não informa
          handleId — assim o fluxo continua grudando no topo/base. São âncoras
          (`isConnectable={false}`): criar contexto pelo canvas é Marco C. */}
      <Handle id="ctx-target" type="target" position={Position.Left} isConnectable={false} className="!bg-slate-300 !w-2 !h-2 !border-0" />
      <Handle id="ctx-source" type="source" position={Position.Right} isConnectable={false} className="!bg-slate-300 !w-2 !h-2 !border-0" />
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
