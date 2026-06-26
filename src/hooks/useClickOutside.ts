import { useRef, useEffect } from 'react'

/**
 * Fecha um popover/dropdown ao clicar fora do elemento referenciado.
 * Extraído do Sidebar (2º consumidor: o popover do gate da caixinha de chat)
 * para evitar duplicação. Anexe o `ref` retornado ao container do popover.
 */
export function useClickOutside<T extends HTMLElement = HTMLDivElement>(onOutside: () => void) {
  const ref = useRef<T>(null)
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [onOutside])
  return ref
}
