import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  listMessages, updateMessageText, addTextMessage, addMediaMessage, removeMessage,
  updateButton, updateIntentMeta, updateActionFields, updateSetDataItems,
  addCondition, sanitizeIntentName, collectCategories, updateCondition,
  addButtonListMessage, addChoice, removeChoice, setChoiceDestination, setChoices,
  replaceButtonListMessage, addCollectionMessage, updateCollectionMessage,
  addTemplateMessage, updateTemplateMessage, type TemplateMessagePayload,
  listErrorMessages, setActionErrorNext,
} from './editIntent'
import { validateFlow } from './validateFlow'
import { createIntentTemplate } from './intentTemplates'
import { parseFlow } from './parseFlow'
import type { BotFlowJson, BotIntent } from '../types'

const samplesDir = join(dirname(fileURLToPath(import.meta.url)), '../../samples')
const BOT_ID = '8df3c1e7-a8c9-4bad-ac5a-2855462da840'

function loadSample(): BotFlowJson {
  return JSON.parse(readFileSync(join(samplesDir, 'sample01.json'), 'utf-8'))
}

function intentWithButtons(json: BotFlowJson): BotIntent {
  const intent = json.list.find(i =>
    i.conditions.some(c => c.assistant_says.some(s => s.messages.some(m => m.messageConfig?.buttons?.length))))
  if (!intent) throw new Error('sample01 sem intenção com botões')
  return intent
}

describe('listMessages / updateMessageText', () => {
  it('lista mensagens com endereços válidos e edita pelo endereço', () => {
    const json = loadSample()
    const intent = json.list.find(i => listMessages(i).length > 0)!
    const msgs = listMessages(intent)
    expect(msgs.length).toBeGreaterThan(0)

    const result = updateMessageText(intent, msgs[0].ref, 'texto editado')
    expect(result).toEqual({ ok: true })
    expect(listMessages(intent)[0].text).toBe('texto editado')
  })

  it('edita o body de mensagens BUTTON/LIST', () => {
    const intent = intentWithButtons(loadSample())
    const btnMsg = listMessages(intent).find(m => m.type === 'BUTTON' || m.type === 'LIST')!
    expect(updateMessageText(intent, btnMsg.ref, 'novo corpo')).toEqual({ ok: true })
    expect(listMessages(intent).find(m => m.ref.condIdx === btnMsg.ref.condIdx && m.ref.msgIdx === btnMsg.ref.msgIdx)?.text).toBe('novo corpo')
  })

  it('rejeita endereço inexistente sem alterar nada', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(updateMessageText(intent, { condIdx: 0, sayIdx: 0, msgIdx: 5 }, 'y').ok).toBe(false)
  })
})

describe('addTextMessage / removeMessage', () => {
  it('adiciona TEXT em template recém-criado e remove em seguida', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addTextMessage(intent, 'olá!')).toEqual({ ok: true })
    const msgs = listMessages(intent)
    expect(msgs).toHaveLength(1)
    expect(msgs[0].text).toBe('olá!')

    expect(removeMessage(intent, msgs[0].ref)).toEqual({ ok: true })
    expect(listMessages(intent)).toHaveLength(0)
  })

  it('não remove mensagens BUTTON/LIST (escolhas ficariam órfãs)', () => {
    const intent = intentWithButtons(loadSample())
    const btnMsg = listMessages(intent).find(m => m.type === 'BUTTON' || m.type === 'LIST')!
    const result = removeMessage(intent, btnMsg.ref)
    expect(result.ok).toBe(false)
  })
})

describe('addCollectionMessage', () => {
  it('serializa COLLECTION com collectionId + fileName vazio e expõe o id no listMessages', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addCollectionMessage(intent, 'g5hRHfEmuWp3')).toEqual({ ok: true })
    const raw = intent.conditions[0].assistant_says[0].messages[0]
    expect(raw).toEqual({ type: 'COLLECTION', fileName: '', collectionId: 'g5hRHfEmuWp3' })
    const msg = listMessages(intent).find(m => m.type === 'COLLECTION')!
    expect(msg.collectionId).toBe('g5hRHfEmuWp3')
  })

  it('rejeita collectionId vazio (não cria mensagem)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addCollectionMessage(intent, '   ').ok).toBe(false)
    expect(listMessages(intent).filter(m => m.type === 'COLLECTION')).toHaveLength(0)
  })

  it('permite remover uma resposta COLLECTION (não é botão/lista)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addCollectionMessage(intent, 'abc123')
    const msg = listMessages(intent).find(m => m.type === 'COLLECTION')!
    expect(removeMessage(intent, msg.ref)).toEqual({ ok: true })
    expect(listMessages(intent).filter(m => m.type === 'COLLECTION')).toHaveLength(0)
  })
})

describe('updateCollectionMessage', () => {
  it('troca o collectionId de uma coleção salva preservando fileName', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addCollectionMessage(intent, 'antigo')
    const msg = listMessages(intent).find(m => m.type === 'COLLECTION')!
    expect(updateCollectionMessage(intent, msg.ref, 'novo')).toEqual({ ok: true })
    const raw = intent.conditions[0].assistant_says[0].messages[0]
    expect(raw).toEqual({ type: 'COLLECTION', fileName: '', collectionId: 'novo' })
  })

  it('rejeita id vazio e mensagem que não é coleção', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addCollectionMessage(intent, 'abc')
    const collRef = listMessages(intent).find(m => m.type === 'COLLECTION')!.ref
    expect(updateCollectionMessage(intent, collRef, '  ').ok).toBe(false)
    addTextMessage(intent, 'oi')
    const textRef = listMessages(intent).find(m => m.type === 'TEXT')!.ref
    expect(updateCollectionMessage(intent, textRef, 'x').ok).toBe(false)
  })
})

describe('addTemplateMessage / updateTemplateMessage (resposta TEMPLATE — modelo com Flow)', () => {
  const payload = (over: Partial<TemplateMessagePayload> = {}): TemplateMessagePayload => ({
    messageTemplateId: 'mt-001',
    title: 'Pedido confirmado',
    content: 'Olá {{1}}, seu pedido {{2}} foi confirmado.',
    tokens: ['@customer.name', '#123'],
    flowButtonText: 'Abrir formulário',
    ...over,
  })

  it('serializa TEMPLATE no formato da plataforma com botão Flow e tokens posicionais', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addTemplateMessage(intent, payload())).toEqual({ ok: true })
    const raw = intent.conditions[0].assistant_says[0].messages[0]
    expect(raw).toMatchObject({
      type: 'TEMPLATE',
      content: 'Olá {{1}}, seu pedido {{2}} foi confirmado.',
      fileName: '',
      title: 'Pedido confirmado',
      messageTemplateId: 'mt-001',
      messageTemplateHeaderToken: '',
      messageTemplateTokens: ['@customer.name', '#123'],
    })
    // messageConfig com botão Flow só com { id, text, type }
    expect(raw.messageConfig?.type).toBe('text')
    expect(raw.messageConfig?.body).toBe('')
    const btn = raw.messageConfig!.buttons[0]
    expect(btn.text).toBe('Abrir formulário')
    expect(btn.type).toBe('FLOW')
    expect(typeof btn.id).toBe('string')
    expect(btn.description).toBeUndefined()
  })

  it('listMessages expõe messageTemplateId, título e tokens; text = corpo', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addTemplateMessage(intent, payload())
    const msg = listMessages(intent).find(m => m.type === 'TEMPLATE')!
    expect(msg.messageTemplateId).toBe('mt-001')
    expect(msg.templateTitle).toBe('Pedido confirmado')
    expect(msg.templateTokens).toEqual(['@customer.name', '#123'])
    expect(msg.text).toBe('Olá {{1}}, seu pedido {{2}} foi confirmado.')
  })

  it('mapeamento posicional: 0, 1 e 3 variáveis', () => {
    const i0 = createIntentTemplate('defaultNode', BOT_ID, 'a')
    addTemplateMessage(i0, payload({ content: 'Sem variáveis aqui', tokens: [] }))
    expect((i0.conditions[0].assistant_says[0].messages[0]).messageTemplateTokens).toEqual([])

    const i1 = createIntentTemplate('defaultNode', BOT_ID, 'b')
    addTemplateMessage(i1, payload({ content: 'Oi {{1}}', tokens: ['Maria'] }))
    expect((i1.conditions[0].assistant_says[0].messages[0]).messageTemplateTokens).toEqual(['Maria'])

    const i3 = createIntentTemplate('defaultNode', BOT_ID, 'c')
    addTemplateMessage(i3, payload({ content: '{{1}} {{2}} {{3}}', tokens: ['a', 'b', 'c'] }))
    expect((i3.conditions[0].assistant_says[0].messages[0]).messageTemplateTokens).toEqual(['a', 'b', 'c'])
  })

  it('rejeita messageTemplateId vazio (não cria mensagem)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addTemplateMessage(intent, payload({ messageTemplateId: '  ' })).ok).toBe(false)
    expect(listMessages(intent).filter(m => m.type === 'TEMPLATE')).toHaveLength(0)
  })

  it('updateTemplateMessage troca tokens/modelo e reusa o id do botão quando o texto não muda', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addTemplateMessage(intent, payload())
    const ref = listMessages(intent).find(m => m.type === 'TEMPLATE')!.ref
    const btnIdAntes = intent.conditions[0].assistant_says[0].messages[0].messageConfig!.buttons[0].id

    expect(updateTemplateMessage(intent, ref, payload({ tokens: ['@new', '#999'] }))).toEqual({ ok: true })
    const raw = intent.conditions[0].assistant_says[0].messages[0]
    expect(raw.messageTemplateTokens).toEqual(['@new', '#999'])
    expect(raw.messageConfig!.buttons[0].id).toBe(btnIdAntes) // mesmo texto de botão → id preservado

    // Trocar o texto do botão regenera o id
    expect(updateTemplateMessage(intent, ref, payload({ tokens: ['@new', '#999'], flowButtonText: 'Outro botão' })).ok).toBe(true)
    expect(intent.conditions[0].assistant_says[0].messages[0].messageConfig!.buttons[0].id).not.toBe(btnIdAntes)
  })

  it('updateTemplateMessage rejeita mensagem que não é TEMPLATE', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addTextMessage(intent, 'oi')
    const textRef = listMessages(intent).find(m => m.type === 'TEXT')!.ref
    expect(updateTemplateMessage(intent, textRef, payload()).ok).toBe(false)
  })

  it('permite remover uma resposta TEMPLATE (não é botão/lista)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addTemplateMessage(intent, payload())
    const ref = listMessages(intent).find(m => m.type === 'TEMPLATE')!.ref
    expect(removeMessage(intent, ref)).toEqual({ ok: true })
    expect(listMessages(intent).filter(m => m.type === 'TEMPLATE')).toHaveLength(0)
  })
})

describe('updateButton', () => {
  it('altera texto e descrição preservando o id do botão', () => {
    const intent = intentWithButtons(loadSample())
    const before = intent.conditions
      .flatMap(c => c.assistant_says).flatMap(s => s.messages)
      .find(m => m.messageConfig?.buttons?.length)!.messageConfig!.buttons
    const originalId = before[0].id

    expect(updateButton(intent, 0, 'Novo rótulo', 'desc')).toEqual({ ok: true })
    expect(before[0]).toEqual({ id: originalId, text: 'Novo rótulo', description: 'desc' })
  })

  it('rejeita índice fora do alcance', () => {
    const intent = intentWithButtons(loadSample())
    expect(updateButton(intent, 99, 'x', null).ok).toBe(false)
  })
})

describe('updateIntentMeta', () => {
  it('atualiza nome/categoria/keywords e o updatedAt', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'antigo')
    intent.updatedAt = 'Mon, 01 Jan 2024 00:00:00 GMT'
    const result = updateIntentMeta(intent, { name: ' novo_nome ', category: '', keywords: ['a', ' b ', ''] })
    expect(result).toEqual({ ok: true })
    expect(intent.name).toBe('novo_nome')
    expect(intent.category).toBe('Sem Categoria')
    expect(intent.keywords).toEqual(['a', 'b'])
    expect(intent.updatedAt).not.toBe('Mon, 01 Jan 2024 00:00:00 GMT')
  })

  it('rejeita nome vazio', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(updateIntentMeta(intent, { name: '  ', category: 'c', keywords: [] }).ok).toBe(false)
    expect(intent.name).toBe('x')
  })

  it('rejeita nome com espaço, acento ou caractere especial (regra mixed_snake_case)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'valido_1')
    for (const invalido of ['com espaco', 'acentuação', 'tem-traco', 'sinal!', 'arroba@']) {
      const result = updateIntentMeta(intent, { name: invalido, category: 'c', keywords: [] })
      expect(result.ok).toBe(false)
      expect(intent.name).toBe('valido_1') // não alterou
    }
  })

  it('aceita nome mixed_snake_case (letras, dígitos e underscore)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(updateIntentMeta(intent, { name: 'Valida_Dados_2', category: 'c', keywords: [] }).ok).toBe(true)
    expect(intent.name).toBe('Valida_Dados_2')
  })

  it('atualiza priority e context (Modelo B); context vazio vira null', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [], priority: 0.75, context: ' menu-id ' })
    expect(intent.priority).toBe(0.75)
    expect(intent.context).toBe('menu-id')
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [], context: '' })
    expect(intent.context).toBeNull()
  })

  it('não mexe em priority/context quando os campos são omitidos', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    intent.priority = 0.5
    intent.context = 'algo'
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [] })
    expect(intent.priority).toBe(0.5)
    expect(intent.context).toBe('algo')
  })

  it('grava executionDelay como número quando > 0', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [], executionDelay: 13 })
    expect(intent.executionDelay).toBe(13)
  })

  it('remove executionDelay (não grava 0) quando o toggle é desligado', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    intent.executionDelay = 13
    // null sinaliza "desligado" → o campo deve sumir do objeto, não virar 0.
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [], executionDelay: null })
    expect('executionDelay' in intent).toBe(false)
  })

  it('trata executionDelay 0 como desligado (remove o campo)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    intent.executionDelay = 5
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [], executionDelay: 0 })
    expect('executionDelay' in intent).toBe(false)
  })

  it('não mexe em executionDelay quando o campo é omitido', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    intent.executionDelay = 7
    updateIntentMeta(intent, { name: 'x', category: 'c', keywords: [] })
    expect(intent.executionDelay).toBe(7)
  })
})

describe('sanitizeIntentName', () => {
  it('converte espaço em underscore e remove acentos/caracteres especiais', () => {
    expect(sanitizeIntentName('Pós graduação')).toBe('Ps_graduao')
    expect(sanitizeIntentName('tem-traco!')).toBe('temtraco')
    expect(sanitizeIntentName('a b @ c')).toBe('a_b__c')
  })

  it('preserva nomes já válidos em mixed_snake_case', () => {
    expect(sanitizeIntentName('Valida_Dados_2')).toBe('Valida_Dados_2')
    expect(sanitizeIntentName('')).toBe('')
  })
})

describe('collectCategories', () => {
  function intentWithCategory(name: string, category: string): BotIntent {
    const intent = createIntentTemplate('defaultNode', BOT_ID, name)
    intent.category = category
    return intent
  }

  it('coleta categorias distintas, ignorando vazios e duplicatas', () => {
    const intents = [
      intentWithCategory('a', 'Vendas'),
      intentWithCategory('b', 'Vendas'),
      intentWithCategory('c', 'Suporte'),
      intentWithCategory('d', '  '),
    ]
    expect(collectCategories(intents).sort()).toEqual(['Suporte', 'Vendas'])
  })

  it('exclui as categorias de sistema "start" e "Sem Categoria"', () => {
    const intents = [
      intentWithCategory('a', 'start'),
      intentWithCategory('b', 'Sem Categoria'),
      intentWithCategory('c', 'Promo'),
    ]
    expect(collectCategories(intents)).toEqual(['Promo'])
  })
})

describe('updateCondition — tipo "context" (Intenção/Contexto)', () => {
  it('grava intent e context (IDs de intenções) no tipo context', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    const result = updateCondition(intent, 0, {
      name: 'Condição Padrão', type: 'context', variable: '', value: 'any',
      intent: 'id-da-intencao', context: 'id-do-contexto',
    })
    expect(result).toEqual({ ok: true })
    expect(intent.conditions[0].type).toBe('context')
    expect(intent.conditions[0].intent).toBe('id-da-intencao')
    expect(intent.conditions[0].context).toBe('id-do-contexto')
  })

  it('intent/context vazios viram null', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, { name: 'c', type: 'context', variable: '', value: '', intent: '', context: '  ' })
    expect(intent.conditions[0].intent).toBeNull()
    expect(intent.conditions[0].context).toBeNull()
  })

  it('não sobrescreve intent/context quando os campos são omitidos (editor em lote)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    intent.conditions[0].intent = 'preexistente'
    intent.conditions[0].context = 'ctx-preexistente'
    updateCondition(intent, 0, { name: 'c', type: 'equals', variable: 'v', value: '1' })
    expect(intent.conditions[0].intent).toBe('preexistente')
    expect(intent.conditions[0].context).toBe('ctx-preexistente')
  })
})

describe('updateCondition — tipo "contains" (Valores como TAGs)', () => {
  it('grava a lista de termos em `values` e mantém `value` como placeholder "any"', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, {
      name: 'Contém', type: 'contains', variable: '@chat.lastMessage', value: 'boleto, pix , cartão',
    })
    expect(intent.conditions[0].type).toBe('contains')
    expect(intent.conditions[0].values).toEqual(['boleto', 'pix', 'cartão'])
    expect(intent.conditions[0].value).toBe('any')
  })

  it('lista vazia vira values null', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, { name: 'c', type: 'contains', variable: 'v', value: '  ,  ' })
    expect(intent.conditions[0].values).toBeNull()
  })

  it('ignora duplicatas implícitas não — mantém os termos na ordem digitada', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, { name: 'c', type: 'contains', variable: 'v', value: 'a, b, a' })
    // updateCondition não deduplica (o editor de TAGs já evita duplicar na UI).
    expect(intent.conditions[0].values).toEqual(['a', 'b', 'a'])
  })

  it('trocar de "contains" para outro tipo limpa `values` órfão', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, { name: 'c', type: 'contains', variable: 'v', value: 'x, y' })
    expect(intent.conditions[0].values).toEqual(['x', 'y'])
    updateCondition(intent, 0, { name: 'c', type: 'equals', variable: 'v', value: 'z' })
    expect(intent.conditions[0].values).toBeNull()
    expect(intent.conditions[0].value).toBe('z')
  })
})

describe('updateCondition — tipos "Total é..." (número em valueNumber)', () => {
  it.each(['totalIsGreaterThan', 'totalIsEqual'])(
    'grava o número (string) em `valueNumber` e `value` placeholder "any" — %s',
    (type) => {
      const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
      updateCondition(intent, 0, { name: 'c', type, variable: '@entity.abc', value: '3' })
      expect(intent.conditions[0].type).toBe(type)
      expect(intent.conditions[0].valueNumber).toBe('3')
      expect(intent.conditions[0].value).toBe('any')
      expect(intent.conditions[0].values).toBeNull()
    },
  )

  it('valor vazio vira valueNumber null', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, { name: 'c', type: 'totalIsEqual', variable: 'v', value: '   ' })
    expect(intent.conditions[0].valueNumber).toBeNull()
  })

  it('trocar de "Total é..." para outro tipo limpa `valueNumber` órfão', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    updateCondition(intent, 0, { name: 'c', type: 'totalIsGreaterThan', variable: 'v', value: '5' })
    expect(intent.conditions[0].valueNumber).toBe('5')
    updateCondition(intent, 0, { name: 'c', type: 'equals', variable: 'v', value: 'abc' })
    expect(intent.conditions[0].valueNumber).toBeNull()
    expect(intent.conditions[0].value).toBe('abc')
  })
})

describe('escolhas/destinos (Fase 10c — addChoice/removeChoice/setChoiceDestination)', () => {
  const choiceIntent = () => createIntentTemplate('choiceNode', BOT_ID, 'menu')

  it('addChoice acrescenta slot vazio em condição de escolha', () => {
    const intent = choiceIntent()
    expect(addChoice(intent, 0)).toEqual({ ok: true })
    expect(addChoice(intent, 0)).toEqual({ ok: true })
    expect(intent.conditions[0].action.choices).toEqual(['', ''])
  })

  it('addChoice rejeita condição que não é de escolha', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addChoice(intent, 0).ok).toBe(false)
  })

  it('setChoiceDestination grava o ID e preenche slots intermediários com ""', () => {
    const intent = choiceIntent()
    expect(setChoiceDestination(intent, 0, 2, 'dest-c').ok).toBe(true) // pula 0 e 1
    expect(intent.conditions[0].action.choices).toEqual(['', '', 'dest-c'])
  })

  it('setChoiceDestination vazio limpa o slot', () => {
    const intent = choiceIntent()
    setChoiceDestination(intent, 0, 0, 'dest-a')
    setChoiceDestination(intent, 0, 0, '  ')
    expect((intent.conditions[0].action.choices as string[])[0]).toBe('')
  })

  it('removeChoice remove o slot no índice', () => {
    const intent = choiceIntent()
    setChoiceDestination(intent, 0, 0, 'a')
    setChoiceDestination(intent, 0, 1, 'b')
    setChoiceDestination(intent, 0, 2, 'c')
    expect(removeChoice(intent, 0, 1).ok).toBe(true)
    expect(intent.conditions[0].action.choices).toEqual(['a', 'c'])
  })

  it('removeChoice rejeita índice fora do alcance', () => {
    const intent = choiceIntent()
    expect(removeChoice(intent, 0, 5).ok).toBe(false)
  })

  it('setChoices substitui a lista e apara vazios do fim (mantém os do meio)', () => {
    const intent = choiceIntent()
    expect(setChoices(intent, 0, ['a', '', 'c', '', '']).ok).toBe(true)
    expect(intent.conditions[0].action.choices).toEqual(['a', '', 'c'])
  })

  it('setChoices com tudo vazio → []', () => {
    const intent = choiceIntent()
    setChoices(intent, 0, ['', '  ', ''])
    expect(intent.conditions[0].action.choices).toEqual([])
  })
})

describe('replaceButtonListMessage (editar menu salvo — Fase 10c)', () => {
  function intentWithMenu() {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addButtonListMessage(intent, {
      header: 'H', body: 'B', footer: 'F', title: '', variant: 'plain',
      items: [{ text: '1', description: '' }, { text: '2', description: '' }],
    })
    return intent
  }
  const ref = { condIdx: 0, sayIdx: 0, msgIdx: 0 }

  it('reescreve moldura e itens, preservando os IDs por posição', () => {
    const intent = intentWithMenu()
    const idsBefore = intent.conditions[0].assistant_says[0].messages[0].messageConfig!.buttons.map(b => b.id)
    const r = replaceButtonListMessage(intent, ref, {
      header: 'novo', body: 'corpo2', footer: '', title: 'Menu', variant: 'plain',
      items: [{ text: 'a', description: '' }, { text: 'b', description: '' }, { text: 'c', description: '' }, { text: 'd', description: '' }],
    })
    expect(r.ok).toBe(true)
    const msg = intent.conditions[0].assistant_says[0].messages[0]
    expect(msg.type).toBe('LIST') // 4 itens → LIST
    expect(msg.messageConfig!.header).toBe('novo')
    expect(msg.messageConfig!.buttons.map(b => b.text)).toEqual(['a', 'b', 'c', 'd'])
    // os 2 primeiros IDs preservados; os novos (3º/4º) gerados
    expect(msg.messageConfig!.buttons.slice(0, 2).map(b => b.id)).toEqual(idsBefore)
    expect(msg.messageConfig!.buttons[2].id).not.toBe(idsBefore[0])
  })

  it('rejeita corpo vazio sem alterar a mensagem', () => {
    const intent = intentWithMenu()
    expect(replaceButtonListMessage(intent, ref, {
      header: '', body: '  ', footer: '', title: '', variant: 'plain', items: [{ text: 'x', description: '' }],
    }).ok).toBe(false)
    expect(intent.conditions[0].assistant_says[0].messages[0].messageConfig!.body).toBe('B')
  })

  it('rejeita ref que não aponta para BUTTON/LIST', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addTextMessage(intent, 'oi')
    expect(replaceButtonListMessage(intent, ref, {
      header: '', body: 'b', footer: '', title: '', variant: 'plain', items: [{ text: 'x', description: '' }],
    }).ok).toBe(false)
  })
})

describe('edição escopada por condição (Modelo B, Marco C)', () => {
  // Intenção com 2 condições: c0 = transfer, c1 = captureData.
  function twoActionCond(): BotIntent {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'multi')
    addCondition(intent)
    intent.conditions[1].action = { ...intent.conditions[0].action, type: 'captureData', transferType: null, value: null }
    return intent
  }

  it('updateActionFields com condIdx mira AQUELA condição', () => {
    const intent = twoActionCond()
    // a condição 1 é captureData; sem condIdx, "transfer" acharia a c0
    expect(updateActionFields(intent, 'captureData', { captureDataType: 'cpf', variable: 'c.cpf' }, 1)).toEqual({ ok: true })
    expect(intent.conditions[1].action.captureDataType).toBe('cpf')
    expect(intent.conditions[0].action.captureDataType).toBeNull()
  })

  it('addTextMessage com condIdx cai na condição certa', () => {
    const intent = twoActionCond()
    addTextMessage(intent, 'oi da c1', 1)
    const c1msgs = listMessages(intent).filter(m => m.ref.condIdx === 1)
    expect(c1msgs.some(m => m.text === 'oi da c1')).toBe(true)
    expect(listMessages(intent).filter(m => m.ref.condIdx === 0).some(m => m.text === 'oi da c1')).toBe(false)
  })

  it('updateButton com condIdx só procura na condição informada', () => {
    const intent = createIntentTemplate('choiceNode', BOT_ID, 'menu')
    addCondition(intent) // c1 sem botões
    // c0 é choice mas ainda sem mensagem de botões → updateButton(0) não acha
    expect(updateButton(intent, 0, 'X', null, 1).ok).toBe(false) // c1 não tem botões
  })
})

describe('addButtonListMessage (Botão/Lista de exibição — Fase 10)', () => {
  /** Helper: monta um config válido a partir de textos de item, com overrides. */
  function cfg(itemTexts: string[], over: Partial<Parameters<typeof addButtonListMessage>[1]> = {}) {
    return {
      header: 'Título', body: 'Corpo', footer: 'Rodapé', title: 'Menu', variant: 'plain' as const,
      items: itemTexts.map(t => ({ text: t, description: '' })),
      ...over,
    }
  }
  const fresh = () => createIntentTemplate('defaultNode', BOT_ID, 'x')
  const rawMsg = (i: BotIntent) => i.conditions[0].assistant_says[0].messages[0]
  const seq = (n: number) => Array.from({ length: n }, (_, k) => String(k + 1))

  it('1-3 itens → type BUTTON e title forçado a ""', () => {
    for (const n of [1, 2, 3]) {
      const intent = fresh()
      expect(addButtonListMessage(intent, cfg(seq(n))).ok).toBe(true)
      expect(rawMsg(intent).type).toBe('BUTTON')
      expect(rawMsg(intent).messageConfig!.title).toBe('')
      expect(rawMsg(intent).messageConfig!.buttons).toHaveLength(n)
    }
  })

  it('4-10 itens → type LIST e mantém o title', () => {
    for (const n of [4, 10]) {
      const intent = fresh()
      expect(addButtonListMessage(intent, cfg(seq(n))).ok).toBe(true)
      expect(rawMsg(intent).type).toBe('LIST')
      expect(rawMsg(intent).messageConfig!.title).toBe('Menu')
      expect(rawMsg(intent).messageConfig!.buttons).toHaveLength(n)
    }
  })

  it('mapeia header/body/footer e itens viram buttons com UUID único e description ""', () => {
    const intent = fresh()
    addButtonListMessage(intent, cfg(['Sim', 'Não']))
    const mc = rawMsg(intent).messageConfig!
    expect(mc).toMatchObject({ header: 'Título', body: 'Corpo', footer: 'Rodapé', type: 'text' })
    expect(mc.buttons[0]).toMatchObject({ text: 'Sim', description: '' })
    expect(mc.buttons[0].id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(mc.buttons[1].id).not.toBe(mc.buttons[0].id)
  })

  it('action permanece "none" e a mensagem é de exibição (removível)', () => {
    const intent = fresh()
    addButtonListMessage(intent, cfg(['a', 'b']))
    expect(intent.conditions[0].action.type).toBe('none')
    const ref = listMessages(intent).find(m => m.type === 'BUTTON')!.ref
    expect(removeMessage(intent, ref).ok).toBe(true)
    expect(listMessages(intent)).toHaveLength(0)
  })

  it('campos de moldura vazios saem como "" (não null)', () => {
    const intent = fresh()
    addButtonListMessage(intent, { header: '', body: 'Corpo', footer: '', title: '', variant: 'plain', items: [{ text: 'a', description: '' }] })
    const mc = rawMsg(intent).messageConfig!
    expect(mc.header).toBe('')
    expect(mc.footer).toBe('')
    expect(mc.title).toBe('')
  })

  describe('caminhos infelizes (não criam mensagem)', () => {
    it('0 itens', () => {
      const intent = fresh()
      expect(addButtonListMessage(intent, cfg([])).ok).toBe(false)
      expect(listMessages(intent)).toHaveLength(0)
    })
    it('mais de 10 itens', () => {
      expect(addButtonListMessage(fresh(), cfg(seq(11))).ok).toBe(false)
    })
    it('corpo vazio', () => {
      expect(addButtonListMessage(fresh(), cfg(['a'], { body: '   ' })).ok).toBe(false)
    })
    it('item sem texto', () => {
      expect(addButtonListMessage(fresh(), cfg(['  '])).ok).toBe(false)
    })
  })

  it('título do botão de opções é OPCIONAL (LIST sem título → ok, title "")', () => {
    const intent = fresh()
    expect(addButtonListMessage(intent, cfg(seq(4), { title: '  ' })).ok).toBe(true)
    expect(rawMsg(intent).type).toBe('LIST')
    expect(rawMsg(intent).messageConfig!.title).toBe('')
  })

  describe('variante "com descrição" (sempre LIST)', () => {
    it('1-3 itens em described → ainda type LIST (não BUTTON)', () => {
      for (const n of [1, 2, 3]) {
        const intent = fresh()
        expect(addButtonListMessage(intent, cfg(seq(n), { variant: 'described' })).ok).toBe(true)
        expect(rawMsg(intent).type).toBe('LIST')
      }
    })

    it('serializa a descrição de cada item', () => {
      const intent = fresh()
      addButtonListMessage(intent, {
        header: '', body: 'Corpo', footer: '', title: 'Menu', variant: 'described',
        items: [{ text: '1', description: 'desc 1' }, { text: '2', description: '' }],
      })
      const buttons = rawMsg(intent).messageConfig!.buttons
      expect(buttons[0]).toMatchObject({ text: '1', description: 'desc 1' })
      expect(buttons[1]).toMatchObject({ text: '2', description: '' })
    })

    it('described sem título → ainda ok (título é opcional)', () => {
      const intent = fresh()
      expect(addButtonListMessage(intent, cfg(['a'], { variant: 'described', title: '  ' })).ok).toBe(true)
      expect(rawMsg(intent).type).toBe('LIST')
      expect(rawMsg(intent).messageConfig!.title).toBe('')
    })

    it('BUTTON (plain 1-3) força description "" mesmo se vier preenchida', () => {
      const intent = fresh()
      addButtonListMessage(intent, {
        header: '', body: 'Corpo', footer: '', title: '', variant: 'plain',
        items: [{ text: '1', description: 'não deveria aparecer' }, { text: '2', description: 'x' }],
      })
      expect(rawMsg(intent).type).toBe('BUTTON')
      expect(rawMsg(intent).messageConfig!.buttons.every(b => b.description === '')).toBe(true)
    })
  })

  it('round-trip: a forma bate com a amostra real (LIST de 10)', () => {
    const intent = fresh()
    const items = seq(10)
    addButtonListMessage(intent, {
      header: 'Título', body: 'Corpo do texto', footer: 'Rodapé', title: 'Título botão opções', variant: 'plain',
      items: items.map(t => ({ text: t, description: '' })),
    })
    const msg = rawMsg(intent)
    expect(msg).toMatchObject({
      type: 'LIST', content: '', fileName: '',
      messageConfig: { title: 'Título botão opções', type: 'text', header: 'Título', body: 'Corpo do texto', footer: 'Rodapé' },
    })
    expect(msg.messageConfig!.buttons.map(b => b.text)).toEqual(items)
    expect(msg.messageConfig!.buttons.every(b => b.description === '' && /^[0-9a-f-]{36}$/i.test(b.id!))).toBe(true)
  })
})

describe('addCondition tipada (Marco D — escolher o tipo da condição)', () => {
  it('sem kind: mantém o comportamento anterior (condição de mensagem, action.none)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(addCondition(intent)).toEqual({ ok: true })
    expect(intent.conditions[1].action.type).toBe('none')
  })

  it('com kind: a condição nova nasce tipada pela ação escolhida', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    addCondition(intent, 'transferNode')
    addCondition(intent, 'endNode')
    expect(intent.conditions[1].action.type).toBe('transfer')
    expect(intent.conditions[1].action.transferType).toBe('direct4userPrevious')   // default do tipo (sem campo → nasce válido)
    expect(intent.conditions[1].action.error?.next.intent).toBe(`${BOT_ID}-start`)
    expect(intent.conditions[2].action.type).toBe('endConversation')
  })

  it('a condição tipada renderiza como o nó certo no grupo (parseFlow)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'multi')
    addCondition(intent, 'csatNode')   // agora 2 condições → grupo + 2 filhos
    const { nodes } = parseFlow({ list: [intent] })
    expect(nodes.find(n => n.id === intent.id)?.type).toBe('intentGroupNode')
    expect(nodes.find(n => n.id === `${intent.id}::c1`)?.type).toBe('csatNode')
    expect(nodes.find(n => n.id === `${intent.id}::c1`)?.data.captureDataType).toBe('supportRate')
  })
})

describe('updateActionFields / updateSetDataItems', () => {
  it('atualiza transferType e value na condição transfer', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    expect(updateActionFields(intent, 'transfer', { transferType: 'search4group', value: 'GRP123' })).toEqual({ ok: true })
    const action = intent.conditions[0].action
    expect(action.transferType).toBe('search4group')
    expect(action.value).toBe('GRP123')
  })

  it('atualiza captureDataType e variable na condição captureData', () => {
    const intent = createIntentTemplate('captureNode', BOT_ID, 'x')
    expect(updateActionFields(intent, 'captureData', { captureDataType: 'cpf', variable: 'customer.cpf' })).toEqual({ ok: true })
    expect(intent.conditions[0].action.captureDataType).toBe('cpf')
    expect(intent.conditions[0].action.variable).toBe('customer.cpf')
  })

  it('captura modo single: grava captureDataType + categoria singleField + multipleFields vazio', () => {
    const intent = createIntentTemplate('captureNode', BOT_ID, 'x')
    updateActionFields(intent, 'captureData', {
      captureDataType: 'name', captureDataTypesCategory: 'singleField', multipleFields: [], variable: '',
    })
    const action = intent.conditions[0].action
    expect(action.captureDataType).toBe('name')
    expect(action.captureDataTypesCategory).toBe('singleField')
    expect(action.multipleFields).toEqual([])
    expect(action.variable).toBe('')
  })

  it('captura modo múltiplo: sentinela em captureDataType + array em multipleFields', () => {
    const intent = createIntentTemplate('captureNode', BOT_ID, 'x')
    const fields = ['fullName', 'cpf', 'zipcode']
    updateActionFields(intent, 'captureData', {
      captureDataType: 'multipleFields', captureDataTypesCategory: 'multipleFields', multipleFields: fields, variable: '',
    })
    const action = intent.conditions[0].action
    expect(action.captureDataType).toBe('multipleFields')
    expect(action.captureDataTypesCategory).toBe('multipleFields')
    expect(action.multipleFields).toEqual(fields)
  })

  it('grava storeType e entity na condição store (Loja física)', () => {
    const intent = createIntentTemplate('storeNode', BOT_ID, 'x')
    expect(updateActionFields(intent, 'store', { storeType: 'first', entity: 'list-id-123' })).toEqual({ ok: true })
    const action = intent.conditions[0].action
    expect(action.storeType).toBe('first')
    expect(action.entity).toBe('list-id-123')
  })

  it('storeType vazio vira null; entity vazio é preservado como ""', () => {
    const intent = createIntentTemplate('storeNode', BOT_ID, 'x')
    updateActionFields(intent, 'store', { storeType: '', entity: '' })
    expect(intent.conditions[0].action.storeType).toBeNull()
    expect(intent.conditions[0].action.entity).toBe('')
  })

  it('Pedido addToCart: grava orderType e variable na condição order', () => {
    const intent = createIntentTemplate('orderNode', BOT_ID, 'x')
    expect(updateActionFields(intent, 'order', { orderType: 'addToCart', variable: '@api.abc.name' })).toEqual({ ok: true })
    const action = intent.conditions[0].action
    expect(action.orderType).toBe('addToCart')
    expect(action.variable).toBe('@api.abc.name')
  })

  it('Pedido generateOrder: grava orderType e PRESERVA variable (não passa o campo)', () => {
    const intent = createIntentTemplate('orderNode', BOT_ID, 'x')
    // Estado vindo do import: generateOrder com variable preenchida (a plataforma
    // mantém o valor, só ignora) — a serialização NÃO deve apagá-lo.
    intent.conditions[0].action.variable = '@api.abc.name'
    updateActionFields(intent, 'order', { orderType: 'generateOrder' })
    expect(intent.conditions[0].action.orderType).toBe('generateOrder')
    expect(intent.conditions[0].action.variable).toBe('@api.abc.name')
  })

  it('Pedido: alternar addToCart → generateOrder preserva a variável digitada', () => {
    const intent = createIntentTemplate('orderNode', BOT_ID, 'x')
    updateActionFields(intent, 'order', { orderType: 'addToCart', variable: '@custom.item' })
    expect(intent.conditions[0].action.variable).toBe('@custom.item')
    // Troca de modo sem passar variable: o valor anterior sobrevive.
    updateActionFields(intent, 'order', { orderType: 'generateOrder' })
    expect(intent.conditions[0].action.orderType).toBe('generateOrder')
    expect(intent.conditions[0].action.variable).toBe('@custom.item')
  })

  it('grava external = {type, apiName} como strings na condição da Chamada de API', () => {
    const intent = createIntentTemplate('apiCallNode', BOT_ID, 'x')
    expect(updateActionFields(intent, 'external', { externalType: 'request', apiName: 'endpoint-id-123' })).toEqual({ ok: true })
    const action = intent.conditions[0].action
    expect(action.external).toEqual({ type: 'request', apiName: 'endpoint-id-123' })
  })

  it('trocar o tipo de integração preserva action.error.next', () => {
    const intent = createIntentTemplate('apiCallNode', BOT_ID, 'x')
    const cond = intent.conditions[0]
    // Simula a config manual do error.next dos exemplos reais (não intrínseca ao tipo).
    cond.action.error = { next: { type: 'context', redirect: 'continueFlow', intent: 'algum-destino' }, assistant_says: [] }
    updateActionFields(intent, 'external', { externalType: 'findStore', apiName: 'endpoint-id-123' })
    expect(cond.action.external).toEqual({ type: 'findStore', apiName: 'endpoint-id-123' })
    // error.next intacto — o editor toca SÓ o external.
    expect(cond.action.error?.next.redirect).toBe('continueFlow')
    expect(cond.action.error?.next.intent).toBe('algum-destino')
  })

  it('rejeita tipo de ação que a intenção não tem', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(updateActionFields(intent, 'transfer', { value: 'y' }).ok).toBe(false)
  })

  it('substitui bulkUpdate filtrando variáveis vazias', () => {
    const intent = createIntentTemplate('setDataNode', BOT_ID, 'x')
    const result = updateSetDataItems(intent, [
      { variable: ' var1 ', value: 'a' },
      { variable: '', value: 'descartado' },
    ])
    expect(result).toEqual({ ok: true })
    expect(intent.conditions[0].action.bulkUpdate).toEqual([{ variable: 'var1', value: 'a' }])
  })
})

describe('validateFlow', () => {
  it('sample01 passa sem erros', () => {
    const report = validateFlow(loadSample())
    expect(report.errors).toEqual([])
  })

  it('detecta ID duplicado como erro', () => {
    const json = loadSample()
    json.list.push({ ...json.list[0] })
    expect(validateFlow(json).errors.some(e => e.includes('ID duplicado'))).toBe(true)
  })

  it('detecta intenção sem nome e sem condições como erro', () => {
    const a = createIntentTemplate('defaultNode', BOT_ID, 'x')
    a.name = ''
    const b = createIntentTemplate('defaultNode', BOT_ID, 'y')
    b.conditions = []
    const report = validateFlow({ list: [a, b] })
    expect(report.errors).toHaveLength(2)
  })

  it('referência interna quebrada vira erro bloqueante (a plataforma a trata como erro a preencher)', () => {
    const json = loadSample()
    const cond = json.list.flatMap(i => i.conditions).find(c => c.next?.intent && typeof c.next.intent === 'object')!
    ;(cond.next.intent as { id: string }).id = 'id-que-nao-existe'
    const report = validateFlow(json)
    expect(report.errors.some(e => e.includes('inexistente'))).toBe(true)
    expect(report.warnings.some(w => w.includes('inexistente'))).toBe(false)
  })

  it('fluxo sem start gera aviso', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    const report = validateFlow({ list: [intent] })
    expect(report.warnings.some(w => w.includes('início'))).toBe(true)
  })

  it('lista vazia não quebra', () => {
    const report = validateFlow({ list: [] })
    expect(report.errors).toEqual([])
  })
})

describe('Container de erro — mensagens em action.error.assistant_says', () => {
  it('addTextMessage(container:error) cai no caminho de erro, não nas respostas normais', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')   // já nasce com action.error
    expect(addTextMessage(intent, 'falhou, tente de novo', 0, 'error')).toEqual({ ok: true })
    expect(intent.conditions[0].action.error!.assistant_says[0].messages[0]).toEqual({
      type: 'TEXT', content: 'falhou, tente de novo', fileName: '',
    })
    // não vazou para as respostas normais
    expect(listMessages(intent)).toHaveLength(0)
    // visível só via listErrorMessages, com ref marcado container:'error'
    const errMsgs = listErrorMessages(intent)
    expect(errMsgs).toHaveLength(1)
    expect(errMsgs[0].text).toBe('falhou, tente de novo')
    expect(errMsgs[0].ref.container).toBe('error')
  })

  it('cria action.error/assistant_says quando ausentes (nó sem caminho de erro)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')   // none → sem action.error
    expect(intent.conditions[0].action.error).toBeUndefined()
    expect(addTextMessage(intent, 'fallback', 0, 'error')).toEqual({ ok: true })
    expect(intent.conditions[0].action.error!.assistant_says[0].messages[0].content).toBe('fallback')
    expect(listErrorMessages(intent).map(m => m.text)).toEqual(['fallback'])
  })

  it('addMediaMessage / addCollectionMessage / addTemplateMessage no container de erro', () => {
    const intent = createIntentTemplate('apiCallNode', BOT_ID, 'x')
    addMediaMessage(intent, 'IMAGE', 'https://s3/x.png', 'x.png', 0, 'error')
    addCollectionMessage(intent, 'coll-123', 0, 'error')
    const payload: TemplateMessagePayload = {
      messageTemplateId: 'tpl-1', title: 'T', content: 'corpo {{1}}', tokens: ['@v'], flowButtonText: 'Abrir',
    }
    addTemplateMessage(intent, payload, 0, 'error')
    const errTypes = listErrorMessages(intent).map(m => m.type)
    expect(errTypes).toEqual(['IMAGE', 'COLLECTION', 'TEMPLATE'])
    expect(listMessages(intent)).toHaveLength(0)   // nada vazou para as respostas
  })

  it('updateMessageText e removeMessage operam pelo ref com container:error', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    addTextMessage(intent, 'erro A', 0, 'error')
    const ref = listErrorMessages(intent)[0].ref
    expect(updateMessageText(intent, ref, 'erro editado')).toEqual({ ok: true })
    expect(listErrorMessages(intent)[0].text).toBe('erro editado')
    expect(removeMessage(intent, ref)).toEqual({ ok: true })
    expect(listErrorMessages(intent)).toHaveLength(0)
  })

  it('container omitido = comportamento atual (não-regressão): cai nas respostas normais', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    addTextMessage(intent, 'resposta normal')   // sem container → 'condition'
    expect(listMessages(intent).map(m => m.text)).toEqual(['resposta normal'])
    expect(listErrorMessages(intent)).toHaveLength(0)   // nada no caminho de erro
  })

  it('respostas e erros ficam isolados no mesmo nó', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    addTextMessage(intent, 'oi')
    addTextMessage(intent, 'deu erro', 0, 'error')
    expect(listMessages(intent).map(m => m.text)).toEqual(['oi'])
    expect(listErrorMessages(intent).map(m => m.text)).toEqual(['deu erro'])
  })

  it('listErrorMessages não materializa estrutura (só leitura) em nó sem error', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(listErrorMessages(intent)).toEqual([])
    expect(intent.conditions[0].action.error).toBeUndefined()
  })
})

describe('setActionErrorNext — destino do caminho de erro (acoplamento intentBot)', () => {
  it('continueFlow → intentBot vazio; type:error e action:intent fixos', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    expect(setActionErrorNext(intent, 0, { redirect: 'continueFlow', intent: `${BOT_ID}-start` })).toEqual({ ok: true })
    expect(intent.conditions[0].action.error!.next).toEqual({
      redirect: 'continueFlow', type: 'error', intent: `${BOT_ID}-start`, intentBot: '', action: 'intent',
    })
  })

  it('waitInteraction → intentBot = botId da intenção', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    setActionErrorNext(intent, 0, { redirect: 'waitInteraction', intent: 'algum-destino' })
    expect(intent.conditions[0].action.error!.next).toEqual({
      redirect: 'waitInteraction', type: 'error', intent: 'algum-destino', intentBot: BOT_ID, action: 'intent',
    })
  })

  it('trocar o rádio reescreve intentBot (continueFlow ↔ waitInteraction)', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    setActionErrorNext(intent, 0, { redirect: 'waitInteraction', intent: `${BOT_ID}-start` })
    expect(intent.conditions[0].action.error!.next.intentBot).toBe(BOT_ID)
    setActionErrorNext(intent, 0, { redirect: 'continueFlow', intent: `${BOT_ID}-start` })
    expect(intent.conditions[0].action.error!.next.intentBot).toBe('')
  })

  it('preserva as mensagens de erro existentes (só sobrescreve o next)', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    addTextMessage(intent, 'fallback', 0, 'error')
    setActionErrorNext(intent, 0, { redirect: 'continueFlow', intent: `${BOT_ID}-start` })
    expect(listErrorMessages(intent).map(m => m.text)).toEqual(['fallback'])
  })

  it('cria action.error quando o nó ainda não tem (defaultNode)', () => {
    const intent = createIntentTemplate('defaultNode', BOT_ID, 'x')
    expect(intent.conditions[0].action.error).toBeUndefined()
    setActionErrorNext(intent, 0, { redirect: 'continueFlow', intent: `${BOT_ID}-start` })
    expect(intent.conditions[0].action.error!.next.redirect).toBe('continueFlow')
    expect(intent.conditions[0].action.error!.assistant_says).toEqual([])
  })

  it('rejeita condição inexistente', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    expect(setActionErrorNext(intent, 9, { redirect: 'continueFlow', intent: 'x' }).ok).toBe(false)
  })

  it('intent vazio ("— Selecione —") cai no Start sintético — nunca grava intent vazio', () => {
    const intent = createIntentTemplate('transferNode', BOT_ID, 'x')
    setActionErrorNext(intent, 0, { redirect: 'continueFlow', intent: '' })
    expect(intent.conditions[0].action.error!.next.intent).toBe(`${BOT_ID}-start`)
  })
})
