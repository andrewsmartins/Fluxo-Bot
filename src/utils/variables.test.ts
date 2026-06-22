import { describe, it, expect } from 'vitest'
import { VARIABLE_GROUPS, variableDisplay } from './variables'

describe('VARIABLE_GROUPS — catálogo de variáveis', () => {
  const groups = Object.fromEntries(VARIABLE_GROUPS.map(g => [g.key, g]))

  it('tem as categorias esperadas com rótulos amigáveis', () => {
    expect(groups.customer.label).toBe('Consumidor')
    expect(groups.channel.label).toBe('Canal')
    expect(groups.chat.label).toBe('Chat')
    expect(groups.custom.label).toBe('Personalizado')
    expect(groups.team.label).toBe('Time')
    expect(groups.flow.label).toBe('Flow')
    expect(groups.entity.label).toBe('Lista')
  })

  it('namespaces "pelados" são categorias-folha com valor prefixo', () => {
    for (const key of ['entity', 'api', 'custom', 'team', 'flow']) {
      expect(groups[key].value).toBe(`@${key}`)
      expect(groups[key].items).toBeUndefined()
    }
  })

  it('Bot tem 4 opções: Aberto Agora, Nome e os 2 horários (ramos)', () => {
    expect(groups.bot.items!.map(i => i.label)).toEqual([
      'Aberto Agora', 'Nome', 'Horário de Abertura', 'Horário de Fechamento',
    ])
    expect(groups.bot.items!.find(i => i.label === 'Aberto Agora')?.value).toBe('@bot.isOpenNow')
    expect(groups.bot.items!.find(i => i.label === 'Nome')?.value).toBe('@bot.name')
  })

  it('cada horário é um ramo com 7 dias, e cada dia tem os 2 componentes de hora', () => {
    const opening = groups.bot.items!.find(i => i.label === 'Horário de Abertura')!
    expect(opening.value).toBeUndefined() // item-ramo não grava valor
    expect(opening.children).toHaveLength(7)
    const monday = opening.children!.find(d => d.value === '@bot.openingTime.monday')
    expect(monday?.label).toBe('segunda')
    expect(monday?.components?.map(c => c.label)).toEqual(['Apenas Horário', 'Apenas Horário com Minutos'])
    expect(monday?.components?.map(c => c.suffix)).toEqual(['#getHourOfDate', '#getHoursAndMinutesOfDate'])
    // Fechamento usa o campo closingTime
    const closing = groups.bot.items!.find(i => i.label === 'Horário de Fechamento')!
    expect(closing.children!.find(d => d.value === '@bot.closingTime.sunday')?.label).toBe('domingo')
  })

  it('componentes (#) ficam fora do value (base crua) e listam os sufixos aplicáveis', () => {
    // value é a base SEM componente; o # vem da coluna de componentes
    const name = groups.customer.items!.find(i => i.label === 'Nome')
    expect(name?.value).toBe('@customer.name')
    expect(name?.components?.map(c => c.suffix)).toEqual(['#normalizeQuery'])
    // store.number é o único com 2 componentes
    const number = groups.store.items!.find(i => i.value === '@store.number')
    expect(number?.components?.map(c => c.suffix)).toEqual(['#onlyNumbers', '#normalizeQuery'])
    // CEP → #zipcode; Pedido.Total → #currency
    expect(groups.store.items!.find(i => i.value === '@store.zip')?.components?.map(c => c.suffix)).toEqual(['#zipcode'])
    expect(groups.order.items!.find(i => i.value === '@order.totalFetched')?.components?.map(c => c.suffix)).toEqual(['#currency'])
  })

  it('variáveis sem componente aplicável não têm a coluna', () => {
    const gender = groups.customer.items!.find(i => i.value === '@customer.gender')
    expect(gender?.components).toBeUndefined()
    expect(groups.channel.items!.find(i => i.value === '@channel.id')?.components).toBeUndefined()
  })

  it('campo personalizado é um item prefixo (ID por-conta completado à mão)', () => {
    const custom = groups.customer.items!.find(i => i.value === '@customer.customFields.')
    expect(custom?.prefix).toBe(true)
  })
})

describe('variableDisplay', () => {
  it('resolve "value + #componente" como "Categoria.Item.Componente"', () => {
    expect(variableDisplay('@customer.name#normalizeQuery')).toEqual({ label: 'Consumidor.Nome.Texto normalizado', resolved: true })
    expect(variableDisplay('@store.zip#zipcode')).toEqual({ label: 'Loja.CEP.CEP formatado', resolved: true })
    expect(variableDisplay('@store.number#onlyNumbers')).toEqual({ label: 'Loja.Número.Só dígitos', resolved: true })
    expect(variableDisplay('@order.totalFetched#currency')).toEqual({ label: 'Pedido.Total.Moeda', resolved: true })
  })

  it('resolve componente em variável aninhada (ramo) para "Categoria.Ramo.Dia.Componente"', () => {
    expect(variableDisplay('@bot.openingTime.monday#getHourOfDate'))
      .toEqual({ label: 'Bot.Horário de Abertura.segunda.Apenas Horário', resolved: true })
    expect(variableDisplay('@bot.closingTime.sunday#getHoursAndMinutesOfDate'))
      .toEqual({ label: 'Bot.Horário de Fechamento.domingo.Apenas Horário com Minutos', resolved: true })
  })

  it('resolve a forma crua sem componente (compat. com fluxos antigos)', () => {
    expect(variableDisplay('@customer.name')).toEqual({ label: 'Consumidor.Nome', resolved: true })
    expect(variableDisplay('@customer.birthDate')).toEqual({ label: 'Consumidor.Data de nascimento', resolved: true })
  })

  it('valor não-catalogado (prefixo completado/custom) cai no cru, não resolvido', () => {
    expect(variableDisplay('@customer.customFields.hBhq2eAiWX')).toEqual({ label: '@customer.customFields.hBhq2eAiWX', resolved: false })
    expect(variableDisplay('')).toEqual({ label: '', resolved: false })
  })
})

describe('variableDisplay — Time (grupo dinâmico, @team.{id}.campo)', () => {
  // Tokens reais da amostra do bot — o ID do time é dinâmico (vem da loja);
  // o schema de campos é idêntico ao do Bot. Fase 1: o ID aparece cru no rótulo.
  it('resolve os 4 campos da amostra para "Time.{id}.…"', () => {
    expect(variableDisplay('@team.fdI9crpRsB.name#normalizeQuery'))
      .toEqual({ label: 'Time.fdI9crpRsB.Nome.Texto normalizado', resolved: true })
    expect(variableDisplay('@team.S1Cl3fbnFG.isOpenNow'))
      .toEqual({ label: 'Time.S1Cl3fbnFG.Aberto Agora', resolved: true })
    expect(variableDisplay('@team.UrAnEmtASL.openingTime.monday#getHourOfDate'))
      .toEqual({ label: 'Time.UrAnEmtASL.Horário de Abertura.segunda.Apenas Horário', resolved: true })
    expect(variableDisplay('@team.87GglN0JapW0.closingTime.monday#getHoursAndMinutesOfDate'))
      .toEqual({ label: 'Time.87GglN0JapW0.Horário de Fechamento.segunda.Apenas Horário com Minutos', resolved: true })
  })

  it('resolve a forma crua sem componente (campo de Time sem #)', () => {
    expect(variableDisplay('@team.fdI9crpRsB.name'))
      .toEqual({ label: 'Time.fdI9crpRsB.Nome', resolved: true })
  })

  it('o @team pelado continua sendo prefixo livre (não resolvido)', () => {
    expect(variableDisplay('@team')).toEqual({ label: '@team', resolved: false })
    expect(variableDisplay('@team.')).toEqual({ label: '@team.', resolved: false })
  })

  it('campo inexistente de um time não resolve (cai no cru)', () => {
    expect(variableDisplay('@team.fdI9crpRsB.naoExiste')).toEqual({ label: '@team.fdI9crpRsB.naoExiste', resolved: false })
  })

  it('troca o ID pelo NOME do time quando o mapa id→nome é fornecido', () => {
    const names = new Map([['fdI9crpRsB', 'Loja Centro']])
    expect(variableDisplay('@team.fdI9crpRsB.name#normalizeQuery', names))
      .toEqual({ label: 'Time.Loja Centro.Nome.Texto normalizado', resolved: true })
    // ID sem entrada no mapa cai no próprio ID (continua resolvido)
    expect(variableDisplay('@team.S1Cl3fbnFG.isOpenNow', names))
      .toEqual({ label: 'Time.S1Cl3fbnFG.Aberto Agora', resolved: true })
  })
})

describe('variableDisplay — Lista (grupo dinâmico, @entity.<nome>)', () => {
  // O picker insere a lista pelo NOME (já legível): `@entity.<nome>` resolve para
  // "Lista.<nome>" por parsing simples, sem mapa id→nome (diferente do Time).
  it('resolve @entity.<nome> para "Lista.<nome>"', () => {
    expect(variableDisplay('@entity.Endereco')).toEqual({ label: 'Lista.Endereco', resolved: true })
    expect(variableDisplay('@entity.Lojas Proximas')).toEqual({ label: 'Lista.Lojas Proximas', resolved: true })
  })

  it('preserva o resto do caminho quando o usuário continua digitando', () => {
    expect(variableDisplay('@entity.Endereco.cep')).toEqual({ label: 'Lista.Endereco.cep', resolved: true })
  })

  it('o @entity pelado continua sendo prefixo livre (não resolvido)', () => {
    expect(variableDisplay('@entity')).toEqual({ label: '@entity', resolved: false })
    expect(variableDisplay('@entity.')).toEqual({ label: '@entity.', resolved: false })
  })
})
