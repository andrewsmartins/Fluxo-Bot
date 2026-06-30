import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FlowStore } from './flowStore'
import {
  createNode, setActionField, setMessage, setCategory, setKeywords, setContext,
  setNodeChoices, setMenu, connectNodes, connectToBot,
  validate, revert, listNodes, describeNode,
} from './flowTools'
import type { BotFlowJson, BotMessage } from '../types'

/**
 * Teste de orquestração da spike (Fase 1, PLANS.md): exercita a camada de
 * storage (load/save/snapshot/revert) + as tools contra um fluxo REAL
 * (`public/masterFlow.json`, 42 intenções). As funções subjacentes de
 * `src/utils` já têm cobertura própria; aqui o foco é o round-trip
 * load → muta → save → reload → assert e o snapshot/revert.
 *
 * Amostra mínima escalando (decisão Q9): 1 nó simples → 1 nó com bloco `error`
 * + captura múltipla → 3 nós conectados.
 */

const FIXTURE = join(__dirname, '..', '..', 'public', 'masterFlow.json')

let dir: string
let flowPath: string

beforeEach(() => {
  // Copia o fluxo real para um arquivo temporário — o round-trip escreve em disco
  // de verdade (testa save/.bak), sem tocar no fixture versionado.
  dir = mkdtempSync(join(tmpdir(), 'flowtools-'))
  flowPath = join(dir, 'masterFlow.json')
  copyFileSync(FIXTURE, flowPath)
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Recarrega o arquivo do disco como modelo cru (o "reload" do round-trip). */
function reload(): BotFlowJson {
  return JSON.parse(readFileSync(flowPath, 'utf8')) as BotFlowJson
}

describe('FlowStore — carga e identidade', () => {
  it('carrega o fluxo real e identifica o bot principal', () => {
    const store = FlowStore.fromFile(flowPath)
    expect(store.flow.list.length).toBeGreaterThan(40)
    expect(store.mainBotId).toBe('2a3859ff-62d5-4c01-ae60-6ae2f812e786')
  })

  it('round-trip sem mutação preserva os dados (preserve-and-patch)', () => {
    // A garantia é de DADOS, não de bytes: serializeFlow é JSON.stringify(…, 2),
    // que normaliza espaços/quebras (o fixture é CRLF; a saída é LF). O invariante
    // é o objeto reidratado ser idêntico.
    const before = reload()
    const store = FlowStore.fromFile(flowPath)
    store.save()
    expect(reload()).toEqual(before)
  })
})

describe('Amostra 1 — criar 1 nó simples (create_node)', () => {
  it('cria, persiste e reaparece no reload com kind correto', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = store.flow.list.length

    const msg = createNode(store, 'defaultNode', 'spike_mensagem')
    expect(msg).toMatch(/criado nó "spike_mensagem" \(id [0-9a-f-]{36}\) kind=defaultNode/)

    // reload do disco: a mutação foi persistida
    const reloaded = reload()
    expect(reloaded.list).toHaveLength(before + 1)
    const created = reloaded.list.find(i => i.name === 'spike_mensagem')
    expect(created).toBeDefined()
    expect(created!.conditions[0].action.type).toBe('none')
    expect(created!.botId).toBe(store.mainBotId)
  })

  it('rejeita kind inválido sem mutar o arquivo', () => {
    const before = readFileSync(flowPath, 'utf8')
    const store = FlowStore.fromFile(flowPath)
    const msg = createNode(store, 'naoExiste', 'x')
    expect(msg).toMatch(/^⚠️ erro/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })

  it('grava o .bak ao lado na 1ª mutação e revert restaura o estado inicial', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = store.flow.list.length

    createNode(store, 'defaultNode', 'spike_temp')
    expect(existsSync(`${flowPath}.bak`)).toBe(true)
    expect(reload().list).toHaveLength(before + 1)

    const msg = revert(store)
    expect(msg).toMatch(/revertido/)
    expect(reload().list).toHaveLength(before)
    expect(reload().list.some(i => i.name === 'spike_temp')).toBe(false)
  })

  it('revert sem mutação não falha e reporta nada a reverter', () => {
    const store = FlowStore.fromFile(flowPath)
    expect(revert(store)).toMatch(/nada a reverter/)
  })
})

describe('Amostra 2 — nó de ação com bloco error + captura múltipla', () => {
  it('captura nasce com error→start e aceita multipleFields no round-trip', () => {
    const store = FlowStore.fromFile(flowPath)

    const created = createNode(store, 'captureNode', 'spike_captura')
    const id = /id ([0-9a-f-]{36})/.exec(created)![1]

    // bloco error materializado no template (os 7 nós de ação)
    const node = store.flow.list.find(i => i.id === id)!
    expect(node.conditions[0].action.error).toBeDefined()
    expect(node.conditions[0].action.error!.next.intent).toBe(`${store.mainBotId}-start`)

    // modo "múltiplas informações": categoria + campos
    setActionField(store, id, 'captureDataTypesCategory', 'multipleFields')
    const r = setActionField(store, id, 'multipleFields', ['fullName', 'mail', 'cpf'])
    expect(r).toMatch(/set multipleFields=\[fullName, mail, cpf\]/)

    // reload confirma persistência da estrutura completa
    const reloaded = reload().list.find(i => i.id === id)!
    expect(reloaded.conditions[0].action.captureDataTypesCategory).toBe('multipleFields')
    expect(reloaded.conditions[0].action.multipleFields).toEqual(['fullName', 'mail', 'cpf'])
    expect(reloaded.conditions[0].action.error).toBeDefined()
  })

  it('set_action_field em nó inexistente é erro sem efeito colateral', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = readFileSync(flowPath, 'utf8')
    const msg = setActionField(store, 'id-que-nao-existe', 'captureDataType', 'mail')
    expect(msg).toMatch(/^⚠️ erro: nó não encontrado/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })

  it('rejeita array em campo escalar e string em multipleFields (gate de tipo)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'captureNode', 'spike_tipo'))![1]
    expect(setActionField(store, id, 'captureDataType', ['a', 'b'])).toMatch(/requer um valor único/)
    expect(setActionField(store, id, 'multipleFields', 'naoEhLista')).toMatch(/requer uma lista/)
  })
})

describe('Amostra 3 — 3 nós conectados (create + connect + choices + validate)', () => {
  it('monta menu→A, menu→B, A→fim por id e por nome, validando ao fim', () => {
    const store = FlowStore.fromFile(flowPath)

    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu'))![1]
    const aId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_a'))![1]
    createNode(store, 'endNode', 'spike_fim')

    // menu de escolha aponta para os dois destinos (por id)
    const setMsg = setNodeChoices(store, menuId, [aId, 'spike_fim'])
    expect(setMsg).toMatch(/set 2 escolha\(s\)/)

    // conexão next por NOME (resolve nome→id)
    const conn = connectNodes(store, 'spike_a', 'spike_fim')
    expect(conn).toBe('spike_a→spike_fim (next)')

    // reload: choices e next persistidos
    const reloaded = reload()
    const menu = reloaded.list.find(i => i.id === menuId)!
    const fim = reloaded.list.find(i => i.name === 'spike_fim')!
    expect(menu.conditions[0].action.choices).toEqual([aId, fim.id])
    const a = reloaded.list.find(i => i.id === aId)!
    expect(a.conditions[0].next.intent).toEqual({ botId: store.mainBotId, id: fim.id })

    // Sem ERROS bloqueantes (refs quebradas, ids duplicados). Há 1 AVISO esperado:
    // o menu tem 2 escolhas mas ainda nenhuma mensagem BUTTON/LIST com botões — é
    // estado intermediário válido (Q2: aviso informa, não bloqueia).
    const report = validate(store)
    expect(report).not.toMatch(/❌/)
    expect(report).toMatch(/dessincronizado/)
  })

  it('connect reporta erro de domínio (menu sem item livre) sem quebrar o estado', () => {
    const store = FlowStore.fromFile(flowPath)
    createNode(store, 'endNode', 'spike_fim')
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu'))![1]
    // menu nasce com choices=[] e sem itens de menu → sem vaga livre
    const conn = connectNodes(store, menuId, 'spike_fim')
    expect(conn).toMatch(/^⚠️ erro:/)
    // Categoriza os nós criados — sem isso o nudge de categoria (Q5) os acusaria.
    setCategory(store, menuId, 'Atendimento')
    setCategory(store, 'spike_fim', 'Encerramento')
    // Sem ERROS bloqueantes. NÃO assertamos "✅ fluxo válido" porque o masterFlow tem
    // menus de botão/lista cujos alvos não têm keyword (v0.33.0) — avisos legítimos de
    // roteamento, não-bloqueantes. O que este teste garante é que o connect com erro de
    // domínio não introduziu ERRO estrutural.
    expect(validate(store)).not.toMatch(/❌/)
  })
})

describe('validate — nudge "Mensagem + Aguardar" → captureNode (interrogatório 2026-06-26)', () => {
  it('dispara aviso (não-bloqueante) quando defaultNode COM texto aponta para waitNode', () => {
    const store = FlowStore.fromFile(flowPath)
    createNode(store, 'defaultNode', 'pergunta_cnpj')
    createNode(store, 'waitNode', 'aguarda_cnpj')
    setMessage(store, 'pergunta_cnpj', 'Qual é o seu CNPJ?')
    connectNodes(store, 'pergunta_cnpj', 'aguarda_cnpj')

    const report = validate(store)
    expect(report).toMatch(/nó "pergunta_cnpj" faz uma pergunta e aponta para "aguarda_cnpj"/)
    expect(report).toMatch(/captureNode/)
    expect(report).not.toMatch(/❌/) // é aviso, nunca erro bloqueante
  })

  it('NÃO acusa quando o defaultNode não tem texto (Q5: só com mensagem TEXT)', () => {
    const store = FlowStore.fromFile(flowPath)
    createNode(store, 'defaultNode', 'so_encadeia')
    createNode(store, 'waitNode', 'aguarda_x')
    connectNodes(store, 'so_encadeia', 'aguarda_x')

    const report = validate(store)
    expect(report).not.toMatch(/"so_encadeia" faz uma pergunta e aponta/)
  })

  it('NÃO acusa um captureNode com a pergunta (o caminho correto)', () => {
    const store = FlowStore.fromFile(flowPath)
    createNode(store, 'captureNode', 'captura_cnpj')
    setMessage(store, 'captura_cnpj', 'Qual é o seu CNPJ?')

    const report = validate(store)
    expect(report).not.toMatch(/"captura_cnpj" faz uma pergunta e aponta/)
  })
})

describe('Fase 4b — set_menu (cria os itens de um choiceNode)', () => {
  it('cria menu BUTTON com 2 itens + 2 slots de choices vazios sincronizados (validate limpo)', () => {
    const store = FlowStore.fromFile(flowPath)
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu_b'))![1]

    const msg = setMenu(store, menuId, 'Como posso ajudar?', [
      { text: 'Falar com Financeiro' },
      { text: 'Quero me cadastrar' },
    ])
    expect(msg).toMatch(/menu BUTTON com 2 itens em "spike_menu_b"/)

    const node = reload().list.find(i => i.id === menuId)!
    const cond = node.conditions[0]
    const buttons = cond.assistant_says.flatMap(s => s.messages)
      .find(m => m.type === 'BUTTON')!.messageConfig!.buttons
    expect(buttons).toHaveLength(2)
    expect(buttons.map(b => b.text)).toEqual(['Falar com Financeiro', 'Quero me cadastrar'])
    // slots sincronizados (buttons[i] ↔ choices[i]), ainda vazios (destino a definir)
    expect(cond.action.choices).toEqual(['', ''])
    // categoriza para o nó não aparecer no nudge de "Sem Categoria" (Q5) — assim o
    // not.toMatch(spike_menu_b) testa só o aviso de dessincronização, não o de categoria
    setCategory(store, menuId, 'Atendimento')
    // sem ERROS e — por estar sincronizado — sem o aviso de dessincronização deste nó
    const report = validate(store)
    expect(report).not.toMatch(/❌/)
    expect(report).not.toMatch(/spike_menu_b/)
  })

  it('infere LIST quando um item traz descrição', () => {
    const store = FlowStore.fromFile(flowPath)
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu_list'))![1]
    const msg = setMenu(store, menuId, 'Escolha:', [
      { text: 'Ver pedido', description: 'status da entrega' },
      { text: 'Outro' },
    ], 'Cabeçalho', 'Rodapé', 'Título da lista')
    expect(msg).toMatch(/menu LIST com 2 itens/)
    const node = reload().list.find(i => i.id === menuId)!
    const m = node.conditions[0].assistant_says.flatMap(s => s.messages).find(x => x.type === 'LIST')!
    expect(m.messageConfig!.title).toBe('Título da lista')
    expect(m.messageConfig!.header).toBe('Cabeçalho')
  })

  it('depois de set_menu, set_choices preenche os destinos sem dessincronizar', () => {
    const store = FlowStore.fromFile(flowPath)
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu_dest'))![1]
    const aId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_dest_a'))![1]
    createNode(store, 'endNode', 'spike_dest_b')
    setMenu(store, menuId, 'Menu', [{ text: 'A' }, { text: 'B' }])
    setNodeChoices(store, menuId, [aId, 'spike_dest_b'])
    // categoriza os 3 nós criados — sem isso o nudge de categoria (Q5) listaria spike_menu_dest
    setCategory(store, menuId, 'Atendimento')
    setCategory(store, aId, 'Atendimento')
    setCategory(store, 'spike_dest_b', 'Encerramento')
    const report = validate(store)
    expect(report).not.toMatch(/❌/)
    expect(report).not.toMatch(/spike_menu_dest/)
  })

  it('recusa nó que não é de escolha', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_naomenu'))![1]
    expect(setMenu(store, id, 'x', [{ text: 'A' }])).toMatch(/não é um nó de escolha/)
  })

  it('recusa recriar menu em nó que já tem um', () => {
    const store = FlowStore.fromFile(flowPath)
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu_dup'))![1]
    setMenu(store, menuId, 'Menu', [{ text: 'A' }])
    expect(setMenu(store, menuId, 'Outro', [{ text: 'B' }])).toMatch(/já tem menu\/destinos/)
  })

  it('recusa quando o nó já tem destinos (choices) — não os apaga em silêncio', () => {
    const store = FlowStore.fromFile(flowPath)
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu_pre'))![1]
    createNode(store, 'endNode', 'spike_menu_pre_dest')
    // set_choices ANTES do set_menu (ordem não-prescrita): grava 1 destino real
    setNodeChoices(store, menuId, ['spike_menu_pre_dest'])
    const destId = reload().list.find(i => i.id === menuId)!.conditions[0].action.choices![0]
    expect(setMenu(store, menuId, 'Menu', [{ text: 'A' }])).toMatch(/já tem menu\/destinos/)
    // o destino pré-existente continua intacto (não foi zerado)
    expect(reload().list.find(i => i.id === menuId)!.conditions[0].action.choices).toEqual([destId])
  })

  it('valida body vazio e contagem de itens (delegado ao buildButtonList)', () => {
    const store = FlowStore.fromFile(flowPath)
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_menu_val'))![1]
    expect(setMenu(store, menuId, '', [{ text: 'A' }])).toMatch(/corpo/)
    expect(setMenu(store, menuId, 'Menu', [])).toMatch(/ao menos 1 item/)
    const onze = Array.from({ length: 11 }, (_, i) => ({ text: `item ${i}` }))
    expect(setMenu(store, menuId, 'Menu', onze)).toMatch(/no máximo 10 itens/)
  })
})

describe('set_message — texto (TEXT) da mensagem de um nó', () => {
  /** Mensagens TEXT da 1ª condição de um nó, lidas do disco. */
  function textMessages(id: string): BotMessage[] {
    const node = reload().list.find(i => i.id === id)!
    return node.conditions[0].assistant_says.flatMap(s => s.messages).filter(m => m.type === 'TEXT')
  }

  it('cria o balão de texto num defaultNode recém-criado (0 TEXT → cria)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_msg'))![1]

    const msg = setMessage(store, id, 'Olá, tudo bem?')
    expect(msg).toMatch(/mensagem criada em "spike_msg"/)

    const texts = textMessages(id)
    expect(texts).toHaveLength(1)
    expect(texts[0].content).toBe('Olá, tudo bem?')
  })

  it('sobrescreve o texto existente sem duplicar (1 TEXT → idempotente)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_msg_idem'))![1]

    setMessage(store, id, 'primeira versão')
    const msg = setMessage(store, id, 'versão final')
    expect(msg).toMatch(/mensagem atualizada em "spike_msg_idem"/)

    const texts = textMessages(id)
    expect(texts).toHaveLength(1) // não duplicou
    expect(texts[0].content).toBe('versão final')
  })

  it('recusa quando há N>1 balões de texto (não edita o errado em silêncio)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_msg_multi'))![1]
    setMessage(store, id, 'balão 1')
    // injeta um 2º balão TEXT (estado que a UI pode produzir, fora do alcance da tool)
    const intent = store.flow.list.find(i => i.id === id)!
    intent.conditions[0].assistant_says[0].messages.push({ type: 'TEXT', content: 'balão 2', fileName: '' })

    expect(setMessage(store, id, 'novo')).toMatch(/2 balões de texto.*não é suportada/)
  })

  it('recusa nó de escolha (aponta set_menu)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_msg_choice'))![1]
    expect(setMessage(store, id, 'x')).toMatch(/é um nó de escolha — use set_menu/)
  })

  it('recusa texto vazio ou só espaços sem mutar o arquivo', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_msg_vazio'))![1]
    const before = readFileSync(flowPath, 'utf8')
    expect(setMessage(store, id, '')).toMatch(/não pode ficar vazio/)
    expect(setMessage(store, id, '   ')).toMatch(/não pode ficar vazio/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })

  it('aceita um balão de texto junto da ação num nó de ação (transfer)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'transferNode', 'spike_msg_transfer'))![1]
    const msg = setMessage(store, id, 'Aguarde, vou te transferir.')
    expect(msg).toMatch(/mensagem criada/)
    expect(textMessages(id)[0].content).toBe('Aguarde, vou te transferir.')
  })

  it('recusa nó inexistente sem efeito colateral', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = readFileSync(flowPath, 'utf8')
    expect(setMessage(store, 'nao-existe', 'oi')).toMatch(/^⚠️ erro: nó não encontrado/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })
})

describe('set_category — categoria (cabeçalho que agrupa) do nó', () => {
  /** Categoria de um nó, lida do disco (round-trip). */
  function categoryOf(id: string): string {
    return reload().list.find(i => i.id === id)!.category
  }

  it('grava a categoria num nó recém-criado (default "Sem Categoria" → a categoria)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_cat'))![1]
    const msg = setCategory(store, id, 'Saudação e triagem')
    expect(msg).toMatch(/categoria de "spike_cat" = "Saudação e triagem"/)
    expect(categoryOf(id)).toBe('Saudação e triagem')
  })

  it('faz trim e colapsa espaços internos (Q3 — mata quase-duplicata boba)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_cat_trim'))![1]
    setCategory(store, id, '  Vendas   e    pós   ')
    expect(categoryOf(id)).toBe('Vendas e pós')
  })

  it('é idempotente — re-setar sobrescreve sem efeito estranho', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_cat_idem'))![1]
    setCategory(store, id, 'Atendimento')
    setCategory(store, id, 'Vendas')
    expect(categoryOf(id)).toBe('Vendas')
  })

  it('recusa categoria vazia ou só espaços sem mutar o arquivo', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_cat_vazio'))![1]
    const before = readFileSync(flowPath, 'utf8')
    expect(setCategory(store, id, '')).toMatch(/não pode ficar vazia/)
    expect(setCategory(store, id, '   ')).toMatch(/não pode ficar vazia/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })

  it('recusa recategorizar o nó de início (categoria especial "start", Q5)', () => {
    const store = FlowStore.fromFile(flowPath)
    const startId = `${store.mainBotId}-start`
    expect(setCategory(store, startId, 'Saudação e triagem')).toMatch(/é o nó de início.*não recategorize/)
    expect(categoryOf(startId)).toBe('start') // intacto
  })

  it('recusa nó inexistente sem efeito colateral', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = readFileSync(flowPath, 'utf8')
    expect(setCategory(store, 'nao-existe', 'Vendas')).toMatch(/^⚠️ erro: nó não encontrado/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })

  it('toca updatedAt ao gravar (#7 — uniformiza setters de campo de cabeçalho)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_cat_touch'))![1]
    // zera o updatedAt em memória para provar que o setCategory o reescreve no save
    store.flow.list.find(i => i.id === id)!.updatedAt = ''
    setCategory(store, id, 'Vendas')
    expect(reload().list.find(i => i.id === id)!.updatedAt).toMatch(/GMT/)
  })
})

describe('validate — nudge de categoria (interrogatório 2026-06-26, Q3/Q5)', () => {
  it('acusa categorias quase-iguais (só diferem por caixa/acento/espaço)', () => {
    const store = FlowStore.fromFile(flowPath)
    const a = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'cat_a'))![1]
    const b = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'cat_b'))![1]
    setCategory(store, a, 'Atendimento')
    setCategory(store, b, 'atendimento') // mesma chave normalizada → quase-dup

    const report = validate(store)
    expect(report).toMatch(/categorias quase-iguais/)
    expect(report).toMatch(/"Atendimento"/)
    expect(report).toMatch(/"atendimento"/)
    expect(report).not.toMatch(/❌/) // aviso, nunca bloqueia
  })

  it('NÃO acusa quase-dup quando a categoria é usada de forma consistente', () => {
    const store = FlowStore.fromFile(flowPath)
    const a = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'cat_c'))![1]
    const b = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'cat_d'))![1]
    setCategory(store, a, 'Atendimento')
    setCategory(store, b, 'Atendimento') // idêntica → reuso correto

    expect(validate(store)).not.toMatch(/categorias quase-iguais/)
  })

  it('acusa nó deixado em "Sem Categoria" (nomeando o nó), não-bloqueante', () => {
    const store = FlowStore.fromFile(flowPath)
    createNode(store, 'defaultNode', 'cat_orfao') // criado, nunca categorizado

    const report = validate(store)
    expect(report).toMatch(/Sem Categoria/)
    expect(report).toMatch(/cat_orfao/)
    expect(report).not.toMatch(/❌/)
  })

  it('NÃO acusa o fixture limpo: início ("start") e nós já categorizados passam', () => {
    const store = FlowStore.fromFile(flowPath)
    // o masterFlow tem todos os nós categorizados e o start em "start" (excluído do nudge)
    const report = validate(store)
    expect(report).not.toMatch(/Sem Categoria/)
    expect(report).not.toMatch(/categorias quase-iguais/)
  })

  it('não quebra com intent sem `category` (export real omite o campo) — trata como Sem Categoria', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'cat_sem_campo'))![1]
    // simula o JSON real onde o cabeçalho `category` está ausente (flowStore faz `as BotFlowJson` cego)
    const intent = store.flow.list.find(i => i.id === id)!
    delete (intent as { category?: string }).category

    expect(() => validate(store)).not.toThrow()
    const report = validate(store)
    expect(report).toMatch(/Sem Categoria/)
    expect(report).toMatch(/cat_sem_campo/)
    expect(report).not.toMatch(/❌/)
  })
})

describe('set_keywords — palavras-chave que roteiam o menu (v0.33.0)', () => {
  /** Keywords de um nó, lidas do disco (round-trip). */
  function keywordsOf(id: string): string[] {
    return reload().list.find(i => i.id === id)!.keywords
  }

  it('grava as keywords num nó (substitui o array)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'kw_alvo'))![1]
    const msg = setKeywords(store, id, ['financeiro'])
    expect(msg).toMatch(/keywords de "kw_alvo" = \[financeiro\]/)
    expect(keywordsOf(id)).toEqual(['financeiro'])
  })

  it('substitui o array anterior (set honesto, Q6)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'kw_sub'))![1]
    setKeywords(store, id, ['velha'])
    setKeywords(store, id, ['nova', 'outra'])
    expect(keywordsOf(id)).toEqual(['nova', 'outra'])
  })

  it('higieniza: trim, colapsa espaços, descarta vazias e duplicatas exatas', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'kw_higiene'))![1]
    setKeywords(store, id, ['  vendas  ', '', 'vendas', 'pós   venda', '   '])
    expect(keywordsOf(id)).toEqual(['vendas', 'pós venda'])
  })

  it('array vazio limpa as keywords (estado legítimo)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'kw_limpa'))![1]
    setKeywords(store, id, ['x'])
    const msg = setKeywords(store, id, [])
    expect(msg).toMatch(/limpadas/)
    expect(keywordsOf(id)).toEqual([])
  })

  it('recusa nó inexistente sem efeito colateral', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = readFileSync(flowPath, 'utf8')
    expect(setKeywords(store, 'nao-existe', ['x'])).toMatch(/^⚠️ erro: nó não encontrado/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })
})

describe('set_context — escopo da keyword (v0.33.0)', () => {
  /** Context de um nó, lido do disco. */
  function contextOf(id: string): string | null {
    return reload().list.find(i => i.id === id)!.context
  }

  it('grava context = id da intenção que escopa (resolve por nome intra-fluxo)', () => {
    const store = FlowStore.fromFile(flowPath)
    const alvoId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'ctx_alvo'))![1]
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'ctx_menu'))![1]
    const msg = setContext(store, alvoId, 'ctx_menu')
    expect(msg).toMatch(/context de "ctx_alvo" = "ctx_menu"/)
    expect(contextOf(alvoId)).toBe(menuId)
  })

  it('sem argumento (ou vazio) limpa o context → keyword global', () => {
    const store = FlowStore.fromFile(flowPath)
    const alvoId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'ctx_clear'))![1]
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'ctx_menu2'))![1]
    setContext(store, alvoId, menuId)
    const msg = setContext(store, alvoId)
    expect(msg).toMatch(/limpo \(keyword global\)/)
    expect(contextOf(alvoId)).toBeNull()
  })

  it('recusa apontar para si mesmo', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'ctx_self'))![1]
    expect(setContext(store, id, id)).toMatch(/não pode ter a si mesmo como context/)
  })

  it('recusa context inexistente sem mutar o arquivo', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'ctx_bad'))![1]
    const before = readFileSync(flowPath, 'utf8')
    expect(setContext(store, id, 'nao-existe')).toMatch(/context "nao-existe": nó não encontrado/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })
})

describe('validate — nudges de roteamento por keyword (v0.33.0)', () => {
  /** Monta um menu de BOTÃO com 2 itens apontando para 2 alvos, retornando os ids. */
  function buildMenu(store: ReturnType<typeof FlowStore.fromFile>) {
    const menuId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'kwm_menu'))![1]
    const aId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'kwm_a'))![1]
    const bId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'kwm_b'))![1]
    setMenu(store, menuId, 'Escolha:', [{ text: 'Falar com Financeiro' }, { text: 'Suporte' }])
    setNodeChoices(store, menuId, [aId, bId])
    // categoriza p/ o nudge de categoria não poluir as asserções
    ;[menuId, aId, bId].forEach(n => setCategory(store, n, 'Atendimento'))
    return { menuId, aId, bId }
  }

  it('(1) acusa alvo de menu de botão/lista sem keyword (nomeando o alvo)', () => {
    const store = FlowStore.fromFile(flowPath)
    buildMenu(store)
    const report = validate(store)
    expect(report).toMatch(/sem keyword/)
    expect(report).toMatch(/kwm_a/)
    expect(report).toMatch(/kwm_b/)
    expect(report).not.toMatch(/❌/)
  })

  it('(1) NÃO acusa quando os alvos têm keyword', () => {
    const store = FlowStore.fromFile(flowPath)
    const { aId, bId } = buildMenu(store)
    setKeywords(store, aId, ['financeiro'])
    setKeywords(store, bId, ['suporte'])
    const report = validate(store)
    expect(report).not.toMatch(/kwm_a/)
    expect(report).not.toMatch(/kwm_b/)
  })

  it('(2) acusa a MESMA keyword em intenções diferentes (colisão global)', () => {
    const store = FlowStore.fromFile(flowPath)
    const { aId, bId } = buildMenu(store)
    setKeywords(store, aId, ['Voltar'])
    setKeywords(store, bId, ['voltar']) // mesma chave dobrada → colisão
    const report = validate(store)
    expect(report).toMatch(/keyword repetida/)
    expect(report).toMatch(/kwm_a/)
    expect(report).toMatch(/kwm_b/)
    expect(report).not.toMatch(/❌/)
  })

  it('(3) acusa intenção com context que é alvo de 2 menus de botão/lista', () => {
    const store = FlowStore.fromFile(flowPath)
    // alvo único compartilhado por 2 menus
    const alvoId = /id ([0-9a-f-]{36})/.exec(createNode(store, 'endNode', 'kw3_alvo'))![1]
    const m1 = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'kw3_m1'))![1]
    const m2 = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'kw3_m2'))![1]
    setMenu(store, m1, 'M1', [{ text: 'ir' }])
    setMenu(store, m2, 'M2', [{ text: 'ir' }])
    setNodeChoices(store, m1, [alvoId])
    setNodeChoices(store, m2, [alvoId])
    setContext(store, alvoId, m1) // escopa a um → conflito com o outro menu
    const report = validate(store)
    expect(report).toMatch(/tem context.*mas é alvo de 2 menus/)
    expect(report).toMatch(/kw3_alvo/)
    expect(report).not.toMatch(/❌/)
  })

  it('(4) acusa keyword com espaço (multi-palavra; entrou pelo agente — set_keywords não splita)', () => {
    const store = FlowStore.fromFile(flowPath)
    const { aId, bId } = buildMenu(store)
    setKeywords(store, aId, ['plano premium']) // colapsa mas NÃO splita → keyword com espaço (inválida)
    setKeywords(store, bId, ['suporte'])
    const report = validate(store)
    expect(report).toMatch(/keyword com espaço/)
    expect(report).toMatch(/"plano premium"/)
    expect(report).toMatch(/kwm_a/)
    expect(report).not.toMatch(/❌/)
  })

  it('(4) NÃO acusa keyword de uma palavra', () => {
    const store = FlowStore.fromFile(flowPath)
    const { aId, bId } = buildMenu(store)
    setKeywords(store, aId, ['financeiro'])
    setKeywords(store, bId, ['suporte'])
    expect(validate(store)).not.toMatch(/keyword com espaço/)
  })
})

describe('Fase 4b — connect_to_bot (redirect cross-bot)', () => {
  // bot diferente do principal do fixture (o alvo cross-bot real da Parte 10).
  const OTHER_BOT = '8df3c1e7-a8c9-4bad-ac5a-2855462da840'

  it('grava next.intent objeto + action:"bot" com default {botId}-start', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_redir'))![1]
    const msg = connectToBot(store, id, OTHER_BOT)
    expect(msg).toBe(`spike_redir→outro bot (${OTHER_BOT}-start)`)

    const cond = reload().list.find(i => i.id === id)!.conditions[0]
    expect(cond.next!.intent).toEqual({ botId: OTHER_BOT, id: `${OTHER_BOT}-start` })
    expect(cond.next!.action).toBe('bot')
    // describe_node rotula como cross-bot
    expect(describeNode(store, id)).toContain('→outro bot')
  })

  it('usa o intentId explícito quando informado', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_redir2'))![1]
    connectToBot(store, id, OTHER_BOT, 'intent-alvo-123')
    const cond = reload().list.find(i => i.id === id)!.conditions[0]
    expect(cond.next!.intent).toEqual({ botId: OTHER_BOT, id: 'intent-alvo-123' })
  })

  it('(guarda a) recusa nó de escolha', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'choiceNode', 'spike_redir_choice'))![1]
    expect(connectToBot(store, id, OTHER_BOT)).toMatch(/é um nó de escolha/)
  })

  it('(guarda b) recusa quando botId é o próprio bot', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_redir_self'))![1]
    expect(connectToBot(store, id, store.mainBotId)).toMatch(/é o próprio bot/)
  })

  it('(guarda c) sobrescreve um next existente e avisa na confirmação', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_redir_over'))![1]
    createNode(store, 'endNode', 'spike_redir_alvo')
    connectNodes(store, id, 'spike_redir_alvo') // cria um next interno
    const msg = connectToBot(store, id, OTHER_BOT)
    expect(msg).toMatch(/destino anterior substituído/)
    const cond = reload().list.find(i => i.id === id)!.conditions[0]
    expect(cond.next!.intent).toEqual({ botId: OTHER_BOT, id: `${OTHER_BOT}-start` })
    expect(cond.next!.action).toBe('bot')
  })

  it('recusa nó inexistente sem efeito colateral', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = readFileSync(flowPath, 'utf8')
    expect(connectToBot(store, 'nao-existe', OTHER_BOT)).toMatch(/^⚠️ erro: nó não encontrado/)
    expect(readFileSync(flowPath, 'utf8')).toBe(before)
  })

  it('recusa botId vazio sem gravar next órfão (não fura a guarda do próprio bot)', () => {
    const store = FlowStore.fromFile(flowPath)
    const id = /id ([0-9a-f-]{36})/.exec(createNode(store, 'defaultNode', 'spike_redir_vazio'))![1]
    expect(connectToBot(store, id, '')).toMatch(/botId vazio/)
    expect(connectToBot(store, id, '   ')).toMatch(/botId vazio/)
    // nenhum next foi gravado
    expect(reload().list.find(i => i.id === id)!.conditions[0].next?.intent).toBeUndefined()
  })
})

describe('FlowStore.reloadFromFile — sincronia com edições externas', () => {
  it('retorna true e atualiza o modelo quando o arquivo foi modificado externamente', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = store.flow.list.length

    // Simula o front gravando o arquivo entre turnos: remove o último nó e escreve
    const edited: BotFlowJson = { list: store.flow.list.slice(0, -1) }
    writeFileSync(flowPath, JSON.stringify(edited, null, 2), 'utf8')

    const reloaded = store.reloadFromFile()

    expect(reloaded).toBe(true)
    expect(store.flow.list).toHaveLength(before - 1)
  })

  it('retorna false e não toca o modelo se o arquivo não mudou', () => {
    const store = FlowStore.fromFile(flowPath)
    const before = store.flow.list.length

    const reloaded = store.reloadFromFile()

    expect(reloaded).toBe(false)
    expect(store.flow.list).toHaveLength(before)
  })

  it('retorna false após save() sem mudança externa (disco = o que salvamos)', () => {
    const store = FlowStore.fromFile(flowPath)
    createNode(store, 'defaultNode', 'spike_reload_save')

    // save() escreve no disco e atualiza lastSavedContent
    // → reloadFromFile deve ver o mesmo conteúdo e retornar false
    const reloaded = store.reloadFromFile()

    expect(reloaded).toBe(false)
  })

  it('retorna false em store de memória (fromObject — sem arquivo)', () => {
    const store = FlowStore.fromObject({ list: [] })
    expect(store.reloadFromFile()).toBe(false)
  })
})

describe('Leitura — list_nodes e describe_node compactos', () => {
  it('list_nodes traz uma linha por nó com id, kind e alvo', () => {
    const store = FlowStore.fromFile(flowPath)
    const out = listNodes(store)
    const lines = out.split('\n')
    expect(lines.length).toBe(store.flow.list.length)
    // a intenção start aparece e referencia seu próximo nó
    expect(out).toMatch(/start \| 2a3859ff-62d5-4c01-ae60-6ae2f812e786-start \| defaultNode \| start \| →/)
  })

  it('describe_node mostra gatilho, ação, campos e destino de um nó real', () => {
    const store = FlowStore.fromFile(flowPath)
    const start = store.flow.list.find(i => i.id.endsWith('-start'))!
    const out = describeNode(store, start.id)
    expect(out).toContain(`nó "start"`)
    expect(out).toMatch(/\[c0\].*defaultNode.*→/)
  })

  it('describe_node de id inexistente é erro amigável', () => {
    const store = FlowStore.fromFile(flowPath)
    expect(describeNode(store, 'xxx')).toMatch(/^⚠️ erro: nó não encontrado/)
  })

  it('rotula salto cross-bot como "outro bot", não como "(start)"', () => {
    // acao_transfer_outro_bot (Parte 10) salta para <outroBot>-start com action:'bot'.
    const store = FlowStore.fromFile(flowPath)
    const crossBot = store.flow.list.find(i =>
      i.conditions.some(c => c.next?.action === 'bot'))
    expect(crossBot, 'fixture deve conter um nó cross-bot').toBeDefined()
    const line = listNodes(store).split('\n').find(l => l.startsWith(`${crossBot!.name} |`))!
    expect(line).toContain('outro bot')
    expect(line).not.toMatch(/→\(start\)/)
    expect(describeNode(store, crossBot!.id)).toContain('→outro bot')
  })
})
