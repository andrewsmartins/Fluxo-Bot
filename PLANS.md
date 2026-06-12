# PLANS.md — Fluxo: de visualizador a editor de fluxos OmniChat

> Última atualização: 2026-06-11. Este arquivo orienta sessões futuras do Claude Code.
> Status: **Fases 1, 2 e 3a concluídas (v0.8.0, branch `feat/editor-roundtrip`). Pendências: Fase 3b + Fase 4 (push API).**

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

### Fase 2 — Criação de nós ✅ CONCLUÍDA (v0.7.0)

Implementação efetiva:
- Paleta (`src/components/NodePalette.tsx`) como `<Panel position="top-left">`
  dentro do ReactFlow; drag & drop HTML5 com MIME `application/fluxo-node-kind`
  e `screenToFlowPosition` (FlowCanvas envolto em `ReactFlowProvider`).
- Templates canônicos em `src/utils/intentTemplates.ts` (forma do POST
  capturado, com nulls explícitos): transfer → `direct4group` + error→start;
  captureData → `free` + error→start; choice → `choices: []`. Nome gerado
  `nova_intencao_{n}`, categoria "Sem Categoria", `crypto.randomUUID()`.
- `onConnect` (editFlow.applyConnect): preenche `next.intent` na PRIMEIRA
  condição livre (sem ref e não-choice), com `redirect: continueFlow` (277 de
  343 refs nos bots reais usam esse valor). A aresta usa o ID posicional
  (`{id}-c{idx}-next`) via `parseFlow.buildNextEdge` — reconexão/deleção
  funcionam nela imediatamente.
- Deleção de arestas `-next` (Delete/Backspace): reseta `next` para
  `{ redirect: 'waitInteraction', type }`. Arestas de escolha são protegidas
  (botão ficaria órfão — mapeamento posicional buttons[i] ↔ choices[i]);
  externas idem. Deleção de NÓS ainda bloqueada (Fase 3: exigiria limpar
  referências de entrada).
- Estado dos nós elevado ao App (canvas controlado); `fitView` agora responde
  a `layoutVersion` (gerar/espaçamento), não à contagem de nós — criar nó não
  re-enquadra mais a viewport.
- Testes: `intentTemplates.test.ts` (23 casos) + `scripts/smoke-phase2.mjs`
  (drop cria nó, drag conecta, Delete remove, export reflete tudo).
- Aprendizado p/ testes Playwright: selecionar aresta exige clicar num ponto
  REAL do path (`getPointAtLength`) — o centro do bounding box de um
  smoothstep cai fora da linha e seleciona outro elemento.

### Fase 3a — Edição de conteúdo ✅ CONCLUÍDA (v0.8.0)

Implementação efetiva:
- DetailPanel (`src/components/DetailPanel.tsx`) virou formulário com rascunho
  local + botão "Aplicar alterações". Edita: nome/categoria/keywords; mensagens
  (TEXT editar/adicionar/remover; BUTTON/LIST só o body); texto/descrição de
  botões (id preservado); transferType/value; captureDataType/variable;
  bulkUpdate do setData. Nós externos (sintéticos) continuam read-only.
- Patches em `src/utils/editIntent.ts`, endereçamento de mensagem por
  `{condIdx, sayIdx, msgIdx}`; remoções aplicadas em ordem decrescente de
  índice (os endereços deslocam); `updatedAt` sempre atualizado.
- Pós-apply o App refaz `intentToNodeData` do nó e `buildEdges(model)` (labels
  de aresta acompanham texto de botão) sem relayout.
- Validação no export (`src/utils/validateFlow.ts`): erros bloqueiam
  (ID duplicado, sem nome, sem condições); avisos não (ref interna quebrada,
  sem start, buttons.length ≠ choices.length).
- Testes: `editIntent.test.ts` (19 casos) + `scripts/smoke-phase3.mjs`.

### Fase 3b — Edição estrutural avançada (PENDENTE)
- Adicionar/remover botões com sincronia posicional buttons[i] ↔ choices[i]
  (e a aresta correspondente).
- Adicionar/remover/editar condições (tipo, variável, valor).
- Deleção de nós com limpeza de referências de entrada (next refs apontando
  para o nó deletado → reset; choices → remover botão + escolha).
- UX: DetailPanel aberto cobre os controles de export (canto sup. direito) —
  reposicionar controles ou fechar painel ao exportar.
- Mensagens BUTTON/LIST: criar do zero (hoje só em intents que já as têm).

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
