# PLANS.md — FlowViewer: de visualizador a editor de fluxos OmniChat

<!-- HANDOFF:START -->
## 🔄 Handoff — 2026-06-24

**Foco da próxima sessão:** **IMPLEMENTAR a Fase 4 — resolvers nome→ID sobre a API OmniChat.**
O `/interrogar` já foi feito nesta sessão e as **8 decisões estão fechadas e gravadas no corpo
§"Fase 4"** — não reabrir. Próximo passo é só codar, começando pelo gate (`find_team`).

**Onde paramos:** branch **`feat/mcp-tools-spike`**. **Fase 3 segue commitada** (`cd22c89`).
Esta sessão foi **só planejamento**: `/handon` (briefing) → `/interrogar` da Fase 4 → consolidei
as decisões no corpo §"Fase 4". **Nenhum código mexido**; o working tree tem **só
`PLANS.md` modificado e não commitado** (a reescrita do §Fase 4 + este handoff).

**Fios soltos / meio-feito:**
- **PLANS.md não commitado** — decidir se commita o planejamento (`docs:`) antes de começar a
  codar ou junto com a 1ª fatia.
- **Nenhum código da Fase 4 ainda.** As 8 decisões estão no corpo; a implementação é greenfield
  sobre funções de fetch que **já existem e são testadas**.

**Armadilhas desta sessão (gotchas de implementação — não redescobrir):**
1. **As funções de fetch já existem e são puras** (`Deps {fetch, token}`, fetch injetável,
   **lançam** em falha): `fetchStoreTeams`/`fetchActiveBots` ([teams.ts](src/utils/teams.ts)),
   `fetchSupervisedUsers` ([users.ts](src/utils/users.ts)), `fetchBotEndpoints`
   ([endpoints.ts](src/utils/endpoints.ts)), `fetchStoreEntities` ([entities.ts](src/utils/entities.ts)),
   `fetchServerIntents` ([pushFlow.ts:151](src/utils/pushFlow.ts#L151)). Reusar `sessionHeaders`/
   `Deps`/`API`/`PARSE` de `teams.ts`. **Não reescrever fetch.**
2. **`.mcp.json` NÃO injeta `OMNI_TOKEN`** (só `FLOW_FILE`). O servidor MCP precisa **ler
   `flow-viewer.env` por conta própria no startup** (a chave existe). Token vive na camada de
   tools, **nunca chega ao modelo**. Token ausente → mensagem "configure `OMNI_TOKEN`".
3. **`getBotId()` ainda não existe na `FlowStore`** — criar: derivar do intent `-start` (id
   `{botId}-start`) ou de `next.intent.botId`. Edge: flow vazio sem intents → mensagem clara.
4. **`fetchSupervisedUsers` precisa ganhar param `search` opcional** (hoje hardcoda `search:'.*'`
   + cap 100) para o `find_user` filtrar server-side (decisão 6 / 8).
5. (mantida) **`mcp/tsconfig.json` inclui só `mcp/`** — `tsc` segue os imports sozinho; glob
   amplo sobre `src/utils` puxa arquivos de DOM e quebra o typecheck.
6. (mantida) **Bash tool ≠ here-string PowerShell** — usar `git commit -F - <<'EOF' … EOF`.

**Próximo passo imediato:** criar o módulo de resolvers em `src/tools/` (helper de match
normalizado + cache de sessão + mensagens de erro) e o **`find_team` primeiro como gate**;
escrever os **unit com `fetch` injetado** (match exato/candidatos/ambíguo/vazio/401-AUTH/cache);
rodar o **smoke read-only real** (lista times do bot de testes); só então abrir os outros 5
resolvers (`find_user`, `find_bot`/`list_bots`, `list_api_integrations`, `list_entities`,
`list_intents`) e expô-los em [mcp/server.ts](mcp/server.ts). Ver corpo §"Fase 4" para as 8
decisões (botId do flow; read-only + set_action_field; erros msg+AUTH; cache sob demanda;
matching contains; find_user server-side; list_intents cross-bot).

**Threads parados (não perder, ortogonais):** editor do nó **Pedido** (planejado no corpo §"Nó
Pedido", **não** implementado); **PRs/merge** das v0.25–v0.27 ainda na branch
`feat/order-node-editor`, não mergeadas em `main`; **Fase 2** (`NODE_CATALOG`) ainda pendente
(consolida o `actionType` hoje espelhado à mão em `nodeCatalog.ts`; toca o DetailPanel/383
testes — fazer com a suíte verde como gate).

**Skills sugeridas ao retomar:** `/code-review` antes de commitar; `/verify` para o smoke
read-only dos resolvers contra a API real. (`/interrogar` da Fase 4 **já concluído** — não
repetir.)

<!-- HANDOFF:END -->

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

## Agente de IA que constrói nós (Claude Code CLI + servidor MCP local)

> Promovido do handoff em 2026-06-23 após interrogatório (skill `interrogar`). Esta é a
> **feature-foco** das próximas sessões; o handoff no topo aponta pra cá. O masterFlow
> (parado/completo na Parte 12) deixa de ser o foco.

**Objetivo (1 frase):** um agente de IA que **constrói e edita nós do fluxo operando
ferramentas** (nunca escrevendo JSON cru), via **Claude Code CLI + um servidor MCP local**
sobre o arquivo de fluxo, estruturado desde já para virar produto depois.

**Decisões-âncora (travadas no design original — NÃO reabrir):**
- O agente **opera tools, nunca escreve JSON cru**. As tools envolvem as funções que já
  existem; a validade fica no código, não na memória do modelo.
- O **servidor MCP é a peça durável** — o mesmo conjunto de tools é reusado no
  caminho-produto; só troca o cliente.
- **Local:** Claude Code lança o MCP como **subprocesso por stdio** — zero portas, zero
  rede de entrada. Único tráfego é **de saída** (API Anthropic + API OmniChat). O gh-pages
  **NÃO** fala com o MCP — site e agente são ilhas que só se cruzam pelo **arquivo de fluxo
  em disco** (a UI lê o arquivo só sob demanda via "Carregar exemplo"/import — ela NÃO o lê
  ao vivo; ver [ImportDialog.tsx:27](src/components/ImportDialog.tsx#L27)).
- **Token** vive na **camada de tools** (`OMNI_TOKEN` de `flow-viewer.env`), nunca chega ao
  modelo, nunca é logado. **Resolver por nome → gravar por ID** (o ID sempre vem de resposta
  real da API ⇒ mata referência alucinada).
- **Modelo:** default `claude-sonnet-4-6`; subir p/ `claude-opus-4-8` se errar a sequência
  em pedidos compostos.

**Ordem revista (interrogatório 2026-06-23, Q1 — spike-primeiro).** O refactor do catálogo
(antiga Fase A) foi **adiado para depois do spike**: provar o conceito contra fluxos reais
antes do refactor caro que toca o [DetailPanel.tsx](src/components/DetailPanel.tsx) (~3500
linhas, 383 testes — o arquivo mais arriscado). De-risca e respeita "amostra mínima antes de
escalar". Nova ordem: **1 spike → 2 catálogo → 3 MCP → 4 resolvers → 5 produto.**

### Fase 1 — Spike: camada de tools sobre o arquivo de fluxo (sem IA) ✅ concluída

> **Resultado (2026-06-23, branch `feat/mcp-tools-spike`):** entregue em
> [src/tools/flowStore.ts](src/tools/flowStore.ts) (storage: load/save/snapshot/revert + `.bak`,
> agnóstico de git) + [src/tools/flowTools.ts](src/tools/flowTools.ts) (tools com retorno
> compacto: `create_node`/`set_action_field`/`set_choices`/`connect`/`validate`/`revert` +
> leitura `list_nodes`/`describe_node`). **15 testes** round-trip em
> [src/tools/flowTools.test.ts](src/tools/flowTools.test.ts) (fixture `public/masterFlow.json`),
> `tsc` limpo, suíte cheia verde (398 testes). Code-review aplicado: gate de tipo
> (array só em `multipleFields`), guarda de fluxo sem início, e rótulo cross-bot
> (`next.action==='bot'` → "outro bot"). **Pendente:** ainda há um sharp edge conhecido —
> `set_action_field`/`connect` operam por `condIdx` (default 0); nós-grupo (`intentGroupNode`,
> 2+ condições) só são parcialmente endereçáveis. OK para a spike (nós de condição única);
> generalizar quando a Fase 3 (MCP) ou um caso real exigir.

**Objetivo:** camada de tools fina (TS puro) que carrega/muta/salva o arquivo de fluxo,
lendo as fontes de verdade **espalhadas que já existem** (sem refactor ainda). Provar
`create_node`+`set_field`+`connect`+`validate` contra fluxos reais **antes** de plugar
qualquer modelo.

**Tools (envolvem o que já existe):**
- `create_node(kind)` → `createIntentTemplate`/`createConditionForKind` ([intentTemplates.ts](src/utils/intentTemplates.ts)) — cria nó com defaults do kind.
- `set_action_field(...)` → `updateActionFields`/`addTextMessage` ([editIntent.ts](src/utils/editIntent.ts)).
- `set_choices(...)` → `setChoices` ([editIntent.ts](src/utils/editIntent.ts)).
- `connect(...)` → `applyConnect` ([editFlow.ts](src/utils/editFlow.ts)).
- `validate()` → `validateFlow` ([validateFlow.ts](src/utils/validateFlow.ts)) — devolve `{errors, warnings}`.
- `revert()` → restaura o snapshot de sessão (camada de storage).
- **Leitura:** `list_nodes()` (mapa compacto: nome, id, kind, category, alvo) + `describe_node(id)` (campos de um nó, compacto).

**Decisões (com o porquê):**
1. **`validate` é tool separada; mutações salvam sem gate (Q2).** Validar a cada escrita
   reprovaria estados intermediários válidos (nó criado mas ainda não conectado). O agente
   chama `validate` quando quer (tipicamente no fim). `validateFlow` já separa `errors`
   (bloqueiam export) de `warnings` (informam); nó órfão **não** é erro, ref quebrada **é**
   — mas "resolver por nome→ID" praticamente elimina ref quebrada.
2. **Undo próprio na camada de storage: snapshot por sessão + `revert` (Q3).** A primeira
   mutação da sessão copia o estado; `revert` volta ao início. **NÃO depende de git** (o
   produto não comita — o usuário final não tem repo). Local = `.bak` ao lado; produto =
   versão anterior no storage do fluxo. **1 snapshot, não pilha** — o mais simples que cobre
   interrupção/caminho-errado; subir para N níveis depois é só guardar mais snapshots, sem
   mudar a interface do `revert`.
3. **Retorno = confirmação compacta, nunca JSON cru (Q4).** `create_node`→"criado nó X
   (id …) kind=…"; `connect`→"X→Y"; `validate`→relatório. Mantém o anchor (o modelo não
   raciocina sobre JSON bruto) e o contexto enxuto (em 42 nós, repetir nodes inteiros
   estoura contexto).
4. **Leitura: `list_nodes` + `describe_node`, ambos compactos (Q5).** Dois usos distintos:
   **orientar-se** (mapa do fluxo) vs **inspecionar antes de editar** (campos de um nó). Só
   `list_nodes` levaria a edição cega; um `get_flow` inteiro incha contexto e ainda falta
   detalhe de campo. Mesma filosofia "listar barato / descrever sob demanda" dos resolvers
   (Fase 4) e do `describe_node_type` (Fase 3).

**Como será testado (Q9):** unitário round-trip em vitest (`load → muta → save → reload →
assert`) usando `public/masterFlow.json` como fixture — cobre a **orquestração**
load/save/snapshot/revert que as funções subjacentes (já testadas) não cobrem. Amostra
mínima escalando: 1 nó simples → 1 nó com bloco `error` + captura múltipla → 3 nós
conectados. Sem IA nesta fase.

### Fase 2 — Centralizar `NODE_CATALOG` (refactor/limpeza, com valor próprio)

**Objetivo:** consolidar a verdade hoje espalhada (NodeKind [types.ts:130](src/types.ts#L130),
`actionToNodeKind` [nodeMeta.ts](src/utils/nodeMeta.ts), defaults
[intentTemplates.ts](src/utils/intentTemplates.ts)/[captureFields.ts](src/utils/captureFields.ts),
const do [DetailPanel.tsx](src/components/DetailPanel.tsx)) num único `NODE_CATALOG`. Alimenta
o DetailPanel (limpeza com valor próprio) **e** o manifesto enxuto + `describe_node_type` da
Fase 3.

**Por que depois do spike:** toca o arquivo mais arriscado (DetailPanel, 383 testes) — só
pagar esse custo depois que o spike provar que o caminho agente/MCP entrega valor. No spike,
o manifesto/catálogo é escrito **à mão, mínimo**; esta fase vira a fonte derivada. Gate:
suíte verde antes e depois.

### Fase 3 — Empacotar como servidor MCP (stdio) ✅ concluída

> **Resultado (2026-06-23, branch `feat/mcp-tools-spike`):** servidor em
> [mcp/server.ts](mcp/server.ts) expõe as **9 tools** da Fase 1 via
> `@modelcontextprotocol/sdk` por stdio; manifesto enxuto em
> [mcp/nodeCatalog.ts](mcp/nodeCatalog.ts) (1 linha/kind nas `instructions` +
> `describe_node_type(kind)` sob demanda). Config do Claude Code em
> [.mcp.json](.mcp.json) (`npx tsx mcp/server.ts`, `FLOW_FILE=public/masterFlow.json`).
> Arquivo de fluxo resolvido por `FLOW_FILE` (env) → 1º arg → default; **1 `FlowStore`
> por processo** (snapshot/revert pela sessão). Typecheck isolado via
> [mcp/tsconfig.json](mcp/tsconfig.json) (`npm run mcp:typecheck`) limpo; suíte cheia
> verde (398 testes); verificado ponta a ponta por cliente MCP stdio (handshake +
> `tools/list` + ciclo `create→set→connect→validate→revert`, revert restaura 1:1).
> Doc em [mcp/README.md](mcp/README.md). **Limitações herdadas da spike** (documentadas
> no README): `condIdx` default 0 (nós-grupo parciais); `setDataNode`/conteúdo de
> mensagem ainda sem tool; resolução nome→ID fica para a Fase 4. **Pendente:** ainda
> sem IA de fato exercitando o MCP — o próximo passo natural é abrir o Claude Code no
> repo e construir um nó por conversa (ou seguir para a Fase 4/2).

**Objetivo:** expor a camada de tools como servidor MCP que o Claude Code lança por stdio +
config do Claude Code + **manifesto enxuto** (14 kinds, 1 linha cada, campos que cada um
pede) sempre no contexto + tool `describe_node_type(kind)` sob demanda.

**Decisões (Q6):** **mesmo repo** (pasta `mcp/` no FlowViewer), importando `src/utils`
**direto** — confirmado TS puro/Node-safe ([intentTemplates.ts](src/utils/intentTemplates.ts)/
[editIntent.ts](src/utils/editIntent.ts)/[editFlow.ts](src/utils/editFlow.ts) só importam
tipos, zero React/DOM) — rodando via **`tsx`** (sem build separado), SDK
`@modelcontextprotocol/sdk` por stdio. A camada de tools segue **fonte única**, reusável
pelo backend de produto depois. Extrair para pacote de monorepo só quando houver 2
consumidores reais (Fase 5) — estrutura à frente da necessidade hoje.

### Fase 4 — Resolvers sobre a API OmniChat ✅ concluída

> **Resultado (2026-06-24, branch `feat/mcp-tools-spike`, commits `2f2c33b` docs + `01deed6`
> feat):** **8 tools read-only** em [src/tools/resolvers.ts](src/tools/resolvers.ts) (classe
> `Resolvers`: helpers de normalização/match/erro+AUTH/cache) expostas no
> [mcp/server.ts](mcp/server.ts): `find_team`/`list_teams`, `find_user`, `find_bot`/`list_bots`,
> `list_api_integrations`, `list_entities`, `list_intents`. Cada uma envolve uma função de fetch
> já existente (não reescrita); `fetchSupervisedUsers` ganhou param `search` opcional (decisão 6).
> Token lido de `flow-viewer.env` no startup do MCP (nunca chega ao modelo). **23 testes** com
> `fetch` injetado + **smoke read-only real verde ponta a ponta** ([scripts/smoke-phase4-resolvers.ts](scripts/smoke-phase4-resolvers.ts)):
> `find_team("Financeiro")`→`S1Cl3fbnFG` (= ID da Parte 8), `find_bot("Cadastro")` acha o alvo
> cross-bot da Parte 10, `find_user` confirma o `search` server-side. Suíte cheia verde (421);
> tsc do app e `mcp:typecheck` limpos. Code-review (alto esforço) só achou concordância pt-BR
> (corrigida). **`getBotId()` não foi criado** — `FlowStore.mainBotId` já existia e foi reusado.
> **Riscos (a)/(b)/(c) fechados.** Próximo natural: Fase 2 (`NODE_CATALOG`) ou exercitar o MCP
> completo (criar nó + resolver alvo + conectar) com IA real.

> **Decisões fechadas no interrogatório de 2026-06-24** (skill `interrogar`). Substituem o
> esboço anterior (Q7/Q8) — em especial o **pré-load eager** foi revertido para **sob demanda**.

**Objetivo (1 frase):** tools read-only que resolvem **nome → ID** batendo na API OmniChat,
**reusando as funções de fetch já existentes e testadas** ([teams.ts](src/utils/teams.ts),
[users.ts](src/utils/users.ts), [endpoints.ts](src/utils/endpoints.ts),
[entities.ts](src/utils/entities.ts), `fetchServerIntents` em [pushFlow.ts](src/utils/pushFlow.ts)) —
o agente devolve o ID e grava pelo `set_action_field` existente, **sem nunca inventar ID**.

**Conjunto de resolvers (núcleo 5 + intents):** `find_team`/`list_teams`, `find_user`,
`find_bot`/`list_bots`, `list_api_integrations`, `list_entities`, `list_intents`. **Dropado
`list_variables`** (`variables.ts` é catálogo **estático** `@customer.*`; as dinâmicas `@team`/
`@entity` já são cobertas por `find_team`/`list_entities`). Ordem: **`find_team` primeiro** (caso
mais comum — transfer; exercita o passo extra `retailerId` de `teams.ts`) e serve de **gate**
(round-trip read-only real verde) antes de abrir os outros no mesmo PR (todos o mesmo formato).

**Decisões (com o porquê):**
1. **Fonte do `botId`: derivado do flow file** (`flowStore.getBotId()` lê o id do intent
   `-start`, ou `next.intent.botId`). Fonte única — nunca diverge do fluxo sendo editado;
   evita 2ª config (env) que poderia apontar pra loja errada em silêncio. Quase todos os
   fetches precisam dele (`endpoints`/`entities` por `botId` direto; `teams`/`users` resolvem
   `retailerId` a partir dele — `find_user` é a exceção: é "supervisionados pela conta do
   token", sem `botId`). **Edge:** flow novo sem intents → sem `botId` → resolver falha com
   mensagem clara.
2. **Resolvers read-only devolvem o ID; o modelo passa ao `set_action_field` (inalterado).**
   A garantia "mata ID alucinado" é **prática, não mecânica**: o resolver é a **única fonte**
   de ID, então o modelo não tem de onde alucinar. Descartado o **gate de IDs resolvidos na
   sessão** (quebraria em IDs reais já presentes no flow importado — Parte 8 tem times/usuários
   reais — e exigiria estado de sessão) e as **tools resolve-and-write** (multiplicariam tools
   por campo e duplicariam o `set_action_field` genérico). Casa com a filosofia
   `list_nodes`/`describe_node` (leitura separada da escrita).
3. **Erros = mensagens claras + AUTH especial; sem enum formal.** O modelo lê o **texto** e
   decide. A única distinção de comportamento na camada: **401/403 → "renove o `OMNI_TOKEN`",
   sem retry** (token de sessão Parse é curto — é a falha real #1; descoberta preguiçosamente
   na 1ª chamada, com mensagem clara — não há pré-load pra "falhar rápido no startup", e erro
   de boot em subprocesso stdio é difícil de surfaçar). `NOT_FOUND`/ambíguo → devolve
   **candidatos** para o modelo desambiguar com o humano. Lista vazia / erro genérico → só
   mensagem boa. **Token ausente** (não expirado) → "configure `OMNI_TOKEN` em
   `flow-viewer.env`" (mesma família AUTH). Descartada a **taxonomia formal 4-subtipos** (o
   modelo se comporta igual a partir de uma boa mensagem; enum vira cerimônia single-user).
4. **Cache sob demanda, por sessão, sem TTL.** Nenhum pré-load no startup. A 1ª chamada de
   cada resolver dispara o fetch (a tool tem o token, lido do `flow-viewer.env` no boot do
   MCP — **nunca chega ao modelo**) e cacheia; as seguintes batem no cache. Resolvers são
   read-only contra a API e edições locais não afetam as listas remotas → **sem invalidação**
   na sessão. Um caminho de código só (lazy+cache). **Reverte o esboço eager** — o ganho do
   eager (falha rápida em token ruim, consciência imediata) é marginal e já coberto pela
   mensagem AUTH na 1ª chamada.
5. **Matching nome→ID: normalizado exato + `contains` para candidatos.** Normaliza (minúscula
   + sem acento — pt-BR). **Exato único → devolve o ID.** Senão, devolve quem **contém** a
   query como **candidatos** (serve o usuário que só sabe *parte* do nome — `contains` é
   estritamente melhor que Levenshtein nesse caso; fuzzy só corrige typo de nome já conhecido,
   ganho raro porque o modelo copia o nome que o humano deu). **Ambíguo (>1)** → devolve os
   empatados; **o modelo PARA e pergunta, nunca auto-escolhe** (é o que protege contra gravar
   o alvo errado em silêncio). Mesmo helper para `find_team`/`find_user`/`find_bot` e o match
   dentro do `list_intents`.
6. **`find_user` filtra server-side.** `fetchSupervisedUsers` ([users.ts:51](src/utils/users.ts#L51))
   hoje busca `search:'.*'` com **cap de 100** e filtra em memória — trunca em loja grande
   (alvo-produto) e pode perder o alvo. Estender o util com um param `search` opcional e mandar
   o nome para a cloud function filtrar no servidor; cache por query (`users:<nome>`).
7. **`list_intents` é o complemento cross-bot** (recebe um `botId`, reusa `fetchServerIntents`
   read-only, devolve `{id, name}` compacto). Para o bot atual o modelo usa `list_nodes`
   (local); `list_intents` resolve o caso "redireciona para a intenção X de *outro* bot" (além
   do `-start` da Parte 10): `find_bot(nome) → botId → list_intents(botId) → acha → grava
   next.intent {id, botId}`.

**Onde mora o código:** novo módulo na camada de tools (`src/tools/`) que envolve as funções
de fetch existentes (match + cache + mensagens de erro); exposto como tools MCP em
[mcp/server.ts](mcp/server.ts). Mantém a **fonte única** reusável pelo backend de produto
(Fase 5). Reusar `sessionHeaders`/`Deps` de [teams.ts](src/utils/teams.ts) (o `buildHeaders` de
`pushFlow.ts` é equivalente — não unificar agora, só reusar o que cada util já tem).

**Como será testado (decisão):** **unit com `fetch` injetado** (sem rede, igual a
`teams.test`/`users.test`) cobrindo match exato único / candidatos / ambiguidade / lista vazia /
401 AUTH (mensagem, sem retry) / cache (2 chamadas = 1 fetch) — escalando do `find_team` para os
demais. **+ 1 smoke read-only manual** contra a API real do bot de testes (`find_team` lista os
times) como rede de segurança contra drift do contrato da API interna (risco registrado).
**Sandbox dispensável:** os resolvers só **leem** da API; a escrita é local no flow file (já com
`.bak`+`revert`), então operar `public/masterFlow.json` direto segue seguro.

**Riscos/pendências:** (a) API interna não documentada pode mudar — o smoke read-only é a rede
de segurança; (b) `find_user` >100 mitigado por server-side search, mas confirmar que a cloud
function respeita `search` no smoke; (c) flow file sem `botId` (flow novo vazio) → mensagem
clara em vez de stack trace.

### Fase 5 — Produto (direcional, NÃO detalhar agora)

Cliente Claude Code → **backend** com tool runner do SDK (ou MCP connector); o **frontend
executa as tools via relay** (WebSocket/SSE) para a **key ficar no servidor**. Backend em
nuvem (Render/Fly/Workers), **nunca** no roteador de casa; gh-pages segue só frontend.

**Não detalhar agora (Q10):** depende de decisões de produto ainda não tomadas (hosting,
transporte do relay, modelo de auth do usuário final) — detalhar seria especulação que
envelhece mal. O que importa preservar **já são anchors**: camada de tools agnóstica de
transporte, token na camada de tools, **storage abstrato** (reforçado pela Q3). Enquanto as
Fases 1–4 respeitarem isso, a Fase 5 segue viável.

**Riscos/pendências:**
- Pureza Node das funções confirmada hoje (só tipos) — re-verificar se o spike puxar novas
  deps de browser para `src/utils`.
- API interna não documentada (risco já registrado) — o round-trip real é a rede de
  segurança.
- O refactor do `NODE_CATALOG` (Fase 2) arrisca os 383 testes do DetailPanel — por isso
  adiado para pós-spike e feito com a suíte verde como gate.
- Threads ortogonais que não podem se perder: editor do nó **Pedido** (planejado, não
  implementado), **PRs/merge** das v0.25–v0.27 pendentes, **commit** do CSAT v0.27.0
  pendente.

## masterFlow.json — fluxo de exemplo canônico (construído por partes)

> Iniciado 2026-06-22. Arquivo: [masterFlow.json](masterFlow.json) na raiz.

**Objetivo:** manter um fluxo de exemplo de referência, fiel ao formato real da plataforma OmniChat, montado incrementalmente parte a parte.

**Bot:** usa o bot de testes `2a3859ff-62d5-4c01-ae60-6ae2f812e786` (mesmo dos backups em `samples/` e do push/smoke).

**Decisões (interrogatório 2026-06-22):**
1. **Réplica fiel** do formato da plataforma (não o mínimo do parser) — para poder ir pro push real sem virar armadilha. Conjunto de campos espelhado de `samples/sample03.json` e `example.json`.
2. O `next` da mensagem **encadeia** para o nó seguinte (não é folha terminal) — formato `redirect: continueFlow / action: intent / type: context / intent:{id,botId}`.
3. Nomes/categorias: `start`·start / `mensagem_boas_vindas`·Mensagem / `encerrar`·Encerramento.
4. O encerramento usa `action.type: endConversation` **com** uma `TEXT` de despedida ("Até logo! 👋").

**Estado atual:**
- **Parte 1:** cadeia Start (`startNode`) → Mensagem "Hello world!" (`defaultNode`) → Encerrar (`endNode`).
- **Parte 2 — nós de teste (só mensagem):** cada nó documenta no `name` a referência do que testa e no corpo o texto do teste. Padrão estabelecido com `teste_contexto_palavra_chave` (`keywords:["teste"]`, `context: mensagem_boas_vindas`, corpo "Teste de Contexto + Palavra-chave", `next` folha). É standalone (gatilho por contexto+palavra-chave) → aparece como componente próprio, com aresta tracejada de contexto vinda da `mensagem_boas_vindas`.
- **Parte 3 — Anexo + Prioridade:** 4 nós standalone de mensagem (`action.none` → `defaultNode`), um por tipo de anexo, cada um com prioridade distinta: `teste_anexo_imagem_prioridade_baixa` (IMAGE, 0.25), `teste_anexo_pdf_prioridade_media` (FILE, 0.5), `teste_anexo_video_prioridade_alta` (VIDEO, 0.75), `teste_anexo_colecao_prioridade_muito_alta` (COLLECTION `collectionId:72ae0Dqbfo`, 1). Links de mídia reais fornecidos pelo Andy.
- **Parte 4 — Menu_Testes (choice/LIST) + cadeia "Teste Cabeçalho":** os 5 nós de teste tiveram `category` → `"Teste Cabeçalho"` e foram **encadeados em sequência** (contexto → imagem → pdf → vídeo → coleção → `encerrar`). Novo nó `Menu_Testes` (`action.choice` → `choiceNode`, `category: "Menu"`) com mensagem **LIST** toda preenchida (header/body/footer/título + botões com id/text/description). 3 itens: **Teste Cabeçalho** (conectado, `choices[0]` → início da cadeia) + 2 placeholders **Teste por Tipo** e **Teste por Ação** (slots `choices` vazios → aviso "sem conexão" do v0.19.0, reservados para caminhos futuros). Total: 9 intenções. `encerrar` agora é terminal compartilhado (recebe de `mensagem_boas_vindas` e da cadeia de teste). **Nota:** o JSON passou a ser formatado por `json.dump` (indent=2) a partir desta parte.
- **Parte 5 — fluxo fechado:** `mensagem_boas_vindas.next` repontado de `encerrar` → `Menu_Testes`. Agora tudo é **1 componente conexo**: `start → boas_vindas → Menu_Testes → [Teste Cabeçalho] → cadeia → encerrar`. Placeholders do menu seguem sem destino.
- **Parte 6 — Teste por Tipo (submenu de ConditionTypes):** novo nó `Menu_Tipos_Condicao` (choice/LIST, `category: "Menu"`, 8 itens), ligado a partir do botão "Teste por Tipo" do `Menu_Testes` (`choices[1]`). Para cada um dos 8 ConditionTypes que avaliam algo (`context`, `lastIntent`, `empty`, `exists`, `equals`, `contains`, `totalIsGreaterThan`, `totalIsEqual`) há um nó `teste_tipo_<slug>` (`category: "Teste por Tipo"`) com **2 condições** `[<tipo>, else]` → vira `intentGroupNode`; ambas `action.none`, com mensagem distintiva ("✅ Caiu em: <rótulo>" / "↪️ Caiu no Senão") e `next → encerrar`. Operandos placeholder: `@custom.teste` (igual="A", contém=["sim","ok"], total*="1"); `lastIntent` referencia `mensagem_boas_vindas` no campo `intent` da condição. Formas de campo por tipo espelhadas dos samples (`""` em equals/empty/contains; `null` em exists/total*). **Ajuste (Andy):** em `teste_tipo_contexto`, a condição `context` tem **`condition.context` E `condition.intent`** preenchidos com `Menu_Tipos_Condicao` (a intenção de onde o nó é alcançado). Na OmniChat o gatilho "Contexto é igual a" exige os dois campos para ser testável.
- **Parte 7 — nó Flow (TEMPLATE) na cadeia "Teste Cabeçalho":** novo nó `teste_flow` (`category: "Teste Cabeçalho"`, `action.none` → `defaultNode`) inserido **entre** `teste_anexo_colecao_prioridade_muito_alta` e `encerrar` — completa os tipos de mensagem (TEXT/IMAGE/FILE/VIDEO/COLLECTION/**TEMPLATE**). Mensagem `TEMPLATE` "Teste Flow" (`messageTemplateId: 1PytiMByYDhA`, token `@customer.name` → `{{1}}`, botão `FLOW`), modelo fornecido pelo Andy usado verbatim; `next` repontado do start (do modelo) para `encerrar` (evita laço; segue o padrão da cadeia). 19 intenções no total.
- **Parte 8 — Teste por Ação (concluída):** o 3º botão do `Menu_Testes` (`choices[2]`, "Teste por Ação") agora aponta para o novo `Menu_Acoes` (choice/LIST, `category: "Menu"`, 6 itens). Cada item percorre **exemplos das possibilidades** daquele `ActionType`. **15 nós novos → 34 intenções no total.** **Decisões (interrogatório 2026-06-22):**
  1. **Estrutura:** submenu **só na Transferência** (`Menu_Transferencia`, 6 `TransferType`s); os outros 5 ramos são **cadeias curtas** encadeadas por `next`.
  2. **Capturar informação** (`captureData`) → 2 nós: `acao_captura_um` (`captureDataType: mail`, `captureDataTypesCategory: singleField`) → `acao_captura_varios` (`captureDataTypesCategory: multipleFields`, `multipleFields` = todos os campos de dado padrão: fullName, name, mail, fullPhoneNumber, cpf, cnpj, zipcode, addressStreet, addressNumber, addressComplement, gender, birthDate).
  3. **Editar informação** (`setData`) → 2 nós: `acao_editar_um` (`bulkUpdate` 1 item) → `acao_editar_varios` (`bulkUpdate` vários). Variáveis reais padrão (`@customer.*`).
  4. **Ações sobre a loja física** (`store`) → `acao_loja` (`storeType: "first"` — único valor do enum `StoreType`).
  5. **Chamada de API** (`external`) → `acao_api` (`external: {type:"request", apiName:<placeholder>}` + bloco `error` com `next.redirect: waitInteraction` — caminho infeliz). **Placeholder obrigatório:** o bot de testes não tem nenhuma API configurada (todos os `apiName` vêm `[]`/`null`), então não existe ID real pra referenciar.
  6. **Transferência** (`transfer`) → `Menu_Transferencia` → 6 nós, um por `TransferType` (`search4group`, `direct4group`, `search4user`, `direct4user`, `directFromBranch`, `direct4userPrevious`). `value` = **IDs reais** do retailer do bot de testes (`5rFc8fXg1G`) onde aplicável: time real nos `*4group`, usuário real nos `*4user`; `directFromBranch`/`direct4userPrevious` → `value` null (resolvido em runtime).
  7. **Aguardar interação** (`waitForInteraction`) → `acao_aguardar` (`next.redirect: waitInteraction`).
  - **IDs reais (decisão do Andy):** buscados ao vivo no retailer `5rFc8fXg1G`. Times: `search4group` → `UrAnEmtASL` (Andrews Teste 1), `direct4group` → `S1Cl3fbnFG` (Financeiro). Usuários: `search4user` → `H8eCHFdDdc`, `direct4user` → `Kq1BchVtk9`. `directFromBranch`/`direct4userPrevious` → `value: null` (runtime). API → placeholder `apiName: "API_EXEMPLO"` (bot não tem API configurada). setData usa `@customer.name`/`@customer.email` (reais) + `@custom.origem`.
  - **Desvio de fidelidade (transfer = folha):** os 6 nós de transferência **não encadeiam** para `encerrar` — o `next` é folha (`{redirect:"waitInteraction", type:"context"}`), como no `transfer` real dos samples: transferir entrega ao humano e o bot para ali. Encadear para `endConversation` seria contraditório.
  - `captureData`/`setData`/`store`/`external`/`transfer` carregam bloco `error` (caminho infeliz: `next.redirect:waitInteraction`, `type:error`, `intent` = `-start`), espelhado dos samples. Cada nó-exemplo tem `name` = referência + uma `TEXT` curta. `category: "Teste por Ação"`.
  - **Estrutura final:** `Menu_Acoes` ─[Capturar]→ `acao_captura_um`→`acao_captura_varios`→encerrar · ─[Editar]→ `acao_editar_um`→`acao_editar_varios`→encerrar · ─[Loja]→ `acao_loja`→encerrar · ─[API]→ `acao_api`→encerrar · ─[Transferência]→ `Menu_Transferencia`→ 6 nós (folhas) · ─[Aguardar]→ `acao_aguardar`→encerrar.
- **Parte 9 — um encerramento por grupo de categoria (limpeza do desenho):** o `encerrar` compartilhado recebia ~22 arestas de todos os ramos (emaranhado no Dagre). Dividido em **3 sinks locais** `endConversation` (todos `category: "Encerramento"`, despedida própria): `encerrar_cabecalho` (mantém o id `f19f108f…`, 1 entrada: cadeia Cabeçalho via `teste_flow`), `encerrar_tipo` (16 entradas: 8 grupos × 2 condições do "Teste por Tipo") e `encerrar_acao` (5 entradas: ramos não-transfer do "Teste por Ação"). Repontamento feito pela **categoria da intenção de origem**. **36 intenções no total.** As transferências seguem folhas (não encerram).
- **Parte 10 — 7ª opção "Transferência para outro bot" no `Menu_Transferencia`:** **não** é um `transferType`. Forma real (samples `sample02`/`sample03`): nó `acao_transfer_outro_bot` com `action.type: "none"` e `next` especial `{redirect:"waitInteraction", action:"bot", type:"context", intent:{id:"<outroBotId>-start", botId:"<outroBotId>"}}` — folha (entrega ao outro bot e este para, como as transferências humanas). Bot-alvo = **ID real** "Andrews - Cadastro de clientes" (`8df3c1e7-a8c9-4bad-ac5a-2855462da840`), outro bot do mesmo retailer (`5rFc8fXg1G`). O viewer já renderiza nativamente como nó sintético **"Outro Bot"** (`ExternalBotNode`, detectado por `parseFlow.ts` via `next.action==='bot'`), com aresta tracejada. `Menu_Transferencia` agora tem 7 itens (limite WhatsApp LIST = 10). **37 intenções no total.**
- **Parte 11 — ajustes de `context` + `keywords` (concluída):** 3 nós de entrada de categoria ganharam aresta de contexto saindo do `Menu_Testes` (`de947f17…`) e palavra-chave: `teste_contexto_palavra_chave` (context `mensagem_boas_vindas`→`Menu_Testes`, keyword `teste`→`cabeçalho`), `Menu_Tipos_Condicao` (context→`Menu_Testes`, +keyword `tipo`), `Menu_Acoes` (context→`Menu_Testes`, +keyword `ações`). Continua **37 intenções**. ⚠️ **O arquivo real é `public/masterFlow.json`** (servido pelo Vite); `dist/masterFlow.json` é saída de build (regenerada, não editar à mão). Não há cópia na raiz — os build scripts antigos usavam path da raiz que resolvia para `public/`.
- **Parte 12 — nós faltantes: Pedido, CSAT e mensagem BUTTON (✅ concluída):** fecha a cobertura dos `NodeKind`. **Objetivo:** exemplificar os 2 ActionTypes ainda ausentes (`order`, `captureCsat`) + o único tipo de mensagem não usado (`BUTTON`). **5 nós novos → 42 intenções.** **Resultado (2026-06-23):** criados `acao_pedido_gerar` (order/generateOrder) → `acao_pedido_carrinho` (order/addToCart, `variable:"@custom.produto"`) → `encerrar_acao`; `acao_csat_nota` (captureCsat/supportRate) → `acao_csat_comentario` (captureCsat/supportRateComment) → `encerrar_acao`; e `teste_botoes` (choice + msg `BUTTON`, 2 botões → `encerrar_cabecalho`) inserido entre `teste_flow` e `encerrar_cabecalho`. `Menu_Acoes` 6→8 itens (choices[6]=Pedido, choices[7]=CSAT). **Entradas dos sinks: `encerrar_acao` 5→7** (as 2 cadeias só somam 2 entradas — o handoff dizia 5→9 por erro de conta) e **`encerrar_cabecalho` 1→2** (os 2 botões do `teste_botoes`; `teste_flow` deixou de apontar pra lá). order/csat carregam bloco `error`→start; choice não. Validação por script 100% verde (ids únicos, alvos válidos, action→NodeKind via `nodeMeta.ts`). Pendente: visual no viewer + push real. **Decisões (interrogatório 2026-06-23):**
  1. **Escopo (completo):** Pedido = 2 nós (`generateOrder` "Gerar pedido" sem campos; `addToCart` "Adicionar item" com `action.variable`); CSAT = 2 nós (`captureDataType: supportRate` nota; `supportRateComment` comentário); BUTTON = 1 nó.
  2. **Pedido e CSAT** entram como 2 novos itens do `Menu_Acoes` (6→8 itens, limite 10), cada um cadeia de 2 nós → `encerrar_acao` (padrão "submenu só na Transferência"). Ordem: Pedido `acao_pedido_gerar`→`acao_pedido_carrinho`→encerrar; CSAT `acao_csat_nota`→`acao_csat_comentario`→encerrar.
  3. **BUTTON** (não é ActionType — é `choice` com `messages[].type:"BUTTON"`, máx. 3 botões) vai no **fim da cadeia "Teste Cabeçalho"** (`teste_flow`→`teste_botoes`→`encerrar_cabecalho`), bucket dos tipos de mensagem. 2 botões, ambos → `encerrar_cabecalho`.
  4. **`addToCart`** usa `action.variable = "@custom.produto"` (variável custom autoexplicativa, não ID de objeto — fiel sem depender de catálogo real, estilo `@custom.origem` da Parte 8).
  5. **Caminho infeliz:** nós `order`/`csat` carregam bloco `error`→start (estão em `ACTION_KINDS_WITH_ERROR`); `choice` (BUTTON) não. Formas confirmadas no editor (`intentTemplates.ts`: `orderType:generateOrder`, `captureDataType:supportRate`) e no spec (`MODELO-INTENCAO-OMNICHAT.md:102`: `captureCsat`→`supportRate`/`supportRateComment`).
  - **Risco/teste:** mesma validação das partes anteriores (ids únicos, alvos válidos, action→NodeKind, contagem de entradas dos encerramentos). Pendente: visual no viewer + push real (BUTTON e CSAT nunca foram exercitados contra a API; `order` depende de catálogo no bot, que o de testes não tem).

**Como foi testado:** parse JSON OK + simulação do grafo `parseFlow` (action→NodeKind e validação de que todo `next.intent.id`/`choices[]` existe na lista, ids únicos, menus 100% conectados). IDs de time/usuário da Parte 8 obtidos ao vivo (read-only, retailer `5rFc8fXg1G`, token de sessão). Pendente: validar visualmente no viewer e, se for dar push, confirmar contra a API real (em especial o nó de API com `apiName` placeholder e o `context`).

**Próximas partes:** estender a partir da Mensagem (hoje folha após o Encerrar) com novos tipos de nó conforme necessário.

## Nó Pedido — dropdown "Tipo de ação" (planejado)

> Interrogatório 2026-06-23. Hoje o `OrderNode` ([OrderNode.tsx](src/components/nodes/OrderNode.tsx)) é só visual (pill com o rótulo do `orderType`) e **não há editor** no DetailPanel. Esta feature adiciona o editor.

**Objetivo (1 frase):** dar ao nó Pedido um editor com dropdown "Tipo de ação" — **Adicionar item** (`orderType: addToCart`, abre picker de variável → `action.variable`) e **Gerar pedido** (`orderType: generateOrder`, sem campos novos).

**Decisões (com o porquê):**
1. **Picker `@` livre** para a variável do "Adicionar item" — reusa `VariablePicker` ([DetailPanel.tsx:1805](src/components/DetailPanel.tsx#L1805)). Não existe endpoint que liste "variáveis de pedido" (são produzidas por nós anteriores, ex.: `@api.<uuid>.name`); dropdown fechado não tem fonte e quebraria o caso real. Consistente com captura/setData.
2. **`action.variable` só é gravada no modo `addToCart`.** Em `generateOrder` o campo some da UI e o valor subjacente é **preservado verbatim** (preserve-and-patch) — é o que a própria plataforma faz (nos 2 JSONs de exemplo, `generateOrder` mantém `variable` preenchida e só ignora). Alternar o dropdown não destrói o valor digitado (vive no draft enquanto o painel está aberto).
3. **Gate do "Aplicar"** quando `addToCart` + variável vazia (espelha a Loja física, aviso âmbar). Validação = não-vazio (picker é texto livre; não dá pra validar existência). `generateOrder` nunca trava.
4. **Rótulo unificado em "Adicionar item"** no dropdown E no pill do canvas — `ORDER_ACTIONS` (`{value,label}`) vira fonte única; `ORDER_LABELS` do `OrderNode` deriva dela. Hoje o pill diz "Adicionar ao carrinho"; muda para "Adicionar item". (Reavaliar se a tela oficial da OmniChat usar outro termo.)
5. **`orderType` desconhecido de import** (fora de `addToCart`/`generateOrder`) preservado como `<option>` extra — anti-corrupção, igual a `storeType`/`captureDataType`.

**Plano de implementação (mirror da `StoreActionSection`):**
- `editIntent.ts updateActionFields` ([:713](src/utils/editIntent.ts#L713)): adicionar `orderType?: string` aos `fields` → `if (fields.orderType !== undefined) cond.action.orderType = fields.orderType`. `variable` já é tratado (linha 738).
- Draft: novos campos `orderType: string` e `orderVariable: string`.
- Parse (buildDraft, ~[:462](src/components/DetailPanel.tsx#L462)): derivar `orderCond` (mirror `storeCond` ~[:413](src/components/DetailPanel.tsx#L413)); `orderType: orderCond?.action.orderType || 'generateOrder'`; `orderVariable: typeof orderCond?.action.variable === 'string' ? orderCond.action.variable : ''`.
- Serialização (~[:3093](src/components/DetailPanel.tsx#L3093)): `if (kind === 'orderNode')` → `addToCart`: `updateActionFields(intent,'order',{orderType:'addToCart',variable:draft.orderVariable.trim()},ci)`; senão (`generateOrder`/legado): `{orderType:draft.orderType}` (NÃO passar `variable` → preserva). **Decisão menor:** `variable` é trimada na escrita (o exemplo tem espaço final, provável artefato; setData já trima).
- Novo `OrderActionSection` (mirror `StoreActionSection`): dropdown `ORDER_ACTIONS` + `<option>` legado; `VariablePicker` condicional quando `addToCart`; aviso âmbar do gate.
- Render do `OrderActionSection` quando `kind === 'orderNode'` (mirror ~[:3579](src/components/DetailPanel.tsx#L3579)) + somar à condição `invalid` do "Aplicar".
- `OrderNode.tsx`: `ORDER_LABELS.addToCart` → "Adicionar item" (ou derivar de `ORDER_ACTIONS` exportado).

**Como será testado (decisão: unitário, sem Playwright):** round-trip em `editIntent.test`/`intentTemplates.test` — (a) parse `addToCart` com `variable` → draft; (b) parse `generateOrder`; (c) serialização grava `variable` só em `addToCart`; (d) alternância de modo preserva o valor; (e) `orderType` gravado correto. O risco real é o JSON do `action`, 100% coberto por unitário. UI (dropdown mostra/esconde campo) é baixo risco → validação visual manual no viewer como passo final.

**Riscos/pendências:** sem fonte para validar se a `variable` existe de fato (só não-vazio); termo "Adicionar item" vs. termo oficial da plataforma (confirmar na tela do construtor se possível).

## Nó Captura CSAT — dropdown "Tipo de captura CSAT" (✅ entregue v0.27.0, commit pendente)

> Interrogatório + implementação 2026-06-23. Era espelho **mais simples** que o nó Pedido: um único dropdown de enum, sem picker de variável e sem gate. Entregue: `CSAT_CAPTURE_TYPES` (fonte única), `CsatActionSection`, branch de serialização `csatNode`, `CsatNode` derivando o pill, +5 testes de round-trip. `tsc` limpo, 383 testes verdes, build OK.

**Objetivo (1 frase):** dar ao nó Captura CSAT um editor com dropdown "Tipo de captura CSAT" — **Dados avaliação CSAT - Nota** (`captureDataType: supportRate`) e **Dados avaliação CSAT - Comentário** (`captureDataType: supportRateComment`).

**Decisões (com o porquê):**
1. **O dropdown grava SÓ `action.captureDataType`.** Confronto dos 3 JSONs de exemplo do Andy: a única diferença consistente entre Nota e Comentário é `captureDataType`. O `action.error.next.intentBot` varia de forma independente (apareceu `""` e preenchido para o *mesmo* `supportRateComment`) → é **ruído de captura**, não correlacionado ao tipo. O bloco `error` é gerenciado pela feature "Em caso de erro" (v0.25.0) e fica **preservado verbatim** (preserve-and-patch). Tudo o mais idêntico.
2. **Rótulos: pill curto, dropdown longo, fonte única.** Nova `CSAT_CAPTURE_TYPES` com `{ value, labelDropdown, labelPill }`. Dropdown: "Dados avaliação CSAT - Nota/Comentário" (texto pedido pelo Andy). Pill do canvas mantém o curto atual ("Nota da avaliação" / "Comentário da avaliação") — espaço apertado no nó pede leitura rápida. `CsatNode.tsx` deriva `CSAT_LABELS` (pill) dessa fonte; o dropdown usa `labelDropdown`. Evita strings soltas sem espremer o texto longo no pill.
3. **Anti-corrupção:** `captureDataType` desconhecido de import (fora de `supportRate`/`supportRateComment`) preservado como `<option>` extra selecionada — igual a `storeType`/`orderType`/`captureDataType` legado. Round-trip não corrompe fluxos que não criamos.
4. **Sem gate no "Aplicar"** — diferente de Pedido/Loja, o CSAT sempre tem valor válido (nasce em `supportRate`, [intentTemplates.ts:139](src/utils/intentTemplates.ts#L139)); o dropdown nunca fica vazio. Default de nó novo **inalterado** (`supportRate`).

**Plano de implementação (mirror da `StoreActionSection`, ainda mais enxuto):**
- `editIntent.ts updateActionFields` já trata `captureDataType` ([:737](src/utils/editIntent.ts#L737)) — reusável. **Atenção:** lá faz `fields.captureDataType || null`; para CSAT o valor é sempre não-vazio, então OK.
- Draft: novo campo `csatCaptureType: string` (ou reusar `captureDataType` do draft com cuidado — preferir campo próprio para não colidir com a lógica de sentinela/multipleFields da Captura).
- Parse (buildDraft, ~[:462](src/components/DetailPanel.tsx#L462)): derivar `csatCond` (mirror `storeCond` ~[:413](src/components/DetailPanel.tsx#L413)); `csatCaptureType: csatCond?.action.captureDataType || 'supportRate'`.
- Serialização: **branch próprio** `if (kind === 'csatNode')` → `updateActionFields(intent,'csat',{captureDataType: draft.csatCaptureType},ci)`. NÃO usar o branch da Captura (que escreve `captureDataTypesCategory`/`multipleFields`/sentinela — irrelevante p/ CSAT). NÃO tocar no `error`.
- Novo `CsatActionSection` (mirror `StoreActionSection`): dropdown `CSAT_CAPTURE_TYPES` (usando `labelDropdown`) + `<option>` legado p/ valor desconhecido. Sem `VariablePicker`, sem aviso âmbar.
- Render do `CsatActionSection` quando `kind === 'csatNode'`.
- `CsatNode.tsx`: derivar `CSAT_LABELS` (pill) de `CSAT_CAPTURE_TYPES.labelPill`.

**Como será testado (decisão: unitário round-trip + visual):** casos em `editIntent.test`/`intentTemplates.test` — (a) parse `supportRate` → draft; (b) parse `supportRateComment`; (c) serialização grava o `captureDataType` certo **e preserva o bloco `error` intacto**; (d) `captureDataType` desconhecido sobrevive ao round-trip. Validação visual manual no viewer no fim. Sem Playwright (projeto não usa; UI é baixo risco).

**Riscos/pendências:** confirmar na tela oficial do construtor OmniChat se "Dados avaliação CSAT - Nota/Comentário" é o termo exato exibido (texto fornecido pelo Andy; ajustar se a plataforma usar outro).

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

## Histórico (arquivado)

> Detalhes completos em [docs/PLANS-ARCHIVE.md](docs/PLANS-ARCHIVE.md). Uma linha por fase/feature concluída e mergeada.

- **v0.25.0** — Seção "Em caso de erro" (`action.error`) nos 7 nós de ação
- **v0.24.0** — Nó "Chamada de API" editável (Tipo de Integração + picker de Endpoint)
- **v0.24.0** — Nó "Transferência" rico (seletor de 2 níveis + picker de vendedores)
- **v0.23.0** — Nó "Loja física" editável + picker dinâmico de `@entity` (Listas)
- **v0.22.0** — Próximo Fluxo (`next.intent` editável: "Neste bot" / "Em outro bot")
- **v0.20.1** — Fix `remapRefs` (refs de `context`/`condition.intent` no push)
- **v0.20.0** — Tempo de envio da resposta (`executionDelay`) — "Fase 17"
- **v0.19.0** — Fase 16: sinal de "opção de menu sem conexão" no nó de Escolha
- **v0.18.1** — Fase 15: feedback ao "Aplicar alterações" (toast + micro-animação)
- **v0.18.0** — Fase 14: nó de Captura (modos "Uma" / "Múltiplas informações")
- **v0.17.0** — Fase 13: UX do picker de variáveis (@)
- **v0.16.0** — Fase 12: Modelo de mensagem com Flow (TEMPLATE)
- **v0.15.0** — Fase 11: repaginação visual "cara de Omni" / Fase 7: duplicação de nós
- **v0.14.0** — Fase 6: nós por condição (Modelo B)
- **v0.13.0** — Fase 4: push + restore via API (CLI + UI) / Fase 5: redesign editor (v0.10–0.12)
- **v0.16.0** — Fase 10/10b/10c: mensagem Botão/Lista + nó de Escolha (menu × escolhas)
- **(branch)** — Fase 8: painel de edição alinhado ao construtor / Fase 9: variável "Times" (@team)
- **v0.8.0–0.9.0** — Fase 3a/3b: edição de conteúdo + estrutural avançada
- **v0.7.0** — Fase 2: criação de nós (paleta + templates)
- **v0.6.0** — Fase 1: round-trip (importar → reconectar → exportar)
