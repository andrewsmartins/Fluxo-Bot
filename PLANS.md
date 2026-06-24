# PLANS.md — FlowViewer: de visualizador a editor de fluxos OmniChat

<!-- HANDOFF:START -->
## 🔄 Handoff — 2026-06-24 (merge da spike concluído)

**Foco da próxima sessão:** **escolher e iniciar o próximo trabalho** — os dois candidatos
naturais são (A) **Fase 2 (`NODE_CATALOG`)**, o refactor adiado que toca o DetailPanel (~3500
linhas, 383 testes) — `/interrogar` antes, suíte verde como gate; ou (B) **editor do nó Pedido**
(planejado em §"Nó Pedido", **não** implementado — espelho do CSAT já entregue). A spike MCP
está **fechada e na `main`**; não há mais nada pendente dela.

**Onde paramos:** branch **`main`**, **working tree LIMPO** e **sincronizada com `origin/main`**.
A `feat/mcp-tools-spike` foi **mergeada na `main`** (merge `15cbf54`, `--no-ff`, push feito) — traz
a spike MCP completa (Fases 1/3/4/4b: camada de tools, servidor MCP stdio, 8 resolvers nome→ID,
`set_menu`/`connect_to_bot`) **e**, de bônus, os threads ortogonais que estavam pendentes:
masterFlow Partes 11/12 e o editor Captura CSAT (v0.27.0). Gate antes do merge: **435 testes
verdes**, `tsc` app e `mcp:typecheck` limpos. PLANS.md arquivado (Fases 1/3/4/4b + CSAT + masterFlow
migraram verbatim para [docs/PLANS-ARCHIVE.md](docs/PLANS-ARCHIVE.md)).

**Fios soltos / meio-feito:** nada de código. **Limpeza pendente (opcional):** as branches
`feat/mcp-tools-spike` e `feat/order-node-editor` (esta 100% contida na spike) já estão na `main`
— podem ser deletadas (local + remota) quando quiser.

**Armadilhas (gotchas — não redescobrir):**
1. **MCP em execução roda o código ANTIGO.** O servidor MCP sobe no boot do Claude Code via
   `.mcp.json`; mudanças nas tools **só aparecem após reiniciar o Claude Code**. Smoke de tools
   recém-mexidas: via `tsx` efêmero (funções reais), não via MCP ao vivo.
2. **`save()` do MCP normaliza CRLF→LF no `FLOW_FILE`** (`public/masterFlow.json`). Rodar prova
   via MCP deixa diff **só de EOL** — restaurar com `git checkout -- public/masterFlow.json`.
3. **smoke efêmero:** não deixar `_smoke-*.ts` no repo. Boilerplate de token/fetch para reusar:
   [scripts/smoke-phase4-resolvers.ts](scripts/smoke-phase4-resolvers.ts).
4. **`git merge` não aceita `-F -` (stdin)** como o `git commit` aceita — usar `-m` ou `-F arquivo`.

**Próximo passo imediato:** perguntar ao Andy **A (Fase 2) ou B (nó Pedido)**. Se **A**:
`/interrogar` a Fase 2 antes de tocar o DetailPanel, suíte verde como gate. Se **B**: seguir o
plano já fechado em §"Nó Pedido" (mirror da `StoreActionSection`, unitário sem Playwright).

**Ponteiros:** merge `15cbf54` na `main`; PLANS §"Fase 2" e §"Nó Pedido" (planos vivos);
spike arquivada em [docs/PLANS-ARCHIVE.md](docs/PLANS-ARCHIVE.md) (Fases 1/3/4/4b + CSAT + masterFlow).

**Skills sugeridas ao retomar:** `/interrogar` antes da Fase 2 (refactor arriscado) ou do nó
Pedido; `/code-review` antes de qualquer commit novo; `/verify` se for validar o MCP ao vivo
(lembrar do reinício, gotcha 1).

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

**Objetivo:** consolidar a verdade hoje espalhada (NodeKind [types.ts:130](src/types.ts#L130),
`actionToNodeKind` [nodeMeta.ts](src/utils/nodeMeta.ts), defaults
[intentTemplates.ts](src/utils/intentTemplates.ts)/[captureFields.ts](src/utils/captureFields.ts),
const do [DetailPanel.tsx](src/components/DetailPanel.tsx)) num único `NODE_CATALOG`. Alimenta
o DetailPanel (limpeza com valor próprio) **e** o manifesto enxuto + `describe_node_type` da
Fase 3 (já entregue à mão, mínimo — esta fase vira a fonte derivada).

**Por que depois do spike:** toca o arquivo mais arriscado (DetailPanel, 383 testes) — só
pagar esse custo depois que o spike provar que o caminho agente/MCP entrega valor (provado).
No spike, o manifesto/catálogo foi escrito **à mão, mínimo** ([mcp/nodeCatalog.ts](mcp/nodeCatalog.ts));
esta fase vira a fonte derivada. Gate: suíte verde antes e depois.

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
