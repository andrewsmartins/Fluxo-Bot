import { describe, it, expect } from 'vitest'
import { createIntentTemplate } from '../utils/intentTemplates'
import { applyChoiceRouting, duplicateDestHints, splitKeywordInput, type ChoiceMeta } from './DetailPanel'
import type { BotIntent } from '../types'

const BOT_ID = '8df3c1e7-a8c9-4bad-ac5a-2855462da840'

/**
 * Cobre a escrita CROSS-INTENT de roteamento por opção (v0.33.0 Fase 2/2.1):
 * `applyChoiceRouting` patcheia o cabeçalho da intenção-ALVO (keyword/context), não o nó
 * de Escolha. O gatilho da Fase 2.1 grava SÓ o que o humano editou desde a ABERTURA
 * (atual × `initial*` congelado), não "o que difere do estado vivo" — daí cada caso fixa
 * o `initial*`. Os setters puros (`setIntentKeywords`/`setIntentContext`) têm cobertura
 * própria em editIntent.test.ts; aqui o foco é a lógica CONDICIONAL que evita clobber.
 */
function mk(name: string): BotIntent {
  return createIntentTemplate('defaultNode', BOT_ID, name)
}

/** Monta uma `ChoiceMeta` com `initial*` = estado de abertura (default: vazio/não editado). */
function meta(o: Partial<ChoiceMeta>): ChoiceMeta {
  return { keyword: '', contextOn: false, initialKeyword: '', initialContextOn: false, ...o }
}

describe('applyChoiceRouting (escrita cross-intent por opção)', () => {
  it('grava a keyword no ALVO (irmão) quando editada, não no nó de Escolha', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    applyChoiceRouting(menu, [t1.id], [meta({ keyword: 'financeiro' })], [menu, t1])
    expect(t1.keywords).toEqual(['financeiro'])
    // O próprio nó de Escolha não recebe keyword nenhuma.
    expect(menu.keywords ?? []).toEqual([])
  })

  it('meta == inicial → NÃO grava nem bumpa updatedAt do irmão (#2/#3)', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    t1.keywords = ['vendas']
    t1.context = null
    t1.updatedAt = ''
    // Estado atual idêntico ao de abertura (o que o pré-preenchimento mostraria) → não-editado.
    applyChoiceRouting(menu, [t1.id], [meta({ keyword: 'vendas', initialKeyword: 'vendas' })], [menu, t1])
    expect(t1.keywords).toEqual(['vendas'])
    expect(t1.updatedAt).toBe('')
  })

  it('keyword editada regrava (substitui)', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    t1.keywords = ['antiga']
    applyChoiceRouting(menu, [t1.id], [meta({ keyword: 'nova, extra', initialKeyword: 'antiga' })], [menu, t1])
    expect(t1.keywords).toEqual(['nova', 'extra'])
  })

  it('keyword esvaziada de propósito (inicial tinha valor) → limpa o alvo', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    t1.keywords = ['x']
    applyChoiceRouting(menu, [t1.id], [meta({ keyword: '', initialKeyword: 'x' })], [menu, t1])
    expect(t1.keywords).toEqual([])
  })

  it('context ON (tocado) escopa a keyword a ESTE menu (grava o id do nó de Escolha)', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    applyChoiceRouting(menu, [t1.id], [meta({ contextOn: true, initialContextOn: false })], [menu, t1])
    expect(t1.context).toBe(menu.id)
  })

  it('context INALTERADO (já ON na abertura) → não regrava nem bumpa updatedAt (#2)', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    t1.context = menu.id
    t1.updatedAt = ''
    applyChoiceRouting(menu, [t1.id], [meta({ contextOn: true, initialContextOn: true })], [menu, t1])
    expect(t1.context).toBe(menu.id)
    expect(t1.updatedAt).toBe('')
  })

  it('context OFF (tocado) desescopa só quando o alvo aponta a ESTE menu', () => {
    const menu = mk('menu')
    const t1 = mk('alvo1')
    t1.context = menu.id
    applyChoiceRouting(menu, [t1.id], [meta({ contextOn: false, initialContextOn: true })], [menu, t1])
    expect(t1.context).toBeNull()
  })

  it('context OFF NÃO toca o escopo quando o alvo aponta a OUTRO menu (anti-clobber)', () => {
    const menuA = mk('menuA')
    const menuB = mk('menuB')
    const t1 = mk('alvo1')
    t1.context = menuB.id // escopado a outro menu
    t1.updatedAt = ''
    applyChoiceRouting(menuA, [t1.id], [meta({ contextOn: false, initialContextOn: true })], [menuA, menuB, t1])
    expect(t1.context).toBe(menuB.id) // intacto
    expect(t1.updatedAt).toBe('') // nem toca updatedAt — o ramo de clear não entra
  })

  it('opção SEM destino é ignorada (nada onde gravar)', () => {
    const menu = mk('menu')
    expect(() => applyChoiceRouting(menu, [''], [meta({ keyword: 'orfa', contextOn: true })], [menu])).not.toThrow()
  })

  it('destino órfão (não existe em intents) é ignorado sem lançar', () => {
    const menu = mk('menu')
    expect(() => applyChoiceRouting(menu, ['id-inexistente'], [meta({ keyword: 'x', initialKeyword: '' })], [menu])).not.toThrow()
  })

  it('várias opções: cada keyword editada vai ao seu próprio alvo, na ordem', () => {
    const menu = mk('menu')
    const t1 = mk('financeiro')
    const t2 = mk('suporte')
    applyChoiceRouting(
      menu,
      [t1.id, t2.id],
      [meta({ keyword: 'financeiro' }), meta({ keyword: 'suporte' })],
      [menu, t1, t2],
    )
    expect(t1.keywords).toEqual(['financeiro'])
    expect(t2.keywords).toEqual(['suporte'])
  })
})

describe('duplicateDestHints (hint de destino repetido entre opções)', () => {
  it('destino único → sem hint', () => {
    expect(duplicateDestHints(['a', 'b', 'c'])).toEqual([null, null, null])
  })

  it('destino repetido aponta para a 1ª ocorrência (1-based)', () => {
    // opção 3 (idx 2) repete o destino da opção 1 (idx 0).
    expect(duplicateDestHints(['a', 'b', 'a'])).toEqual([null, null, 1])
  })

  it('vazios não contam como duplicata', () => {
    expect(duplicateDestHints(['', '', 'a'])).toEqual([null, null, null])
  })

  it('três iguais → 2ª e 3ª apontam para a 1ª', () => {
    expect(duplicateDestHints(['a', 'a', 'a'])).toEqual([null, 1, 1])
  })
})

describe('splitKeywordInput (keyword multi-palavra vira termos distintos — #4/#5)', () => {
  it('espaço quebra em dois termos (impossível criar multi-palavra pela UI)', () => {
    expect(splitKeywordInput('plano premium')).toEqual(['plano', 'premium'])
  })

  it('vírgula também quebra (formato do submit)', () => {
    expect(splitKeywordInput('financeiro, suporte')).toEqual(['financeiro', 'suporte'])
  })

  it('mistura de espaços/vírgulas/excesso colapsa e descarta vazios', () => {
    expect(splitKeywordInput('  a ,  b   c , ')).toEqual(['a', 'b', 'c'])
  })

  it('display (comma-only) preserva valor legado com espaço como UM chip', () => {
    // O split de DISPLAY do KeywordTags é só por vírgula — não esconde o estado ruim.
    expect('plano premium'.split(',').map(s => s.trim()).filter(Boolean)).toEqual(['plano premium'])
  })
})
