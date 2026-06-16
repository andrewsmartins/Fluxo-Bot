# PLANS.md — Fluxo: de visualizador a editor de fluxos OmniChat

> Última atualização: 2026-06-15 (Fase 6 planejada). Este arquivo orienta sessões futuras do Claude Code.
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
