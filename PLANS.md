# PLANS.md — FlowViewer: de visualizador a editor de fluxos OmniChat

<!-- HANDOFF:START -->
## 🔄 Handoff — 2026-06-26

**Foco da próxima sessão:** implementar a **Fase 1** (camada de tools) da feature **"Menus que roteiam de verdade" (v0.33.0)** — plano recém-fechado por `/interrogar` (6 Qs), gravado no corpo do PLANS (§"Menus que roteiam de verdade"). **Antes disso**, resolver o débito ainda aberto: a feature **Categorias (v0.32.0) segue NÃO commitada**.

**Plano novo desta sessão (NÃO iniciado, só planejado):** menus de Escolha não roteiam na plataforma porque o roteamento real é por **`keyword` na intenção-alvo** (match "contém"), não pelo `choices[]` (que só dispara por número posicional — morto p/ botões, pois clicar envia o TEXTO do botão). Faltam setters de `keywords`/`context` (campos de cabeçalho, sem tool — como `category` era). Solução em **2 fases**:
- **Fase 1 (MCP-first, a fazer agora):** funções puras `setKeywords(node, keywords[])` + `setContext(node, ctx|vazio)` em [flowTools.ts](src/tools/flowTools.ts); registrar as 2 tools em [mcp/server.ts](mcp/server.ts) (11→13) + guidance; **3 nudges** no `validate()` (alvo sem keyword · keyword duplicada entre alvos · context p/ alvo de 2 menus); unit tests + `mcp:typecheck`. **Já conserta a dor reportada** — shippável sozinha (v0.33.0). Fecha com `/verify` e2e.
- **Fase 2 (sessão própria):** 2 campos por opção no [DetailPanel.tsx:3569-3582](src/components/DetailPanel.tsx#L3569-L3582) (campo keyword pré-preenchido com a do alvo + checkbox context default OFF) + escrita **cross-intent** (patcheia os alvos ao "Aplicar"). Reusa os setters da Fase 1.

**Fios soltos / débito anterior (resolver antes da Fase 1):**
- **Categorias (v0.32.0) NÃO commitada** — working tree sujo (7+ arquivos: CHANGELOG/PLANS/README/package.json/mcp/server.ts/flowTools.ts/flowTools.test.ts). `setCategory` + guidance + `findCategoryNudges` no `validate()`; **+10 testes, suíte 482 verde**; `tsc`+`mcp:typecheck` limpos. Falta: `/code-review` → commit (`feat: set_category + guidance + nudge (v0.32.0)`).
- **`/verify` e2e pendentes:** Categorias (saudação + 2 capturas reusam MESMA "Identificação", zero "Sem Categoria") · Captura (CNPJ+nº atendimento → 2 `captureNode`, zero `waitNode`) · `set_message`.
- **Destino das branches:** `feat/set-message` (v0.30.0) e `feat/capture-node-guidance` (Captura v0.31.0 + Categorias v0.32.0) → PR(s) p/ `main`. v0.33.0 deve sair em branch própria.

**Armadilhas (herdadas, ainda valem):**
- **PowerShell `Get-Content -Raw` SEM `-Encoding utf8` (PS 5.1) lê UTF-8 como ANSI** e o round-trip dupla-encoda o arquivo (mojibake). Nunca round-trip de fonte sem `-Encoding utf8`; **preferir o Edit tool**.
- Edit tool converte escapes `\u` em trânsito — p/ acentos usar `/\p{Diacritic}/gu` (flag `u`).
- Nudges no `validate()` podem colidir com testes que criam nós "incompletos" — ajustar fixtures p/ o estado completo do novo mundo (foi o que quebrou na v0.32.0).

**Próximo passo imediato:**
1. `/code-review` + commit da v0.32.0 (Categorias) → fecha o débito.
2. Branch nova p/ a v0.33.0; começar pelos setters puros `setKeywords`/`setContext` + testes (amostra mínima antes da UI).
3. `/verify` e2e numa **sessão nova** (o MCP só recarrega ao reiniciar o Claude Code).

**Ponteiros:**
- PLANS §"Menus que roteiam de verdade" — mecânica confirmada, decisões Q1–Q6, faseamento, critério de aceite.
- Leitura já pronta de `keywords`/`context`: [flowTools.ts:488-489](src/tools/flowTools.ts#L488-L489). Padrão a espelhar: `setCategory`/`findCategoryNudges` no mesmo arquivo.
- UI da Escolha: `draft.choices.map` em [DetailPanel.tsx:3569](src/components/DetailPanel.tsx#L3569); patch dos destinos em [DetailPanel.tsx:3204](src/components/DetailPanel.tsx#L3204).
- Commits recentes: `59b6307` (Captura v0.31.0), `5ae070a` (doc Uni.co).

**Skills sugeridas ao retomar:** `/code-review` antes de commitar a v0.32.0; `/verify` para os e2e pendentes; `/interrogar` já cumprido para a v0.33.0.
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

> **Fases 1, 2, 3, 4 e 4b ✅ concluídas e mergeadas na `main`** (spike: merge `15cbf54`;
> Fase 2: merge `e701026`; ambos 2026-06-24). Detalhes do spike (Fases 1/3/4/4b) **e da Fase 2
> (`NODE_CATALOG`)** em [docs/PLANS-ARCHIVE.md](docs/PLANS-ARCHIVE.md) — a Fase 2 foi migrada ao
> archive em 2026-06-26 (PLANS passou de ~600 linhas). Segue viva abaixo apenas a **Fase 5**
> (produto, direcional).

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
- Pureza Node das funções confirmada (só tipos) — re-verificar se algo puxar novas
  deps de browser para `src/utils`.
- API interna não documentada (risco já registrado) — o round-trip real é a rede de
  segurança.
- ~~O refactor do `NODE_CATALOG` (Fase 2) arrisca os 383 testes do DetailPanel.~~ ✅ Resolvido:
  Fase 2 mergeada (merge `e701026`) com a suíte verde como gate em cada um dos 4 commits.

### Prompt de construção do fluxo "Grupo Uni.co (lojista)"

> Prompt multi-turno fechado por interrogatório (skill `interrogar`) em 2026-06-26. Artefato
> reutilizável: 6 turnos de chat + mapa Mermaid + critério em
> [docs/PROMPT-fluxo-uni-co.md](docs/PROMPT-fluxo-uni-co.md). Origem: PDF "Reestruturação
> Omnichat Lojista".

**Objetivo:** construir pela caixinha o fluxo do PDF **o mais fiel possível**, dentro das tools.
Topologia: tronco linear (saudação→marca→captura CNPJ→categoria→assunto de 7 opções) + os 7
direcionamentos, com **bifurcação local (menu)** só nos ramos 2 (devolução, por marca×categoria)
e 6 (partes/peças, por marca) — porque **não há condição por variável nas tools**. Dinâmicos →
variáveis reais (`@customer.name`, `@chat.customerSupportRequestId`). Serve também de `/verify`
do `set_message`. **Gap de tool descoberto:** intenção dentro/fora-de-horário com "Senão" exige
tools de condição inexistentes (add_condition + critério `@bot.isOpenNow` + flag Senão) — fora-de-
horário virou 2 nós soltos como aproximação; candidato a feature futura. Pendente: rodar pela
caixinha e avaliar contra o critério do doc.

### Nó de Captura no agente — trocar "Mensagem + Aguardar" por `captureNode` (guidance + nudge) ✅ IMPLEMENTADA (branch `feat/capture-node-guidance`, v0.31.0)

> **Resultado (2026-06-26, branch `feat/capture-node-guidance`):** entregue como **guidance + nudge**
> (sem tool nova). (1) `summary`/`fields` de `captureNode` e `waitNode` reescritos em
> [nodeCatalog.ts](src/utils/nodeCatalog.ts); (2) nova regra "perguntar+esperar = captureNode" nas
> `instructions` do [mcp/server.ts](mcp/server.ts); (3) `validate()` ([flowTools.ts](src/tools/flowTools.ts))
> ganhou `findAskWaitNudges` — aviso não-bloqueante quando `defaultNode` COM texto → `waitNode`, exclusivo
> do agente (não toca `validateFlow`/UI). **+3 testes**, suíte cheia verde (**472 testes**), `tsc`+`mcp:typecheck`
> limpos. **Pendente:** `/verify` e2e pela caixinha (critério de aceite abaixo).
>
> Plano fechado por interrogatório (skill `interrogar`) em 2026-06-26. Decisões TRAVADAS abaixo —
> registro do raciocínio; não reabrir sem novo interrogatório. Origem: ao construir o fluxo Uni.co
> (turnos 2/3/4/7, "mensagem X → aguardar a resposta"), o agente monta `defaultNode` + `waitNode`
> em vez de um `captureNode`.

**Objetivo (1 frase):** fazer o agente usar **um `captureNode`** sempre que o passo for "perguntar
algo e esperar a resposta", em vez do par `defaultNode` + `waitNode`.

**Diagnóstico (achados do código — é guidance, NÃO falta tool):**
- `captureNode` recém-criado já nasce com `captureDataType: 'free'` ([intentTemplates.ts:83](src/utils/intentTemplates.ts#L83))
  ⇒ captura não configurada = "pergunte e espere qualquer resposta" = exatamente o que Mensagem+Aguardar faz.
- `set_message` aceita `captureNode` (recusa só `choiceNode`) ⇒ o nó de Captura **carrega a própria pergunta**.
- `set_action_field` já grava `captureDataType`/`captureDataTypesCategory`/`multipleFields` ([flowTools.ts:33](src/tools/flowTools.ts#L33)).
- A UI ([DetailPanel.tsx:3215](src/components/DetailPanel.tsx#L3215)) grava **só** esses 3 campos ao salvar captura — **nunca** `variable`.
  Captura tipada (CNPJ/CPF/…) **não precisa** de variável: a plataforma armazena no campo conhecido do contato pelo
  próprio `captureDataType`. `variable` só serve ao tipo `custom` (= território do `setDataNode.bulkUpdate` não exposto, fora do escopo).
- Logo: tudo construível com as tools de hoje. O agente caiu no workaround por **guidance** — o `summary` do
  `captureNode` ("Captura dado(s) do contato…") enquadra como "dado estruturado" e não diz que é o jeito de "perguntar e esperar".

**Decisões (com o porquê):**
1. **Regra única: pergunta+espera → `captureNode` (Q1).** Qualquer "faça uma pergunta e espere a resposta" vira
   um `captureNode` — inclusive texto livre, que fica em `captureDataType='free'` (default). O `waitNode` sobra só
   para "esperar sem perguntar nada". Uma regra só, uniforme; sem o agente ter que adivinhar "é tipado?".
2. **Materialização: guidance + nudge no `validate()` (Q2).** (a) Reescrever o `summary` do `captureNode` e do
   `waitNode` em [nodeCatalog.ts](src/utils/nodeCatalog.ts) e a regra na linha "Trabalho típico" das `instructions`
   do [mcp/server.ts](mcp/server.ts); (b) `validate()` emite **aviso não-bloqueante** ao detectar o antipadrão.
   Texto guia a construção; validate pega recidiva. **Sem guardrail duro na tool** — `waitNode` tem usos legítimos
   e bloquear misturaria política de design com validação estrutural.
3. **Política de tipo: conservador (Q4).** O agente só seta `captureDataType` quando a pergunta casa **limpo** com
   **um** dos 11 `CAPTURE_FIELDS` (CNPJ→`cnpj`, e-mail→`mail`, telefone→`fullPhoneNumber`). Composto/ambíguo/sem
   mapeamento → deixa `free`. Nunca erra o tipo (pior caso = pergunta+espera); `set_action_field` **não valida** enum
   hoje, então a disciplina vive na guidance. Vocabulário = os 11 `CAPTURE_FIELDS`, não os 22 do enum da plataforma.
   *Consequência:* o "Qual seu CNPJ **e nome da loja**?" do Uni.co (composto) vira captura **free** — o humano lê a resposta.
4. **Agente NUNCA grava `variable` (decorre do diagnóstico).** Espelha a UI. `variable` = tipo `custom`, fora do escopo.
5. **Nudge preciso: só `defaultNode` COM mensagem TEXT → `waitNode` (Q5).** É a assinatura de "perguntou e esperou".
   `defaultNode` sem texto → `waitNode` não acusa (raro e ambíguo). Menos falso-positivo.

**Como será testado:**
- **Unit do nudge** (padrão de [flowTools.test.ts](src/tools/flowTools.test.ts)): defaultNode-com-texto→wait **dispara**
  aviso; defaultNode-sem-texto→wait **não** dispara; captureNode→(nada) limpo; aviso é não-bloqueante (validate não falha).
- **`mcp:typecheck`** limpo (mudança de `summary`/instructions é texto; o validate ganha uma checagem).
- **`/verify` e2e pela caixinha:** prompt "pergunte o CNPJ e depois pergunte o nº de atendimento" → assert no
  `work.flow.json` que ambos são `captureNode` (CNPJ tipado=`cnpj`; nº atendimento=`free`), **zero** `waitNode`.

**Riscos/pendências:**
- Guidance não garante 100% (Q2 recusou guardrail duro) — o nudge do `validate()` é a rede para recidiva.
- `set_action_field` ainda não valida `captureDataType` (dívida da Fase 2) — se o agente escrever tipo inválido,
  passa silencioso. Aceito por ora; consolidar junto com os sub-enums quando a Fase 5 pedir validação de campo.
- Enum reduzido (11 vs 22): captura que precisaria de `cpfOrCnpj`/`custom`/etc. cai em `free` — aceito; ampliar é aditivo.

### Categorias coerentes nos nós (`set_category` + semente + nudge) ✅ IMPLEMENTADA (v0.32.0)

> **Resultado (2026-06-26):** entregue. (1) Tool `setCategory` em [flowTools.ts](src/tools/flowTools.ts) (trim+colapsa
> espaços, recusa vazia e o nó de início) + registrada em [mcp/server.ts](mcp/server.ts); (2) guidance híbrida
> reuse-first (semente por fase + precedência) nas `instructions` do MCP + linha "Trabalho típico"; (3) `findCategoryNudges`
> no `validate()` (quase-duplicatas por caixa/acento/espaço + nós em "Sem Categoria", excluindo o início). **+10 testes**
> (suíte cheia **482 verde**), `tsc`+`mcp:typecheck` limpos. **Pendente:** `/verify` e2e pela caixinha (critério abaixo).
>
> Plano fechado por interrogatório (skill `interrogar`) em 2026-06-26. Decisões TRAVADAS abaixo —
> registro do raciocínio; não reabrir sem novo interrogatório. Origem: o agente cria todo nó em
> `category: 'Sem Categoria'` e não tem como categorizar — pedido: categorias coerentes e reutilizadas.

**Objetivo (1 frase):** dar ao agente como atribuir **categorias coerentes e reutilizáveis** às
intenções que cria, para agrupar o fluxo na plataforma OmniChat sem explodir em sinônimos.

**Diagnóstico (achados do código — é gap de tool, NÃO só guidance):**
- Todo nó nasce em `category: 'Sem Categoria'` ([intentTemplates.ts:134](src/utils/intentTemplates.ts#L134)); o
  `start` em `'start'` ([intentTemplates.ts:157](src/utils/intentTemplates.ts#L157)).
- `category` é campo de **cabeçalho da intenção** (texto livre que agrupa — [MODELO-INTENCAO-OMNICHAT.md:36](docs/MODELO-INTENCAO-OMNICHAT.md#L36)),
  **não** está em `ACTION_FIELDS` e **não há tool** para gravá-la → hoje o agente não consegue categorizar.
- **Leitura já pronta:** `list_nodes` mostra `| categoria |` ([flowTools.ts:391](src/tools/flowTools.ts#L391)) e
  `describe_node` mostra `categoria=` ([flowTools.ts:405](src/tools/flowTools.ts#L405)) — o pré-requisito de "ver o
  que existe pra reutilizar" já existe; falta só a **escrita**.

**Decisões (com o porquê):**
1. **Estratégia híbrida reuse-first (Q1).** Vocabulário-semente curado + regra de reuso; categoria é
   **texto livre** (não enum — precisa de válvula de escape). Taxonomia 100% fixa é rígida demais p/
   varejo+educacional; emergente puro deriva. O híbrido dá âncora **e** escape, casando com a regra-âncora
   "reusar/resolver antes de criar".
2. **Tool dedicada `set_category(node, category)`, idempotente (Q2).** Espelha `set_message`/`set_action_field`
   (verbo "set", editável depois). Categoriza nós novos **e** existentes e re-categoriza sem recriar —
   o que um param de `create_node` não faz. Mantém `create_node` enxuto (kind+name).
3. **Anti-duplicata = trim + nudge no `validate()` (Q3).** (a) `set_category` faz **trim** e colapsa espaços
   (mata o erro bobo); (b) `validate()` emite **aviso não-bloqueante** quando categorias diferem só por
   caixa/acento/espaço ("'Atendimento' vs 'atendimento' — unifique"). Espelha `findAskWaitNudges`. **Sem
   auto-canonicalizar** (violaria "sem surpresa" — gravaria categoria diferente da pedida em silêncio).
4. **Eixo = fase da jornada, semente de 6 (Q4).** Categorias grossas que reusam em todo fluxo (reuso alto),
   não por assunto (cardinalidade alta = reuso baixo). Assunto fica no **nome** do nó. Semente:
   **Saudação e triagem · Identificação · Atendimento · Vendas · Transferência · Encerramento**.
5. **Precedência fluxo > semente > inventar + nudge de default (Q5).** (1) reutiliza categoria já existente
   no fluxo que sirva (o fluxo manda sobre a semente — evita duplicar contra vocabulário estabelecido);
   (2) senão escolhe da semente; (3) senão inventa coerente com o eixo "fase". `validate()` também nudga nó
   deixado em `'Sem Categoria'` (a recidiva que a feature combate) — **exceto** o `start` (categoria especial
   `'start'`, nunca recategorizar).
6. **Guidance mora nas `instructions` do [mcp/server.ts](mcp/server.ts)** (semente + precedência), no padrão do
   `captureNode` — registrar a tool com descrição + zod e citá-la na linha "Trabalho típico".

**Como será testado (Q6 — aceite):**
- **Unit** em [flowTools.test.ts](src/tools/flowTools.test.ts): `set_category` grava (assert) · **trim**
  (`" Vendas "`→`"Vendas"`) · **idempotente** · nó inexistente → erro. Nudge do `validate()`:
  `"Atendimento"`+`"atendimento"` → **dispara**; só `"Atendimento"` → **não**; nó em `"Sem Categoria"` →
  **dispara**; `start`/`"start"` → **não**; tudo **não-bloqueante**.
- **`mcp:typecheck`** limpo (registro da tool + zod).
- **`/verify` e2e pela caixinha (critério de aceite):** prompt "crie um nó de saudação e dois nós que
  perguntam CNPJ e e-mail" → assert no `work.flow.json` que a saudação ficou em `"Saudação e triagem"` e as
  **duas capturas reutilizaram a MESMA `"Identificação"`** (prova o reuso eficiente), **zero** `"Sem Categoria"`.

**Riscos/pendências:**
- Híbrido depende de guidance p/ a precedência (Q5) — o nudge do `validate()` é a rede p/ recidiva (duplicata
  e `'Sem Categoria'`).
- Detecção de quase-duplicata por caixa/acento/espaço (normalização leve) pode não pegar sinônimos reais
  ("Atendimento" vs "Suporte") — aceito; o eixo "fase" + semente reduzem isso na origem, não no validate.
- `set_category` aceita texto livre (Q1) — categoria fora da semente passa; é a válvula de escape, por design.

### Menus que roteiam de verdade (`set_keywords` + `set_context` + UI por opção) 📋 PLANEJADA (v0.33.0)

> Plano fechado por interrogatório (skill `interrogar`) em 2026-06-26. Decisões TRAVADAS abaixo —
> registro do raciocínio; não reabrir sem novo interrogatório. Origem: *"nossos nós de menu não
> funcionam na plataforma"* — o agente monta `choices[]` + botões, mas o menu não roteia.

**Objetivo (1 frase):** fazer os menus (nó de Escolha) **rotearem de verdade** na plataforma,
fiando `keyword` (e opcionalmente `context`) nas **intenções-alvo** — nas duas superfícies: tool MCP
(agente) **e** campo na UI do `DetailPanel` (humano).

**Mecânica de roteamento confirmada (runtime OmniChat, território N2 do Andy — não está no código):**
- Clicar num botão/lista envia o **TEXTO do botão** (ex.: "Falar com Financeiro"), nunca um número.
- O `choices[]` (o que `set_choices` grava) só dispara por **resposta numérica posicional** → como o
  cliente nunca manda número ao clicar, **`choices[]` é praticamente morto** p/ menus de botão/lista. **É o bug.**
- Roteamento real = **`keyword` na intenção-alvo** casando com o texto do botão; casamento é **"CONTÉM"**
  (a mensagem do cliente contém a keyword), não "igual".
- `context` é **opcional**: vazio = a keyword vira **atalho global** (dispara de qualquer lugar);
  setado (= a intenção de Escolha) = **escopado** àquele menu.

**Diagnóstico do código:** **não existe setter** p/ `keywords` nem `context` — são campos de **cabeçalho**
da intenção (como `category` era antes da v0.32.0). `describe_node` só os **lê** ([flowTools.ts:488-489](src/tools/flowTools.ts#L488-L489));
falta a escrita. Logo é **gap de tool**, no mesmo padrão de `set_category`.

**Decisões (com o porquê):**
1. **Keyword = palavra saliente, casamento "contém" (Q2).** Humano escolhe a palavra; agente escolhe a
   mais saliente por julgamento (ex.: "Falar com Financeiro" → `financeiro`). Como o match é "contém", a
   saliente casa o clique **e** texto livre digitado. **Auto-wire mecânico no `set_choices` descartado** —
   escolher a saliente é julgamento, não derivação mecânica.
2. **Escopo: ambas as superfícies (Q3 = B).** Tool MCP p/ o agente **e** campo na UI p/ o humano. (As duas
   últimas features foram MCP-only; aqui o usuário pediu explicitamente o caminho humano também.)
3. **Context default global, escopar sob demanda (Q4 = A).** `set_context` entra, mas o padrão ao fiar é
   **sem context** (atalho global — "deixa mais aberto", como o usuário quer); escopa-se via context só
   quando a keyword é **genérica/reusada** ("Voltar", "Sim/Não") e colidiria. Keyword distintiva fica global.
   Guidance ensina o critério; `validate()` nudga keyword duplicada entre alvos.
4. **UI = 2 campos por opção, abaixo do seletor de alvo (Q5).** Na seção de Escolhas, **sem mexer** no menu
   nem no seletor de alvo que já funcionam: abaixo do `IntentSelect` de cada opção
   ([DetailPanel.tsx:3569-3582](src/components/DetailPanel.tsx#L3569-L3582)) entram **(a)** um campo de
   keyword e **(b)** um checkbox "setar context". O campo de keyword **pré-preenche com a keyword atual do
   alvo** (mostra o estado real, zero adivinhação frágil); checkbox default **OFF**.
5. **`set_keywords` substitui (set honesto) (Q6 = A).** Grava exatamente o que recebe (`keywords = [palavra]`),
   espelhando o verbo "set" de `set_message`/`set_category`. Clobber mitigado: o agente cria alvos com array
   **vazio** (sem clobber) e a UI **pré-preenche** (humano vê e preserva). Multi-keyword gerenciado, se um dia
   precisar, é aditivo (`add_keyword`).

**Faseamento (2 fases, baixo acoplamento — cruzam só nos campos `keywords`/`context`):**
- **Fase 1 — Camada de tools (MCP-first):** funções puras `setKeywords`/`setContext` em [flowTools.ts](src/tools/flowTools.ts)
  + registro em [mcp/server.ts](mcp/server.ts) + guidance + os 3 nudges no `validate()` + unit tests + `mcp:typecheck`.
  **Já entrega o conserto reportado** (menus que o agente empurra) — shippável sozinha (uma versão). Fecha com `/verify` e2e.
- **Fase 2 — UI do `DetailPanel`:** 2 campos por opção ([3569-3582](src/components/DetailPanel.tsx#L3569-L3582)) + escrita
  **cross-intent**. **Reusa os setters puros da Fase 1** (não reimplementa lógica). Dependência unidirecional Fase 1→Fase 2;
  isola o pedaço arriscado (DetailPanel ~3500 linhas) numa sessão própria, com a camada de tools já verde como rede.

**Tools novas (header-field, padrão `set_category`):**
- `set_keywords(node, keywords[])` — substitui o array de palavras-chave do alvo.
- `set_context(node, contextNode | vazio)` — grava `context` = ID da intenção referenciada (intra-fluxo,
  resolve por id/nome); vazio = limpa (desmarcar o checkbox).
- Registrar ambas em [mcp/server.ts](mcp/server.ts) + citar na linha "Trabalho típico"; 11→13 tools.

**Tratamentos do caminho infeliz (no `validate()` / sinais leves — todos NÃO-bloqueantes):**
- Opção de menu cujo alvo **não tem keyword** → nudge "não vai rotear" + sinal leve no campo vazio na UI
  (padrão do "opção sem conexão" da v0.19.0).
- **Keyword duplicada entre alvos diferentes** (colisão global) → nudge "unifique ou escope com context".
- **Context apontando p/ alvo que é destino de 2 menus** (conflito impossível — context comporta um só) → nudge.

**Detalhe de implementação mais delicado (registrado):** a escrita é **cross-intent** — os 2 campos do painel
da Escolha **patcheiam o cabeçalho da intenção-alvo** (`keywords`/`context`), não o nó de Escolha. Ao "Aplicar
alterações", o painel passa a mutar **nós irmãos**. Factível no modelo fonte-de-verdade (cada nó guarda seu `raw`),
mas é onde mora o risco no `DetailPanel` (~3500 linhas, arquivo mais arriscado).

**Como será testado:**
- **Unit** ([flowTools.test.ts](src/tools/flowTools.test.ts)): `set_keywords` grava/substitui · nó inexistente → erro ·
  `set_context` grava ID e **limpa** ao receber vazio · resolve alvo por id/nome intra-fluxo. Nudges: alvo sem
  keyword **dispara** · keyword duplicada **dispara** · context conflitante **dispara** · tudo **não-bloqueante**.
- **`mcp:typecheck`** limpo (registro das 2 tools + zod).
- **UI** ([DetailPanel.tsx:3569](src/components/DetailPanel.tsx#L3569)): campo pré-preenche com a keyword do alvo ·
  "Aplicar" patcheia o **alvo** (cross-intent) · campo vazio sinaliza.
- **`/verify` e2e pela caixinha (critério de aceite):** prompt "menu com Financeiro, Suporte e Vendas" → cada
  alvo recebe **keyword saliente** (`financeiro`/`suporte`/`vendas`), `choices[]` ainda gravado (não regride), e o
  menu **roteia** ao empurrar p/ a plataforma.

**Riscos/pendências:**
- Escrita cross-intent no `DetailPanel` (item acima) — fatiar a parte UI com cuidado; é o maior risco.
- `set_keywords` substitui → clobber, mitigado por array-vazio (agente) + pré-preenche (UI).
- Casamento "contém" → keyword genérica colide globalmente; mitigado por guidance (distintiva→global,
  genérica→context) + nudge de duplicata.

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

- **v0.30.0 (PR #5, merge `53b3b19`)** — Chat UX: textarea auto-expand + pill zinc + widget draggable
- **v0.30.0 (PR #5, merge `53b3b19`)** — Gate da caixinha de chat (lock + popover de requisitos pendentes)
- **(merge `15cbf54`, PR #5)** — Caixinha de chat na página: PoC local do agente (Claude Agent SDK + ponte WS)
- **(merge `15cbf54`)** — Tool `set_message`: texto TEXT do `defaultNode` (0→cria, 1→sobrescreve, N>1→erro)
- **(merge `15cbf54`)** — Spike MCP: Fases 1/3/4/4b (camada de tools, servidor MCP stdio, 8 resolvers nome→ID, set_menu + connect_to_bot)
- **(merge `e701026`)** — Fase 2: centralizar `NODE_CATALOG` (fonte única kind-level; MCP deriva o manifesto)
- **v0.27.0** — Nó Captura CSAT editável (dropdown "Tipo de captura CSAT")
- **v0.26.0** — Nó Pedido editável (dropdown "Tipo de ação": Adicionar item / Gerar pedido)
- **masterFlow.json** — fluxo de exemplo canônico, Partes 1–12 (42 intenções) — fixture viva em `public/masterFlow.json`
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
