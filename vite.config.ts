import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/FlowViewer/',
  server: {
    proxy: {
      // O upload de mídia (passo 2 do uploadMedia.ts) faz um presigned POST ao S3,
      // mas o bucket `prod-file-service` não libera CORS para http://localhost:5173 —
      // então o browser bloqueia a leitura da resposta mesmo com upload 204 OK.
      // Este proxy encaminha o POST ao S3 server-to-server (sem CORS no browser),
      // preservando o path-style do bucket (/prod-file-service). Só vale em dev;
      // em produção o uploadMedia usa a URL absoluta original.
      '/s3-proxy': {
        target: 'https://s3.amazonaws.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/s3-proxy/, ''),
      },
    },
  },
})
