# Testes automatizados

Documentação da suíte de testes do FlowViewer: **251 testes unitários** (Vitest, 12 arquivos) e **15 scripts de smoke** (Playwright, browser real).

- **Unitários** (`npm test`) — rápidos, sem rede e sem browser; rodam sobre os módulos puros de `src/utils/`. São a rede de segurança do dia a dia.
- **Smokes** (`node scripts/smoke-*.mjs`) — exercitam o app inteiro num browser headless contra o dev server. Os que tocam a plataforma usam um **`fetch` falso** (nunca a API real). São a prova de que a feature funciona ponta a ponta na UI.

> Última execução verificada: **209 passed (10 arquivos)** em ~2.0s — `npx vitest run`.

---

## Como rodar

```bash
# Unitários (todos)
npm test

# Um arquivo só / um caso só
npx vitest run src/utils/parseFlow.test.ts
npx vitest run -t "agrupamento"

# Smoke (precisa do dev server rodando: npm run dev)
node scripts/smoke-phase6.mjs            # usa a URL padrão
node scripts/smoke-phase6.mjs http://localhost:5173/FlowViewer/
```

Os smokes que falam com a plataforma (`smoke-phase4b*`) interceptam `window.fetch` via `addInitScript` e respondem com um servidor falso — **não tocam a API real** e não precisam de token.

---

# Parte 1 — Testes unitários (251)

| Arquivo | Casos | O que cobre |
|---|---:|---|
| [`intentTemplates.test.ts`](../src/utils/intentTemplates.test.ts) | 63 | Templates canônicos dos 11 tipos, criação de nó/condição, conectar/deletar |
| [`editIntent.test.ts`](../src/utils/editIntent.test.ts) | 44 | Patches de conteúdo do intent, validação no export e campos por tipo de condição (`context`/`intent`, `contains`→`values`, `total*`→`valueNumber`) |
| [`parseFlow.test.ts`](../src/utils/parseFlow.test.ts) | 43 | JSON → nós + arestas (Modelo B), agrupamento, contexto, caminhos infelizes |
| [`editFlow.phase3b.test.ts`](../src/utils/editFlow.phase3b.test.ts) | 16 | Escolhas (botão↔slot), condições, conectar por condição, excluir intenção |
| [`pushFlow.test.ts`](../src/utils/pushFlow.test.ts) | 16 | Push ao rascunho: 2 passadas, remap de IDs, guardrails |
| [`variables.test.ts`](../src/utils/variables.test.ts) | 16 | Catálogo de variáveis (picker de `@`), modificadores, `variableDisplay`, tokens de Time |
| [`editFlow.test.ts`](../src/utils/editFlow.test.ts) | 15 | Round-trip de serialização, decodificação de IDs de aresta, reconexão |
| [`duplicate.test.ts`](../src/utils/duplicate.test.ts) | 10 | Duplicação fiel (clone de intenção/condição, regen de IDs de botão, nomes únicos) |
| [`restoreFlow.test.ts`](../src/utils/restoreFlow.test.ts) | 10 | Restauração de backup (deletar→recriar→sobrescrever), consistência eventual |
| [`teams.test.ts`](../src/utils/teams.test.ts) | 9 | Variável "Times": `fetchRetailerId`/`fetchTeams`/`fetchStoreTeams` + caminhos infelizes |
| [`history.test.ts`](../src/utils/history.test.ts) | 6 | Pilha de undo/redo |
| [`exportImage.test.ts`](../src/utils/exportImage.test.ts) | 3 | Bounds do export PNG/SVG cientes de grupos |
| **Total** | **251** | |

---

## `parseFlow.test.ts` (43)

O coração da visualização: converte o JSON do bot em nós e arestas seguindo o **Modelo B** (um nó por condição).

**`actionToNodeKind` — os 11 ActionTypes (13)** — cada `action.type` mapeia para o tipo de nó certo:
- `none → defaultNode`
- `choice → choiceNode`
- `captureData → captureNode`
- `setData → setDataNode`
- `transfer → transferNode`
- `waitForInteraction → waitNode`
- `endConversation → endNode`
- `external → apiCallNode`
- `order → orderNode`
- `captureCsat → csatNode`
- `store → storeNode`
- action ausente/desconhecida cai em `defaultNode`
- `external` (API) é `apiCallNode`, **não** `externalBotNode` (são coisas distintas)

**Os 5 novos tipos isolados renderizam como nó solto tipado (5)** — `endConversation`, `external`, `order`, `captureCsat` e `store` cada um vira um nó solto do tipo correto.

**Agrupamento: 2+ condições viram grupo + filhos (4)**
- intenção com choice+captureData → 1 grupo + 2 filhos
- o nó-pai aparece **antes** dos filhos no array (exigência do React Flow)
- o cabeçalho do grupo carrega prioridade, keywords, contexto e contagem
- os filhos carregam dados **por condição** (rótulo do gatilho como título)

**Intenção com 1 condição vira nó solto (2)** — sem container; o `start` é sempre `startNode` e nunca agrupa.

**Arestas no Modelo B (4)** — saem do handle do filho `{id}::c{idx}` mantendo o ID posicional; a origem de um nó solto é o ID cru; arestas internas são `deletable` (têm botão remover), externas não; a aresta de contexto não é deletable.

**Aresta de contexto (6)** — `intent.context` vira aresta tracejada; a origem pode ser uma intenção agrupada (usa o ID cru do container); auto-referência, `start` e destino inexistente não desenham aresta; contexto não entra no layout.

**Caminhos infelizes (7)** — intenção sem condições, 0 mensagens, choice com slot vazio, `next` ausente, contexto órfão, choice para fora do fluxo e fluxo vazio: todos tratados sem crash.

**`intentToNodeData` (2)** — delega ao view-model da condição 0 (nó solto); intenção sem condições não quebra.

---

## `intentTemplates.test.ts` (63)

Templates canônicos de intenção — a forma exata que a tela oficial envia no POST — e a criação de nós/condições pela paleta.

**`createIntentTemplate` (26)**
- Os 11 tipos geram uma intenção válida que **renderiza como o próprio tipo** (11 casos).
- Os 11 tipos têm `action` com **todos os campos canônicos do POST** (11 casos).
- `transfer` e `captureData` incluem caminho de erro apontando para o start.
- IDs são únicos entre chamadas.
- `createStartIntent` tem ID especial, categoria `start` e renderiza como `startNode`.
- `isCreatableKind` rejeita tipos não criáveis.

**Marco D — criação dos 11 ActionTypes (29)**
- Há **exatamente 11** tipos criáveis (os 11 ActionTypes; `start` e `externalBot` não entram).
- Cada um dos 11 tipos **nasce como nó solto** (1 condição, sem grupo) — 11 casos.
- Defaults embasados no spec: `order → generateOrder`, `csat → supportRate`.
- `store`/`external`/`end` nascem **sem subtipo presumido** (enum desconhecido / terminal).
- Caminho infeliz: nó terminal (`end`) não introduz referência quebrada — export liberado.
- Caminho infeliz: choice recém-criado (sem botão) recusa conexão com mensagem útil.
- Caminho feliz: adicionar mensagem + botão ao choice criado e conectar preenche o slot.
- `createConditionForKind(kind)` bate com a condição da intenção criada para os 11 tipos (11 casos).
- Estrutura grupo+filhos: serializar fluxo agrupado **não vaza filhos** (`::c{idx}`) como intenções.

**`applyConnect` (5)** — preenche `next.intent` na primeira condição livre; a aresta construída é decodificável e renderizável; rejeita quando todas as condições têm destino; rejeita origem/destino inexistentes; round-trip continua serializável.

**`applyEdgeDelete` (3)** — remove o destino restaurando a forma canônica; rejeita arestas de escolha e externas; rejeita condição sem destino (deletar duas vezes).

---

## `editIntent.test.ts` (44)

Patches pequenos e validados sobre o intent cru (endereçamento estável por `{condIdx, sayIdx, msgIdx}`).

**`listMessages` / `updateMessageText` (3)** — lista mensagens com endereços válidos e edita pelo endereço; edita o body de mensagens BUTTON/LIST; rejeita endereço inexistente sem alterar nada.

**`addTextMessage` / `removeMessage` (2)** — adiciona e remove TEXT; **não** remove BUTTON/LIST (escolhas ficariam órfãs).

**`updateButton` (2)** — altera texto e descrição preservando o id do botão; rejeita índice fora do alcance.

**`updateIntentMeta` (4)** — atualiza nome/categoria/keywords e `updatedAt`; rejeita nome vazio; atualiza `priority` e `context` (Modelo B), com `context` vazio virando `null`; não mexe nesses campos quando omitidos.

**Edição escopada por condição — Marco C (3)** — `updateActionFields`, `addTextMessage` e `updateButton` com `condIdx` miram **aquela** condição específica.

**`addCondition` tipada — Marco D (3)** — sem `kind` mantém o comportamento antigo (`action.none`); com `kind` a condição nasce tipada pela ação; a condição tipada renderiza como o nó certo no grupo.

**`updateActionFields` / `updateSetDataItems` (4)** — atualiza `transferType`/`value` em transfer; `captureDataType`/`variable` em captureData; rejeita tipo de ação que a intenção não tem; substitui `bulkUpdate` filtrando variáveis vazias.

**`validateFlow` (6)** — sample01 passa sem erros; ID duplicado é erro; intenção sem nome/condições é erro; **referência interna quebrada vira erro bloqueante**; fluxo sem start gera aviso; lista vazia não quebra.

**`updateCondition` — tipo `context` (3)** — grava `intent`/`context` (IDs) no tipo context; vazios viram `null`; **não** sobrescreve esses campos quando o editor em lote os omite.

**`updateCondition` — tipo `contains` (4)** — grava a lista de termos em `values` (esquema de TAGs) mantendo `value="any"`; lista vazia vira `values: null`; preserva a ordem digitada; trocar para outro tipo **limpa `values`** órfão.

**`updateCondition` — tipos `total*` (4)** — `totalIsGreaterThan`/`totalIsEqual` gravam o número como string em `valueNumber` com `value="any"`; valor vazio vira `null`; trocar de tipo **limpa `valueNumber`** órfão.

---

## `editFlow.phase3b.test.ts` (16)

Edição estrutural: a sincronia posicional botão↔escolha e a exclusão de intenções.

**Fluxo de escolhas: mensagem → botão → conectar → deletar (4)** — cria mensagem de botões, adiciona botão e conecta preenchendo o slot; deletar aresta de escolha esvazia o slot mantendo o botão; `removeButton` remove botão e escolha na mesma posição; `addButton` exige mensagem de botões e `addButtonsMessage` não duplica.

**Edição de condições (2)** — atualiza/adiciona/remove condições; não remove a última nem aceita nome vazio.

**`applyConnect` — origem por condição, Marco C (6)** — conectar a partir do filho `{id}::c1` preenche o `next` daquela condição; `::c0` não toca a condição 1; condição já com destino recusa nova conexão; filho de escolha sem slot pede para adicionar botão; condição inexistente falha com mensagem clara; nó solto mantém a lógica de primeira vaga livre.

**`applyNodeDelete` (4)** — remove a intenção e limpa `next` refs de entrada; remove botão+escolha quando o nó era destino de uma choice; reaponta `error.next` para o start; bloqueia excluir o start e nós inexistentes.

---

## `pushFlow.test.ts` (16)

O cerne da Fase 4: enviar o fluxo ao rascunho da plataforma em 2 passadas, com `fetch` mockado (sem rede).

**`planPush` (2)** — separa criação de atualização pela presença do ID no servidor; lista/servidor vazios = tudo criação.

**`remapRefs` (2)** — reaponta as 4 formas de referência (`next.intent.id`, `choices`, `error.next.intent`, `fallbackIntents`); não muta e devolve `false` quando nada está no mapa.

**`pushFlow` — 2 passadas (6)** — cria A e B, captura IDs reais e remapeia start→A e A→B; **não muta** o flow recebido; erro HTTP no meio para e reporta só o que entrou; criação que volta 200 sem id conta como falha; chama `onBackup` com o estado do servidor **antes** de qualquer POST; **nunca inclui o token no relatório** mas o usa nos headers.

**`fetchServerIntents` (2)** — devolve a lista num GET 200; lança quando o GET falha (ex.: 403 de token/botId errado).

**Guardas de pré-flight (4)** — rejeita fluxo vazio, fluxo que mistura botIds, botId que não bate com o alvo, e aborta se a leitura do backup falhar (não escreve).

---

## `editFlow.test.ts` (15)

A base do round-trip (Fase 1): serializar de volta sem perder campos e decodificar IDs de aresta.

**`serializeFlow` — round-trip com exports reais (3)** — importar → exportar `sample01/02/03.json` preserva o JSON integralmente.

**`parseEdgeId` (5)** — decodifica aresta `next` com UUID, aresta de escolha e aresta externa `{botId}-start`; retorna `null` para IDs fora do padrão; **todas** as arestas geradas pelo `parseFlow` são decodificáveis.

**`applyEdgeReconnect` (7)** — reconecta aresta `next` (altera só `next.intent`); reconecta escolha (substitui em `choices`); substitui todas as ocorrências quando o destino está duplicado; rejeita aresta externa, destino que não é intenção do fluxo e ID desconhecido; lista vazia não quebra.

---

## `restoreFlow.test.ts` (10)

Restaurar o bot ao estado real de um backup, com mock stateful (GET/POST/DELETE juntos).

**`planRestore` (1)** — classifica cada intenção em excluir (extra), recriar (missing) e sobrescrever (comum).

**`deleteExtras` — fase 1 (2)** — remove o excedente em rodadas quando a remoção é eventual (lag 2); para em `maxRounds` e reporta o que sobrou.

**`restoreToBackup` (4)** — exclui extra, recria A→B com remap e sobrescreve o start; tolera consistência eventual e ainda restaura; reporta não-ok quando a exclusão não converge mas ainda roda o push; emite progresso etiquetado por fase (delete/create/update).

**Guardas de pré-flight (3)** — rejeita backup vazio, backup que mistura botIds e botId que não bate com o alvo (antes de destruir qualquer coisa).

---

## `history.test.ts` (6)

A pilha de undo/redo (até 30 passos).

- `takeSnapshot` clona o modelo — mutações posteriores não afetam o snapshot.
- `undo` devolve o estado anterior e `redo` o repõe.
- uma mutação nova invalida o `redo`.
- `undo`/`redo` em histórico vazio devolvem `null` sem quebrar.
- respeita o cap de 30 passos descartando os mais antigos.
- `clear` esvazia `past` e `future`.

---

## `exportImage.test.ts` (3)

O fix de bounds do export PNG/SVG quando há nós aninhados (grupos do Modelo B).

- `boundsNodes` exclui filhos (`parentId`) e mantém os nós-macro.
- fluxo sem grupos não muda.
- caminho infeliz: lista vazia retorna vazia.

---

# Parte 2 — Smoke tests (Playwright)

Exercitam o app num browser headless contra o dev server. Pré-requisito: `npm run dev` rodando (a URL padrão de cada script pode variar entre `5173`/`5174` — passe a URL como argumento se necessário).

> A suíte rastreia **14 smokes de fase** (`smoke-phase*.mjs`). O `smoke-test.mjs` é o smoke original da **Fase 1** (round-trip), totalizando **15 scripts**.

| Script | Fase / Marco | O que valida |
|---|---|---|
| [`smoke-test.mjs`](../scripts/smoke-test.mjs) | Fase 1 | Round-trip: importa sample01, gera fluxo, confere render + reconexão e que o JSON exportado é idêntico ao importado |
| [`smoke-phase2.mjs`](../scripts/smoke-phase2.mjs) | Fase 2 | Cria nó via drop da paleta, conecta arrastando do handle, deleta aresta com Delete e valida no JSON exportado |
| [`smoke-phase3.mjs`](../scripts/smoke-phase3.mjs) | Fase 3 | Abre o painel, edita nome/mensagem/botão, aplica e confere no canvas (nome, label da aresta) e no JSON |
| [`smoke-phase3b.mjs`](../scripts/smoke-phase3b.mjs) | Fase 3b | Cria nó de escolha, monta mensagem de botões + botão pelo painel, conecta, e exclui intenção validando limpeza de refs |
| [`smoke-phase4b.mjs`](../scripts/smoke-phase4b.mjs) | Fase 4b | **PushDialog** com `fetch` falso: gating do botão Enviar (token + botId + trava de testes), dry-run, backup antes do envio, relatório e sanitização do token |
| [`smoke-phase4b-restore.mjs`](../scripts/smoke-phase4b-restore.mjs) | Fase 4b | **RestoreDialog** com `fetch` falso e estado mutável: upload do backup, gating, dry-run (excluir/recriar/sobrescrever), snapshot de segurança, exclusão e recriação |
| [`smoke-phase5.mjs`](../scripts/smoke-phase5.mjs) | Fase 5 | Novo fluxo do zero (botId), criação de nó, undo/redo por teclado e botões, export validado |
| [`smoke-phase6.mjs`](../scripts/smoke-phase6.mjs) | Fase 6 — Marco A | Importa `sample01-v2.json` e confere a estrutura do Modelo B (grupo + filhos por condição, nó solto para 1 condição) |
| [`smoke-phase6-context.mjs`](../scripts/smoke-phase6-context.mjs) | Fase 6 — Marco B | Fluxo sintético com `intent.context`: confere a aresta de contexto tracejada, distinta das de fluxo |
| [`smoke-phase6-edit.mjs`](../scripts/smoke-phase6-edit.mjs) | Fase 6 — Marco C | DetailPanel em dois modos: clicar no grupo edita a meta (prioridade/contexto); clicar no filho edita a condição |
| [`smoke-phase6-create.mjs`](../scripts/smoke-phase6-create.mjs) | Fase 6 — Marco D | Paleta com os 11 ActionTypes; cria nó terminal + Chamada de API; export não vaza filhos de grupo; PNG de fluxo com grupos não quebra |
| [`smoke-phase6-merge.mjs`](../scripts/smoke-phase6-merge.mjs) | Fase 6 — Marco D | Arrastar um tipo da paleta **sobre** um nó existente o adiciona como nova condição (a intenção vira grupo com 2 filhos) |
| [`smoke-phase6-edge-delete.mjs`](../scripts/smoke-phase6-edge-delete.mjs) | Fase 6 | Remover conexão pelo botão "×" da aresta reflete no modelo; o nó de início abre o painel em modo somente-leitura |
| [`smoke-phase7-duplicate.mjs`](../scripts/smoke-phase7-duplicate.mjs) | Fase 7 | As 3 formas de duplicação: botão "dentro da intenção" (+1 condição), "fora da intenção" (+1 intenção), Ctrl+arrastar (+1 intenção); IDs de botão sem colisão |
| [`smoke-phase7-dup-highlight.mjs`](../scripts/smoke-phase7-dup-highlight.mjs) | Fase 7 | Feedback visual: cópia por botão recebe a classe `fluxo-dup` e perde ao ser clicada; Ctrl+arrastar gera +1 intenção e não deixa destaque após soltar |

---

## Filosofia dos testes

Seguindo as diretrizes do projeto, cada feature é coberta nos dois níveis:

1. **Caminho feliz** — a operação principal funciona e o JSON resultante é válido/serializável.
2. **Caminho infeliz** — lista vazia, valor nulo, índice fora do alcance, referência quebrada, slot cheio, consistência eventual da API: tudo tratado de forma **explícita e visível** (erro com mensagem útil), nunca silenciosa.
3. **Invariantes de segurança** — token nunca vaza para relatório/log; backup sempre baixado antes de escrever na plataforma; o modelo do App nunca é mutado por engano (clona antes de remapear); o start não é excluível.

Os unitários provam a **lógica**; os smokes provam que ela está **ligada na UI**.
