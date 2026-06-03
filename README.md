# Flow Viewer

Visualizador de fluxos de chatbot a partir de JSON. Cole ou importe o JSON de configuração do bot e veja o fluxograma gerado automaticamente com layout hierárquico.

---

## Funcionalidades

- Geração automática de fluxograma a partir de JSON
- Layout hierárquico top-down calculado pelo [Dagre](https://github.com/dagrejs/dagre)
- 10 tipos de nó com cores distintas (veja tabela abaixo)
- Rótulos nas arestas com o texto dos botões de escolha
- Zoom, pan e minimapa interativos
- Controle de espaçamento entre nós (botões `−` / `+` no canto superior direito)
- Exportação do fluxo completo em **PNG** (2400×1600) e **SVG** (vetor)
- Input via textarea (colar JSON) ou upload de arquivo `.json`

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

---

## Instalação e uso

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev

# Build de produção
npm run build
```

O servidor sobe em `http://localhost:5173`.

---

## Como usar

1. **Cole** o JSON no painel esquerdo ou clique em **Importar .json** para carregar um arquivo
   > Três arquivos de exemplo estão disponíveis na raiz do projeto: `sample01.json` (12 nós), `sample02.json` (159 nós) e `sample03.json` (141 nós)
2. Clique em **Gerar Fluxo** (ou `Ctrl+Enter`)
3. Use scroll para zoom e arraste para navegar pelo fluxo
4. Use os botões **−** / **+** no canto superior direito para ajustar o espaçamento entre os nós
5. Para exportar, clique em **PNG** ou **SVG** no mesmo painel do canto superior direito

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
| `"endConversation"` | Encerra a conversa | Vermelho escuro |
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
├── utils/
│   └── parseFlow.ts            Converte JSON → nodes + edges + layout Dagre
├── components/
│   ├── FlowCanvas.tsx          Canvas React Flow com todos os providers
│   ├── JsonInput.tsx           Painel de entrada (textarea, upload, legenda)
│   ├── ExportControls.tsx      Botões de exportação PNG/SVG e controle de espaçamento
│   └── nodes/
│       ├── StartNode.tsx           Nó de início (verde)
│       ├── ChoiceNode.tsx          Nó de escolha com botões (azul)
│       ├── CaptureNode.tsx         Nó de captura de dados (roxo)
│       ├── TransferNode.tsx        Nó de transferência para atendente (vermelho)
│       ├── WaitNode.tsx            Nó de espera por interação (ciano)
│       ├── SetDataNode.tsx         Nó de atribuição de variáveis (índigo)
│       ├── ExternalBotNode.tsx     Nó de redirecionamento externo (âmbar)
│       ├── EndConversationNode.tsx Nó de encerramento de conversa (vermelho escuro)
│       ├── ApiCallNode.tsx         Nó de chamada de API externa (verde-azulado)
│       └── DefaultNode.tsx         Nó padrão (cinza)
├── App.tsx                     Layout principal e gerenciamento de estado
└── main.tsx                    Entry point
```

### Fluxo de dados

```
JSON (textarea / arquivo)
  └─▶ parseFlow(json, spacing?)
        ├─▶ getNodeKind()        detecta tipo de cada nó
        ├─▶ extrai arestas       via action.choices ou next.intent.id
        └─▶ dagreLayout()        calcula posições x/y com ranksep/nodesep configuráveis
              └─▶ ReactFlow      renderiza canvas interativo
                    └─▶ ExportControls  exportação PNG/SVG + controle de espaçamento
```

---

## Tipos de nó

| Cor | Tipo | Condição de detecção |
|---|---|---|
| Verde | Início | `category === "start"` |
| Vermelho | Transferência | Qualquer condição com `action.type === "transfer"` |
| Ciano | Espera | Qualquer condição com `action.type === "waitForInteraction"` |
| Azul | Escolha | Qualquer condição com `action.type === "choice"` |
| Roxo | Captura | Qualquer condição com `action.type === "captureData"` |
| Índigo | Atribuição | Qualquer condição com `action.type === "setData"` |
| Vermelho escuro | Encerramento | Qualquer condição com `action.type === "endConversation"` |
| Verde-azulado | API externa | Qualquer condição com `action.type === "external"` |
| Âmbar | Bot externo | Nó gerado para redirecionamentos a outro botId |
| Cinza | Padrão | Demais casos |

A prioridade de detecção é: **Início > Transferência > Espera > Escolha > Captura > Atribuição > Encerramento > API > Padrão**.
