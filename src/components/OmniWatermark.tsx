import omniWatermarkUrl from '../assets/omni-watermark.svg'

/**
 * Marca-d'água da Omni no fundo do canvas: grande, centralizada e sutil.
 *
 * Em vez de embutir os paths (duplicaria o asset), usa o SVG limpo como
 * `mask-image` de uma <div> colorida. Vantagens:
 *  - fonte única: o desenho vive só em assets/omni-watermark.svg;
 *  - a cor segue o tema (a máscara recorta a cor de fundo da div), então
 *    adaptamos o tom ao claro/escuro sem gerar dois arquivos.
 *
 * Fica ABAIXO dos nós (z-0) e com pointer-events desligado, então é puramente
 * decorativa — não intercepta cliques nem o pan/zoom do React Flow.
 */
export function OmniWatermark({ isDark }: { isDark: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden">
      <div
        style={{
          // Tamanho grande mas contido: ~55% da menor dimensão da viewport.
          width: 'min(55vmin, 720px)',
          aspectRatio: '1238 / 1271',
          backgroundColor: isDark ? '#e2e8f0' : '#0f172a',
          // Sutil: mais discreta no claro (fundo branco realça) que no escuro.
          opacity: isDark ? 0.05 : 0.04,
          WebkitMaskImage: `url(${omniWatermarkUrl})`,
          maskImage: `url(${omniWatermarkUrl})`,
          WebkitMaskRepeat: 'no-repeat',
          maskRepeat: 'no-repeat',
          WebkitMaskPosition: 'center',
          maskPosition: 'center',
          WebkitMaskSize: 'contain',
          maskSize: 'contain',
        }}
      />
    </div>
  )
}
