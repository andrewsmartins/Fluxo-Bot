# Changelog

Todas as mudanças notáveis neste projeto são documentadas neste arquivo.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adota [Versionamento Semântico](https://semver.org/lang/pt-BR/).

> **Regra de bumping:**
> - `PATCH` (0.x.**y**) — correções de bug sem mudança de interface
> - `MINOR` (0.**x**.0) — funcionalidades novas retrocompatíveis
> - `MAJOR` (**x**.0.0) — quebra de compatibilidade (estrutura do JSON de entrada, etc.)

---

## [Não lançado]

---

## [0.4.0] - 2026-06-03

### Adicionado
- **Modo escuro completo** com toggle sol/lua na sidebar
- Hook `useDarkMode` com persistência em `localStorage` e detecção automática via `prefers-color-scheme`
- Variantes `dark:` em todos os 10 tipos de nó, `DetailPanel`, `ExportControls`, `FlowCanvas` e layout principal
- Cores dinâmicas no `Background` e `MiniMap` do React Flow de acordo com o tema ativo

---

## [0.3.0] - 2026-06-03

### Adicionado
- 2 novos tipos de nó — **Encerramento de conversa** (`EndConversationNode`, vermelho escuro) e **Chamada de API** (`ApiCallNode`, verde-azulado) — totalizando **10 tipos**
- Controles de espaçamento (`−` / `+`) no canto superior direito do canvas
- Espaçamento dinâmico e reconfigurável a cada geração (`ranksep` / `nodesep` em `parseFlow`)

### Corrigido
- MiniMap em branco no React Flow v12: adicionados `width`/`height` explícitos nos nós e `nodeComponent` SVG puro no `MiniMap`
- Codificação de caracteres especiais em nomes, mensagens e condições (`fixEncoding`)
- Rótulo incorreto em `ExternalBotNode` para bots externos sem nome definido

---

## [0.2.0] - 2026-06-03

### Adicionado
- **DetailPanel**: painel lateral com detalhes completos do nó selecionado — keywords, mensagens, condições, tipo de captura, destino de transferência e variáveis definidas
- 3 novos tipos de nó — **Aguarda interação** (`WaitNode`, ciano), **Atribuição de variável** (`SetDataNode`, índigo) e **Bot externo** (`ExternalBotNode`, âmbar)
- **Layout bin-packing** para fluxos com subgrafos desconectados: componentes isolados são posicionados lado a lado sem sobreposição
- Deploy automático no GitHub Pages via `gh-pages`

### Alterado
- `parseFlow` refatorado para suportar os novos tipos de nó com melhor separação de responsabilidades
- `ChoiceNode` passa a suportar o tipo lista (`action.type === "list"`) com ícone diferenciado

---

## [0.1.0] - 2026-06-02

### Adicionado
- Estrutura base do projeto: React 18 + Vite + TypeScript + Tailwind CSS
- Visualização de fluxo de chatbot a partir de JSON com propriedade `list`
- Layout hierárquico top-down automático via [Dagre](https://github.com/dagrejs/dagre)
- 5 tipos de nó: **Início** (verde), **Escolha** (azul), **Captura** (roxo), **Transferência** (vermelho) e **Padrão** (cinza)
- Rótulos nas arestas com o texto dos botões de escolha
- Zoom, pan e minimapa interativos via `@xyflow/react`
- Exportação em **PNG** (2400×1600) e **SVG** (vetor) via `html-to-image`
- Input via textarea (colar JSON) e upload de arquivo `.json`
- Atalho `Ctrl+Enter` para gerar o fluxo
