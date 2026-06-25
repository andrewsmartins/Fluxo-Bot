# PLANS.md — FlowViewer: de visualizador a editor de fluxos OmniChat

<!-- HANDOFF:START -->
## 🔄 Handoff — 2026-06-24 (Fase 2 + nó Pedido fechados; sem feature pendente — escolher próximo)

**Foco da próxima sessão:** **escolher o próximo trabalho real** — não há feature pendente. Esta
sessão descobriu que o **nó Pedido já estava implementado e lançado (v0.26.0, commit `5c43d69`,
2026-06-23)**: o handoff anterior apontava-o como "não implementado" por engano. Os docs foram
sincronizados (§"Nó Pedido" movida para o archive; índice e este handoff corrigidos). Candidatos
abertos: (a) **limpeza de branches mergeadas** (decisão pendente, abaixo); (b) **Fase 5 — Produto**
(direcional, **bloqueada** em decisões de produto, ver PLANS §"Fase 5"); (c) **melhorias paralelas**
(`elkjs` no layout, ver §"Melhorias paralelas").

**Onde paramos:** branch **`main`**, em sincronia com `origin/main` (após o commit de sync de docs
desta sessão). Fase 2 (`NODE_CATALOG`) e nó Pedido (v0.26.0) ambos **mergeados na `main`** e verdes.
Refactor da Fase 2 sem mudança de comportamento: fatos kind-level centralizados em
[src/utils/nodeCatalog.ts](src/utils/nodeCatalog.ts); `nodeMeta`/`intentTemplates`/MCP/DetailPanel/paleta
**derivam** dele.

**Fios soltos / meio-feito:** nada de código. **Pendente (decisão do Andy, não respondida):**
**limpeza de branches mergeadas** — opções: (a) só as 3 do ciclo recente (`feat/node-catalog`,
`feat/mcp-tools-spike`, `feat/order-node-editor`, local+remota), (b) varrer TODAS as mergeadas
(**10 locais / 5 remotas** órfãs já em `main` — lista via `git branch --merged main`), ou (c) pular.
**Dívida de doc (fora do escopo do sync):** o `CHANGELOG.md` só tem seções por versão até `[0.14.0]`;
de 0.15→0.27 nada ganhou seção própria (padrão pré-existente, não só o nó Pedido).

**Armadilhas (gotchas — não redescobrir):**
1. **Dois sistemas de label** (decisão da Fase 2): badge/canvas CURTO ("Aguarda", "Variável") vive
   no `KIND_LABELS_LIGHT/DARK` do DetailPanel (Sistema B, +cor=tema, consumidor único); paleta/MCP
   DESCRITIVO ("Aguardar interação", …) é o `label` do `NODE_CATALOG` (Sistema P). NÃO consolidar.
2. **MCP em execução roda o código ANTIGO** (sobe no boot via `.mcp.json`); mudanças nas tools só
   após **reiniciar o Claude Code**. Para testar ao vivo, subir `tsx mcp/server.ts` em processo
   novo via stdio JSON-RPC (caminho **absoluto** `D:/Fluxo/...`); apontar `FLOW_FILE` p/ **cópia
   descartável** se for criar/editar (não tocar `public/masterFlow.json`). Não deixar smoke no repo.
3. **`save()` do MCP normaliza CRLF→LF no `FLOW_FILE`** — diff só de EOL restaura com
   `git checkout -- public/masterFlow.json`.
4. **`git merge` não aceita `-F -` (stdin)** — usar `-m` ou `-F arquivo`.
5. **GUI:** a paleta só aparece depois de carregar/criar fluxo ("Novo fluxo" → "Criar fluxo"); o nó
   de início nasce **sob o painel da paleta** (top-left), que intercepta o clique — fricção de UX
   pré-existente (anotada no `/verify`, candidata a ajuste futuro).
6. **Confiar no git, não no rótulo do handoff** — esta sessão pegou um foco fantasma porque o
   handoff dizia "não implementado" sem cruzar com `git log`. Ao retomar, validar o estado real.

**Próximo passo imediato:** decidir a limpeza de branches (a/b/c acima); depois escolher entre as
frentes abertas (Fase 5 está bloqueada em produto, então provavelmente melhorias paralelas ou uma
nova feature a definir).

**Ponteiros:** Fase 2 no merge `e701026` (commits `ab2b0e5`/`5788e28`/`b290d00`/`086dffb`); nó Pedido
em `5c43d69` (v0.26.0) — plano arquivado em [docs/PLANS-ARCHIVE.md](docs/PLANS-ARCHIVE.md) §"Nó Pedido";
Fase 5 (produto, direcional) em PLANS §"Fase 5"; melhorias em PLANS §"Melhorias paralelas".

**Skills sugeridas ao retomar:** `/interrogar` se for desenhar uma feature nova antes de codar;
`/code-review` antes de commitar; `/verify` para validar UI ao vivo (gotcha 2, processo novo).

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

> **Fases 1, 3, 4 e 4b ✅ concluídas e mergeadas na `main`** (merge `15cbf54`, 2026-06-24).
> Detalhes completos (decisões + resultados) em [docs/PLANS-ARCHIVE.md](docs/PLANS-ARCHIVE.md).
> Seguem vivas abaixo apenas a **Fase 2** (refactor adiado, ainda pendente) e a **Fase 5**
> (produto, direcional).

### Fase 2 — Centralizar `NODE_CATALOG` (refactor/limpeza, com valor próprio)

**Objetivo (1 frase):** criar um único `src/utils/nodeCatalog.ts` (Node-pure) como fonte de
verdade *por tipo de nó*, do qual derivam as constantes hoje duplicadas em ≥4 arquivos, e do
qual o manifesto MCP passa a **derivar** em vez de duplicar à mão.

> Plano fechado por interrogatório (skill `interrogar`) em 2026-06-24. As decisões abaixo
> estão TRAVADAS — não reabrir sem novo interrogatório.

**Verdade espalhada hoje (o alvo):** `NodeKind` [types.ts:130](src/types.ts#L130);
`actionToNodeKind`/`CONDITION_TYPE_LABELS`/`PRIORITY_LABELS` [nodeMeta.ts](src/utils/nodeMeta.ts);
`CREATABLE_KINDS`/`CREATABLE_KIND_LABELS`/`ACTION_TYPE_BY_KIND`(privado)/`ACTION_KINDS_WITH_ERROR`/`buildKindAction`
[intentTemplates.ts](src/utils/intentTemplates.ts); consts inline por tipo no
[DetailPanel.tsx](src/components/DetailPanel.tsx) (`KIND_LABELS_LIGHT/DARK`, `KIND_OPTIONS`,
`STORE_ACTIONS`, `ORDER_ACTIONS`, `EXTERNAL_TYPES`, `TRANSFER_*`); manifesto hand-written
[mcp/nodeCatalog.ts](mcp/nodeCatalog.ts).

**Decisões (com o porquê):**
1. **Catálogo MAGRO, kind-level (Opção A).** Absorve só fatos *por tipo de nó*: `label`,
   `actionType`, `creatable`, `hasError`, `summary`, `fields`. Os sub-enums internos
   (`TRANSFER_*`, `STORE_ACTIONS`, `CAPTURE_FIELDS`, …) **NÃO** entram — já são fontes únicas
   locais bem-comportadas, com um só consumidor. O valor que paga tocar o arquivo de 383
   testes é (a) o MCP **derivar** o manifesto (hoje hand-written → diverge silenciosamente) e
   (b) matar a duplicação do enum-de-tipos+label (repetido em 3 lugares). Catálogo gordo seria
   consolidar o que não está espalhado.
2. **`src/utils/nodeCatalog.ts`, Node-pure; cor/ícones FORA.** O `mcp/` importa o catálogo e
   roda em Node sem DOM ⇒ catálogo = só domínio. `color` (Tailwind, light/dark) é tema → fica
   num mapa de tema à parte chaveado por `NodeKind` (regra de ouro do dark-mode: tema separado
   da estrutura). `label` é domínio e compartilhável; `color` não.
3. **Rename `mcp/nodeCatalog.ts` → `mcp/nodeManifest.ts`** para não colidir com o novo
   `src/utils/nodeCatalog.ts`. O de mcp vira derivador fino + formatador (`manifest`/`describeNodeType`).
4. **Catálogo chaveado pelos 11 `CreatableKind` (uniforme, sem union).** Descoberta no início
   do commit 1: existem **dois sistemas de label distintos**, não uma duplicação —
   **(P) paleta/descritivo** (`CREATABLE_KIND_LABELS`, 11 criáveis, ex.: "Aguardar interação",
   "Editar informação", "Encerrar conversa", "Chamada de API", "Captura CSAT"), duplicado entre
   intentTemplates → DetailPanel `KIND_OPTIONS` → MCP; e **(B) badge/canvas** (`KIND_LABELS_LIGHT/DARK`,
   16 kinds, label CURTO + cor, ex.: "Aguarda", "Variável", "Terminar", "Chamada API", "CSAT"),
   com **consumidor único** (a badge do DetailPanel). Unificar num só label mudaria a UI (viola o
   gate). Logo: **o catálogo serve só o Sistema P** (label descritivo) + actionType/hasError/summary/fields,
   chaveado pelos 11 `CreatableKind`. **O Sistema B (badge curto + cor) permanece no DetailPanel**
   como mapa de tema por `NodeKind` (mesma lógica da decisão 2 + consumidor-único dos sub-enums).
   `actionToNodeKind` nunca retorna start/externalBot/intentGroup (vêm de detecção estrutural),
   então 11 kinds bastam. **Efeito:** o commit 3 (DetailPanel) encolhe — `KIND_OPTIONS` deriva de
   graça via decisão 1; a badge nem muda.
5. **`buildKindAction` PERMANECE em `intentTemplates.ts`.** O catálogo absorve só dados puros
   (label, actionType); `actionToNodeKind`, `CREATABLE_KINDS`, `CREATABLE_KIND_LABELS`,
   `ACTION_KINDS_WITH_ERROR` (→ campo `hasError`) passam a **derivar** do catálogo, com os
   exports/assinaturas **preservados**. Os `if (kind===…)` do `buildKindAction` são lógica de
   inicialização, não tabela — declarativizá-los arrisca os testes de template sem ganho.

**Plano de migração (incremental, 4 commits, `npm test` verde como gate entre cada um):**
1. Criar `nodeCatalog.ts` + re-derivar as constantes antigas *nos arquivos atuais* (`nodeMeta`,
   `intentTemplates`), **sem mudar exports/assinaturas**. Suíte verde prova derivação fiel.
2. Apontar `mcp/nodeManifest.ts` (rename) para o catálogo; `mcp:typecheck` + smoke efêmero.
3. **DetailPanel** (commit isolado — o arriscado): trocar `KIND_LABELS_*`/`KIND_OPTIONS` pela
   leitura do catálogo (label do catálogo; cor do tema à parte). Vermelho aqui aponta direto.
4. Limpeza: remover consts mortas; conferir zero duplicação remanescente.

**Como será testado:** os 383 testes são o gate primário (consomem labels/options/defaults via
exports preservados). **Antes do commit 3**, verificar se há cobertura de render das badges/labels
do DetailPanel; se não houver, adicionar âncora mínima "catálogo → label renderizado" para a rede
de segurança não depender só de leitura manual. Fallback defensivo de label/cor (`catalog[kind]?.label ?? kind`)
preservado igual a hoje.

**Riscos/dívida nomeada:**
- **Sub-enums adiados (divergência descritiva MCP↔DetailPanel nos valores de campo).** Aceita
  enquanto o MCP usa `fields` só como prosa-dica. **Gatilho para voltar:** quando o MCP for
  **validar/enumerar valores de campo** (ex.: `set_action_field` rejeitar `transferType` inválido),
  provável na Fase 5 — aí consolidar TODOS de uma vez (inclusive `TRANSFER_*`, que é máquina de
  estado de UI de 2 níveis, mini-refactor à parte) com escopo e teste próprios.
- Anti-corrupção de `<option>` legado (`storeType`/`orderType`/`condType` desconhecidos) vive
  nos sub-enums ⇒ **fora do escopo, não tocar**.

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
- O refactor do `NODE_CATALOG` (Fase 2) arrisca os 383 testes do DetailPanel — por isso
  adiado para pós-spike e feito com a suíte verde como gate.

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

- **(merge `15cbf54`)** — Spike MCP: Fases 1/3/4/4b (camada de tools, servidor MCP stdio, 8 resolvers nome→ID, set_menu + connect_to_bot)
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
