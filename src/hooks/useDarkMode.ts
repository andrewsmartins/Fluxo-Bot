import { useState, useLayoutEffect } from 'react'

export function useDarkMode() {
  // Lê do DOM — a classe já foi aplicada de forma síncrona em main.tsx
  const [dark, setDark] = useState(() =>
    document.documentElement.classList.contains('dark')
  )

  // useLayoutEffect garante que a classe .dark no <html> muda antes da pintura,
  // evitando o flash de um frame com canvas transparente sobre fundo escuro
  useLayoutEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return { dark, toggle: () => setDark(d => !d) }
}
