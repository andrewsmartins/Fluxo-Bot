# Fluxo Bot

Editor visual de fluxos de chatbot OmniChat. Importe o JSON do bot (ou crie um fluxo do zero a partir do botId), edite nós, conexões e conteúdo no canvas, e exporte de volta no formato aceito pela plataforma.

---

## Funcionalidades

- Geração automática de fluxograma a partir de JSON
- Layout hierárquico top-down calculado pelo [Dagre](https://github.com/dagrejs/dagre)
- 10 tipos de nó com cores distintas (veja tabela abaixo)
- Rótulos nas arestas com o texto dos botões de escolha
- Zoom, pan e minimapa interativos
- Controle de espaçamento entre nós (botões `−` / `+` no canto superior direito)
- Exportação do fluxo completo em **PNG** e **SVG** com dimensões calculadas pelos bounds reais dos nós
- **Criação de nós** — paleta no canto superior esquerdo: arraste um tipo (Mensagem, Escolha, Captura, Transferência, Espera, Definir dados) para o canvas para criar uma intenção nova com template canônico
- **Edição de conexões** — arraste a ponta de destino de uma aresta para outra intenção; conecte nós arrastando do handle inferior; delete arestas com Delete/Backspace; o JSON subjacente é atualizado (`next.intent` ou `action.choices`)
- **Edição de conteúdo** — clique num nó para abrir o painel: edite nome, categoria, keywords, mensagens, botões (adicionar/remover, com sincronia automática das escolhas), condições, transferência, captura e variáveis; **Aplicar alterações** grava no modelo
- **Exclusão de intenções** — botão no painel ou tecla Delete; todas as referências de entrada são limpas automaticamente
- **Validação no export** — erros estruturais bloqueiam o download; inconsistências prováveis aparecem como aviso
- **Exportação JSON** — baixa o fluxo (com as edições) no mesmo formato `{ "list": [...] }` aceito pela plataforma, preservando todos os campos não editados
- **Dark mode** completo — toggle sol/lua na sidebar altera sidebar, nodes, painéis e canvas simultaneamente; preferência salva em `localStorage`
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

# Testes (Vitest)
npm test
```

O servidor sobe em `http://localhost:5173`.

---

## Como usar

1. **Importar** (toolbar) abre o modal: cole o JSON do bot (resposta da aba Network) ou carregue um arquivo `.json`, e clique em **Gerar fluxo** (`Ctrl+Enter`) — ou use **Novo fluxo** informando o botId para começar do zero
   > Arquivos de exemplo em `samples/` (não versionados — dados reais): `sample01.json` (12 nós), `sample02.json` (159 nós) e `sample03.json` (141 nós)
2. Use scroll para zoom e arraste para navegar; os botões **−** / **+** na barra superior ajustam o espaçamento do layout
3. Para **criar** um nó, arraste um tipo da paleta (canto superior esquerdo) até a posição desejada
4. Para **conectar**, arraste do handle inferior de um nó até outro nó; para **reconectar**, arraste a ponta de destino (seta) de uma aresta — conexões para outros bots não são editáveis
5. Para **editar conteúdo**, clique no nó e use o painel à direita (Aplicar alterações grava no modelo)
6. Para **excluir**, selecione nó ou aresta e pressione Delete, ou use o botão no painel
7. **Ctrl+Z** desfaz e **Ctrl+Shift+Z** refaz qualquer edição (botões ↶ ↷ na toolbar)
8. O **indicador de validação** na toolbar mostra erros/avisos do fluxo em tempo real (clique para ver a lista)
9. **Exportar** (toolbar) baixa o **JSON** no formato da plataforma (com todas as edições) ou imagem **PNG**/**SVG**

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
