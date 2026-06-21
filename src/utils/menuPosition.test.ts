import { describe, it, expect } from 'vitest'
import { computeMenuLeft, MENU_MAX_WIDTH, MENU_MARGIN } from './menuPosition'

describe('computeMenuLeft', () => {
  const MAX = MENU_MAX_WIDTH // 960
  const MARGIN = MENU_MARGIN // 8

  it('alinha à esquerda do campo quando há espaço de sobra', () => {
    expect(computeMenuLeft({ left: 100 }, 1920, MAX, MARGIN)).toBe(100)
  })

  it('campo colado à borda direita: empurra para a esquerda sem estourar à direita', () => {
    const vw = 1440
    const left = computeMenuLeft({ left: 1380 }, vw, MAX, MARGIN)
    expect(left + MAX).toBeLessThanOrEqual(vw - MARGIN)
    expect(left).toBe(vw - MARGIN - MAX) // 472
  })

  it('viewport menor que o menu: nunca posiciona antes da margem esquerda', () => {
    expect(computeMenuLeft({ left: 1000 }, 800, MAX, MARGIN)).toBe(MARGIN)
  })

  it('campo já à esquerda da margem: respeita a margem mínima', () => {
    expect(computeMenuLeft({ left: 2 }, 1920, MAX, MARGIN)).toBe(MARGIN)
  })

  it('é determinística: mesmas entradas → mesmo left', () => {
    const a = computeMenuLeft({ left: 1380 }, 1440, MAX, MARGIN)
    const b = computeMenuLeft({ left: 1380 }, 1440, MAX, MARGIN)
    expect(a).toBe(b)
  })

  it('cresce para a direita: campo à esquerda com largura pequena fica no próprio campo', () => {
    // 2 colunas (384px) num campo a left=600 numa tela larga → mantém o left do campo.
    expect(computeMenuLeft({ left: 600 }, 1920, 384, MARGIN)).toBe(600)
  })

  it('nunca deixa o menu estourar à direita quando cabe na tela', () => {
    const vw = 1920
    for (const left of [0, 300, 900, 1500, 1919]) {
      const x = computeMenuLeft({ left }, vw, MAX, MARGIN)
      expect(x).toBeGreaterThanOrEqual(MARGIN)
      expect(x + MAX).toBeLessThanOrEqual(vw - MARGIN)
    }
  })
})
