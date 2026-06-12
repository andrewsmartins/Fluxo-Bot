# PLANS.md — Fluxo: de visualizador a editor de fluxos OmniChat

> Última atualização: 2026-06-11. Este arquivo orienta sessões futuras do Claude Code.
> Status: **Fase 1 concluída (v0.6.0, branch `feat/editor-roundtrip`). Próxima: Fase 2.**

## Contexto

O Fluxo hoje é um **visualizador read-only**: importa o JSON de intenções de um bot
OmniChat, parseia em `src/utils/parseFlow.ts` e renderiza com `@xyflow/react` (React
Flow 12) + layout automático via Dagre. A plataforma OmniChat **não tem editor visual
nem importador/exportador de arquivo** — só uma tela Angular que edita intenção por
intenção.

Objetivo do projeto: evoluir o Fluxo para um **editor visual** (criar nós, conectar,
editar conteúdo) capaz de gerar JSON válido e, opcionalmente, enviar direto para a
plataforma via API.

## Contrato de API descoberto (engenharia reversa do bundle + captura de rede)

Base: `https://k0yowczqxg.execute-api.us-east-1.amazonaws.com/prod`
(API Gateway AWS; o front em `app.omni.chat` chama cross-origin).

| Operação | Chamada |
|---|---|
| Listar intenções | `GET /v1/{botId}/intents?fullObject=true` → `{ "list": [intent, ...] }` |
| Salvar/criar intenção | `POST /v1/{botId}/intents/{intentId}` (body = objeto intent completo) |
| Excluir intenção | `DELETE /v1/{botId}/intents/{intentId}` |
| Mesmas rotas para | `endpoints` e `entities` (coleções irmãs de intents) |
| Bot inteiro | `POST /v1/bots` (salvar), `POST /v1/bots/duplicate`, `POST /v1/{botId}/publish`, `GET /v1/{botId}/versions/{id}` |

Headers de autenticação necessários (capturados de uma sessão real):
`authorization: Bearer <token>`, `x-parse-session-token: <token>`,
`x-parse-application-id: <app id fixo>`, `x-omnichat-platform: web`.
O token é o de sessão do usuário logado (Parse Server). **Nunca commitar tokens.**

### Fatos de schema confirmados (POST capturado vs samples de GET)

- O body do POST tem **a mesma forma** dos itens do GET — round-trip é viável.
- `id` das intenções: UUID v4. A intenção inicial usa ID especial `{botId}-start`.
- `condition.next.intent` = **objeto** `{ botId, id }`.
- `action.error.next.intent` = **string** (ID), com `intentBot` como campo irmão.
  Essa assimetria existe em GET e POST igualmente — preservar na serialização.
- Campo `advanced: { active, endpointId }` existe nos exports mais novos
  (sample02/03) e no POST; ausente no sample01 (mais antigo). Tratar como opcional,
  mas sempre emitir no POST.
- O formulário Angular envia o `action` com **todos os campos presentes**
  (nulls/defaults explícitos: `captureDataTypesCategory`, `multipleFields`,
  `lastMessageTextParams`, etc.), enquanto GETs antigos omitem alguns. Serializar
  sempre a forma completa canônica (a do POST capturado).
- Ações que referenciam `endpoints`/`entities` apontam para IDs já existentes no
  bot — o editor trata como referência, nunca cria.

Payload de referência: ver captura do POST de `aguarda_atendente` (transfer) feita
em 2026-06-11 — manter cópia **sanitizada** (sem headers) se necessário em
`samples/`.

## Arquitetura alvo

**Inverter a fonte de verdade.** Hoje: JSON → parseFlow (lossy) → nós React Flow.
Alvo: o modelo `BotIntent[]` é a fonte de verdade; o canvas é uma projeção editável.

- Cada nó guarda seu `BotIntent` cru em `node.data` (campo `raw`).
- Edição estrutural no canvas (conectar/desconectar) = patch no intent
  (`condition.next`).
- Edição de conteúdo no DetailPanel = patch nas `conditions`/`assistant_says`.
- Exportar = remontar `{ list: [...] }` a partir dos intents (originais + patches).
  Nunca reconstruir campos não editados — **preservar e aplicar patch**, não
  serializar do zero.

## Fases

### Fase 1 — Round-trip (importar → reconectar → exportar) ✅ CONCLUÍDA (v0.6.0)

Implementação efetiva (com desvios deliberados do plano original):
- A fonte de verdade é o `BotFlowJson` original em `parsedDataRef` (App.tsx),
  **não** uma cópia em `node.data.raw` — o objeto parseado é mutado pelos patches
  e serializado direto, preservando qualquer campo extra desconhecido.
- O mapeamento aresta→modelo usa os **IDs de aresta** do parseFlow, que codificam
  a posição: `{intentId}-c{condIdx}-next|ch{idx}|ext`. Decodificação em
  `src/utils/editFlow.ts` (`parseEdgeId`).
- Reconexão: só a **ponta de destino** é editável (`reconnectable: 'target'`);
  mover a origem mudaria de qual condição a aresta nasce (ambíguo). Arestas
  externas (`-ext`) não são editáveis. `onReconnect` no App patcheia o modelo
  via `applyEdgeReconnect` e só então atualiza o canvas (`reconnectEdge` com
  `shouldReplaceId: false` — o ID precisa permanecer estável).
- Arestas de escolha: o patch substitui o destino **por valor** em
  `action.choices` (todas as ocorrências), porque o índice da aresta refere-se
  à lista deduplicada, não à original. IDs de botões são UUIDs independentes —
  não precisam de patch.
- Botão **JSON** no ExportControls baixa `serializeFlow(model)`.
- **Fora do escopo entregue** (adiado para Fase 2): criação de novas arestas
  (`onConnect`) e deleção — ambas exigem decidir qual condição recebe/perde o
  `next`, o que faz mais sentido junto da paleta de criação de nós.
- Testes: `src/utils/editFlow.test.ts` (Vitest, `npm test`) — round-trip dos 3
  samples, decodificação de IDs (incl. `{botId}-start`), patches e caminhos
  infelizes. `@types/node` instalado para o `tsc` aceitar `node:fs` nos testes.

### Fase 2 — Criação de nós
- Paleta lateral com um template de `BotIntent` mínimo válido por tipo
  (choiceNode, captureNode, transferNode, waitNode, setDataNode, defaultNode).
- Template = forma canônica completa do POST capturado (todos os defaults).
- Gerar UUID v4 para `id`; `botId` herdado do fluxo carregado.
- Drag & drop com `screenToFlowPosition`; `onConnect` preenche `next`.
- **Teste:** criar 2 nós, conectar, exportar, validar contra o schema canônico.

### Fase 3 — Edição de conteúdo
- DetailPanel vira formulário: mensagens (TEXT/BUTTON/LIST), botões, condições,
  tipo de ação, transferType/value, bulkUpdate (setData), captureDataType.
- Fase mais cara — o schema de conditions/actions tem muita variação.
- **Teste:** round-trip por tipo de nó; validação de campos obrigatórios antes
  de exportar (start existe? refs órfãs? IDs duplicados?).

### Fase 4 (opcional) — Push direto via API
- Configuração de token de sessão (nunca persistir em repo; usar campo na UI ou
  variável de ambiente local).
- Para cada intent alterado/criado: `POST /v1/{botId}/intents/{id}`.
- **Sempre testar em bot sandbox — nunca em bot de cliente em produção.**
- Caminho infeliz: 401 (token expirado), 4xx de validação — exibir erro claro.

## Melhorias paralelas (independentes das fases)

- Trocar `dagre@0.8.5` (sem manutenção) por `@dagrejs/dagre` (fork mantido,
  API idêntica) — só muda o import em `parseFlow.ts`.
- Avaliar `elkjs` se a estética do layout automático incomodar: é port-aware
  (considera a posição dos handles, melhora fluxos com muitos botões/saídas).
  Restrito a `parseFlow.ts:dagreLayout`.

## Riscos e decisões registradas

1. API interna não documentada — pode mudar sem aviso; o teste de round-trip com
   exports reais é a rede de segurança.
2. Usuário (Andy) trabalha na OmniChat (Suporte N2 + automações) — uso interno
   autorizado, ainda assim seguir a regra do sandbox.
3. Não criar/editar `endpoints` e `entities` no escopo atual — só referenciar.
4. A skill de projeto foi descartada (decisão de 2026-06-11): o conhecimento fica
   neste PLANS.md.
