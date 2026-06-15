# PLANS.md — Fluxo: de visualizador a editor de fluxos OmniChat

> Última atualização: 2026-06-15. Este arquivo orienta sessões futuras do Claude Code.
> Status: **Fases 1–3b, 4a (push CLI) e 5 (a, b, c) concluídas (v0.12.1, branch `feat/visual-editor`).**
> **Fase 4a PRONTA e validada ponta a ponta** — todos os critérios do protocolo
> cumpridos, incl. caminhos infelizes e rollback real (ver docs/fase4-resultados.md,
> Etapa 4, 2026-06-15). Próximo passo: **Fase 4b** (push pela UI do Fluxo) —
> plano de implementação pronto na seção "Fase 4b" abaixo; começar pela extração
> de `src/utils/pushFlow.ts` testável.

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

### Fase 3b — Edição estrutural avançada ✅ CONCLUÍDA (v0.9.0)

Implementação efetiva:
- Botões: `addButton` cria botão + slot vazio `''` em choices (posicional);
  `removeButton` remove ambos na mesma posição; `addButtonsMessage` cria a
  mensagem BUTTON canônica (`messageConfig.type: 'text'`, content null) em
  choiceNodes da paleta. Tudo no painel, seção "Opções".
- `applyConnect` estendido: em ordem de documento, preenche slot de escolha
  vazio OU `next` de condição não-choice livre. Aresta de escolha nasce com o
  texto do botão como label. Após conectar, o App reconstrói TODAS as arestas
  via `buildEdges(model)` (não mais aresta avulsa).
- `applyEdgeDelete` para escolhas: esvazia o slot por valor (índice da aresta
  é da lista deduplicada), botão preservado.
- Condições: `updateCondition`/`addCondition`/`removeCondition` (última
  protegida). Draft do painel carrega `originalIdx` (null = novo) — mesma
  técnica dos botões — e remoções aplicam em índice decrescente, condições
  por último (refs de mensagem usam condIdx pré-remoção).
- `applyNodeDelete`: limpa next refs (reset canônico), choices+botões
  (posicional), `error.next` → `{botId}-start`, fallbackIntents filtrados.
  Start não excluível. Disparado pelo Delete (via onNodesChange) ou pelo
  botão "Excluir intenção" do painel.
- ExportControls movido para top-center (DetailPanel cobria o canto direito).
- Testes: `editFlow.phase3b.test.ts` (10 casos) + `scripts/smoke-phase3b.mjs`.
- Aprendizado Playwright: não criar nós de teste no canto inferior direito —
  o MiniMap intercepta o mouse e o gesto de conexão nunca inicia.

### Fase 4 — Push direto via API

> **Fase 4a (CLI) CONCLUÍDA e VALIDADA na plataforma real (2026-06-12).**
> `scripts/push-flow.mjs` empurra fluxo exportado para o rascunho do bot, com
> remapeamento de IDs em 2 passadas (POST com ID novo é ignorado pelo servidor
> — ver docs/fase4-resultados.md). Validado: cadeia íntegra no servidor, tela
> da Omni abre/salva as intenções, simulador percorre o fluxo, publicado
> intocado. Decisão pendente: Fase 4b (mesmo push pela UI do Fluxo — CORS
> permite) ou manter só CLI.
>
> **Fechamento do protocolo (2026-06-15):** caminhos infelizes da Etapa 2 e
> rollback real concluídos — todos os 4 critérios de "pronta" cumpridos
> (docs/fase4-resultados.md, Etapa 4). Achados: a API aceita payloads inválidos
> (sem `conditions`, ref `next` quebrada) silenciosamente, e `DELETE` é de
> consistência eventual (rollback agora reverifica em laço). **Pré-requisito da
> Fase 4b:** promover "ref interna quebrada" de aviso para ERRO bloqueante em
> `src/utils/validateFlow.ts` (a plataforma a trata como erro a preencher), já
> que o Fluxo precisa validar antes do push — o servidor não barra lixo.

#### Fase 4b — Push pela UI do Fluxo (PLANO — pronto para implementar)

> Desenho aprovado pelo Andy em 2026-06-15. Pré-condições satisfeitas: CORS
> aberto (`*`, sonda da Etapa 0) e Fase 4a validada ponta a ponta. Pré-requisito
> técnico já feito: ref interna quebrada é ERRO bloqueante no `validateFlow`.
> **Decisão: a UI CONVIVE com o CLI** (não substitui) — CLI é mais auditável
> para lote, UI é mais prática no dia a dia.

**Objetivo:** botão "Enviar para OmniChat" na UI que faz o mesmo push do
`scripts/push-flow.mjs` (2 passadas com remapeamento de IDs), direto do
navegador, sem exportar JSON + rodar script.

**Por que o ambiente do navegador muda 2 coisas (e só essas):**
- Backup vira **download `.json`** (não há `samples/` no browser) — baixado
  antes do primeiro POST.
- Token fica **só em memória** (estado do componente, campo password); nunca
  `localStorage`, nunca persistido, some ao recarregar.
- Observação: a consistência eventual do DELETE NÃO afeta o push — o
  remapeamento usa o `id` devolvido no corpo do POST, não um GET posterior.

**Ordem de implementação (menor risco primeiro):**

1. **`src/utils/pushFlow.ts` — extração testável do núcleo (FAZER PRIMEIRO).**
   Funções puras com `fetch` injetável (assinatura tipo `(deps: { fetch })`):
   - `planPush(flowList, serverIntents)` → `{ creates, updates }` (quem é
     criação vs. atualização, por presença do id no servidor).
   - `remapRefs(intent, idMap)` → reaponta `next.intent.id`, `action.choices`,
     `error.next.intent`, `fallbackIntents` (portar de push-flow.mjs:114-130).
   - `pushFlow(flow, { fetch, token, botId, onProgress })` → orquestra as 2
     passadas (cria → captura ids reais → remapeia → atualiza), sequencial com
     stop-on-first-error, devolve relatório estruturado (por intenção: op,
     sent, got, status).
   - O CLI `push-flow.mjs` passa a importar desse módulo (ou fica como está e o
     módulo é a fonte canônica para a UI — decidir na hora; o CLI já está
     validado, não regredir).
   - **Headers/segredos:** o módulo recebe o token por parâmetro; NUNCA loga
     token nem o inclui no relatório.

2. **Testes Vitest do `pushFlow.ts` com `fetch` mockado** (sem rede):
   - planejamento criar vs. atualizar;
   - remapeamento de ids nas 2 passadas (o cerne do achado da Etapa 1 — POST de
     id novo gera outro id; refs precisam apontar para o id real);
   - caminho infeliz: erro HTTP no meio → para, reporta o que entrou;
   - ref/serialização preservadas (não reconstruir do zero).

3. **`src/components/PushDialog.tsx`** — modal com os guardrails:
   - campo de token (password, só em memória);
   - confirmação do alvo: **digitar os últimos N caracteres do botId**;
   - **checkbox "é um bot de testes"** (trava consciente);
   - botão **dry-run/preview** mostrando creates/updates antes de enviar;
   - **download do backup** (GET) antes do primeiro POST;
   - relatório por intenção ao final + botão **"copiar relatório"** sanitizado
     (sem token).

4. **Botão "Enviar para OmniChat" na TopBar** — habilitado só com fluxo
   carregado E `validateFlow` sem erros (reusa o `report` que já existe no App).

5. Smoke Playwright opcional do PushDialog (abrir, validar confirmação do botId,
   dry-run) — **sem tocar a API real**.

**Critério de pronto:** tsc + vitest verdes; push real num bot de testes
batendo com o resultado do CLI; token nunca persistido/logado (revisar). Versão
sugerida: minor (0.13.0).

**Guardrails herdados da 4a (repetidos aqui de propósito):** backup-first
sempre; sequencial com stop-on-first-error; publish FORA de escopo (só
rascunho); push no bot errado mitigado por confirmação dupla do botId.

#### Histórico do planejamento (REVISADO 2026-06-12)

Revisão de segurança feita em 2026-06-12. Protocolo completo de teste em
**docs/TESTE-FASE4.md**; sonda read-only em **scripts/probe-api.mjs**.

Decisões do redesenho seguro:
- **Fase 4a primeiro: CLI, não UI.** `scripts/push-flow.mjs` (a construir após
  a sonda) lê o fluxo.json exportado + `$env:OMNI_TOKEN` e faz os POSTs.
  Motivos: CORS pode bloquear o navegador (a API atende `app.omni.chat`;
  sonda confirma), e um script com flags explícitas (`--only <id>`,
  `--dry-run`) é mais auditável que um botão.
- **Fase 4b (UI no Fluxo) só se**: CORS permitir E a 4a se provar estável.
  Guardrails da UI: token em memória (nunca localStorage), digitar os últimos
  caracteres do botId para confirmar, checkbox de bot de testes, backup
  automático (GET) antes do primeiro POST, relatório por intenção com botão
  "copiar relatório" sanitizado (sem token).
- **Backup-first sempre**: nenhuma escrita sem GET prévio salvo em samples/.
- **Push sequencial com stop-on-first-error** e relatório do que entrou.
- **CONFIRMADO pelo Andy (2026-06-12): salvar via API altera só o RASCUNHO.**
  A publicação é um botão manual na plataforma e fica FORA do escopo do Fluxo
  (decisão: não implementar `POST /publish`). Risco de afetar canal ao vivo
  durante push é estruturalmente baixo.
- Riscos mapeados: push no bot errado (mitigado por confirmação explícita do
  botId), push parcial (sequencial + relatório + backup), schema rejeitado
  (a tela da Omni é o validador final — Etapa 1 do protocolo), token vazado
  (nunca logar/persistir; instrução de rotação no protocolo).

### Fase 5 — Redesign UI: de visualizador para editor ✅ CONCLUÍDA (v0.10–0.12)

Notas de implementação além do planejado:
- Versão da toolbar lida de `package.json` (import direto, resolveJsonModule).
- Undo/redo ganhou de brinde o **rollback de edição parcial** do DetailPanel:
  `onBeforeApply` captura snapshot → falha no meio dos patches → `onApplyFailed`
  restaura (antes o modelo ficava meio-aplicado).
- Snapshots usam refs espelho (nodesRef/edgesRef) para callbacks estáveis.
- Smokes migrados para `scripts/lib/loadFlow.mjs` (loadFlow/exportJson/readToast);
  novo `scripts/smoke-phase5.mjs` cobre novo fluxo + undo/redo.
- Aprendizado Playwright: cliques "em área vazia" do pane precisam evitar a
  paleta (top-left) — ela cresceu com a legenda.

Plano original (decisões e desenho):

Decisões do Andy (2026-06-11): toolbar superior + canvas cheio; importação em
modal (colar + arquivo); novo fluxo do zero pedindo botId; undo/redo no escopo.
Motivação: o sidebar permanente de 384px (JSON + branding + legenda) era o
centro do app quando ele era um visualizador estático; num editor é espaço
morto. O JSON deixa de ser visível — vira só entrada (modal) e saída (export).

#### 5a — Toolbar + canvas cheio + modal de importação
- **TopBar** (`src/components/TopBar.tsx`), barra fina no topo:
  título "Fluxo" + versão + badge Beta; botões **Novo fluxo**, **Importar**,
  **Exportar ▾** (dropdown JSON/PNG/SVG — sai do canvas); indicador de
  validação (✓ verde / ⚠ N avisos / ✖ N erros, clicável → lista); link
  Documentação; ThemeToggle.
- **ImportDialog** (`src/components/ImportDialog.tsx`): modal com textarea
  (colar da aba Network — fluxo real de trabalho) + botão de arquivo .json +
  "Gerar fluxo". Mesma validação atual (list array etc.). Substituir fluxo já
  carregado pede confirmação (perde edições não exportadas).
- **Status/erros**: remover o painel de erro do sidebar; criar **toast**
  (canto inferior central, auto-dismiss para avisos, persistente para erros)
  usado por todas as mensagens de edição/validação que hoje vão para
  `setError` do App.
- **Remoções**: sidebar `JsonInput` inteiro; legenda de cores (a paleta já
  mostra cor+nome; acrescentar chips não arrastáveis de Início/Outro Bot nela).
- Controles de espaçamento (− espaço +) permanecem flutuando no canvas
  (top-center, agora sem os botões de export).
- **Impacto nos testes**: os 4 smoke scripts localizam `textarea` e "Gerar
  Fluxo" na página — todos precisam ser atualizados para abrir o modal.
  Extrair helper comum `scripts/lib/loadFlow.mjs`.

#### 5b — Novo fluxo do zero
- "Novo fluxo" na toolbar abre **NewFlowDialog**: pede o **botId** (copiado
  da URL da plataforma; validar formato UUID) e cria
  `{ list: [createStartIntent(botId)] }`.
- `createStartIntent(botId)` em intentTemplates: `id = "{botId}-start"`,
  `category: 'start'`, `name: 'start'`, condição canônica "Start" com action
  none (forma observada no sample02).
- Export desse fluxo nasce compatível com o push da Fase 4 (IDs reais).

#### 5c — Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- Histórico por **snapshot do modelo**: `structuredClone(model)` + nodes/edges
  (posições incluídas) após cada mutação bem-sucedida (reconnect, connect,
  delete de aresta/nó, criação de nó, apply do painel, importação).
- Centralizar num `commitChange()` no App que todas as mutações chamam —
  hoje cada handler chama setError/setNodes/setEdges por conta própria.
- Cap de 30 passos (modelo de 300 intents ≈ 1 MB por snapshot).
- Atalhos ignorados quando o foco está em input/textarea (painel de edição).
- Botões ↶ ↷ na toolbar além dos atalhos.

Ordem: 5a → 5b → 5c, uma versão minor cada (0.10.0, 0.11.0, 0.12.0).
Critério de pronto por fatia: tsc + vitest + smoke atualizados verdes.

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
