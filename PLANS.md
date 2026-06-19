# PLANS.md — FlowViewer: de visualizador a editor de fluxos OmniChat

> Última atualização: 2026-06-18 (Fase 11 — Repaginação visual "cara de Omni" PLANEJADA; ver seção "Fase 11" no fim). Este arquivo orienta sessões futuras do Claude Code.
> **Fase 7 (Duplicação de nós)** concluída e **Fase 8 (Painel de edição alinhado à plataforma)** em andamento — ambas na branch `feat/duplicate-nodes`, ainda não mergeadas. Ver as seções "Fase 7" e "Fase 8" abaixo. package.json em 0.15.0.
> **Fase 8 — progresso 2026-06-17:** tipos de mensagem IMAGE/FILE/VIDEO implementados no painel de edição. Botão "+ Adicionar Resposta" com dropdown, editor por tipo (aba Link + aba Upload via API presigned URL OmniChat), renderização de mensagens existentes de mídia (ícone + fileName + remover). Utilitário `uploadMedia.ts` + `uploadFile` no TeamsContext. 251 testes + tsc verdes. **ATENÇÃO:** os campos da resposta presigned URL (`uploadUrl` e `url`) são supostos — validar na primeira testada com upload real e ajustar `uploadMedia.ts:PresignedUrlResponse` se necessário.
> **Resposta "Coleção" (COLLECTION) — 2026-06-18, branch `feat/collection-response`:** nova opção no "+ Adicionar Resposta" que envia um catálogo de produtos. Serialização confirmada por export real: `{ type: 'COLLECTION', fileName: '', collectionId: '<objectId>' }` (campo `collectionId` novo em `BotMessage`). Service `collections.ts` espelha `teams.ts` (mesmo token de sessão, 2 passos, classe Parse `Collection` filtrada por `retailer` Pointer + `name` regex; `sessionHeaders`/`PARSE`/`APP_ID` agora exportados de `teams.ts`). UI no `DetailPanel`: `CollectionMessageEditor` (busca + lista + preview capa/nome/ID em TAG) e `CollectionSummary`. Contexto/estado de coleções no `TeamsContext`/`App.tsx` (espelha `@team`). 289 testes + tsc + build verdes. **ATENÇÃO:** o nome do campo da imagem de capa no objeto `Collection` ainda não foi validado contra um objeto real — `extractImageUrl` (em `collections.ts`) cobre `image`/`coverImage`/`cover`/`photo`/`thumbnail` (string, `{url}` ou Parse File); ajustar se a plataforma usar outro nome.
> **Cores (endNode + seleção de grupo) — 2026-06-19, branch `feat/collection-response`:** `endNode` ("Encerrar conversa") saiu do vermelho `#dc2626` para **grafite `#3f3f46`** (zinc-700, tom inédito na paleta) em `nodeVisual.ts`; badge "Terminar" no `DetailPanel` → `bg-zinc-200/800`. Nó **Mensagem** (`defaultNode`) saiu do âmbar `#f59e0b` para **fuchsia `#d946ef`** (badge `bg-fuchsia-100/950`). Seleção de intenção com **≥2 condições** (vira `intentGroupNode` por `parseFlow.ts:42`) ganhou cor própria **âmbar `#f59e0b`** (livre desde que a Mensagem virou fuchsia) via `--node-color` na classe `.react-flow__node-intentGroupNode` (CSS), em vez do violeta de fallback. O âmbar segue também na aresta de redirect a outro bot (`parseFlow.ts`, uso independente). Nota: as marching-ants grafite do `endNode` ficam discretas no tema escuro — a seleção segue sinalizada também pela sombra reforçada do `NodeShell`. Ajustes pequenos de UI.
> **Espaçamento no pill de controles — 2026-06-19, branch `feat/collection-response`:** os botões de recolher/expandir espaçamento do layout (Dagre) saíram do `Sidebar` (rail) para o pill de zoom (`ZoomControls` em `FlowCanvas.tsx`), à direita de um divisor. Diferenciação do zoom: divisor + ícones próprios de traço (barras + setas dentro/fora), mesma cor preta/branca (por pedido do Andy — o tom slate inicial pareceu "apagado"), strokeWidth 2.5 p/ igualar o peso dos ícones preenchidos. Handlers `onSpacing*` agora passam `App → FlowCanvas → ZoomControls`; removidos do `Sidebar` (junto da `MinusIcon` órfã). Como o `FlowCanvas` só monta com `hasFlow`, os botões não precisam de estado disabled.
> **Indicador de zoom nos controles — 2026-06-19, branch `feat/collection-response`:** entre os botões +/− do pill de controles passou a aparecer a porcentagem do zoom (só o número), atualizada via `useViewport`; clicar restaura para 100% (`zoomTo(1)`). Implementado em `ZoomControls` dentro de `FlowCanvas.tsx` (o `<Controls>` renderiza children depois dos botões nativos, então a linha foi remontada com `ControlButton`: +, número, −, ajustar à tela). CSS `.react-flow__controls-zoom-value` em `index.css`. tsc verde. Ajuste pequeno de UI — sem fase própria.
> Status: **Fases 1–5 concluídas, incl. 4a (push CLI) e 4b (push + restore pela
> UI). v0.13.0, MERGEADO NA `main`.**
> **MERGE NA MAIN CONCLUÍDO (2026-06-15):** a `feat/visual-editor` (v0.13.0) está
> 100% na `main`. Cuidado registrado: o PR #2 (GitHub) mergeou um estado ANTIGO
> da feature (só até a Fase 4a, `02578ca`), deixando a Fase 4b de fora; corrigido
> com um merge complementar (`feat/visual-editor` completo → `main`) + sincronização
> da `version` do `package-lock` (estava em 0.12.1). A `main` agora bate com a
> feature (100 testes verdes). A branch `feat/visual-editor` segue existindo.
> **`dagre` TROCADO por `@dagrejs/dagre@3.0.0` (2026-06-15):** fork mantido, API
> idêntica, embarca os próprios tipos (removido `@types/dagre`). Só mudou o import
> em `parseFlow.ts`. Ver "Melhorias paralelas".
> **Fase 4a PRONTA e validada ponta a ponta** — todos os critérios do protocolo
> cumpridos, incl. caminhos infelizes e rollback real (docs/fase4-resultados.md,
> Etapa 4, 2026-06-15).
> **Fase 4b PRONTA e VALIDADA na plataforma real (2026-06-15)** — push e restore
> pela UI funcionam ponta a ponta, batendo com o CLI. Push: `pushFlow.ts` +
> `PushDialog`. Restore COMPLETO (fiel ao backup: exclui + recria com remap +
> sobrescreve, ordem deletar→recriar, snapshot de segurança antes): `restoreFlow.ts`
> + `RestoreDialog`. 100 testes Vitest + 2 smokes Playwright (sem API real).
> Validação manual aprovada pelo Andy (fluxo completo e só-start). Ver
> docs/fase4-resultados.md (seção "Fase 4b") e seção "Fase 4b" abaixo.
>
> **Próximos passos sugeridos (próxima sessão):** (1) **Fase 6 — Modelo B COMPLETA**: Marcos A
> (visualização), B (aresta de Contexto), C (edição dois-modos) e **D (criação dos 11
> ActionTypes + revalidação + fix de export com grupos)** **CONCLUÍDOS** na branch
> `feat/model-b-nodes` (183 testes + 10 smokes verdes). Prontos para revisão/merge: validar
> visualmente a criação dos 5 tipos novos, decidir o bump de versão (minor, 0.14.0) e mergear
> a branch; (2) avaliar as "Melhorias paralelas" (elkjs); (3) possível recriação de refs órfãs
> no restore (caveat na "Fase 4b"). Publicação (`POST /publish`) FORA de escopo.

## Contexto

O FlowViewer hoje é um **visualizador read-only**: importa o JSON de intenções de um bot
OmniChat, parseia em `src/utils/parseFlow.ts` e renderiza com `@xyflow/react` (React
Flow 12) + layout automático via Dagre. A plataforma OmniChat **não tem editor visual
nem importador/exportador de arquivo** — só uma tela Angular que edita intenção por
intenção.

Objetivo do projeto: evoluir o FlowViewer para um **editor visual** (criar nós, conectar,
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
> intocado. Decisão pendente: Fase 4b (mesmo push pela UI do FlowViewer — CORS
> permite) ou manter só CLI.
>
> **Fechamento do protocolo (2026-06-15):** caminhos infelizes da Etapa 2 e
> rollback real concluídos — todos os 4 critérios de "pronta" cumpridos
> (docs/fase4-resultados.md, Etapa 4). Achados: a API aceita payloads inválidos
> (sem `conditions`, ref `next` quebrada) silenciosamente, e `DELETE` é de
> consistência eventual (rollback agora reverifica em laço). **Pré-requisito da
> Fase 4b:** promover "ref interna quebrada" de aviso para ERRO bloqueante em
> `src/utils/validateFlow.ts` (a plataforma a trata como erro a preencher), já
> que o FlowViewer precisa validar antes do push — o servidor não barra lixo.

#### Fase 4b — Push pela UI do FlowViewer (PLANO — pronto para implementar)

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

1. **`src/utils/pushFlow.ts` — extração testável do núcleo ✅ FEITO (2026-06-15).**
   Implementado com `fetch` injetável e os testes Vitest do passo 2 já verdes
   (14 casos, sem rede). Desvios/decisões da implementação:
   - `pushFlow` **clona** `flow.list` (`structuredClone`) antes de remapear — o
     CLI partia de um `JSON.parse` fresco; na UI o fluxo é o modelo vivo do App,
     que não pode ser mutado pelo push.
   - Backup virou o callback `onBackup(backupData)`, **aguardado** antes do 1º
     POST (a UI baixa o `.json` aí). O GET de estado serve de backup E de base
     do `planPush`.
   - Guardas de pré-flight **lançam** (fluxo vazio, botIds misturados, botId que
     não bate com o alvo, GET de estado falhou); erros HTTP no meio do push NÃO
     lançam — viram `failed: true` no relatório com o que entrou até parar.
   - **CLI mantido como está** (validado na 4a, não regredir): `push-flow.mjs`
     continua sendo a fonte canônica para lote/Node; `pushFlow.ts` é a versão de
     browser. A duplicação da lógica de remap está documentada no cabeçalho do
     módulo. Reunificar exigiria build step (CLI é `.mjs` puro) — não compensa.
   - Relatório (`PushReport`) sanitizado: `{ ok, failed, results[], okCount,
     idMap }`. O token só aparece nos headers, nunca no retorno (testado).
   Assinatura original planejada (para referência):
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

2. **Testes Vitest do `pushFlow.ts` com `fetch` mockado** ✅ FEITO (`pushFlow.test.ts`):
   - planejamento criar vs. atualizar;
   - remapeamento de ids nas 2 passadas (o cerne do achado da Etapa 1 — POST de
     id novo gera outro id; refs precisam apontar para o id real);
   - caminho infeliz: erro HTTP no meio → para, reporta o que entrou;
   - ref/serialização preservadas (não reconstruir do zero);
   - extras cobertos: clone não muta o modelo, 200 sem id no corpo = falha,
     `onBackup` antes do 1º POST, token fora do relatório mas presente nos
     headers, guardas de pré-flight.

3. **`src/components/PushDialog.tsx`** ✅ FEITO (2026-06-15) — modal com os guardrails:
   - campo de token (password, só em memória — `useState`, some ao fechar);
   - confirmação do alvo: digitar os **últimos 6 caracteres** do botId (`CONFIRM_LEN`);
   - checkbox "é um bot de testes" (trava consciente);
   - botão **dry-run/preview** (usa `fetchServerIntents` + `planPush`) mostrando
     creates/updates antes de enviar;
   - **download do backup** via callback `onBackup` antes do primeiro POST;
   - progresso por operação (via `onProgress`) + relatório final com botão
     **"copiar relatório"** sanitizado (`buildReportText`, sem token).
   - O `fetch` do browser entra como `browserFetch` (adapta a `FetchLike`).

4. **Botão "Enviar para OmniChat" na TopBar** ✅ FEITO — botão verde (esmeralda)
   `Enviar`, habilitado só com `hasFlow && report.errors.length === 0`. Abre o
   PushDialog passando `model={parsedDataRef.current}` e `report`.

5. Smoke Playwright do PushDialog ✅ FEITO (`scripts/smoke-phase4b.mjs`) — roda
   **sem tocar a API real**: intercepta `window.fetch` via `addInitScript` com um
   servidor falso (GET devolve o start; POST devolve 200). Cobre gating do botão
   (token + confirmação do botId + trava), confirmação errada do alvo, dry-run,
   download do backup antes do envio, relatório final e que o token não vaza na
   UI. Aprendizado: o mock de `fetch` por `addInitScript` é seguro porque a app é
   SPA estática (HMR usa WebSocket; módulos carregam por `<script>`, não `fetch`).

**Critério de pronto:** tsc + vitest verdes; push real num bot de testes
batendo com o resultado do CLI; token nunca persistido/logado (revisar). Versão
sugerida: minor (0.13.0).

**Guardrails herdados da 4a (repetidos aqui de propósito):** backup-first
sempre; sequencial com stop-on-first-error; publish FORA de escopo (só
rascunho); push no bot errado mitigado por confirmação dupla do botId.

#### Restaurar backup pela UI — restore COMPLETO (✅ FEITO 2026-06-15)

**Por que existe:** o push é só *upsert* (POST cria/atualiza, NUNCA apaga). Depois
de enviar um fluxo de teste, reimportar+reenviar o backup só atualiza o que está
no arquivo — o excedente criado no servidor permanece. Faltava "voltar o bot ao
estado real do backup". (Decisão do Andy 2026-06-15: restore tem que ser fiel ao
arquivo, **não** delete-only.)

**As 3 operações de um restore fiel:** (1) EXCLUIR o que está no servidor e não no
backup; (2) RECRIAR o que está no backup e sumiu; (3) SOBRESCREVER o que existe
nos dois. Recriar cai no achado da Etapa 1 (POST de ID novo → servidor gera
outro), então exige o **remap de IDs em 2 passadas** — reusamos o `pushFlow`.

**Ordem OBRIGATÓRIA: deletar PRIMEIRO, recriar/atualizar DEPOIS.** Se o push
rodasse antes, as recriadas ganham IDs que não estão no backup e o passo de
exclusão as veria como "extras" e apagaria o que acabou de criar. Deletando
antes, os conjuntos ficam disjuntos (extras nunca são do backup). Há teste
provando isso (nenhum ID `srv-*` recriado aparece nos DELETEs).

- **`src/utils/restoreFlow.ts`** — núcleo testável:
  - `planRestore(backupList, serverIntents)` → `{ extras, creates, updates,
    serverTotal, keepCount }` (classifica em excluir/recriar/sobrescrever;
    alimenta o dry-run).
  - `deleteExtras(...)` → laço **deletar → esperar → reverificar** (até
    `maxRounds`, padrão 6, espera 4s) p/ a consistência EVENTUAL do `DELETE`
    (Etapa 4 da 4a). `sleep` injetável p/ os testes.
  - `restoreToBackup(...)` → orquestrador: **snapshot de segurança** do estado
    atual (`onSafetyBackup`, baixado pela UI antes de destruir) → `deleteExtras`
    → `pushFlow(backup)` (sem `onBackup`). Relatório combinado
    `{ ok, deletePhase, pushPhase }`. Guarda de botId no topo, ANTES de destruir.
  - `deleteIntent(deps, id)` no `pushFlow.ts` (headers/API num lugar só).
- **`RestoreDialog.tsx`** — file input do `.json`, lê o botId do backup, mesmos
  guardrails do push + **aviso destrutivo**; dry-run mostra "excluir N · recriar
  M · sobrescrever K"; baixa o snapshot de segurança (`pre-restore-...json`)
  antes de executar; botão vermelho "Restaurar para o backup".
- **Botão "Restaurar" na TopBar** — sempre habilitado; abre o `RestoreDialog`.
- Testes: `restoreFlow.test.ts` (mock stateful unificado GET/POST/DELETE: restore
  completo com remap, prova da ordem, consistência eventual, maxRounds, guardas)
  + smoke `scripts/smoke-phase4b-restore.mjs` (upload + exclusão + recriação +
  safety backup, sem API real).
- **Fora de escopo:** publicação. Caveat honesto: se o backup referenciar uma
  intenção que não está no próprio arquivo (ref órfã), o remap não tem destino —
  recria como está; é problema do arquivo, não do restore.

#### Histórico do planejamento (REVISADO 2026-06-12)

Revisão de segurança feita em 2026-06-12. Protocolo completo de teste em
**docs/TESTE-FASE4.md**; sonda read-only em **scripts/probe-api.mjs**.

Decisões do redesenho seguro:
- **Fase 4a primeiro: CLI, não UI.** `scripts/push-flow.mjs` (a construir após
  a sonda) lê o fluxo.json exportado + `$env:OMNI_TOKEN` e faz os POSTs.
  Motivos: CORS pode bloquear o navegador (a API atende `app.omni.chat`;
  sonda confirma), e um script com flags explícitas (`--only <id>`,
  `--dry-run`) é mais auditável que um botão.
- **Fase 4b (UI no FlowViewer) só se**: CORS permitir E a 4a se provar estável.
  Guardrails da UI: token em memória (nunca localStorage), digitar os últimos
  caracteres do botId para confirmar, checkbox de bot de testes, backup
  automático (GET) antes do primeiro POST, relatório por intenção com botão
  "copiar relatório" sanitizado (sem token).
- **Backup-first sempre**: nenhuma escrita sem GET prévio salvo em samples/.
- **Push sequencial com stop-on-first-error** e relatório do que entrou.
- **CONFIRMADO pelo Andy (2026-06-12): salvar via API altera só o RASCUNHO.**
  A publicação é um botão manual na plataforma e fica FORA do escopo do FlowViewer
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
  título "FlowViewer" + versão + badge Beta; botões **Novo fluxo**, **Importar**,
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

### Fase 6 — Nós por condição alinhados ao modelo da plataforma (Modelo B) ✅ CONCLUÍDA (Marcos A–D)

> Objetivo: aproximar os tipos de nó do que a plataforma realmente expõe.
> Spec de referência completa (UI ↔ JSON + todos os enums): **[docs/MODELO-INTENCAO-OMNICHAT.md](docs/MODELO-INTENCAO-OMNICHAT.md)**.
> Decisão de modelagem (escolhida pelo Andy): **Modelo B — um nó por CONDIÇÃO,
> agrupado por intenção**. A relação `condição → action.type` é 1:1, então cada
> condição vira um nó tipado pela ação. O `getNodeKind` atual "achata" intenções
> multi-ação (ex.: `Confirmar_nome` com `[choice, captureData]` vira só `choiceNode`
> e a captura some) — o Modelo B resolve isso.

**Por que mudar.** Hoje 1 intenção = 1 nó, tipo único por prioridade
(`parseFlow.ts:getNodeKind`). O enum oficial tem **11 ActionTypes**; só 6 viram nó
dedicado. Faltam 5: `endConversation`, `external` (API), `order`, `captureCsat`,
`store`. E intenções com várias condições/ações perdem informação visual.

**Decisões fechadas:**
- **Agrupamento:** `intentGroupNode` (parent React Flow) + nós-condição como filhos
  (`parentId` + `extent: 'parent'`). Intenção com **1 condição** = **nó solto** (sem
  container — evita poluir o caso comum). Container só com **2+ condições**.
- **5 novos NodeKinds:** `endNode` (Terminar conversa), `apiCallNode` (Chamada externa
  API — **≠** `externalBotNode`, que é redirect p/ outro bot), `orderNode` (Pedido),
  `csatNode` (Captura CSAT), `storeNode` (Loja física). `action.type=none` → nó de
  mensagem (renomear `defaultNode`→conceito "Mensagem").
- **Header do grupo (rico):** Nome + Categoria (subtítulo) + **badge de Prioridade
  SEMPRE visível** (Nenhuma..Muita Alta) + keywords como chips + ícones discretos para
  Contexto e tempo de resposta (`executionDelay`).
- **Aresta especial de Contexto:** desenhar `intent.context` como aresta **tracejada**
  (intenção-de-contexto → esta intenção), distinta da aresta de fluxo (`next`/`choice`).
  Fluxos Alternativos (`fallbackIntents`) **fora de escopo por ora** (decisão do Andy).
- **Layout 2 camadas (evita dagre composto):** (1) filhos em linha dentro do grupo;
  (2) dagre atual roda sobre os **grupos**, com arestas colapsadas intent→intent só
  para posicionar. As arestas renderizadas saem do handle do filho → **grupo de destino**.
- **IDs:** nó-condição = `{intentId}::c{idx}`. O ID de aresta já codifica `condIdx`
  (`editFlow.ts`), então a origem por condição fica explícita (simplifica `applyConnect`).
- **DetailPanel dois-modos:** clicar no **grupo** edita meta da intenção (nome, categoria,
  prioridade, contexto, keywords, delay); clicar no **filho** edita condição + ação.
- **Labels de gatilho:** usar os 10 rótulos do `ConditionType` (ex.: "Valor contém",
  "Total é maior que", "Senão") em vez do label genérico atual.

**Marcos (implementar nesta ordem):**
- **Marco A — Visualização. ✅ CONCLUÍDO (branch `feat/model-b-nodes`).** Implementado:
  - `types.ts`: `NodeKind` +6 (`endNode`, `apiCallNode`, `orderNode`, `csatNode`,
    `storeNode`, `intentGroupNode`) e campos opcionais em `FlowNodeData` (triggerLabel,
    priority, conditionCount, hasContext, hasDelay, orderType, storeType, apiName).
  - `src/utils/nodeMeta.ts` (NOVO): `actionToNodeKind` (11 ActionTypes), rótulos de
    `ConditionType` e `PriorityType`, `hasExecutionDelay`. Centraliza os enums (reusado
    por parseFlow, componentes e DetailPanel).
  - `parseFlow.ts` reescrito: `buildIntentNodes` emite grupo+filhos (2+ cond) ou nó solto
    (1/0 cond); dados por condição (`conditionNodeData`); `groupNodeData` p/ o cabeçalho;
    **layout 2 camadas** (`collapseEdges` → `dagreLayout` só sobre os nós-macro; filhos
    em linha relativos ao pai). `dagreLayout`/`layoutSingle`/`bbox` agora recebem
    `sizeById` (grupos têm tamanho dinâmico). `buildEdges`/`buildNextEdge`: origem =
    nó-condição (`{id}::c{idx}` no grupo, ou ID cru no solto).
  - 6 componentes novos: `IntentGroupNode` (cabeçalho rico) + `EndNode`/`ApiCallNode`/
    `OrderNode`/`CsatNode`/`StoreNode`. Registrados em `FlowCanvas` (nodeTypes + cores).
  - `DetailPanel`: badges dos 6 kinds novos + guarda read-only p/ filho (`ReadOnlyCondition`).
  - **DECISÃO DE ID (registrar p/ Marco C):** a **entrada de uma intenção** (destino das
    arestas) é sempre o **ID cru** `{intentId}` — container do grupo OU nó solto. Só os
    **filhos** usam `{intentId}::c{idx}`. Isso mantém `edge.target` = ID cru (casa com
    `choices`/`next.intent.id`) e deixou `editFlow`/`parseEdgeId` e os 100 testes de edição
    **intactos**. Os IDs de aresta seguem `{intentId}-c{condIdx}-…`.
  - **Testes:** `parseFlow.test.ts` (35 casos, incl. caminhos infelizes) + smoke
    `scripts/smoke-phase6.mjs`. Build + **135 testes** Vitest verdes; os 7 smokes
    anteriores (round-trip, push, restore, fase2/3/3b/5) passam sem alteração. Validado
    importando `samples/sample01-v2.json` no app (4 grupos + 8 filhos, 19 arestas, sem
    erros de página).
- **Marco B — Aresta de Contexto. ✅ CONCLUÍDO (branch `feat/model-b-nodes`).** Implementado:
  - `parseFlow.ts`: `buildContextEdges(intents, intentIds)` emite, para cada intenção
    com `intent.context` apontando p/ intenção EXISTENTE, uma aresta tracejada violeta
    (`#a855f7`) `contexto → esta intenção`, com ID `ctx-{intentId}`, seta, `data.kind:
    'context'`, `deletable: false` e `reconnectable: false`. Origem/destino = **ID cru**
    da intenção (container do grupo ou nó solto), igual à entrada de fluxo. `contextEdgeStyle()`
    centraliza o estilo. Chamada ao fim de `buildEdges` (logo aparece também nos rebuilds
    do App após edição). Guardas: ignora `context` vazio, auto-referência, destino
    inexistente (sem aresta órfã) e intenção-alvo `start` (sem handle de entrada).
  - **Layout:** arestas de contexto NÃO entram no dagre — `collapseEdges` as exclui pelo
    `data.kind === 'context'`. Decisão: contexto é anotação cruzada, não a hierarquia do
    fluxo; manter fora do layout deixou o posicionamento do Marco A intacto (isolado).
  - `IntentGroupNode`: ganhou handle `source` (Bottom) — necessário porque uma
    intenção-de-contexto pode ser agrupada (o container vira origem da aresta). Os demais
    kinds que aparecem como contexto em dados reais (choice/capture/api/setData/default/
    start) já tinham `source`. Usado SÓ pela aresta de contexto (fluxo sai dos filhos).
  - **Testes:** +6 casos em `parseFlow.test.ts` (origem/destino/estilo, origem agrupada,
    auto-ref, start, fora do layout, contagem em sample02 real) + smoke
    `scripts/smoke-phase6-context.mjs` (fluxo sintético — aresta tracejada, órfã sem
    aresta, origem agrupada). Build + **141 testes** verdes; os 8 smokes anteriores passam.
    Validado visualmente (aresta violeta tracejada com rótulo "contexto", distinta do fluxo).
- **Marco C — Edição. ✅ CONCLUÍDO (branch `feat/model-b-nodes`).** Implementado:
  - **`DetailPanel` em 3 modos** (`resolveMode` pelo nó): **group** (clicar no
    `intentGroupNode`) edita meta da intenção — nome, categoria, keywords, **prioridade**
    (select) e **context** (select das outras intenções) + lista de condições (add/remove);
    **condition** (clicar num filho `{id}::c{idx}`) edita só aquela condição — gatilho
    (10 rótulos do `ConditionType`), mensagens da condição, botões e ação (transfer/
    capture/setData), com **Excluir condição**; **solo** (1 condição) = editor completo
    de antes + prioridade/context. Antes do Marco C, filho era somente-leitura.
  - **`editFlow.applyConnect`** ganhou origem por condição: `splitSourceId` parseia
    `{id}::c{idx}` e preenche a vaga DAQUELA condição (antes falhava ao conectar a partir
    de filhos de grupo). Reconnect/delete já eram por condição (o ID de aresta codifica
    `condIdx` — `parseEdgeId`), então não mudaram.
  - **`editIntent`**: `condIdx` opcional em `addTextMessage`/`addButton`/`removeButton`/
    `addButtonsMessage`/`updateButton`/`updateActionFields`/`updateSetDataItems` (sem ele =
    1ª condição compatível, retrocompatível); `updateIntentMeta` aceita `priority`+`context`.
  - **App**: `intent` do filho resolvido tirando `::c{idx}` (`intentIdOf`); `intents`
    passado ao painel p/ o seletor de context; **`handleApplyEdit` re-parseia preservando
    posições** (robusto a mudança de tipo do filho, nº de condições, grupo↔solo).
  - **DECISÃO:** condição é removida pelo modo grupo (lista) OU pelo "Excluir condição"
    no modo filho (bloqueado na última). Add/remove de condição vive no grupo/solo.
  - **Testes:** +6 em `editFlow.phase3b.test.ts` (conectar por filho), +5 em
    `editIntent.test.ts` (escopo `condIdx`, priority/context) + smoke
    `scripts/smoke-phase6-edit.mjs` (dois modos no browser). Build + **152 testes** +
    10 smokes verdes. Validado visualmente (editor de condição escopado: gatilho +
    mensagens + ação do filho).
- **Marco D — Criação + polish. ✅ CONCLUÍDO (branch `feat/model-b-nodes`).** Implementado:
  - **Paleta dos 11 ActionTypes:** `CREATABLE_KINDS`/`ACTION_TYPE_BY_KIND` (`intentTemplates.ts`)
    ganharam os 5 tipos da Fase 6 (`endNode`/`apiCallNode`/`orderNode`/`csatNode`/`storeNode`).
    A `NodePalette` separa os itens em dois grupos com divisória — **Fluxo** (os 6) e
    **Avançado** (os 5) — e espelha as cores do `FlowCanvas`. Um nó criado nasce como **nó
    solto** (1 condição), `type: kind` consistente com `soloKind` — `handleCreateNode` não mudou.
  - **Defaults dos templates (mínimos, embasados no spec §4):** `order` → `orderType:
    'generateOrder'`; `captureCsat` → `captureDataType: 'supportRate'`; `endConversation`/
    `external`/`store` sem subtipo presumido (terminal / objeto `external` canônico / enum de
    `storeType` desconhecido — decisão: não inventar). Só `transfer`/`captureData` têm `error.next`.
  - **Export PNG/SVG (fix real):** `getNodesBounds` sem `nodeLookup` lê a posição crua; filhos
    de grupo têm posição relativa → bounds errado. Novo `exportImage.boundsNodes` exclui os
    filhos (`parentId`) do cálculo (o container já os cobre). Bug latente desde o Marco A.
  - **Revalidação SEM mudança de código:** `pushFlow`/`restoreFlow` operam sobre o modelo
    (`flow.list`/`backupData.list`), nunca sobre os nós → filhos `{id}::c{idx}` nunca viram
    intenções no JSON; `validateFlow` opera sobre `json.list` e os tipos novos não criam refs.
    Confirmado por teste (serialização de fluxo agrupado mantém a contagem de `list`).
  - **Testes:** +9 em `intentTemplates.test.ts` + novo `exportImage.test.ts` (3 do `boundsNodes`)
    + smoke `scripts/smoke-phase6-create.mjs` (cria end + API, exporta PNG com grupos, JSON sem
    vazamento de filhos); `smoke-phase2` atualizado (paleta 6 → 11). Build + **183 testes** +
    10 smokes verdes.
  - **Extra (pós-Marco D): condição tipada — escolher a ação ao adicionar condição + merge pela
    paleta.** Duas entradas para criar uma condição **já tipada** (em vez de sempre `action.none`):
    (1) **select "Ação"** no **+ Adicionar condição** do DetailPanel (os 11 tipos); (2) **arrastar
    um tipo da paleta SOBRE um nó-intenção** adiciona-o como condição daquela intenção (vira grupo),
    com destaque tracejado no alvo (`merge-drop-target`). Guardas: start (nunca agrupa), bot externo
    e área vazia caem no "criar solto"; filhos de grupo ignorados. Núcleo compartilhado:
    `buildKindAction`/`createConditionForKind` (intentTemplates), `addCondition(intent, kind?)`
    (editIntent), `CREATABLE_KIND_LABELS` (fonte única de rótulos), `handleAddConditionToNode` (App)
    + `intentNodeAt`/`onAddConditionToNode` (FlowCanvas). +4 testes + smoke `smoke-phase6-merge.mjs`.
    Build + **197 testes** + 11 smokes verdes. _Escopo B (fundir dois nós EXISTENTES) ficou de fora
    por causa da integridade de refs de entrada (id da origem some) — planejar à parte se necessário._
  - **Extra (polish): Start read-only, remover conexões, exclusão limpa.** Três ajustes:
    (1) **Start não-editável** — `DetailPanel` ganhou o modo `startRO` (somente-leitura, espelha
    `externalRO`); a conexão de saída do start segue editável no canvas. (2) **Remover conexões
    pelo botão "×"** — aresta customizada `DeletableEdge` (src/components/edges/) com botão no meio,
    registrada em `edgeTypes`; só arestas internas (`-next`/`-ch`) usam `type: 'deletable'` (externas
    e de contexto seguem smoothstep, sem botão). O clique cai no mesmo caminho do Delete. (3) **Excluir
    intenção remove os filhos** — `deleteNode` re-parseia preservando posições em vez de filtrar só o
    id exato (antes os nós `{id}::c{idx}` ficavam órfãos no canvas). +2 testes (tipos de aresta) + smoke
    `smoke-phase6-edge-delete.mjs`; smokes 2/3/3b ajustados ao novo label (EdgeLabelRenderer). Build +
    **199 testes** + 12 smokes verdes.

**Como testar (incl. caminho infeliz):** samples com intenção multi-condição
(`Confirmar_nome` = choice+captureData), intenção de 1 condição (deve colapsar em nó
solto), intenção com 0 mensagens, `choice` com slot de escolha vazio, `next` ausente
(`waitInteraction`/`endConversation`), `context` apontando para intenção inexistente
(não desenhar aresta órfã), e os 5 novos action types isolados. Build + Vitest +
smoke Playwright devem seguir verdes.

**Riscos:** maior mudança desde a Fase 5 — mexe em parse, layout, edição, criação e
push/restore. Mitigação: faseado por Marco, cada um deixando o app funcional; `parseFlow`
é o núcleo isolável (Marco A primeiro, com testes).

### Fase 7 — Duplicação de nós ✅ CONCLUÍDA (v0.15.0, branch `feat/duplicate-nodes`)

> Objetivo: poder duplicar uma intenção/condição sem refazê-la à mão. 3 formas,
> decididas com o Andy em 2026-06-16.

**Decisões fechadas:**
- **Ctrl+arrastar** age só em **nó-intenção** (nó solto ou container de grupo) e gera
  uma **intenção NOVA** (cópia de TODAS as condições) no ponto do drop. Filhos-condição
  (travados em `extent:'parent'`) ficam fora do gesto — para eles, os botões do painel.
- **A cópia é FIEL**: preserva as conexões de saída (`next.intent`, `action.choices`,
  `error.next`, `context`, `fallbackIntents`). Só os **IDs de botões são regerados**
  (UUID novo). Nada aponta PARA a cópia (entrada vazia, esperado). **Start nunca é duplicado.**
- **Botão "Duplicar Condição"** aparece em **condição-filha E nó solto**
  (no solto, vira grupo). **Botão "Duplicar Intenção"** (condição-filha) extrai a
  condição para intenção nova; o mesmo rótulo no grupo/solto copia a intenção inteira.
  _(Rótulos atualizados na Fase 8; antes "Duplicar dentro/fora da intenção". Os dois
  botões ficam lado a lado quando ambos se aplicam.)_

**Implementação:**
- **`src/utils/duplicate.ts` (NOVO, núcleo puro)** — `regenButtonIds` (choices mapeiam
  posicionalmente p/ botões, então regerar o id do botão é seguro), `cloneCondition`,
  `makeUniqueName` (`_copia`/`_copia_N` — `validateFlow` só barra ID duplicado, não nome),
  `duplicateConditionInIntent` (feature 2), `cloneIntent` (features 1 e 3-grupo),
  `intentFromCondition` (feature 3-filha; meta herdada da origem).
- **`App.tsx`** — 3 handlers (`handleDuplicateIntent` com `newPos`/`restorePos`,
  `handleDuplicateConditionInIntent`, `handleDuplicateConditionOutside`) seguindo o padrão
  `takeSnap → muta modelo → parseFlow → merge de posições → bumpModel` (entram no undo/redo).
- **`FlowCanvas.tsx`** — `onNodeDragStart`/`onNodeDragStop` com `dupRef` (id + posição
  inicial p/ restaurar o original); **`multiSelectionKeyCode={null}`** liberou o Ctrl
  (era usado pela multisseleção do React Flow e conflitava com o gesto).
- **`DetailPanel.tsx`** — 3 botões (índigo) no rodapé conforme o modo; duplicação opera
  sobre o **modelo persistido** (não sobre o rascunho não salvo), snapshot tirado pelo App.
- **Testes:** `duplicate.test.ts` (10 casos, incl. `condIdx` inválido) + smoke
  `scripts/smoke-phase7-duplicate.mjs` (3 formas + IDs de botão sem colisão). **209 testes**
  Vitest + tsc verdes; smokes de regressão passam.
- **Polish — feedback visual (esmeralda "marching ants"):** no **Ctrl+arrastar** a cópia
  nasce **no início** do gesto (anexada via `setNodes(curr => [...curr, ...copyNodes])`, sem
  re-parsear, para não cancelar o arraste do original) e original+cópia ficam tracejados
  animados + arestas animadas; **ao soltar** (`handleDuplicateFinish`) a cópia vai ao drop, o
  original volta ao início e o destaque limpa. Pelos **botões**, a cópia nasce destacada e
  some na 1ª interação (clique/arraste). Estado `highlightIds` no App + `displayNodes`/
  `displayEdges` derivados (nunca no modelo/histórico); arestas reusam `animated` do React
  Flow, CSS novo só para o nó (`.fluxo-dup` + `@keyframes fluxo-marching` em `src/index.css`).
  Smoke `scripts/smoke-phase7-dup-highlight.mjs`. _Risco do re-render cancelar o arraste
  mitigado pelo append (objetos existentes intactos) — validado pelo smoke._
- **Fora de escopo:** fundir DOIS nós existentes num só (a integridade de refs de entrada
  some o id de origem — mesmo caveat do "Escopo B" da Fase 6/Marco D).

### Fase 8 — Painel de edição alinhado ao construtor da plataforma ✅ EM ANDAMENTO (branch `feat/duplicate-nodes`)

> Objetivo: o painel de detalhes deve se comportar como o builder real da OmniChat
> ao editar meta da intenção e gatilho da condição. Trabalhado com o Andy em 2026-06-16,
> tipo de condição por tipo de condição (cada um conferido contra exemplos reais da plataforma).

**Decisões fechadas (todas validadas com exemplos do builder):**
- **Nome da intenção é `mixed_snake_case`** (`[A-Za-z0-9_]`). O builder usa a diretiva
  Angular `specialcharacter`, que **bloqueia a digitação**. Espelhamos: sanitização em tempo
  real (espaço → `_`, remove acento/símbolo) + validação no submit (`updateIntentMeta`).
- **Categoria** tem default **"Sem Categoria"**, dropdown das existentes e cria nova ao digitar.
  As variáveis e categorias **não vêm do JSON do fluxo** — são dado de conta/bot. Categorias:
  store de sessão acumulativo (`knownCategories`), coletado na importação (`collectCategories`)
  e a cada save (a plataforma grava a cada save; nós só no push, então guardamos local).
- **Campos por tipo de condição** (só os tipos abaixo até agora; os demais seguem Variável/Valor):
  - `context` → **Intenção** (`condition.intent`) + **Contexto** (`condition.context`), ambos IDs.
  - `lastIntent` → só **Intenção**.
  - `empty` / `exists` → **Variável** com picker de `@`.
  - `equals` / `contains` / `totalIsGreaterThan` / `totalIsEqual` → campo **Variável** usa o
    `VariablePicker` (busca de `@`), não mais texto livre.
  - `contains` → **Variável** + **"Valores"** (lista de TAGs, mesmo `KeywordTags` das palavras-chave).
    Fonte de verdade = array `condition.values` (confirmado em `samples/sample03.json`), com
    `condition.value` mantido como placeholder `"any"`. Ao trocar o gatilho para outro tipo,
    `updateCondition` **limpa `values`** (sem lista órfã). `Condition.values: string[] | null`.
  - `totalIsGreaterThan` / `totalIsEqual` → **Variável** + **"Total"** (stepper numérico
    `NumberStepper`: botões −/+, começa em 0, aceita negativo). Fonte de verdade = `condition.valueNumber`
    como **string** (confirmado nas amostras, ex.: `"1"`), com `condition.value` placeholder `"any"`.
    `updateCondition` limpa `valueNumber` ao trocar de tipo. `Condition.valueNumber: string | null`.
- **Variáveis: catálogo CURADO** (a plataforma NÃO expõe por API — não há request ao abrir o
  picker; é lista estática no front). Sintaxe `@namespace.campo[.sub]#modificador`. O front
  **exibe rótulo amigável e grava o cru**. Picker em 3 níveis (Categoria → Variável →
  Modificador); modificador **só quando há escolha real** (2+ combinações fornecidas).
  Combinações = só as fornecidas pelo Andy (não é produto cartesiano variável×modificador).

**Implementação:**
- **`src/utils/variables.ts` (NOVO)** — `VARIABLE_GROUPS` (grupos com `items`/`value` folha),
  `variableDisplay(raw)` (resolve cru → "Categoria › Item (Modificador)"). Horários do bot
  gerados (2 campos × 7 dias, 2 modificadores cada).
- **`src/utils/editIntent.ts`** — `sanitizeIntentName`, validação em `updateIntentMeta`,
  `collectCategories`, e `updateCondition` passou a aceitar/gravar `intent`/`context` (opcionais,
  round-trip — não sobrescreve quem não os passa).
- **`DetailPanel.tsx`** — componentes `CategorySelect`, `KeywordTags`, `IntentSelect`,
  `VariablePicker` e o compartilhado **`ConditionTypeFields`** (usado no editor de condição
  individual E na lista de condições — corrige o buraco de o nó solo não ter os campos).
  Helper `patchCond` para a lista.
- **`App.tsx`** — `knownCategories` (estado), `collectCategories` na `loadModel` e no
  `handleApplyEdit`, prop `categories` pro painel.
- **`nodeMeta.ts`** — rótulos: `empty` → "O valor está vazio", `lastIntent` → "A última intenção foi".
- **Testes:** `variables.test.ts` (NOVO) + casos em `editIntent.test.ts`. **251 testes** verdes.

**Próximos tipos a alinhar (pendentes):** `else` (sem operando, já coberto). Os campos de
operando dos 10 tipos estão alinhados; resta conferir labels finais e o campo "Valor" do
`equals` contra o builder (hoje texto livre).

## Fase 9 — Variável "Times" (grupo dinâmico) — EM ANDAMENTO

**Objetivo:** o picker de Time deve espelhar o do Bot, mas com a lista de **times da loja**
como 2ª coluna: `Time → [times] → Nome / Aberto Agora / Horário de Abertura/Fechamento → dias
→ componentes`. O token só difere do Bot por um segmento de **ID**: `@team.{id}.campo[.dia]#comp`
(amostra real: `@team.fdI9crpRsB.name#normalizeQuery`, `@team.S1Cl3fbnFG.isOpenNow`,
`@team.UrAnEmtASL.openingTime.monday#getHourOfDate`).

**Decisões (Andy, 2026-06-16):** (1) **sondar a fonte de dados antes de codar a parte dinâmica**;
(2) **Fase 1 (estática) primeiro**.

**O nó de segurança:** as duas curls que listam times usam credenciais diferentes:
- `GET /v2/bots?status=active` → **token de sessão** + app-id, **mesmo host do push** (CORS de
  navegador já provado). ✅ browser-safe.
- `GET api-private2.omni.chat/.../Team` → **master key REST** (`x-parse-rest-api-key`), host
  privado. ❌ **NUNCA no frontend** (vaza segredo + CORS). Segredo de servidor.
  → A pergunta da Fase 2 é: existe endpoint de times por **token de sessão** com CORS?

**Fase 1 — schema estático (FEITO, 233 testes verdes):**
- `variables.ts`: `botDayItems()` → `dayItems(base)` + `entityFieldItems(base)` (parametrizados
  pelo prefixo); grupo Bot agora usa `entityFieldItems('@bot')` (saída idêntica).
- `variableDisplay` resolve `@team.{id}.campo[.dia]#comp` → "Time.{id}.…" reusando o schema do
  Bot (`matchTeamVariable`). O `@team` pelado segue prefixo livre. **ID aparece cru** por ora.
- Testes novos em `variables.test.ts` (os 4 campos da amostra, forma crua, pelado, campo inexistente).

**Probe (FEITO, aguarda execução do Andy):** `scripts/probe-teams.mjs` — read-only, **só token de
sessão** (master key nunca usada). Rodar: `$env:OMNI_TOKEN='r:...'; node scripts/probe-teams.mjs <botId>`.
Verifica CORS+auth+shape de `/v2/bots` (traz `retailerId`/`teams`?) e sonda endpoints candidatos
de times. **Resultado decide a Fase 2.**

**Probe — RESULTADO (2026-06-16, bot de testes `2a3859ff-…786`):**
- `/v2/bots?status=active`: **browser-safe** (CORS `*`, token de sessão OK), traz `retailerId` por
  bot (bot de testes → `5rFc8fXg1G`).
- Endpoints de times no execute-api (`/v2/teams`, `/v1/{bot}/teams`, `/v2/bots/{bot}/teams`): **403**
  (não existem/não liberam).
- **Team-class no Parse por SESSÃO** (`GET api-private2.omni.chat/parse/classes/Team?where=<retailer
  pointer>`, headers Bearer + `x-parse-session-token` + app-id, **SEM master key**): **CORS 204 (origin
  ecoado) + GET 200 com 14 times**. Cada time traz `objectId` e `name`. → **A master key da curl era
  desnecessária; sessão + CORS bastam.**

**Fase 2 — módulo de dados (FEITO, 242 testes verdes):**
- `src/utils/teams.ts` (`fetch` injetável, padrão `pushFlow.ts`; token só nos headers, nunca logado):
  - `fetchRetailerId({fetch, token, botId})` → casa o `botId` do modelo (campo `botId` da lista,
    confirmado contra a API real) com `/v2/bots` e devolve `retailerId`.
  - `fetchTeams({fetch, token, retailerId})` → `GET api-private2.../classes/Team?where=<pointer>`
    → `[{objectId, name}]` ordenado por nome (fallback `name`→`objectId`).
  - `fetchStoreTeams({fetch, token, botId})` → compõe os dois (a UI tem o botId, não o retailerId).
- Testes: `teams.test.ts` (retailer/times + caminhos infelizes) e os casos de Time em `variables.test.ts`.

**Fase 2 — UI do picker (FEITO, 243 testes + smoke real verdes):**
- **Token GLOBAL da sessão** (decisão do Andy): elevado ao `App` (`sessionToken`), com campo único
  na `TopBar` (botão de chave + popover, só em memória). `PushDialog`/`RestoreDialog` agora recebem
  `token`/`onTokenChange` em vez de estado local — fonte única reaproveitada por push/restore/times.
- **`TeamsContext`** (`src/contexts/TeamsContext.tsx`) expõe `{teams, status, error, loadTeams, byId}`;
  o fetch real (`fetchStoreTeams`) vive no `App` (tem token+botId). Evita threadar props por
  App → DetailPanel → VariablePicker/TextArea → VariableMenu.
- **`VariableMenu`**: categoria **Time** abre coluna dinâmica de times (carregamento sob demanda,
  estados idle/loading/error/vazio); escolher um time abre `entityFieldItems('@team.{id}')` (mesmo
  schema do Bot). Trocar o token reseta os times (conta diferente).
- **`variableDisplay(value, byId)`**: troca o ID pelo **nome do time** no rótulo ("Time.{nome}.…");
  o `VariablePicker` passa o `byId` do contexto.
- Validação: `scripts/smoke-phase9-teams.mjs` (toca a API real) — token global → "Carregar times"
  → time real → campo → grava `@team.{id}.isOpenNow`. **Sem master key no bundle.**

**Fase 2 — pendências menores (próxima sessão):**
- O `variableDisplay` dos rótulos resolvidos em mensagens (`VariableTextArea` mostra token cru
  inline — ok p/ a plataforma); avaliar se vale traduzir na exibição.
- Considerar cache de times persistente por `retailerId` (hoje recarrega ao trocar token).

## Fase 10 — Mensagem Botão/Lista no "Adicionar Resposta" — ✅ IMPLEMENTADA (núcleo + UI; falta validação manual)

> Objetivo: o menu "+ Adicionar Resposta" ganha o tipo **Botão/Lista**, que cria uma
> mensagem interativa (moldura + itens) em `assistant_says`, como Texto/Imagem.
> Trabalhado com o Andy em 2026-06-17. **Escopo desta fase: variante "sem descrição",
> SÓ EXIBIÇÃO** (a "lista com descrição" e a ramificação ficam para depois).
>
> **Status:** `addButtonListMessage` + `ButtonListEditor` implementados, 262 testes + tsc
> verdes. **Pendente:** validação manual na UI (criar → exportar → conferir contra amostra
> → push no bot de testes `2a3859ff-…786`).

**Decisões fechadas (validadas contra 2 capturas reais do builder):**
- **Só exibição (action `none`)** nesta fase. O editor autora APENAS o `messageConfig`;
  NÃO mexe em `action.choices` nem cria arestas. A ramificação (combinar com action
  `choice`) fica para etapa futura — ver "Fato descoberto" abaixo.
- **`type` da mensagem alterna pela contagem de itens:** **2–3 itens → `"BUTTON"`**,
  **4–10 itens → `"LIST"`** (espelha o limite do WhatsApp: botões de resposta ≤ 3;
  lista até 10). É o que explica "Título botão opções" só aparecer com 4+ itens.
- **Obrigatórios para salvar:** `body` (Corpo) preenchido + **1 a 10 itens** com texto.
  `header`/`footer`/`title` ("Título botão opções") são **sempre opcionais** (vazio → `""`).
  (A UI abre com 1 campo de item; mínimo válido é 1, máximo 10.)

**Mapeamento de campos (CONTRA-INTUITIVO — fixar):**

| Rótulo na UI            | Limite | Campo no JSON            |
|-------------------------|--------|--------------------------|
| Título                  | 60     | `messageConfig.header`   |
| Corpo do texto          | 80     | `messageConfig.body`     |
| Rodapé                  | 60     | `messageConfig.footer`   |
| Título botão opções     | 20     | `messageConfig.title`    |
| Item N                  | 20     | `buttons[N].text`        |

- Cada item → `{ id: crypto.randomUUID(), text, description: "" }`.
- Campos vazios saem como **`""`** (string vazia), não `null` — é o que as capturas
  mostram para este tipo de mensagem (diverge do `addButtonsMessage` legado, que usa `null`).
- `messageConfig.type` = `"text"` fixo; `content` e `fileName` = `""`.

**Fato descoberto (impacto da combinação com Escolha — para a etapa futura):**
- O `messageConfig` é **idêntico** em exibição (action `none`) e em escolha (action `choice`);
  só o `action` muda. Logo, este editor serve aos dois — a ramificação é decisão do `action`.
- A captura com escolha tinha **10 botões e 2 `choices`** apenas porque o Andy conectou só 2
  no exemplo — `buttons` e `choices` **podem** ser paralelos (10 botões → 10 choices). O
  mapeamento posicional `buttons[i] ↔ choices[i]` do código atual **continua válido**. Resta
  só confirmar, na etapa de ramificação, como a plataforma representa o **caso parcial**
  (alguns botões sem destino: choices mais curto vs. slots `''`).

**Implementação planejada:**
- **`src/types.ts`** — `ButtonMessageConfig`/`ButtonOption` já existem e bastam.
- **`src/utils/editIntent.ts` — `addButtonListMessage(intent, cfg, condIdx = 0)`** (NOVA):
  - `cfg = { header, body, footer, title, items: { text, description }[] }`.
  - Valida: `1 ≤ items.length ≤ 10`, `body` não-vazio, cada `item.text` não-vazio; se
    `items.length ≥ 4` exige `title`. Retorna `EditResult` com `reason` claro em cada falha.
  - `const type = items.length >= 4 ? 'LIST' : 'BUTTON'`; `title` só quando LIST (senão `""`).
  - Empurra a mensagem em `assistant_says[0].messages` (cria o say se faltar). `touch(intent)`.
  - **Não toca em `action`** (fica `none`/o que já era) nem em `choices`.
- **`removeMessage`** — hoje recusa BUTTON/LIST ("mapeiam para escolhas"). Ajustar para
  **permitir remover** quando a condição **não** for `action.type === 'choice'` (mensagem de
  exibição não tem choices para órfãos). Mantém o bloqueio nas de escolha.
- **`DetailPanel.tsx`:**
  - `NewDraftMessage` vira união discriminada: além de TEXT/IMAGE/FILE/VIDEO, a variante
    `{ type: 'BUTTONLIST', variant: 'plain', header, body, footer, title, items: {text,description}[] }`
    (`variant: 'plain'` = "sem descrição"; `'described'` virá depois).
  - `ADD_MESSAGE_OPTIONS` ganha `{ type: 'BUTTONLIST', label: 'Botão/Lista' }`. O `onAdd`
    cria o draft com 2 itens vazios.
  - Novo componente **`ButtonListEditor`** (render quando `msg.type === 'BUTTONLIST'`):
    - 3 campos de moldura com `maxLength` + contador "(x/limite)": Título(60), Corpo(80), Rodapé(60).
    - Seletor "botão/lista sem descrição" | "lista com descrição" (a 2ª **desabilitada/"em breve"** nesta fase).
    - Lista de itens: input `maxLength=20` cada + "remover" (trava em **mín. 1**; inicia com 1).
    - "+ Adicionar Item" (trava em **máx. 10**).
    - "Título botão opções" (`maxLength=20`): **só visível quando `items.length ≥ 4`**.
    - Dica visual do tipo resultante (ex.: "Botões (até 3)" vs "Lista (4+)").
  - No submit (`handleApply`): para cada `newMessages` BUTTONLIST chamar `addButtonListMessage`.
    Erros de validação entram no mesmo fluxo de `EditResult` já usado.

**Como vai ser testado (antes de codar a UI):**
- **Unit (`editIntent.test.ts`)** sobre `addButtonListMessage`:
  - 1, 2 e 3 itens → `type: 'BUTTON'`; 4 e 10 itens → `type: 'LIST'`.
  - Mapeamento: header/body/footer/title nas chaves certas; itens viram `buttons` com UUID e `description: ""`.
  - LIST mantém `title`; BUTTON força `title: ""`.
  - Caminho infeliz: `0` itens, `> 10` itens, `body` vazio, item vazio, LIST sem `title` → `ok: false` com `reason`.
  - **Round-trip:** exportar e comparar a forma com as 2 amostras coladas pelo Andy.
- **Manual:** criar via UI no bot de testes `2a3859ff-…786`, preencher, exportar JSON,
  conferir contra as amostras e (opcional) push + render na plataforma.

### Fase 10b — variante "lista com descrição" — ✅ IMPLEMENTADA (núcleo + UI; falta validação manual)

> Objetivo: habilitar a 2ª opção do seletor. Decisões com o Andy em 2026-06-17;
> exemplo real analisado (LIST de 10 itens, alguns com `description`, outros vazios).

**Regras (confirmadas):**
- **"com descrição" é SEMPRE `type: "LIST"`** (1-10 itens) — descrição só existe em linha
  de lista, não em botão de resposta. Por isso o **"Título botão opções" fica sempre
  visível** nessa variante (não depende dos 4+) — mas é **opcional** (vazio → `""`).
- **"sem descrição" inalterada:** 1-3 → BUTTON, 4-10 → LIST.
- **Cada item ganha um campo "Descrição"** (limite **72**, padrão WhatsApp — ver
  [[reference-omnichat-whatsapp-limits]]). Descrição é **opcional** por item (o exemplo
  tem itens com `description: ""`).
- **Troca de variante PRESERVA os itens digitados.** Exceção: se todos os itens estão
  vazios (estado pristine), trocar reinicia para o padrão da variante — **"com descrição"
  começa com 1 item**, "sem descrição" com 2. (Satisfaz "vir com 1 por padrão na 1ª vez"
  sem perder dados digitados.)
- **`description` só vai pro JSON quando `type === 'LIST'`** (BUTTON força `""`), garantindo
  que botões de resposta nunca carreguem descrição.

**Implementação:**
- **`editIntent.ts` — `ButtonListConfig` ganha `variant: 'plain' | 'described'`.**
  `addButtonListMessage`: `type = variant === 'described' || items.length >= 4 ? 'LIST' : 'BUTTON'`;
  título **sempre opcional**; `description: type === 'LIST' ? it.description : ''`.
- **`DetailPanel.tsx`:**
  - `NewButtonListMessage.variant` passa a aceitar `'described'`; **habilitar o 2º botão** do seletor.
  - Handler de troca de variante: preserva itens; se pristine, reinicia ao padrão (1/2).
  - `isList = variant === 'described' || items.length >= 4` → controla rótulo, título e tipo.
  - Quando `described`: cada item mostra um `CharField` extra **Descrição** (max 72).
  - `BL_LIMITS.desc = 72`. Submit passa `variant` ao `addButtonListMessage`.
  - **`ButtonListSummary`** (mensagem salva): recebe o `type` real (rótulo Lista/Botões correto)
    e mostra a descrição ao lado de cada item quando houver.
- **Testes (`editIntent.test.ts`):** described com 1-3 itens → ainda `LIST`; `description`
  serializada nos itens; título opcional (LIST sem título → `ok`, `title:""`); BUTTON força
  `description:""`; round-trip contra a amostra "com descrição".

**Fora de escopo desta fase (explícito):** ramificação
(action `choice` + conectar itens a destinos no canvas); editar Botão/Lista **já existentes**
(esta fase só CRIA novas via draft — remover/editar persistidas vem depois).

### Fase 10c — Nó de Escolha: separar Menu (itens) de Escolhas (destinos) — ✅ IMPLEMENTADA (núcleo + UI; falta validação manual)

> **Status:** núcleo (`addChoice`/`removeChoice`/`setChoiceDestination`/`setChoices`/
> `replaceButtonListMessage` + builder compartilhado) e UI (seções "Menu" + "Escolhas",
> preview `MenuPreview`, restrição ao choiceNode) implementados. 277 testes + tsc verdes.
> **Pendente:** validação manual na UI (criar menu → adicionar escolhas com destino →
> ver conexão no canvas → editar menu salvo → exportar e conferir contra a amostra).
>
> **Conectar opção livre pelo canvas (Andy, 2026-06-18):** handle ÚNICO — arrastar do
> nó conecta a próxima opção livre na ordem, criando o slot da Escolha automaticamente
> (`connectCondition` cria slot enquanto `choices.length < nº de itens do menu`).
> Desconectar = esvaziar o slot (mantém a Escolha). Implementado em `editFlow.ts` + testes.

> Decisão do Andy (2026-06-17): a opção **Botão/Lista fica restrita ao nó de Escolha** e a
> edição do nó passa a ter duas partes: **menu** (em cima) e **escolhas/destinos** (embaixo),
> ligados pela ORDEM. Exemplo real analisado: LIST com 10 itens + `action.choices` com 2 IDs.

**Modelo conceitual (confirmado pelo Andy):**
- **Topo = MENU:** o editor Botão/Lista (moldura Título/Corpo/Rodapé/Título botão opções + itens
  com texto e, em "com descrição", descrição). Os itens são `messageConfig.buttons[]`.
- **Baixo = ESCOLHAS:** seção renomeada de "Opções (botões ↔ escolhas)" para **"Escolhas"**.
  Lista de **destinos** (`action.choices[]`), cada um um **dropdown de intenção** (`IntentSelect`).
- **Ligação por ORDEM:** `choices[i]` é o destino do item de menu `i` (`buttons[i]`).
- **`choices` pode ser menor que `buttons`** — nem todo item tem destino (transição por
  palavra-chave cobre o resto). `choices` continua posicional com `''` para slots vazios.
- Botão **"Criar mensagem de botões"/"Adicionar botão" → "Adicionar Escolha"**, começa com **zero**;
  ao adicionar, abre o dropdown de destino.
- **"Botão/Lista" só aparece no menu "Adicionar Resposta" em `choiceNode`** (some nos demais).

**Decisões CONFIRMADAS (Andy, 2026-06-17):**
1. **Duas vias pro mesmo dado.** O dropdown grava `choices[i] = intentId` e o **canvas atualiza o
   desenho da conexão** (App reconstrói as arestas do modelo). Arraste no canvas continua valendo.
2. **Slots parciais OK.** "Adicionar Escolha" anexa um slot (`''`) ligado ao próximo item por ordem;
   destino vazio é válido (`''`); vazios no fim aparados na serialização (amostra: 10 itens, 2 choices).
3. **Editar menu salvo SIM.** Inclui editar itens (texto/descrição) e a moldura da Botão/Lista
   persistida. Além disso: exibir um **PREVIEW do menu legível e agradável** (não só os campos).

**Implementação prevista (alto nível):**
- `editIntent.ts`: `addChoice`/`removeChoice`/`setChoiceDestination(intent, condIdx, idx, intentId)`
  (gravam `action.choices` sem acoplar a `buttons`). Desacoplar `addButton` (parar de empurrar `''`
  em choices) — itens do menu e choices passam a crescer separados.
- `DetailPanel.tsx`: seção "Escolhas" com `IntentSelect` por slot rotulado pelo item correspondente
  (por ordem); "Adicionar Escolha"; o editor Botão/Lista no topo vira o autor do menu do choiceNode.
- Restringir `BUTTONLIST` no `ADD_MESSAGE_OPTIONS`/menu a `kind === 'choiceNode'`.
- Sincronia com `parseFlow`/`editFlow` (arestas `…-ch{idx}`) preservada — `choices` segue posicional.

**Testes:** `choices` posicional com `''`; `setChoiceDestination` grava o ID certo; menos choices
que itens; round-trip contra a amostra (10 itens / 2 choices); arestas batem com os índices.

## Fase 11 — Repaginação visual ("cara de Omni") — PLANO (aprovado p/ planejar 2026-06-18)

> Objetivo: aproximar o visual do FlowViewer do **construtor de campanhas da OmniChat**,
> a partir de uma print do produto real (analisada com o Andy em 2026-06-18).
> **Escopo escolhido pelo Andy: COMPLETO (A+B+C+D, incluindo o rail lateral).**
> **Direção do fluxo: MANTER vertical (cima→baixo).** Virar horizontal (L→R, como a
> Omni) exigiria refatorar Dagre (`rankdir`), os handles (Top/Bottom→Left/Right) e
> todas as arestas — esforço alto e ganho estético baixo: a "cara de Omni" vem ~90%
> do estilo dos cards e da paleta, não da direção.
>
> **Regra de theming (NÃO violar):** este projeto NÃO usa `dark:` do Tailwind — o tema
> é `ThemeContext` (`isDark: boolean`) + classes condicionais. Toda cor nova entra como
> par claro/escuro nas classes, igual ao restante. Ver [[feedback-dark-mode-theming]].

### Tokens extraídos da print (hex ESTIMADOS visualmente — sem DevTools; usar como ponto de partida)

> **Aviso:** o Andy só tem a print (sem acesso ao DevTools do produto nesta sessão). Os hex
> abaixo são a melhor aproximação a olho — a print comprime cor, então tratar como **valores
> iniciais**, ajustáveis na 1ª comparação visual lado a lado. A coluna **Tailwind** é o que
> de fato usaremos no código (o projeto é todo classe Tailwind); o hex é só a referência.

| Papel | Hex (est.) | Tailwind mais próximo | Onde aparece na Omni | Uso no FlowViewer |
|---|---|---|---|---|
| **Âmbar (primária/marca)** | `~#F5A623` | entre `amber-400 #FBBF24` e `amber-500 #F59E0B` → **token custom `omni-amber`** | nav ativa, aba ativa, botão primário, barra "Enviadas" | trocar a primária atual `blue-500` (ex.: botão "Importar JSON" em `App.tsx:836`) |
| **Violeta/Índigo (seleção)** | `~#6D28D9` | `violet-700 #6D28D9` | **borda do nó selecionado**, barra "Cliques" | borda de **seleção** do nó (hoje não há destaque de seleção dedicado) |
| Azul | `~#2F7FF6` | `blue-500 #3B82F6` | "Entregues" | acentos secundários |
| Verde | `~#22C55E` | `green-500 #22C55E` (≈ `emerald-500` já usado) | "Lidas", pill "Ativa" | cor de "novo"/sucesso; manter |
| Teal/Ciano | `~#17B6C4` | `cyan-500 #06B6D4` | logo, "Comprar agora" | acento |
| Rosa/Vermelho | `~#F04438` | `red-500 #EF4444` (≈ `rose-500` já usado) | "Falhas", badge "135" | erro; manter |
| Sidebar (rail) | `~#0F1626` | `slate-900 #0F172A` | rail vertical | fundo do rail (Fase D) |
| Texto título | `~#1E2433` | `slate-800 #1E293B` | títulos de card/seção | manter família slate |
| Texto subtítulo | `~#6B7280` | `slate-500 #64748B` | subtítulos/legendas | — |
| Borda de card | `~#E8EAED` | `slate-200 #E2E8F0` | contorno suave dos cards | bordas |
| Trilho de barra | `~#EEF0F3` | `slate-100 #F1F5F9` | fundo das barras de progresso | — |
| Canvas (fundo / pontos) | `~#FCFCFD` / pontos `~#E2E5EA` | branco + pontos `slate-200` | grade pontilhada | `Background` em `FlowCanvas.tsx:210` |
| Chip lavanda (bg / texto) | `~#EEF0FF` / `~#6366F1` | `indigo-50 #EEF2FF` / `indigo-500 #6366F1` | "Lançamento de coleção", "Clique no site" | chips de tag/categoria no nó |

**Decisão de token (única não-óbvia):** o âmbar da Omni cai **entre** `amber-400` e `amber-500`
do Tailwind — nenhum bate exato. Para fidelidade, adicionar um **token custom `omni-amber: #F5A623`**
no `tailwind.config` (em 11A) em vez de torcer um dos dois. As demais cores têm classe Tailwind
suficientemente próxima — não vale criar token custom pra elas.

**Chips de métrica do card (padrão de cor — pill claro + texto da cor):** âmbar (`amber-50`/`amber-600`),
azul (`blue-50`/`blue-600`), verde (`green-50`/`green-600`), violeta (`violet-50`/`violet-600`),
vermelho (`red-50`/`red-600`). No tema escuro, espelhar com o par `*-950`/`*-300` (mesmo padrão já
usado no badge de captura, `CaptureNode.tsx:40`).

### O que a print muda no nosso visual atual

- **Nós (maior impacto).** Hoje cada nó tem uma **faixa sólida colorida no topo**
  (`bg-violet-500`, `bg-slate-500`, etc. — ver `DefaultNode.tsx:13`, `CaptureNode.tsx:27`).
  A Omni NÃO usa faixa: usa **chip-ícone colorido** (quadradinho `rounded-xl`) à esquerda +
  **título bold** + **subtítulo cinza**, em card branco `rounded-2xl` com sombra suave. É o
  que mais "denuncia" que não é Omni.
- **Chips/badges em pill** (`rounded-full`), fundo claro + texto da cor (já fazemos algo
  parecido no badge de captura — `CaptureNode.tsx:40`; padronizar todos assim).
- **Seleção = borda violeta 2px + sombra elevada** (hoje só temos esmeralda p/ duplicação
  e índigo tracejado p/ merge — a seleção em si não tem destaque).
- **Controles de zoom** como pill branco flutuante (hoje `<Controls>` padrão do React Flow).
- **Chrome:** header minimalista + (Fase D) rail vertical escuro à esquerda.

### Sub-fases (ordem de menor risco → maior)

- **11A — Tokens & paleta (base). ✅ CONCLUÍDA (2026-06-18).** Implementado:
  - **`src/utils/nodeVisual.ts` (NOVO):** `NODE_COLORS: Record<NodeKind, string>` + `nodeColor(type)`
    (fallback slate-500). Unificou as DUAS tabelas duplicadas — `NODE_COLORS` do `FlowCanvas`
    (canvas + minimap) e `KIND_COLORS` do `NodePalette` (bolinha) —, que agora a consomem (incl. a
    legenda Início/Outro Bot via `nodeColor('startNode')`/`nodeColor('externalBotNode')`).
  - **Decisão (Andy): usar `amber-400` direto, SEM token custom.** Contraste: `amber-400` com texto
    branco falha — os CTAs usam **`bg-amber-400 text-slate-900 hover:bg-amber-500`** (texto escuro).
  - **CTAs trocados** (filled azul → âmbar): "Importar JSON" (`App.tsx`), "Gerar fluxo"
    (`ImportDialog`), "Criar fluxo" (`NewFlowDialog`), "Fechar" (`PushDialog`/`RestoreDialog`),
    "Aplicar alterações" (`DetailPanel`). **Preservados:** azul do `choiceNode` (identidade de tipo)
    e vermelho do "Restaurar" (destrutivo).
  - **Deixado para depois (não são CTAs):** focus-rings `focus:ring-blue-500` dos inputs e links
    `text-blue-500` — sweep de acento secundário, baixo valor, fazer junto da 11C/polish.
  - **Sem mudança visual estrutural.** Critério atingido: **291 testes** + tsc + build verdes (apresentação pura).
- **11B — Redesign dos nós (≈80% da "cara Omni"). ✅ CONCLUÍDA (2026-06-18).** Implementado:
  - **`src/components/nodes/NodeShell.tsx` (NOVO):** moldura comum — card branco `rounded-2xl` +
    sombra, **chip-ícone** colorido (cor via `nodeVisual.ts`, com alpha por `style`), título +
    subtítulo, slot de corpo (`empty:hidden` colapsa o espaço quando não há preview/chips), **anel
    violeta** na seleção (`selected ? ring-2 ring-violet-500 shadow-lg`), handles cinza padronizados
    e flags `hasTarget`/`hasSource`/`dashed`/`icon`. Helpers exportados: `NodePreview`, `NodePill`
    (pill tingido pela cor do tipo), `NodeNote`.
  - **`src/components/nodes/nodeIcons.tsx` (NOVO):** registro único de SVGs *stroke* 24×24 por
    `NodeKind` (reúne os existentes + cria Mensagem/Captura/Transferência, que não tinham ícone);
    `nodeIcon(kind)` + `listIcon()` (variante do Escolha em modo lista).
  - **12 nós migrados** para o `NodeShell`: Default, Choice, Capture, Transfer, Wait, SetData, End,
    ApiCall, Order, Csat, Store, ExternalBot. Terminais (Transfer/End/Externo) com `hasSource={false}`;
    Externo com `dashed`. **`StartNode` (pílula) e `IntentGroupNode` (container) preservados** —
    estruturalmente distintos, não entram no card.
  - **Apresentação pura:** não tocou em `parseFlow`/`editFlow`/IDs/`FlowNodeData`. **291 testes** +
    tsc + build verdes (sem alterar testes); validado por screenshot (claro + escuro + anel de
    seleção num nó-card). CSS caiu ~51,6 → ~45,2 kB (menos classes de cor por nó).
  - **GOTCHA corrigido:** o card NÃO pode ter `position: relative` — isso reposiciona os `Handle`
    (absolutos) do React Flow e **quebra a criação de conexão por arraste** (renderiza ok, mas
    arrastar de um handle não cria aresta). O `NodeShell` saiu com `relative` por engano; removido.
    Pego pelo `smoke-phase2` e isolado por bisseção (`git stash`). **Se algum nó-card precisar de
    posicionamento absoluto interno no futuro, NÃO usar `relative` no card raiz.**
  - **Polish já feito na 11C:** bump do `border-radius` do `.fluxo-dup::after` (12 → 16px) para casar
    com o card `rounded-2xl`.
- **11C — Canvas. ✅ CONCLUÍDA (2026-06-18).** Implementado:
  - **`<Controls>` como pill branco flutuante horizontal** no rodapé central (`position="bottom-center"`,
    `showInteractive={false}`). CSS em `index.css` com especificidade `.react-flow__panel.react-flow__controls`
    (supera o padrão do React Flow sem depender da ordem de import); tema escuro via `.dark` (classe no `<html>`).
  - **Grade de pontos** afinada (`FlowCanvas` Background): `bgColor` quase-branco (claro) / quase-preto (escuro)
    + pontos sutis (`gap 22`, `size 1.2`).
  - **Polish:** `.fluxo-dup::after` border-radius 12 → 16px (casa com `rounded-2xl`).
  - MiniMap já consumia `nodeColor` desde a 11A. **291 testes** + tsc + build verdes; validado por screenshot
    (controles + grade nos dois temas).
- **11D — Chrome (rail lateral + header enxuto). ✅ CONCLUÍDA (2026-06-18).** Decisão do Andy:
  **rail FUNCIONAL** (move as ações para o rail, esvaziando o header). Implementado:
  - **`src/components/Sidebar.tsx` (NOVO):** `<nav>` escuro estreito (`w-14`, sempre escuro,
    independe do tema — como a plataforma) com as ações como ícones (tooltip + `aria-label`):
    logo âmbar; Novo/Importar/Exportar(dropdown→direita)/Restaurar; **Enviar** (esmeralda, destaque);
    Desfazer/Refazer; espaçamento −/+; rodapé com Token (popover→direita, dot de status),
    Documentação e toggle de tema. Popovers Exportar/Token via `useTheme` (NUNCA `dark:` — [[dark-mode-theming-fluxo]]).
  - **`src/components/TopBar.tsx` (REESCRITO):** header fino — título + versão + Beta + pill de
    status de validação (dropdown de erros/avisos). Perdeu todas as ações (foram pro rail).
  - **`App.tsx`:** layout raiz de coluna única → **`flex` com rail + coluna (`TopBar`+`main`)**;
    `ExportFormat` agora vem do `Sidebar`.
  - **Smokes:** `locator('header')` → `locator('nav')` em 8 scripts (botões migraram pro rail,
    nomes acessíveis preservados; `nav` mantém a desambiguação que o `header` dava).
  - **291 testes** + tsc + build verdes; verificado por screenshot (rail + header + popover de
    Token nos dois temas).
  - **Bateria de smokes — TODA VERDE (2026-06-18, contra dev server): 18/18 PASS.** Inclui
    `smoke-test`, `phase2`, `phase5`, toda a família `phase6*`, `phase4b`/`phase4b-restore`,
    `phase7-*`, `phase9-teams` (toca API real, token via `flow-viewer.env`) e `etapa1/2-build-flow`.
  - **7 smokes que estavam quebrados (drift das Fases 8/10c, NÃO da Fase 11 — confirmado via
    `git stash`) foram ATUALIZADOS aos seletores/rótulos atuais:** `phase7-duplicate`/`phase7-dup-highlight`
    (rótulos → "Duplicar Condição"/"Duplicar Intenção"); `phase3` (retargetado a um nó solo com
    mensagem TEXT + textarea `[data-testid="detail-panel"] textarea`; partes de botão/aresta obsoletas
    removidas); `etapa1/2-build-flow` (fluxo de mensagem → "+ Adicionar Resposta" → "Texto"); `phase9-teams`
    (nó-alvo passou a um solo+TEXT + seletor de textarea do painel); **`phase3b` reescrito ao modelo
    Fase 10c** — Menu (Botão/Lista) + seção "Escolhas" com destino pelo `<select>` `IntentSelect`
    (`selectOption`), em vez do antigo "Criar mensagem de botões" + arraste.
- **11E — Barra superior eliminada + start como card. ✅ CONCLUÍDA (2026-06-18).** Pedido do Andy:
  levar a versão para o pé do rail e remover a barra superior; reestilizar o start.
  - **`TopBar.tsx` REMOVIDO.** O canvas ocupa a altura toda (`App`: `flex` com rail + `main`, sem
    coluna intermediária). `ExportFormat` já vinha do `Sidebar`.
  - **`Sidebar`:** ganhou `version` e `report`. No pé: **indicador de validação** (ícone ✓/⚠/✕ colorido
    + contador + popover à direita com erros/avisos) e a **versão** (`v{version}`) abaixo do toggle de tema.
  - **`StartNode` reescrito** para usar o `NodeShell` (chip *play* esmeralda + título + "Início do fluxo",
    `hasTarget={false}`). Saiu a pílula esmeralda. textContent do título segue `data.name` ("start"),
    então os smokes que localizam o start por texto/`data-id` continuam válidos.
  - **291 testes** + tsc + build verdes; **smokes 18/18 PASS** (incl. os que conectam do start); validado
    por screenshot.

### Como testar (visual + regressão)

- **Regressão automática primeiro:** 11A/11B/11C são apresentação — os 289 testes Vitest +
  tsc + os smokes Playwright devem **seguir verdes sem alteração** (não tocam parse/edit/push).
  Se um smoke quebrar, é sinal de que mexemos em estrutura sem querer.
- **Caminho infeliz visual:** nó sem `messagePreview` (card só com cabeçalho), título/subtítulo
  longos (truncamento), nó selecionado + duplicado ao mesmo tempo (borda violeta de seleção vs.
  esmeralda de duplicação — não podem brigar), grupo com muitos filhos, tema claro **e** escuro
  (cada cor nova precisa do par claro/escuro), export PNG/SVG do novo card (o `exportImage` lê o
  DOM — conferir que a sombra/borda não corta no bounds).
- **Comparação visual:** abrir um sample real ao lado da print e iterar até bater (cards, chips,
  seleção). 11D: conferir o rail nos dois temas e que nenhum botão de ação sumiu.

### Riscos

- **11B é amplo** (13 componentes). Mitigar com o `NodeShell` (1 fonte de verdade) e migrando
  um nó por vez, validando no app a cada um.
- **11D mexe no layout raiz** — maior risco de regressão de layout/responsividade; só depois de
  11A–C. Se o custo/benefício do rail não compensar na prática, é o item natural a cortar.
- Confirmar os **hex exatos** no DevTools do produto real antes de fechar a paleta — a print
  comprime cor (ver conversa: print dá aproximação, DevTools dá o valor + estados).

## Melhorias paralelas (independentes das fases)

- ~~Trocar `dagre@0.8.5` (sem manutenção) por `@dagrejs/dagre` (fork mantido,
  API idêntica) — só muda o import em `parseFlow.ts`.~~ ✅ FEITO (2026-06-15):
  `@dagrejs/dagre@3.0.0`. O fork embarca tipos próprios, então `@types/dagre` saiu.
  Build + 100 testes + smoke-phase5 verdes; bundle caiu ~526→477 kB.
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
5. **`npm audit`: 2 vulnerabilidades high do esbuild ≤0.28.0 — ACEITAS, não
   corrigir com `--force` (decisão de 2026-06-15).** Ambas são de tempo de
   desenvolvimento e não chegam ao site publicado (o esbuild não vai no bundle):
   (a) GHSA-67mh-4wv8-2f99 — o dev server do esbuild permite que um site
   malicioso aberto durante `npm run dev` leia respostas (vetor só em localhost,
   produção não usa); (b) GHSA-gv7w-rqvm-qjhr — falta de verificação de
   integridade do binário **no módulo Deno** (projeto é Node, não aplica). O
   esbuild ≤0.28.0 vem do **vite 5**, e o único fix que o npm oferece é
   `vite@8` (`audit fix --force`) — major quebrando vite 5→8, desproporcional
   para falhas que não atingem produção. Se um dia quiser zerar o audit, fazer
   um **upgrade deliberado do vite** como tarefa própria, com revalidação de
   build/config/plugin-react — nunca via `--force`.
