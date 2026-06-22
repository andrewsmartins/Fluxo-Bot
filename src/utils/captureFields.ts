/**
 * Fonte única de verdade dos campos de captura do nó "Capturar informação".
 *
 * São as 11 opções que a plataforma OmniChat oferece na UI do nó de captura,
 * na ordem oficial. Tanto o painel de edição (select/checkboxes) quanto o
 * preview do nó no canvas consomem esta lista — antes havia duas listas
 * duplicadas e dessincronizadas (com `email`/`phone`, que na verdade são
 * `mail`/`fullPhoneNumber` no payload real).
 *
 * Os `value` batem 1:1 com o enum `CaptureDataType` da plataforma; ver
 * docs/MODELO-INTENCAO-OMNICHAT.md.
 */
export interface CaptureField {
  value: string
  label: string
}

export const CAPTURE_FIELDS: readonly CaptureField[] = [
  { value: 'fullName',          label: 'Nome completo' },
  { value: 'name',              label: 'Nome' },
  { value: 'fullPhoneNumber',   label: 'Telefone' },
  { value: 'cpf',               label: 'CPF' },
  { value: 'cnpj',              label: 'CNPJ' },
  { value: 'zipcode',           label: 'CEP' },
  { value: 'addressNumber',     label: 'Número do endereço' },
  { value: 'addressComplement', label: 'Complemento' },
  { value: 'mail',              label: 'E-mail' },
  { value: 'gender',            label: 'Gênero' },
  { value: 'birthDate',         label: 'Data de nascimento' },
] as const

/** Mapa value → rótulo PT-BR, para lookup rápido no preview e no painel. */
export const CAPTURE_FIELD_LABELS: Record<string, string> = Object.fromEntries(
  CAPTURE_FIELDS.map(f => [f.value, f.label]),
)

/**
 * Sentinela que a plataforma grava em `action.captureDataType` quando o modo é
 * "Múltiplas informações" (os campos reais ficam no array `multipleFields`).
 */
export const MULTIPLE_FIELDS_SENTINEL = 'multipleFields'

/**
 * Valor "campo não mapeado / texto livre" da plataforma. Aqui ele é o estado de
 * REPOUSO do modo single: o `<option>` placeholder ("— Selecione —") vale `free`,
 * então um nó de captura recém-criado (e nunca configurado) ainda serializa um
 * valor válido em vez de `null` ao ser enviado. Mesmo assim, o gate de save trata
 * `free`/vazio como "nada escolhido" e exige uma das 11 opções para aplicar.
 */
export const FREE_CAPTURE = 'free'

/** Valores de `action.captureDataTypesCategory` que distinguem os dois modos. */
export const CAPTURE_CATEGORY = {
  single: 'singleField',
  multiple: 'multipleFields',
} as const

/** Rótulo legível de um value, com fallback para o próprio value (campo legado). */
export function captureFieldLabel(value: string): string {
  if (value === FREE_CAPTURE) return 'Texto livre'
  return CAPTURE_FIELD_LABELS[value] ?? value
}
