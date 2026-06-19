# Guia de uso — Fluxo Bot

Guia do editor visual de fluxos de chatbot OmniChat. Atualizado para a **v0.14.0 (Fase 6 — Modelo B)**.

> O ciclo completo: **importar (ou criar do zero) → editar no canvas → validar → exportar JSON → enviar para o rascunho do bot (UI ou CLI) → publicar manualmente na plataforma**.

---

## Como o editor representa o fluxo (Modelo B)

Antes de editar, vale entender o modelo. Na plataforma, uma **intenção** contém uma ou mais **condições** — cada condição tem seu próprio gatilho, mensagens e **ação** (escolha, captura, transferência, etc.).

O editor desenha **um nó por condição**, tipado pela ação dela:

- Intenção com **1 condição** → um **nó solto** (sem moldura).
- Intenção com **2+ condições** → um **grupo** (moldura) com os nós-condição como filhos, sob um cabeçalho que mostra nome, categoria, prioridade e keywords.

As arestas também são tipadas:

| Aresta | Aparência | Significado |
|---|---|---|
| Fluxo | Cinza, com uma **tag** no meio (rótulo + botão **×**) | Para onde a condição avança (`next` ou escolha) |
| Contexto | Tracejada violeta | A intenção de origem "arma" a de destino (`intent.context`) |
| Outro bot | Âmbar, animada | Redirecionamento para outro bot da plataforma |

---

## 1. Abrir um fluxo

Clique em **Importar** na toolbar. O modal aceita duas entradas:

- **Colar JSON** — copie a resposta da requisição de intents na aba Network da plataforma e cole no textarea; `Ctrl+Enter` gera o fluxo.
- **Carregar arquivo** — selecione um `.json` exportado anteriormente.

Se já houver um fluxo com edições na tela, o modal avisa antes de substituir.

### Criar do zero

**Novo fluxo** (toolbar) pede o **botId** (UUID copiado da URL da plataforma) e cria a intenção de início canônica (`{botId}-start`). O JSON exportado já nasce com IDs reais do bot.

---

## 2. Navegar no canvas

- **Scroll** dá zoom; **arrastar** o fundo faz pan; o **minimapa** mostra a visão geral.
- Os botões **− espaço +** na toolbar ajustam o espaçamento do layout automático.
- Nós podem ser arrastados para reposicionar (apenas visual — não altera o JSON).

---

## 3. Editar o fluxo

### Criar nós

Arraste um tipo da paleta **Criar nó** (canto superior esquerdo) até a posição desejada. São **11 tipos**, em dois grupos:

- **Fluxo** (dia a dia): Mensagem, Escolha, Captura, Transferência, Espera, Definir dados.
- **Avançado** (Fase 6): Encerrar conversa, Chamada de API, Pedido, Captura CSAT, Loja física.

Cada um nasce como **nó solto** com o template canônico que a tela oficial usa (UUID novo, defaults corretos por tipo, caminho de erro apontando para o start quando aplicável).

> **Adicionar como condição (merge):** se você soltar um tipo **sobre um nó-intenção já existente**, ele vira uma **nova condição daquela intenção** em vez de um nó solto — a intenção passa a ter 2+ condições e se transforma num grupo. Durante o arraste, o nó-alvo ganha um contorno tracejado. Soltar sobre o **start**, sobre um **bot externo** ou fora de qualquer nó cria um nó solto (comportamento normal).

### Conectar e reconectar

- **Conectar**: arraste do handle inferior de um nó até outro nó. Em nós de escolha, a conexão preenche o primeiro slot de botão vazio (a aresta nasce com o texto do botão como rótulo).
- **Reconectar**: arraste a **ponta de destino** (seta) de uma aresta para outra intenção. A origem não é móvel, e arestas para outros bots (e de contexto) não são editáveis.
- **Remover aresta**: clique no botão **×** da tag no meio da aresta, ou selecione e pressione `Delete`. Em arestas de escolha, o slot fica vazio mas o botão é mantido (reconectável depois); numa aresta `next`, a transição volta à forma canônica sem destino.

### Editar conteúdo

Clique num nó para abrir o painel à direita. **O painel se adapta ao que você clicou:**

- **Grupo** (cabeçalho de uma intenção com 2+ condições) → edita a **meta da intenção**: nome, categoria, keywords, **prioridade** (Nenhuma…Muita Alta) e **contexto** (qual intenção a precede), além de adicionar/remover condições da lista.
- **Condição** (um filho dentro do grupo) → edita **só aquela condição**: gatilho (nome, tipo, variável, valor), mensagens, botões/escolhas e os campos da ação (transferência/captura/setData). Tem botão **Excluir condição** (some quando é a última).
- **Nó solto** (intenção com 1 condição) → editor completo: meta + conteúdo numa tela só.

**Os campos do gatilho mudam conforme o tipo de condição** (espelhando o construtor da plataforma):

| Tipo | Campos |
|---|---|
| Sem condição / Senão | — (sem operando) |
| O contexto é igual a | **Intenção** + **Contexto** (seletores de intenções existentes) |
| A última intenção foi | **Intenção** |
| O valor está vazio / O valor existe | **Variável** (busca de `@`) |
| Valor é igual a | **Variável** (busca de `@`) + **Valor** (texto livre) |
| O valor contém | **Variável** (busca de `@`) + **Valores** (lista de tags, igual às palavras-chave) |
| Total é maior que / Total é igual a | **Variável** (busca de `@`) + **Total** (campo numérico com −/+, começa em 0 e aceita negativos) |

> O campo **Variável** usa o mesmo **picker de `@`** das mensagens: clique (ou digite `@`) para navegar Categoria → Variável → Modificador; mostra o rótulo legível e grava a variável crua.

As mudanças ficam num rascunho local até clicar em **Aplicar alterações**.

- Adicionar botão cria um slot vazio de escolha — conecte no canvas para preenchê-lo.
- Remover botão remove a escolha na mesma posição (sincronia automática).
- Editar o texto de um botão atualiza o rótulo da aresta no canvas.

> O nó de **início** abre o painel em modo **somente-leitura** (mostra nome, condição e destino, sem formulário). A conexão de saída dele continua editável no canvas — é como o fluxo começa.

### Tipos de resposta (+ Adicionar Resposta)

Na seção **Mensagens**, o botão **+ Adicionar Resposta** abre o menu de tipos:

- **Texto** — mensagem de texto (com picker de `@` para variáveis).
- **Imagem / PDF / Vídeo** — mídia por **Link** (URL) ou **Upload** (envia o arquivo à OmniChat; exige token de sessão).
- **Coleção** — envia um **catálogo/coleção de produtos** da loja. Abre uma **caixa de busca + lista** das coleções disponíveis (carregadas com o token de sessão, igual à variável `@team`) e, ao lado, um **preview** com a **imagem de capa, o nome e o ID** da coleção. Escolha uma e clique em **Salvar coleção** para recolher num cartão compacto; o botão **editar** reabre a busca para trocar a coleção (inclusive depois de já salva no fluxo). A resposta guarda o `collectionId`; se a lista ainda não foi carregada ao reabrir, o cartão mostra só o ID.

> **Botão/Lista** não fica neste menu — é exclusivo do nó de **Escolha** (seção "Menu").

### Duplicar nós

Há três formas de duplicar, todas **cópias fiéis** — as conexões de saída (`next`, escolhas, `error.next`, contexto) são preservadas, e os **IDs dos botões são regenerados** para não colidir. O nó de **início nunca é duplicado**.

- **Ctrl + arrastar** um nó-intenção (nó solto ou cabeçalho de um grupo) cria uma **intenção nova** (com todas as condições) no ponto onde você soltar — o original fica no lugar.
- No painel, **"Duplicar dentro da intenção"** (num nó solto ou numa condição-filha) copia **aquela condição dentro da mesma intenção**; num nó solto, isso o transforma em **grupo** (2 condições).
- No painel, **"Duplicar fora da intenção"** (numa condição-filha) extrai aquela condição para uma **intenção nova**; **"Duplicar intenção"** (no grupo ou no nó solto) copia a intenção inteira.

A cópia recebe o nome do original com sufixo `_copia` (`_copia_2`, `_copia_3`… se já houver). Duplicar entra no histórico de **desfazer/refazer**.

Durante o **Ctrl+arrastar**, o nó original e a cópia aparecem com uma **borda tracejada verde animada** (e as conexões também) — ao soltar, voltam ao normal. Ao duplicar **pelos botões**, a cópia nasce com esse mesmo destaque, que some assim que você **clica ou arrasta** o nó pela primeira vez.

### Excluir intenções

Selecione o nó e pressione `Delete`, ou use o botão no painel. Todas as referências de entrada são limpas automaticamente (`next`, botão+escolha, `error.next`, fallbacks); num grupo, os nós-condição filhos somem junto. O nó de início não é excluível.

### Desfazer / refazer

`Ctrl+Z` desfaz e `Ctrl+Shift+Z` (ou `Ctrl+Y`) refaz qualquer edição — também pelos botões **↶ ↷** na toolbar. Histórico de até 30 passos.

---

## 4. Validação

O **indicador na toolbar** recalcula a cada edição:

| Ícone | Significado |
|---|---|
| ✓ | Fluxo válido |
| ⚠ | Avisos (fluxo sem start, botões dessincronizados das escolhas) — não bloqueiam |
| ✕ | Erros (IDs duplicados, intenção sem nome/condições, **referência interna quebrada**) — **bloqueiam o export e o envio** |

Clique no indicador para ver a lista completa. Uma referência `next` apontando para um ID inexistente é **erro bloqueante**: a plataforma a aceita silenciosamente, mas trata como erro a preencher e o simulador cai no Start — então o Fluxo barra antes do envio.

---

## 5. Exportar

O dropdown **Exportar** na toolbar oferece:

- **JSON** — fluxo completo no formato `{ "list": [...] }` aceito pela plataforma, preservando todos os campos não editados (*preserve-and-patch*).
- **PNG / SVG** — imagem do fluxograma com dimensões calculadas pelos bounds reais dos nós (funciona corretamente mesmo com grupos).

---

## 6. Enviar para a plataforma

O envio escreve **somente no rascunho** do bot — publicar continua sendo o botão manual na plataforma. Há dois caminhos com a **mesma lógica**: pela UI (recomendado no dia a dia) e pela CLI (lote/auditável).

### Pela UI (botão Enviar)

O botão **Enviar** (habilitado só com um fluxo válido carregado) abre o **diálogo de push** com guardrails conscientes:

1. **Token** num campo de senha — fica só em memória, nunca é salvo nem logado.
2. **Confirmação do alvo** — digite os últimos 6 caracteres do botId.
3. **Trava "é um bot de testes"** — precisa ser marcada.
4. **Pré-visualização (dry-run)** — mostra o que será criado e atualizado antes de enviar.
5. **Backup baixado** automaticamente antes do primeiro envio.
6. Progresso por operação e relatório final com botão **copiar relatório** (sanitizado, sem o token).

### Restaurar um backup (botão Restaurar)

O botão **Restaurar** sobe um backup `.json` e devolve o bot ao **estado exato do arquivo**: exclui o que está sobrando, **recria** o que sumiu (com remap de IDs) e **sobrescreve** o resto. Baixa um snapshot de segurança antes de qualquer alteração destrutiva. Mesmos guardrails do push.

> Por que existe o Restaurar? O push é só *upsert* — nunca apaga. Reimportar um backup pelo push não remove intenções criadas depois; o Restaurar fecha essa lacuna.

### Pela CLI

```powershell
$env:OMNI_TOKEN = 'r:...'        # token de sessão (nunca commitar)

# dry-run (padrão — não escreve nada):
node scripts/push-flow.mjs fluxo.json --bot <botId>

# executar de verdade:
node scripts/push-flow.mjs fluxo.json --bot <botId> --yes

# enviar uma única intenção:
node scripts/push-flow.mjs fluxo.json --bot <botId> --only <intentId> --yes
```

Por que duas passadas? A API **ignora IDs novos no POST e gera outros** — o script cria as intenções, captura os IDs reais e remapeia todas as referências (`next.intent`, `choices`, `error.next`, `fallbackIntents`) antes de reenviar. Validado ponta a ponta na plataforma real (ver [fase4-resultados.md](fase4-resultados.md)).

Guardrails embutidos: sem `--yes` é dry-run; `--bot` é obrigatório e conferido contra o botId do arquivo; backup automático do estado do servidor é salvo em `samples/` antes do primeiro POST; o push para no primeiro erro.

**Desfazer um push pela CLI:**

```powershell
node scripts/rollback-bot.mjs <botId> samples/backup-<botId>-<timestamp>.json        # dry-run
node scripts/rollback-bot.mjs <botId> samples/backup-<botId>-<timestamp>.json --yes  # executar
```

---

## 7. Dark mode

Toggle sol/lua na toolbar — tema aplicado a toda a interface (toolbar, nós, painéis e canvas) e salvo em `localStorage`.

---

## Atalhos de teclado

| Atalho | Ação |
|---|---|
| `Ctrl+Enter` | Gerar fluxo (no modal de importação) |
| `Delete` / `Backspace` | Excluir nó ou aresta selecionada |
| `Ctrl` + arrastar | Duplicar a intenção (nó solto ou grupo) no ponto do drop |
| `Ctrl+Z` | Desfazer |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Refazer |

> Os atalhos de undo/redo são ignorados quando o foco está em campos de texto.

---

> 📖 Veja também: [README](../README.md) (visão geral e tipos de nó) · [Testes automatizados](TESTES-AUTOMATIZADOS.md) · [Modelo de intenção da OmniChat](MODELO-INTENCAO-OMNICHAT.md)
