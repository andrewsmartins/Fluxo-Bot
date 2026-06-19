# Fluxo Bot

Editor visual de fluxos de chatbot OmniChat. Importe o JSON do bot (ou crie um fluxo do zero a partir do botId), edite nós, conexões e conteúdo no canvas, e exporte de volta no formato aceito pela plataforma.

> 📖 **[Guia de uso](docs/GUIA-DE-USO.md)** — passo a passo de todas as features, do import ao push para o rascunho do bot.

---

## Funcionalidades

### Visualização
- Geração automática de fluxograma a partir do JSON do bot
- Layout hierárquico top-down calculado pelo [Dagre](https://github.com/dagrejs/dagre), com controle de espaçamento (botões recolher/expandir no pill de controles, à direita do zoom)
- **Modelo B** — um nó por **condição**, tipado pela ação dela; intenções com 2+ condições viram um **grupo** (container) com os nós-condição como filhos; cada um dos 11 `ActionType` da plataforma tem nó dedicado
- 13 tipos de nó com cores distintas (veja [Tipos de nó](#tipos-de-nó))
- Arestas tipadas: **fluxo** (cinza, com tag de rótulo + botão de remover), **contexto** (tracejada violeta) e **redirect a outro bot** (âmbar, animada)
- Zoom, pan e minimapa interativos; **dark mode** completo (toggle sol/lua salvo em `localStorage`)

### Edição
- **Criação de nós** — paleta no canto superior esquerdo (grupos **Fluxo** e **Avançado**): arraste um dos 11 tipos para o canvas e crie uma intenção nova com template canônico; soltar **sobre um nó existente** adiciona o tipo como **nova condição** daquela intenção (vira grupo)
- **Edição de conexões** — arraste a ponta de destino de uma aresta para outra intenção; conecte arrastando do handle inferior; remova pela **tag "×"** da aresta ou com Delete/Backspace; o JSON subjacente é atualizado (`next.intent` ou `action.choices`)
- **Edição de conteúdo** — o painel abre em modo conforme o nó: **grupo** (meta da intenção: nome, categoria, palavras-chave, prioridade, contexto + lista de condições), **condição** (gatilho, mensagens, botões e ação só daquela condição) ou **nó solto** (editor completo); **Aplicar alterações** grava no modelo. Os campos espelham o construtor da plataforma: **nome** em `mixed_snake_case` (espaço vira `_`, sem acento/símbolo), **categoria** como combobox ("Sem Categoria" por padrão, sugere as existentes e cria novas), **palavras-chave** como tags (Enter cria, "×" remove)
- **Campos por tipo de condição** — "O contexto é igual a" abre **Intenção** + **Contexto** (seletores de intenções); "A última intenção foi" abre **Intenção**; "O valor está vazio"/"O valor existe", "Valor é igual a", "O valor contém", "Total é maior que" e "Total é igual a" abrem o campo **Variável** com um **picker de `@`** em 3 níveis (Categoria → Variável → Modificador) que exibe rótulos legíveis ("Loja › Número (Só dígitos)") e grava a variável crua. O operando varia: "Valor é igual a" tem **Valor** (texto livre); "O valor contém" tem **Valores** (lista de tags, igual às palavras-chave, gravada em `values`); "Total é maior que"/"Total é igual a" têm **Total** (campo numérico com −/+, começa em 0 e aceita negativos, gravado em `valueNumber`)
- **Respostas (mensagens)** — botão **"+ Adicionar Resposta"** cria **Texto**, **Imagem**, **PDF** ou **Vídeo**; mídia aceita **URL manual** ou **upload** direto para a OmniChat (presigned S3, requer token de sessão)
- **Menu Botão/Lista (nó de Escolha)** — seção **"Menu"** monta a mensagem interativa: moldura (Título/Corpo/Rodapé/Título botão opções) + itens. *Sem descrição*: 1-3 itens viram **botões de resposta**, 4-10 viram **lista**; *com descrição*: sempre lista, cada item com descrição. A seção **"Escolhas"** liga os itens a intenções-destino **pela ordem** (`action.choices`); nem todo item precisa de destino (pode transitar por palavra-chave). Conectar uma **opção livre pelo canvas** cria a escolha automaticamente
- **Duplicação de nós** — **Ctrl+arrastar** um nó-intenção (solto ou grupo) cria uma intenção nova no ponto do drop; no painel, **"Duplicar Condição"** copia a condição na mesma intenção e **"Duplicar Intenção"** gera uma intenção nova (os dois botões ficam lado a lado quando ambos se aplicam). Cópias são fiéis (conexões de saída preservadas, IDs de botão regenerados); o início nunca é duplicado
- **Exclusão de intenções** — botão no painel ou tecla Delete; todas as referências de entrada são limpas automaticamente
- **Undo/redo** — **Ctrl+Z** desfaz e **Ctrl+Shift+Z** / **Ctrl+Y** refazem qualquer edição (botões ↶ ↷ na toolbar); histórico de até 30 passos
- O nó de **início** (`category: "start"`) é somente-leitura no painel; a conexão de saída dele continua editável no canvas

### Entrada e saída
- Input via **modal de importação** (colar JSON da aba Network ou upload de `.json`) ou **Novo fluxo** a partir do botId
- **Validação no export** — erros estruturais bloqueiam o download; inconsistências prováveis aparecem como aviso (indicador vivo na toolbar)
- **Exportação JSON** — baixa o fluxo (com as edições) no formato `{ "list": [...] }` aceito pela plataforma, preservando todos os campos não editados (*preserve-and-patch*)
- **Exportação de imagem** — PNG e SVG do fluxo completo, com dimensões calculadas pelos bounds reais dos nós

### Sincronização com a plataforma
- **Push (UI)** — botão **Enviar** envia o fluxo para o **rascunho** do bot direto do navegador, com remapeamento automático de IDs em 2 passadas; guardrails: token só em memória, confirmação do botId, trava de bot de testes, dry-run e backup baixado antes do envio; a publicação continua manual na plataforma
- **Restaurar backup (UI)** — botão **Restaurar** sobe um backup `.json` e restaura o bot ao estado do arquivo (exclui o excedente, recria o que falta com remap e sobrescreve o resto), baixando um snapshot de segurança antes
- **Push/restore via CLI** — `scripts/push-flow.mjs` e `scripts/rollback-bot.mjs` para uso em lote/auditável (mesma lógica do `pushFlow.ts`/`restoreFlow.ts`), com dry-run por padrão e backup automático

---

## Stack

| Lib | Uso |
|---|---|
| [React 18](https://react.dev) + [Vite](https://vitejs.dev) | Framework e bundler |
| [TypeScript](https://www.typescriptlang.org) | Tipagem estática |
| [@xyflow/react](https://reactflow.dev) | Canvas interativo do fluxograma |
| [Dagre](https://github.com/dagrejs/dagre) | Algoritmo de layout automático |
| [html-to-image](https://github.com/bubkoo/html-to-image) | Exportação PNG/SVG |
| [Tailwind CSS](https://tailwindcss.com) | Estilização |
| [Vitest](https://vitest.dev) | Testes unitários |
| [Playwright](https://playwright.dev) | Smoke tests no browser (`scripts/smoke-*.mjs`) |

---

## Instalação e uso

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Build de produção
npm run build

# Testes (Vitest)
npm test
```

O servidor sobe em `http://localhost:5173`.

> 🧪 **[Testes automatizados](docs/TESTES-AUTOMATIZADOS.md)** — os 251 testes unitários e os 15 smokes documentados, com o que cada um cobre.

---

## Como usar

1. **Importar** (toolbar) abre o modal: cole o JSON do bot (resposta da aba Network) ou carregue um arquivo `.json`, e clique em **Gerar fluxo** (`Ctrl+Enter`) — ou use **Novo fluxo** informando o botId para começar do zero
   > Arquivos de exemplo em `samples/` (não versionados — dados reais): `sample01.json` (12 nós), `sample02.json` (159 nós) e `sample03.json` (141 nós)
2. Use scroll para zoom e arraste para navegar; no pill de controles (rodapé), à direita do zoom, os botões de recolher/expandir ajustam o espaçamento do layout
3. Para **criar** um nó, arraste um tipo da paleta (canto superior esquerdo) até a posição desejada
4. Para **conectar**, arraste do handle inferior de um nó até outro nó; para **reconectar**, arraste a ponta de destino (seta) de uma aresta — conexões para outros bots não são editáveis
5. Para **editar conteúdo**, clique no nó e use o painel à direita (Aplicar alterações grava no modelo)
6. Para **duplicar**, segure **Ctrl e arraste** um nó-intenção (cópia no ponto do drop), ou use os botões **Duplicar** no painel
7. Para **excluir**, selecione nó ou aresta e pressione Delete, ou use o botão no painel
8. **Ctrl+Z** desfaz e **Ctrl+Shift+Z** refaz qualquer edição (botões ↶ ↷ na toolbar)
9. O **indicador de validação** na toolbar mostra erros/avisos do fluxo em tempo real (clique para ver a lista)
10. **Exportar** (toolbar) baixa o **JSON** no formato da plataforma (com todas as edições) ou imagem **PNG**/**SVG**

---

## Estrutura do JSON esperado

O JSON deve ter uma propriedade `list` contendo um array de intents (nós do bot):

```json
{
  "list": [
    {
      "id": "string",
      "name": "string",
      "category": "string",
      "botId": "string",
      "keywords": ["string"],
      "priority": 0,
      "conditions": [ ... ]
    }
  ]
}
```

### Nó de início

O nó raiz do fluxo deve ter `"category": "start"`. Apenas um por fluxo.

### Conditions

Cada intent contém um array `conditions` que define tanto as **mensagens que o bot envia** quanto as **transições para o próximo nó**.

```json
{
  "name": "Condição Padrão",
  "type": "any",
  "variable": null,
  "action": { ... },
  "assistant_says": [ ... ],
  "next": { ... }
}
```

| Campo | Descrição |
|---|---|
| `type` | Tipo da condição: `"any"`, `"exists"` (variável existe), `"else"` (fallback) |
| `variable` | Variável verificada quando `type === "exists"` |
| `action` | Ação executada quando a condição é ativada |
| `assistant_says` | Mensagens que o bot envia |
| `next` | Para onde o fluxo avança |

### action.type

| Valor | Comportamento | Nó renderizado |
|---|---|---|
| `"choice"` | Apresenta botões de escolha ao usuário | Azul |
| `"captureData"` | Captura um dado do usuário (nome, CEP, etc.) | Roxo |
| `"transfer"` | Transfere a conversa para um atendente humano | Vermelho |
| `"waitForInteraction"` | Aguarda interação do usuário sem capturar dado | Ciano |
| `"setData"` | Atribui valor a uma ou mais variáveis | Índigo |
| `"endConversation"` | Encerra a conversa | Grafite |
| `"external"` | Chama uma API externa | Verde-azulado |
| `"none"` | Sem ação, apenas avança para o próximo nó | Cinza |

### Transições entre nós

Há duas formas de definir o próximo nó:

**Via `action.choices`** — usado quando `action.type === "choice"`. Lista de IDs dos próximos intents, na mesma ordem dos botões em `assistant_says`:

```json
"action": {
  "type": "choice",
  "choices": ["id-do-no-a", "id-do-no-b"]
}
```

**Via `next.intent.id`** — usado para transições diretas (captureData, none, etc.):

```json
"next": {
  "type": "context",
  "intent": {
    "botId": "...",
    "id": "id-do-proximo-no"
  }
}
```

### Mensagens (`assistant_says`)

```json
"assistant_says": [
  {
    "channel": "any",
    "messages": [
      {
        "type": "TEXT",
        "content": "Olá! Qual é o seu nome?"
      },
      {
        "type": "BUTTON",
        "messageConfig": {
          "body": "Selecione uma opção:",
          "buttons": [
            { "id": "uuid", "text": "Opção 1", "description": null },
            { "id": "uuid", "text": "Opção 2", "description": null }
          ]
        }
      }
    ]
  }
]
```

| Tipo | Campo de conteúdo |
|---|---|
| `TEXT` | `content` — texto da mensagem (suporta variáveis como `@customer.name`) |
| `BUTTON` | `messageConfig.body` — texto principal; `messageConfig.buttons` — lista de opções |

---

## Estrutura do projeto

```
src/
├── types.ts                    Interfaces TypeScript do JSON do bot
├── App.tsx                     Layout principal, estado dos nós e undo/redo
├── main.tsx                    Entry point
├── contexts/
│   └── ThemeContext.tsx        Distribui isDark via React Context (dark mode)
├── utils/
│   ├── parseFlow.ts            Converte JSON → nodes + edges + layout Dagre (Modelo B)
│   ├── nodeMeta.ts             Mapa ActionType→nó, rótulos de gatilho e prioridade
│   ├── editFlow.ts             Reconectar/conectar/deletar arestas + serializar fluxo
│   ├── editIntent.ts           Patches de conteúdo do intent (mensagens, botões, ação)
│   ├── intentTemplates.ts      Templates canônicos por tipo (criação de nó/condição)
│   ├── duplicate.ts            Duplicação de intenção/condição (clone fiel + regen de IDs)
│   ├── variables.ts            Catálogo de variáveis da plataforma (picker de @, rótulos legíveis)
│   ├── validateFlow.ts         Validação no export (erros bloqueiam, avisos informam)
│   ├── exportImage.ts          Exportação PNG/SVG (bounds reais, ciente de grupos)
│   ├── history.ts              Pilha de undo/redo (até 30 snapshots)
│   ├── pushFlow.ts             Núcleo do push para o rascunho (2 passadas + remap)
│   └── restoreFlow.ts          Restauração a partir de backup (deletar→recriar→sobrescrever)
├── components/
│   ├── TopBar.tsx              Toolbar: importar, exportar, enviar, restaurar, undo/redo, validação
│   ├── FlowCanvas.tsx          Canvas React Flow com todos os providers
│   ├── OmniWatermark.tsx       Marca-d'água da logo Omni no fundo (sutil, segue o tema)
│   ├── NodePalette.tsx         Paleta de criação (grupos Fluxo / Avançado)
│   ├── DetailPanel.tsx         Painel de edição (modos: grupo / condição / solo / read-only)
│   ├── ImportDialog.tsx        Modal de importação (colar JSON / upload)
│   ├── NewFlowDialog.tsx       Modal "Novo fluxo" (a partir do botId)
│   ├── PushDialog.tsx          Diálogo de envio ao rascunho (guardrails + dry-run)
│   ├── RestoreDialog.tsx       Diálogo de restauração de backup
│   ├── Toast.tsx               Toasts de erro/aviso no rodapé do canvas
│   ├── ThemeToggle.tsx         Botão sol/lua do dark mode
│   ├── edges/
│   │   └── DeletableEdge.tsx       Aresta de fluxo com tag (rótulo + botão "×")
│   └── nodes/
│       ├── IntentGroupNode.tsx     Container de intenção com 2+ condições (Modelo B)
│       ├── StartNode.tsx           Início (verde)
│       ├── ChoiceNode.tsx          Escolha com botões (azul)
│       ├── CaptureNode.tsx         Captura de dados (roxo)
│       ├── TransferNode.tsx        Transferência para atendente (vermelho)
│       ├── WaitNode.tsx            Espera por interação (ciano)
│       ├── SetDataNode.tsx         Atribuição de variáveis (índigo)
│       ├── EndNode.tsx             Encerramento de conversa (grafite)
│       ├── ApiCallNode.tsx         Chamada de API externa (verde-azulado)
│       ├── OrderNode.tsx           Pedido (laranja)
│       ├── CsatNode.tsx            Captura CSAT (rosa)
│       ├── StoreNode.tsx           Loja física (verde-limão)
│       ├── ExternalBotNode.tsx     Redirecionamento a outro bot (âmbar)
│       └── DefaultNode.tsx         Mensagem / encadeamento sem ação (fuchsia)
└── scripts/                    CLIs e smoke tests (push, rollback, smoke-phase*.mjs)
```

### Fluxo de dados

```
JSON (modal de importação / arquivo / Novo fluxo)
  └─▶ parseFlow(json, spacing?)
        ├─▶ um nó por condição    tipado por actionToNodeKind() (Modelo B)
        ├─▶ agrupa por intenção    2+ condições → intentGroupNode + filhos
        ├─▶ extrai arestas         fluxo (choices/next), contexto e redirect externo
        └─▶ dagreLayout()          posiciona os nós-macro (ranksep/nodesep configuráveis)
              └─▶ ReactFlow        canvas interativo (edição in-place)
                    ├─▶ serializeFlow()   JSON de volta (preserve-and-patch)
                    ├─▶ exportImage()     PNG/SVG (bounds reais)
                    └─▶ pushFlow()        envio ao rascunho da plataforma
```

---

## Tipos de nó

No **Modelo B**, cada **condição** vira um nó, tipado pela `action` dela (`actionToNodeKind` em [src/utils/nodeMeta.ts](src/utils/nodeMeta.ts)). Os 11 `ActionType` da plataforma têm nó dedicado, além do nó de início, do redirect a outro bot e do container de grupo.

| Cor | Tipo | Detecção (`action.type`) |
|---|---|---|
| Verde | Início | `category === "start"` da intenção |
| Azul | Escolha | `choice` |
| Roxo | Captura | `captureData` |
| Vermelho | Transferência | `transfer` |
| Ciano | Espera | `waitForInteraction` |
| Índigo | Atribuição | `setData` |
| Grafite | Encerramento | `endConversation` |
| Verde-azulado | Chamada de API | `external` |
| Laranja | Pedido | `order` |
| Rosa | Captura CSAT | `captureCsat` |
| Verde-limão | Loja física | `store` |
| Cinza | Padrão | `none` ou ação ausente (só mensagens / encadeamento) |
| Âmbar | Bot externo | nó sintético gerado para redirecionamentos a outro botId |
| — | Grupo de intenção | container de uma intenção com 2+ condições (`intentGroupNode`) |

> **Nota:** a "Chamada de API" (`external`, verde-azulado) é distinta do "Bot externo" (âmbar) — a primeira é uma chamada HTTP; o segundo é redirecionamento para outro bot da plataforma.
