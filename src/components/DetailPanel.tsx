import type { Node } from '@xyflow/react'
import type { FlowNodeData, NodeKind } from '../types'

const KIND_LABELS: Record<NodeKind, { label: string; color: string }> = {
  startNode:       { label: 'Início',          color: 'bg-emerald-100 text-emerald-700' },
  choiceNode:      { label: 'Escolha',          color: 'bg-blue-100 text-blue-700' },
  captureNode:     { label: 'Captura',          color: 'bg-violet-100 text-violet-700' },
  transferNode:    { label: 'Transferência',    color: 'bg-rose-100 text-rose-700' },
  waitNode:        { label: 'Aguarda',          color: 'bg-cyan-100 text-cyan-700' },
  setDataNode:     { label: 'Variável',         color: 'bg-indigo-100 text-indigo-700' },
  externalBotNode: { label: 'Outro Bot',        color: 'bg-amber-100 text-amber-700' },
  defaultNode:     { label: 'Padrão',           color: 'bg-slate-100 text-slate-600' },
}

const CAPTURE_LABELS: Record<string, string> = {
  name: 'Nome', fullName: 'Nome completo', zipcode: 'CEP',
  addressNumber: 'Número do endereço', addressComplement: 'Complemento',
  email: 'E-mail', phone: 'Telefone', cpf: 'CPF',
}

const TRANSFER_TYPE_LABELS: Record<string, string> = {
  direct4group:        'Grupo direto',
  direct4user:         'Usuário direto',
  direct4userPrevious: 'Atendente anterior',
  direct4userCurrent:  'Atendente atual',
  queue:               'Fila de atendimento',
}

const COND_TYPE_STYLES: Record<string, string> = {
  exists: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  else:   'bg-slate-50 text-slate-500 border-slate-200',
  any:    'bg-blue-50 text-blue-600 border-blue-200',
  equals: 'bg-orange-50 text-orange-700 border-orange-200',
}

const COND_TYPE_LABELS: Record<string, string> = {
  exists: 'existe',
  else:   'senão',
  any:    'qualquer',
  equals: 'igual',
}

interface DetailPanelProps {
  node: Node<FlowNodeData>
  onClose: () => void
}

export function DetailPanel({ node, onClose }: DetailPanelProps) {
  const data = node.data
  const kind = (node.type ?? 'defaultNode') as NodeKind
  const badge = KIND_LABELS[kind] ?? KIND_LABELS.defaultNode

  return (
    <div className="absolute right-0 top-0 h-full w-80 bg-white border-l border-slate-200 shadow-xl z-10 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-4 py-3 border-b border-slate-100">
        <div className="min-w-0 pr-2">
          <p className="text-sm font-semibold text-slate-800 leading-tight truncate">{data.name}</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">{data.category}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.color}`}>
            {badge.label}
          </span>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Fechar"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">

        {/* Keywords */}
        {data.keywords.length > 0 && (
          <Section title="Keywords">
            <div className="flex flex-wrap gap-1">
              {data.keywords.map(kw => (
                <span key={kw} className="text-[10px] bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">
                  {kw}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* Messages */}
        {data.allMessages.length > 0 && (
          <Section title="Mensagens">
            <div className="flex flex-col gap-2">
              {data.allMessages.map((msg, i) => (
                <p
                  key={i}
                  className="text-xs text-slate-600 leading-relaxed bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 whitespace-pre-wrap"
                >
                  {msg.replace(/@[\w.#]+/g, m => `[${m.slice(1)}]`)}
                </p>
              ))}
            </div>
          </Section>
        )}

        {/* Buttons / list options */}
        {data.buttons.length > 0 && (
          <Section title="Opções">
            <div className="flex flex-col gap-1.5">
              {data.buttons.map(btn => (
                <div key={btn.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5">
                  <p className="text-xs font-medium text-blue-800">{btn.text}</p>
                  {btn.description && (
                    <p className="text-[10px] text-blue-600 mt-0.5">{btn.description}</p>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Capture type */}
        {data.captureDataType && (
          <Section title="Dado capturado">
            <span className="text-xs text-violet-700 bg-violet-50 border border-violet-200 rounded-full px-2 py-0.5">
              {CAPTURE_LABELS[data.captureDataType] ?? data.captureDataType}
            </span>
          </Section>
        )}

        {/* Transfer info */}
        {(data.transferType || data.transferValue) && (
          <Section title="Transferência">
            <div className="flex flex-col gap-1.5">
              {data.transferType && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Tipo</span>
                  <span className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-full px-2 py-0.5">
                    {TRANSFER_TYPE_LABELS[data.transferType] ?? data.transferType}
                  </span>
                </div>
              )}
              {data.transferValue && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-slate-400">Destino</span>
                  <span className="text-[10px] font-mono text-rose-700 bg-rose-50 border border-rose-200 rounded px-1.5 py-0.5">
                    {data.transferValue}
                  </span>
                </div>
              )}
            </div>
          </Section>
        )}

        {/* Conditions */}
        {data.conditions.length > 0 && (
          <Section title="Condições">
            <div className="flex flex-col gap-1.5">
              {data.conditions.map((cond, i) => {
                const typeStyle = COND_TYPE_STYLES[cond.type] ?? COND_TYPE_STYLES.any
                const typeLabel = COND_TYPE_LABELS[cond.type] ?? cond.type
                return (
                  <div key={i} className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-medium text-slate-700">{cond.name}</p>
                      <span className={`text-[10px] border rounded-full px-1.5 py-0 ${typeStyle}`}>
                        {typeLabel}
                      </span>
                    </div>
                    {cond.variable && (
                      <p className="text-[10px] font-mono text-slate-400 mt-1 truncate" title={cond.variable}>
                        {cond.variable}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          </Section>
        )}

        {/* External bot info */}
        {kind === 'externalBotNode' && (
          <Section title="Destino externo">
            <InfoRow label="Bot ID"    value={data.externalBotId    ?? '-'} mono />
            <InfoRow label="Intent ID" value={data.externalIntentId ?? '-'} mono />
          </Section>
        )}

        {/* SetData items */}
        {data.setDataItems.length > 0 && (
          <Section title="Variáveis definidas">
            <div className="flex flex-col gap-1.5">
              {data.setDataItems.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <span className="font-mono text-indigo-600 bg-indigo-50 border border-indigo-200 rounded px-1.5 py-0.5 text-[10px]">
                    {item.variable}
                  </span>
                  <span className="text-slate-400">=</span>
                  <span className="font-medium text-slate-700">{item.value}</span>
                </div>
              ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1.5">{title}</p>
      {children}
    </div>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 mb-1.5">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span
        className={`text-[10px] break-all bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 ${mono ? 'font-mono' : ''}`}
        title={value}
      >
        {value}
      </span>
    </div>
  )
}
