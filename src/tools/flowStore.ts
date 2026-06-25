import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import type { BotFlowJson } from '../types'
import { serializeFlow } from '../utils/editFlow'

/**
 * Camada de STORAGE da spike do agente (Fase 1, PLANS.md § "Agente de IA que
 * constrói nós"). Carrega/muta/salva o arquivo de fluxo e mantém a rede de
 * segurança da sessão (snapshot + revert). É a peça DURÁVEL: a mesma abstração
 * é reusada no caminho-produto (Fase 5) trocando só a fonte (`fromFile` →
 * storage em nuvem), por isso o I/O fica isolado aqui e as tools (`flowTools`)
 * só conhecem `flow`/`beginMutation`/`save`/`revert`.
 *
 * Decisões travadas no design (interrogatório 2026-06-23):
 *  - Q2: mutações salvam SEM gate de validação (validar é tool à parte). Estados
 *    intermediários válidos (nó criado mas ainda não conectado) não podem ser
 *    barrados.
 *  - Q3: undo = 1 snapshot por sessão (não pilha) + `revert`. NÃO depende de git
 *    (o produto não tem repo). Local grava também um `.bak` ao lado do arquivo
 *    para durabilidade fora do processo.
 */
export class FlowStore {
  private model: BotFlowJson
  /** Caminho do arquivo em disco; `null` em store de memória (testes/produto). */
  readonly filePath: string | null
  /** Cópia do estado na 1ª mutação da sessão (a base do `revert`). */
  private snapshot: BotFlowJson | null = null
  /**
   * Conteúdo bruto do último `fromFile` ou `save`. Usado por `reloadFromFile`
   * para detectar se o arquivo foi modificado externamente (disco ≠ este valor
   * → recarregar; disco = este valor → noop).
   */
  private lastSavedContent: string | null = null

  private constructor(model: BotFlowJson, filePath: string | null, lastSavedContent: string | null = null) {
    this.model = model
    this.filePath = filePath
    this.lastSavedContent = lastSavedContent
  }

  /** Store sobre um modelo em memória — sem persistência (save/revert não tocam disco). */
  static fromObject(model: BotFlowJson): FlowStore {
    return new FlowStore(model, null)
  }

  /** Carrega o fluxo de um arquivo JSON no disco (caminho local da spike). */
  static fromFile(filePath: string): FlowStore {
    const raw = readFileSync(filePath, 'utf8')
    return new FlowStore(JSON.parse(raw) as BotFlowJson, filePath, raw)
  }

  /** Caminho do backup de sessão, ao lado do arquivo (`<arquivo>.bak`). */
  get bakPath(): string | null {
    return this.filePath ? `${this.filePath}.bak` : null
  }

  /** Modelo em memória — fonte de verdade que as tools mutam (preserve-and-patch). */
  get flow(): BotFlowJson {
    return this.model
  }

  /**
   * ID do bot principal: o da intenção de início (`category: 'start'` ou id
   * `…-start`), com fallback para a 1ª intenção. Usado pelos templates de nó e
   * pela detecção de conexão cross-bot.
   */
  get mainBotId(): string {
    const start = this.model.list.find(i => i.category === 'start' || i.id.endsWith('-start'))
    return start?.botId ?? this.model.list[0]?.botId ?? ''
  }

  /**
   * Tira o snapshot de sessão (idempotente: só na 1ª mutação). Toda tool que
   * muta o modelo chama isto ANTES de aplicar a mudança, garantindo que `revert`
   * volte ao estado em que a sessão começou. Em store de arquivo, também copia
   * o arquivo para `.bak` (uma vez) como rede de segurança fora do processo.
   */
  beginMutation(): void {
    if (this.snapshot) return
    this.snapshot = structuredClone(this.model)
    if (this.filePath && this.bakPath && !existsSync(this.bakPath)) {
      copyFileSync(this.filePath, this.bakPath)
    }
  }

  /** Persiste o modelo em disco (no-op em store de memória). Mutações salvam sem gate (Q2). */
  save(): void {
    if (!this.filePath) return
    const content = serializeFlow(this.model)
    writeFileSync(this.filePath, content, 'utf8')
    this.lastSavedContent = content
  }

  /**
   * Relê o arquivo do disco e atualiza o modelo em memória se o conteúdo
   * divergiu desde o último `fromFile`/`save`. Era o gatilho de sincronia
   * pensado para um MCP persistente entre turnos.
   *
   * NOTA (verificado 2026-06-25): no PoC local da caixinha de chat o MCP **sobe
   * novo a cada turno** (o Agent SDK re-spawna o subprocesso mesmo no `resume`),
   * então o `fromFile` do boot já enxerga o flush do canvas — este método é
   * **redundante** nesse caminho. Mantido como rede de segurança e para a Fase 5
   * (caso o MCP passe a viver entre turnos, basta chamá-lo no início de cada tool).
   *
   * Retorna `true` se houve reload, `false` se o arquivo não mudou.
   * No-op (retorna `false`) em store de memória (`filePath === null`).
   */
  reloadFromFile(): boolean {
    if (!this.filePath) return false
    const current = readFileSync(this.filePath, 'utf8')
    if (current === this.lastSavedContent) return false
    this.model = JSON.parse(current) as BotFlowJson
    this.lastSavedContent = current
    return true
  }

  /**
   * Desfaz TUDO desde a 1ª mutação da sessão, restaurando o snapshot e
   * persistindo. Retorna `false` se nada foi mutado ainda (nada a reverter).
   */
  revert(): boolean {
    if (!this.snapshot) return false
    this.model = structuredClone(this.snapshot)
    this.save()
    return true
  }
}
