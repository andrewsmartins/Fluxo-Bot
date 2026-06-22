/**
 * Upload de mídia para a OmniChat via presigned URL (S3) — Fase 8.
 *
 * Fluxo em 2 passos (presigned POST do S3 — formato confirmado por captura de rede):
 *   1. POST /files/v1/presigned-url com { type, name, mimeType } e Bearer token
 *      → devolve { attachmentUrl, url, fields } (ver PresignedUrlResponse abaixo)
 *   2. POST multipart/form-data em `url`, com todos os `fields` + um campo
 *      `Content-Type` (exigido pela policy do S3) + o arquivo como ÚLTIMO campo
 *      (`file`). Sem header Authorization e sem definir o Content-Type DO REQUEST:
 *      é o S3 que valida via `fields` (policy/assinatura), e o browser põe o boundary.
 *   `attachmentUrl` é a URL pública permanente, gravada em BotMessage.content.
 *
 * CORS: o host `private-api2.omni.chat` é um AWS API Gateway com Allow-Origin `*`,
 * mas o preflight só permite Authorization/Content-Type/x-omnichat-platform(-version).
 * Os headers x-parse-* da API de intents NÃO são aceitos aqui (bloqueiam o preflight).
 *
 * Segurança: o token vai só no header do passo 1 e NUNCA é logado.
 */

const FILES_API = 'https://private-api2.omni.chat/files'
// Versão do app web da OmniChat — o gateway de arquivos exige este header (401 sem ele).
// Valor fixo capturado da plataforma; atualizar se a API passar a recusar versões antigas.
const PLATFORM_VERSION = '1.116.16'

export type UploadMediaType = 'IMAGE' | 'FILE' | 'VIDEO'

type ApiMediaType = 'image' | 'document' | 'video'

/** Campos da resposta de /files/v1/presigned-url (presigned POST do S3). */
interface PresignedUrlResponse {
  /** URL pública permanente do arquivo — gravada em BotMessage.content. */
  attachmentUrl: string
  /** Endpoint do bucket S3 — alvo do POST multipart com os `fields` + o arquivo. */
  url: string
  /** Campos exigidos pelo S3 (key, policy, X-Amz-*) — vão no form antes do arquivo. */
  fields: Record<string, string>
}

const TYPE_MAP: Record<UploadMediaType, { apiType: ApiMediaType; accept: string }> = {
  IMAGE: { apiType: 'image',    accept: 'image/*' },
  FILE:  { apiType: 'document', accept: 'application/pdf' },
  VIDEO: { apiType: 'video',    accept: 'video/*' },
}

/** Valor do atributo `accept` para o <input type="file"> conforme o tipo de mídia. */
export function acceptFor(type: UploadMediaType): string {
  return TYPE_MAP[type].accept
}

/**
 * Em dev (Vite), o bucket S3 não libera CORS para http://localhost:5173: mesmo um
 * upload bem-sucedido (204) fica ilegível pro fetch por falta de Access-Control-
 * Allow-Origin, e a chamada rejeita. Roteamos então o POST por um proxy do Vite
 * (`server.proxy['/s3-proxy']` → s3.amazonaws.com), que faz a chamada server-to-
 * server, sem CORS. A assinatura do presigned POST é feita sobre a Policy (não
 * sobre o host), então trocar o host pelo proxy NÃO a invalida. Em produção (e se
 * o host não for o S3 path-style esperado) devolvemos a URL absoluta original.
 */
function resolveUploadUrl(rawUrl: string): string {
  if (!import.meta.env.DEV) return rawUrl
  try {
    const parsed = new URL(rawUrl)
    if (parsed.host !== 's3.amazonaws.com') return rawUrl
    return `/s3-proxy${parsed.pathname}${parsed.search}`
  } catch {
    return rawUrl
  }
}

/**
 * Executa um `fetch` rotulando qual passo do upload falhou. O `fetch` pode lançar
 * de forma síncrona (ex.: header com caractere fora do Latin-1) — sem este wrapper,
 * o erro não diria se veio do passo 1 ou 2. Nunca inclui o token na mensagem.
 */
async function requestStep(step: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run()
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err)
    throw new Error(`Falha de rede no ${step}: ${reason}`)
  }
}

/**
 * Faz upload de um arquivo para a OmniChat e devolve a URL pública permanente + nome.
 * Lança Error descritivo (sem expor o token) se qualquer passo falhar.
 */
export async function uploadMedia(
  file: File,
  type: UploadMediaType,
  token: string,
): Promise<{ content: string; fileName: string }> {
  const { apiType } = TYPE_MAP[type]

  // Passo 1: solicitar presigned URL à API da OmniChat
  const res = await requestStep('passo 1 (presigned-url)', () => fetch(`${FILES_API}/v1/presigned-url`, {
    method: 'POST',
    // O serviço de arquivos é um AWS API Gateway (host private-api2), NÃO o Parse
    // Server dos intents. O preflight só aceita Authorization/Content-Type/
    // x-omnichat-platform — enviar x-parse-* faz o navegador bloquear por CORS.
    headers: {
      accept: 'application/json, text/plain, */*',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-omnichat-platform': 'web',
      'x-omnichat-platform-version': PLATFORM_VERSION,
    },
    body: JSON.stringify({ type: apiType, name: file.name, mimeType: file.type }),
  }))

  if (!res.ok) {
    const excerpt = await res.text().catch(() => '')
    throw new Error(
      `Erro ao solicitar URL de upload (${res.status})` +
      (excerpt ? `: ${excerpt.slice(0, 200)}` : ''),
    )
  }

  const data = (await res.json()) as PresignedUrlResponse
  if (!data.attachmentUrl || !data.url || !data.fields) {
    // Lista só os NOMES das chaves (nunca os valores: podem conter credenciais AWS).
    const keys = data && typeof data === 'object' ? Object.keys(data).join(', ') : typeof data
    throw new Error(
      'Resposta inesperada do servidor — campos attachmentUrl/url/fields ausentes. ' +
      `Campos recebidos: [${keys}]. Verifique uploadMedia.ts:PresignedUrlResponse.`,
    )
  }

  // Passo 2: enviar o arquivo ao S3 via presigned POST (sem token OmniChat).
  // Os `fields` (policy, assinatura, key) vão primeiro; o `file` precisa ser o
  // ÚLTIMO campo do form. Não definimos o Content-Type DO REQUEST: o browser
  // monta o multipart/form-data com o boundary correto sozinho.
  const form = new FormData()
  for (const [name, value] of Object.entries(data.fields)) form.append(name, value)

  // A policy do S3 traz a condição ["eq", "$Content-Type", <mime>], que EXIGE um
  // CAMPO de formulário chamado `Content-Type` com esse valor exato. O header
  // Content-Type da parte `file` NÃO satisfaz essa condição — sem o campo, o S3
  // recusa com 403 (que, por não trazer Access-Control-Allow-Origin, o browser
  // reporta como erro de CORS). O `fields` da OmniChat não inclui esse campo, então
  // o adicionamos aqui com o mesmo mimeType enviado no passo 1 (file.type), antes
  // do `file`. Só é incluído quando `data.fields` ainda não o trouxe.
  if (!('Content-Type' in data.fields)) form.append('Content-Type', file.type)

  form.append('file', file)

  const post = await requestStep('passo 2 (envio ao armazenamento)', () => fetch(resolveUploadUrl(data.url), {
    method: 'POST',
    body: form,
  }))
  if (!post.ok) {
    throw new Error(`Erro ao enviar arquivo para o armazenamento (${post.status})`)
  }

  return { content: data.attachmentUrl, fileName: file.name }
}
