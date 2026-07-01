import { useEffect, useState, type RefObject } from 'react'

/**
 * Posição do botão-gatilho enquanto seu popover está aberto, para ancorar um
 * `createPortal` com `position: fixed` em document.body. Necessário porque o
 * rail lateral tem `overflow-hidden` (exigido pela animação de recolher/expandir),
 * que recortaria qualquer popover posicionado como filho `absolute` dele.
 */
export function useAnchoredPopover(open: boolean, btnRef: RefObject<HTMLElement | null>) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open && btnRef.current) {
      setRect(btnRef.current.getBoundingClientRect())
      requestAnimationFrame(() => setVisible(true))
    } else {
      setRect(null)
      setVisible(false)
    }
  }, [open, btnRef])

  return { rect, visible }
}
