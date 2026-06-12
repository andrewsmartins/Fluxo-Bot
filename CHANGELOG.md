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

## [0.6.0] - 2026-06-11

### Adicionado
- **Fase 1 do editor (round-trip)**: o fluxo importado agora pode ser editado e exportado de volta como JSON
  - Reconexão de arestas no canvas: arraste a ponta de destino de uma conexão para outra intenção — o modelo (`next.intent` ou `action.choices`) é atualizado em memória
  - Botão **JSON** no painel de exportação: baixa o fluxo no formato `{ "list": [...] }` aceito pela plataforma, preservando integralmente os campos não editados (estratégia *preserve-and-patch*)
  - Novo módulo `src/utils/editFlow.ts`: `parseEdgeId` (decodifica IDs de aresta de volta para a posição no modelo), `applyEdgeReconnect` (patch validado com mensagens de erro) e `serializeFlow`
- Suíte de testes com Vitest (`npm test`): round-trip com os 3 samples reais, decodificação de IDs de aresta e casos de erro (aresta externa, destino inexistente, lista vazia, escolhas duplicadas)
- `PLANS.md` com o plano completo do projeto editor (fases 1–4) e o contrato de API da plataforma descoberto por engenharia reversa

### Alterado
- Arestas internas são reconectáveis apenas pela ponta de destino (mover a origem seria ambíguo); arestas para outros bots (externas) não são editáveis
- Falhas de reconexão exibem mensagem de erro no painel lateral em vez de falhar silenciosamente

---

## [0.5.0] - 2026-06-06

### Adicionado
- `ThemeContext` (`src/contexts/ThemeContext.tsx`) com hook `useTheme()` — distribui `isDark` via React Context sem prop drilling
- Script anti-flash em `index.html`: lê `localStorage` antes de o React montar para evitar piscar no carregamento

### Corrigido
- **Dark mode não afetava a plataforma inteira** — apenas a janela de preview (Background/MiniMap do canvas) respondia ao toggle; sidebar, nodes e painéis permaneciam estáticos
- **Causa raiz**: regras CSS `dark:*` do Tailwind (`.dark .dark\:bg-*`) não estavam presentes no bundle compilado pois o servidor foi iniciado antes de `darkMode: 'class'` ser adicionado ao `tailwind.config.js`; adicionar a classe `.dark` ao DOM não tinha efeito visual algum

### Alterado
- Arquitetura de tematização completamente reescrita: `dark:` prefix Tailwind removido de todos os arquivos — classes agora são computadas diretamente via ternário React (`isDark ? 'bg-slate-800' : 'bg-white'`)
- Todos os 8 node components, `JsonInput`, `DetailPanel`, `ExportControls` e `ThemeToggle` passam a consumir `useTheme()` ou receber `isDark` como prop
- `ThemeToggle` refatorado como componente controlado (recebe `isDark` + `onToggle` do `App.tsx`)

---

## [0.4.2] - 2026-06-06

### Adicionado
- Link **Documentação** ao lado do badge Beta no cabeçalho do sidebar (aponta para o repositório GitHub)

### Alterado
- Largura do sidebar aumentada de `w-72` para `w-96` para melhor legibilidade do JSON
- Itens do rodapé de legenda centralizados

---

## [0.4.1] - 2026-06-06

### Adicionado
- Badge de versão (`v0.4.1`) e **Beta** no cabeçalho do sidebar

### Corrigido
- Exportação PNG/SVG agora calcula dimensões a partir dos bounds reais dos nós (2× resolução, máx 8000 px) em vez de tamanho fixo 2400×1600 — fluxos grandes não ficam mais cortados
- `minZoom` reduzido de `0.3` para `0.01` no `ExportControls` para capturar fluxos muito grandes

---

## [0.4.0] - 2026-06-03

### Adicionado
- Botão toggle sol/lua para dark mode na sidebar com persistência em `localStorage`
- Cores dinâmicas no `Background` e `MiniMap` do React Flow de acordo com o tema ativo
- `tailwind.config.js` atualizado com `darkMode: 'class'`

### Nota
- A implementação via variantes `dark:` do Tailwind estava incompleta nesta versão: apenas o canvas (Background/MiniMap) respondia ao toggle. Corrigido definitivamente na [0.5.0].

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
