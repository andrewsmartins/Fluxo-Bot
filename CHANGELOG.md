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

## [0.12.1] - 2026-06-11

### Alterado
- Controles de espaçamento (− espaço +) movidos do canvas para a barra superior, junto dos demais controles (desfazer/refazer); o painel flutuante `CanvasControls` foi removido

---

## [0.12.0] - 2026-06-11

### Adicionado
- **Fase 5c: undo/redo** — Ctrl+Z desfaz e Ctrl+Shift+Z/Ctrl+Y refaz qualquer edição (reconectar, conectar, criar/excluir nó, deletar aresta, edições do painel); botões ↶ ↷ na toolbar; histórico de até 30 passos por snapshot (`src/utils/history.ts`); atalhos ignorados com foco em campos de texto
- **Rollback de edição parcial**: se um patch do "Aplicar alterações" falhar no meio, o modelo volta ao estado pré-edição (antes ficava meio-aplicado)

## [0.11.0] - 2026-06-11

### Adicionado
- **Fase 5b: novo fluxo do zero** — botão "Novo fluxo" na toolbar pede o botId (UUID validado, copiado da URL da plataforma) e cria a intenção de início canônica (`{botId}-start`); o JSON exportado já nasce com IDs reais

## [0.10.0] - 2026-06-11

### Alterado
- **Fase 5a: redesign — de visualizador para editor**
  - Sidebar permanente de 384px removido; o canvas ocupa toda a tela sob uma toolbar fina
  - Importação virou modal (colar JSON da aba Network ou carregar arquivo), com aviso quando substitui um fluxo com edições
  - Exportação (JSON/PNG/SVG) movida do canvas para dropdown na toolbar
  - Erros e avisos viram **toasts** no rodapé do canvas (avisos somem sozinhos)
  - **Indicador de validação vivo** na toolbar: ✓ válido / ⚠ avisos / ✕ erros, recalculado a cada edição e clicável para ver a lista completa
  - Legenda de cores absorvida pela paleta (chips de Início/Outro Bot)
  - Versão exibida na toolbar agora vem do `package.json` (não dessincroniza mais)

### Removido
- Componentes `JsonInput` e `ExportControls` (substituídos por `TopBar`, `ImportDialog`, `Toast` e `CanvasControls`)

---

## [0.9.0] - 2026-06-11

### Adicionado
- **Fase 3b do editor: edição estrutural completa**
  - **Botões com sincronia posicional**: adicionar botão cria um slot vazio em `action.choices` (conecte no canvas para preenchê-lo); remover botão remove a escolha na mesma posição; "Criar mensagem de botões" monta a mensagem BUTTON canônica em nós de escolha recém-criados
  - **Conectar escolhas**: arrastar do handle de origem agora também preenche o primeiro slot de escolha vazio (a aresta nasce com o texto do botão como label)
  - **Deletar aresta de escolha**: esvazia o slot mantendo o botão (reconectável depois)
  - **Condições editáveis**: nome, tipo (qualquer/igual/existe/senão), variável e valor; adicionar e remover condições (a última é protegida)
  - **Excluir intenção** (botão no painel ou Delete no nó selecionado) com limpeza completa de referências de entrada: `next` resetado, botão+escolha removidos na mesma posição, `error.next` reapontado para o start e fallbacks filtrados; o start não é excluível

### Corrigido
- Controles de exportação movidos para o centro superior — ficavam cobertos pelo DetailPanel aberto

---

## [0.8.0] - 2026-06-11

### Adicionado
- **Fase 3a do editor: edição de conteúdo no DetailPanel**
  - O painel de detalhes virou formulário com rascunho local e botão **Aplicar alterações**: nome, categoria, keywords, mensagens (editar/adicionar/remover TEXT, editar body de BUTTON/LIST), texto/descrição dos botões, tipo+destino de transferência, tipo de captura+variável e variáveis do setData (adicionar/remover/editar)
  - Novo módulo `src/utils/editIntent.ts`: patches pequenos e validados sobre o intent cru (endereçamento estável de mensagens por `{condIdx, sayIdx, msgIdx}`), sempre atualizando `updatedAt`
  - **Validação no export** (`src/utils/validateFlow.ts`): erros bloqueiam o download (IDs duplicados, intenção sem nome/condições) e avisos informam sem bloquear (refs quebradas, fluxo sem start, botões dessincronizados das escolhas)
  - Editar texto de botão atualiza o label da aresta de escolha correspondente no canvas
- Smoke test da Fase 3 (`scripts/smoke-phase3.mjs`): edita nome/mensagem/botão, aplica e valida canvas + JSON exportado + integridade das demais intenções

### Protegido (decisões de segurança do modelo)
- Mensagens BUTTON/LIST não são removíveis pelo painel (os botões mapeiam posicionalmente para `action.choices`)
- Remoções de mensagens aplicadas em ordem decrescente de índice para não deslocar os endereços

---

## [0.7.0] - 2026-06-11

### Adicionado
- **Fase 2 do editor: criação de nós e arestas**
  - Paleta "Criar nó" no canto superior esquerdo do canvas: arraste um dos 6 tipos (Mensagem, Escolha, Captura, Transferência, Espera, Definir dados) para criar uma intenção nova na posição do drop
  - Templates canônicos de intenção (`src/utils/intentTemplates.ts`) com a forma exata que a tela oficial envia no POST — UUID v4 novo, `advanced`, defaults por tipo (transfer → `direct4group`, captureData → `free`) e caminho de erro apontando para o start
  - Conectar nós: arraste do handle inferior (origem) até outro nó — preenche `next.intent` na primeira condição livre (`redirect: continueFlow`)
  - Deletar arestas: selecione e pressione Delete/Backspace — remove a referência `next` no modelo (arestas de escolha e externas são protegidas)
  - Nós agora podem ser arrastados para reposicionar (estado visual; não afeta o JSON)
- Smoke test da Fase 2 (`scripts/smoke-phase2.mjs`): cria nó via drop, conecta, deleta aresta e valida tudo no JSON exportado

### Corrigido
- `fitView` não é mais disparado ao criar um nó (re-zoom no meio da edição desorientava e invalidava o gesto em andamento) — agora só ao gerar fluxo ou mudar espaçamento

### Alterado
- Estado dos nós elevado ao `App` (canvas totalmente controlado) — posições manuais sobrevivem à criação de novos nós
- `parseFlow` exporta `intentToNodeData` e `buildNextEdge` para reuso na criação

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

### Corrigido
- Reconexão "não pegava" ao soltar no corpo do nó: o drop exigia acertar o handle de ~6px no topo — adicionados `connectionRadius={80}` e `reconnectRadius={16}`, handles maiores e destaque visual dos alvos válidos durante o arrasto (`.connectionindicator`)

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
