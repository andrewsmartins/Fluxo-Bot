import type { ReactNode } from 'react'
import type { NodeKind } from '../../types'

/**
 * Ícone por tipo de nó (Fase 11B). Reúne num só lugar os SVGs que antes viviam
 * espalhados pelos componentes de nó (vários sequer tinham ícone). Estilo *stroke*
 * 24x24, estilo stroke, sem dependência externa. Consumido pelo `NodeShell`
 * no chip-ícone do card (padrão "cara de Omni").
 */

const svg = (children: ReactNode) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
)

const ICONS: Record<NodeKind, ReactNode> = {
  // Mensagem simples (bolha de conversa) — o "Enviar mensagem" do dia a dia.
  defaultNode: svg(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />),
  // Escolha (botões) — duas barras empilhadas.
  choiceNode: svg(<><rect x="3" y="5" width="18" height="4" rx="1" /><rect x="3" y="13" width="18" height="4" rx="1" /></>),
  // Captura de dado — prancheta.
  captureNode: svg(<><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><rect x="8" y="2" width="8" height="4" rx="1" /></>),
  // Transferência para atendente — headset.
  transferNode: svg(<><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></>),
  // Aguardar — relógio.
  waitNode: svg(<><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></>),
  // Definir variável — caneta.
  setDataNode: svg(<><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></>),
  // Outro bot — link externo.
  externalBotNode: svg(<><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></>),
  // Terminar conversa — círculo "sem entrada".
  endNode: svg(<><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></>),
  // Chamada de API — chevrons de código.
  apiCallNode: svg(<><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>),
  // Pedido — carrinho.
  orderNode: svg(<><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></>),
  // CSAT — estrela.
  csatNode: svg(<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  // Loja física — vitrine.
  storeNode: svg(<><path d="M3 9l1-5h16l1 5" /><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9" /><path d="M3 9h18" /></>),
  // Início — play.
  startNode: svg(<polygon points="5 3 19 12 5 21 5 3" />),
  // Container de grupo — não usa chip (renderiza cabeçalho próprio); fallback genérico.
  intentGroupNode: svg(<><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /></>),
}

/** Ícone (16x16, stroke) do tipo de nó. Cai no de mensagem se o tipo for desconhecido. */
export function nodeIcon(kind: NodeKind): ReactNode {
  return ICONS[kind] ?? ICONS.defaultNode
}

/** Ícone de "lista" — variante do nó de Escolha quando `actionType === 'list'`. */
export function listIcon(): ReactNode {
  return svg(<><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></>)
}
