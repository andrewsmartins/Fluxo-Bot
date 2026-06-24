import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { FlowStore } from './flowStore'
import {
  createNode, setActionField, setNodeChoices, connectNodes, validate, revert,
  listNodes, describeNode,
} from './flowTools'
import type { BotFlowJson } from '../types'

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
    expect(validate(store)).toMatch(/✅ fluxo válido/)
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
