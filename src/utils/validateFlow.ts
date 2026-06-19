import type { BotFlowJson } from '../types'

export interface ValidationReport {
  /** Problemas que tornam o JSON inválido para a plataforma — bloqueiam o export. */
  errors: string[]
  /** Inconsistências prováveis, mas que a plataforma tolera — só avisam. */
  warnings: string[]
}

// Por que ref interna quebrada é ERRO (e não aviso): a API aceita silenciosamente
// um `next.intent` apontando para um ID inexistente (HTTP 200), mas a tela da Omni
// marca o campo "Próximo Fluxo" como erro a preencher e o simulador cai no Start.
// Como o servidor não barra lixo, o FlowViewer precisa barrar antes do push.
// Validado na Etapa 2 da Fase 4 — ver docs/fase4-resultados.md (2026-06-15).

function getRefIds(json: BotFlowJson): { id: string; botId: string; from: string }[] {
  const refs: { id: string; botId: string; from: string }[] = []
  for (const intent of json.list) {
    for (const cond of intent.conditions) {
      const next = cond.next?.intent
      if (next && typeof next === 'object' && next.id) {
        refs.push({ id: next.id, botId: next.botId ?? '', from: intent.name })
      }
      if (Array.isArray(cond.action.choices)) {
        for (const choiceId of cond.action.choices) {
          if (choiceId) refs.push({ id: choiceId, botId: intent.botId, from: intent.name })
        }
      }
    }
  }
  return refs
}

/**
 * Valida o modelo antes do export. Erros bloqueiam (IDs duplicados, intenção
 * sem nome/condições, referência interna quebrada); avisos informam (fluxo sem
 * início, choice com botões dessincronizados) mas não impedem o download.
 */
export function validateFlow(json: BotFlowJson): ValidationReport {
  const errors: string[] = []
  const warnings: string[] = []
  const ids = new Set<string>()

  for (const intent of json.list) {
    if (ids.has(intent.id)) errors.push(`ID duplicado: ${intent.id} (${intent.name})`)
    ids.add(intent.id)
    if (!intent.name?.trim()) errors.push(`intenção sem nome (id ${intent.id})`)
    if (!intent.conditions?.length) errors.push(`intenção "${intent.name}" sem condições`)
  }

  if (!json.list.some(i => i.category === 'start' || i.id.endsWith('-start'))) {
    warnings.push('o fluxo não tem intenção de início (categoria "start")')
  }

  const mainBotId = json.list.find(i => i.category === 'start')?.botId ?? json.list[0]?.botId ?? ''
  for (const ref of getRefIds(json)) {
    const isExternal = ref.botId && ref.botId !== mainBotId
    if (!isExternal && !ids.has(ref.id)) {
      errors.push(`"${ref.from}" referencia uma intenção inexistente (${ref.id})`)
    }
  }

  for (const intent of json.list) {
    for (const cond of intent.conditions) {
      if (cond.action.type !== 'choice' || !Array.isArray(cond.action.choices)) continue
      const buttons = cond.assistant_says
        .flatMap(s => s.messages)
        .find(m => (m.type === 'BUTTON' || m.type === 'LIST') && m.messageConfig?.buttons?.length)
        ?.messageConfig?.buttons ?? []
      if (buttons.length !== cond.action.choices.length) {
        warnings.push(`"${intent.name}": ${buttons.length} botões para ${cond.action.choices.length} escolhas (mapeamento posicional dessincronizado)`)
      }
    }
  }

  return { errors, warnings }
}
