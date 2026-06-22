/**
 * Catálogo de variáveis de sistema da plataforma OmniChat, organizado em grupos
 * com rótulos legíveis — alimenta o picker de `@` (ex.: condição "O valor está
 * vazio"). O front EXIBE o rótulo amigável dotado ("Consumidor.Nome"), mas GRAVA a
 * variável crua no objeto (`@customer.name#normalizeQuery`).
 *
 * É uma lista CURADA/estática: a plataforma não expõe isso por API. Regras:
 *  - `value` é a base da variável SEM componente (ex.: `@customer.name`).
 *  - `components` lista os `#componentes` aplicáveis (coluna final "Componentes (#)"),
 *    só nas variáveis que aceitam algum; o valor final gravado é `value + suffix`.
 *  - Itens/grupos com `prefix: true` inserem um prefixo e liberam digitação: o
 *    campo personalizado (ID por-conta) e os namespaces "pelados" (@api, @custom,
 *    @entity, @team, @flow), completados à mão.
 */

export interface VariableComponent {
  /** Rótulo amigável (ex.: "Só dígitos", "Moeda"). */
  label: string
  /** Sufixo "#componente" gravado após a base da variável (ex.: "#onlyNumbers"). */
  suffix: string
}

export interface VariableItem {
  /** Rótulo amigável exibido no picker (ex.: "Número"). */
  label: string
  /** Base da variável crua SEM componente (ex.: "@store.number").
   *  Opcional para itens-ramo (que só agrupam `children`, ex.: "Horário de Abertura"). */
  value?: string
  /** true: insere como prefixo e libera digitação (ID por-conta / namespace livre). */
  prefix?: boolean
  /** Componentes (#) aplicáveis — coluna final "Componentes (#)". Só existe nas
   *  variáveis que aceitam algum `#componente`; a escolha grava `value + suffix`. */
  components?: VariableComponent[]
  /** Subitens (nível intermediário): item vira RAMO e abre outra coluna em vez de
   *  gravar valor. Ex.: "Horário de Abertura" → 7 dias, cada dia com `components`. */
  children?: VariableItem[]
}

export interface VariableGroup {
  /** Namespace (chave interna). */
  key: string
  /** Rótulo amigável da categoria (ex.: "Consumidor"). */
  label: string
  /** Categoria "folha": selecionar a categoria insere este valor (prefixo livre). */
  value?: string
  /** Itens da categoria (picker em níveis). */
  items?: VariableItem[]
}

const DAY_LABELS: Record<string, string> = {
  monday: 'segunda', tuesday: 'terça', wednesday: 'quarta', thursday: 'quinta',
  friday: 'sexta', saturday: 'sábado', sunday: 'domingo',
}

/** Rótulos amigáveis dos componentes (#) — fonte única para picker e exibição. */
const COMPONENT_LABELS: Record<string, string> = {
  '#normalizeQuery': 'Texto normalizado',
  '#onlyNumbers': 'Só dígitos',
  '#formatIsoDate': 'Data ISO',
  '#zipcode': 'CEP formatado',
  '#currency': 'Moeda',
  '#getHourOfDate': 'Apenas Horário',
  '#getHoursAndMinutesOfDate': 'Apenas Horário com Minutos',
}

/** Monta a coluna de componentes (#) aplicáveis a partir dos sufixos informados. */
function comps(...suffixes: string[]): VariableComponent[] {
  return suffixes.map(suffix => ({ label: COMPONENT_LABELS[suffix] ?? suffix, suffix }))
}

/**
 * Dias da semana de um horário (ramo): 7 dias, cada um com os 2 componentes de
 * hora. `base` é o prefixo da variável SEM o dia (ex.: "@bot.openingTime" ou
 * "@team.fdI9crpRsB.closingTime") — assim o mesmo gerador serve Bot e Time.
 */
function dayItems(base: string): VariableItem[] {
  return Object.entries(DAY_LABELS).map(([day, dayLabel]) => ({
    label: dayLabel, value: `${base}.${day}`, components: comps('#getHourOfDate', '#getHoursAndMinutesOfDate'),
  }))
}

/**
 * Conjunto de campos de uma "entidade-bot" (Bot ou Time): Aberto Agora, Nome e os
 * dois horários (ramos de 7 dias). `base` é o prefixo comum (ex.: "@bot" ou
 * "@team.fdI9crpRsB"). Fonte única do schema: o Time só difere do Bot pelo
 * segmento de ID no caminho — o resto (campos, dias, componentes) é idêntico.
 */
export function entityFieldItems(base: string): VariableItem[] {
  return [
    { label: 'Aberto Agora', value: `${base}.isOpenNow` },
    { label: 'Nome', value: `${base}.name`, components: comps('#normalizeQuery') },
    { label: 'Horário de Abertura', children: dayItems(`${base}.openingTime`) },
    { label: 'Horário de Fechamento', children: dayItems(`${base}.closingTime`) },
  ]
}

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    key: 'customer', label: 'Consumidor', items: [
      { label: 'Nome', value: '@customer.name', components: comps('#normalizeQuery') },
      { label: 'Sobrenome', value: '@customer.lastName', components: comps('#normalizeQuery') },
      { label: 'E-mail', value: '@customer.email', components: comps('#onlyNumbers') },
      { label: 'CPF', value: '@customer.taxDocumentNumber', components: comps('#onlyNumbers') },
      { label: 'CNPJ', value: '@customer.businessTaxId', components: comps('#onlyNumbers') },
      { label: 'Código do país (telefone)', value: '@customer.phoneCountryCode' },
      { label: 'ID do contato', value: '@customer.objectId' },
      { label: 'Código de área', value: '@customer.areaCode' },
      { label: 'DDD', value: '@customer.ddd' },
      { label: 'Telefone', value: '@customer.phoneNumber' },
      { label: 'Data de nascimento', value: '@customer.birthDate', components: comps('#formatIsoDate') },
      { label: 'Consentimento LGPD', value: '@customer.consentLGPD' },
      { label: 'Gênero', value: '@customer.gender' },
      { label: 'ID externo', value: '@customer.externalId' },
      { label: 'Endereço', value: '@customer.address' },
      { label: 'Campo personalizado…', value: '@customer.customFields.', prefix: true },
    ],
  },
  {
    key: 'channel', label: 'Canal', items: [
      { label: 'Telefone', value: '@channel.id' },
      { label: 'Tipo', value: '@channel.type' },
    ],
  },
  { key: 'bot', label: 'Bot', items: entityFieldItems('@bot') },
  { key: 'entity', label: 'Lista', value: '@entity' },
  {
    key: 'store', label: 'Loja', items: [
      { label: 'Nome da loja', value: '@store.name' },
      { label: 'Telefone da loja', value: '@store.phone' },
      { label: 'Endereço (linha 1)', value: '@store.addressLine1', components: comps('#normalizeQuery') },
      { label: 'Bairro', value: '@store.suburb', components: comps('#normalizeQuery') },
      { label: 'Endereço (linha 2)', value: '@store.addressLine2', components: comps('#normalizeQuery') },
      { label: 'Número', value: '@store.number', components: comps('#onlyNumbers', '#normalizeQuery') },
      { label: 'Cidade', value: '@store.city', components: comps('#normalizeQuery') },
      { label: 'Estado', value: '@store.state', components: comps('#normalizeQuery') },
      { label: 'CEP', value: '@store.zip', components: comps('#zipcode') },
      { label: 'Identificador', value: '@store.identificator', components: comps('#normalizeQuery') },
    ],
  },
  { key: 'api', label: 'API', value: '@api' },
  { key: 'custom', label: 'Personalizado', value: '@custom' },
  {
    key: 'order', label: 'Pedido', items: [
      { label: 'Total', value: '@order.totalFetched', components: comps('#currency') },
      { label: 'Subtotal', value: '@order.subtotalFetched', components: comps('#currency') },
      { label: 'URL de checkout', value: '@order.checkoutUrl', components: comps('#normalizeQuery') },
      { label: 'Frete', value: '@order.freightCost', components: comps('#currency') },
      { label: 'Desconto', value: '@order.discount', components: comps('#currency') },
    ],
  },
  {
    key: 'chat', label: 'Chat', items: [
      { label: 'ID do atendimento', value: '@chat.customerSupportRequestId' },
      { label: 'ID do chat', value: '@chat.chatId' },
      { label: 'Última mensagem', value: '@chat.lastMessage' },
      { label: 'Palavra-chave', value: '@chat.currentKeyWords' },
    ],
  },
  { key: 'team', label: 'Time', value: '@team' },
  { key: 'flow', label: 'Flow', value: '@flow' },
]

/**
 * Resolve o que exibir para uma variável crua gravada. Bate com um item catalogado
 * (considerando o modificador final, quando há) e devolve o rótulo amigável SEPARADO
 * POR PONTO ("Consumidor.Nome" ou "Loja.Número.Só dígitos", resolved=true). Caso
 * contrário (prefixo completado / valor custom), devolve o cru (resolved=false).
 */
export function variableDisplay(
  value: string,
  teamNames?: ReadonlyMap<string, string>,
): { label: string; resolved: boolean } {
  // Time é o ÚNICO grupo dinâmico: o ID do time vem da loja (não está no catálogo
  // estático), então o caminho é "@team.{id}.campo[.dia]#comp". Resolvemos pelo
  // mesmo schema do Bot, parametrizado pelo ID extraído do token. Quando o mapa
  // id→nome estiver carregado (Fase 2), o rótulo usa o NOME do time; senão, o ID.
  const team = matchTeamVariable(value, teamNames)
  if (team) return { label: team, resolved: true }
  // Lista (`@entity`) é dinâmica como o Time, mas o token já é legível (`@entity.<nome>`):
  // resolvemos para "Lista.<nome>" por parsing simples, sem precisar de mapa id→nome.
  const entity = matchEntityVariable(value)
  if (entity) return { label: entity, resolved: true }
  for (const group of VARIABLE_GROUPS) {
    const label = matchVariable(group.items ?? [], value, [group.label])
    if (label) return { label, resolved: true }
  }
  return { label: value, resolved: false }
}

/**
 * Resolve um token de Time (`@team.{id}.campo[.dia]#comp`) para o caminho de
 * rótulos "Time.{nome|id}.…", reusando o schema de campos da entidade-bot.
 * `teamNames` (id→nome) troca o ID pelo nome do time quando disponível. Devolve
 * null para qualquer coisa que não seja `@team.<id>.<resto>` (inclusive o `@team`
 * pelado, que continua sendo prefixo livre).
 */
function matchTeamVariable(value: string, teamNames?: ReadonlyMap<string, string>): string | null {
  const match = /^@team\.([^.#]+)\.(?=.)/.exec(value)
  if (!match) return null
  const id = match[1]
  const idLabel = teamNames?.get(id) ?? id
  return matchVariable(entityFieldItems(`@team.${id}`), value, ['Time', idLabel])
}

/**
 * Resolve um token de Lista (`@entity.<nome>[.resto]`) para o caminho de rótulos
 * "Lista.<nome>[.resto]". O picker insere a lista pelo NOME (já legível), então não
 * há mapa id→nome a consultar — basta trocar o prefixo `@entity` pelo rótulo "Lista".
 * Devolve null para o `@entity` pelado (sem ponto), que segue como prefixo livre.
 */
function matchEntityVariable(value: string): string | null {
  const match = /^@entity\.(.+)$/.exec(value)
  if (!match) return null
  return `Lista.${match[1]}`
}

/**
 * Busca recursiva no catálogo (suporta itens-ramo via `children`). Monta o caminho
 * de rótulos separado por ponto ("Bot.Horário de Abertura.segunda.Apenas Horário")
 * ou devolve null se nenhum item bater com o valor cru.
 */
function matchVariable(items: VariableItem[], value: string, trail: string[]): string | null {
  for (const item of items) {
    if (item.prefix) continue
    if (item.children?.length) {
      const found = matchVariable(item.children, value, [...trail, item.label])
      if (found) return found
    } else if (item.components?.length) {
      // value + componente → "Categoria.Item.Componente"
      for (const c of item.components) {
        if ((item.value ?? '') + c.suffix === value) return [...trail, item.label, c.label].join('.')
      }
      // Forma crua sem componente (compat. com fluxos antigos que usam a variável pelada).
      if (item.value === value) return [...trail, item.label].join('.')
    } else if (item.value === value) {
      return [...trail, item.label].join('.')
    }
  }
  return null
}
