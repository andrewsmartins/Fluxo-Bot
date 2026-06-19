# Fase 4 — Protocolo de teste do push via API (bot de testes)

> Leia inteiro antes de começar. Regra de ouro: **nada aqui toca bot de cliente.**
> Toda escrita acontece num bot de testes criado para isso, e todo passo de
> escrita é precedido de backup.

## Pré-requisitos (uma vez)

1. **Bot de testes**: crie um bot novo na plataforma (ou use um que comprovadamente
   nenhum cliente usa). Anote o **botId** (UUID na URL).
2. **Confirmação de isolamento**: na tela do bot, confirme que ele não está
   publicado em nenhum canal de produção (WhatsApp/Instagram de cliente).
3. **Token de sessão**: com a plataforma aberta e logada, capture na aba
   Network o header `x-parse-session-token` de qualquer chamada.
   - O token dá acesso à sua conta inteira. **Nunca** cole em chat, arquivo
     versionado ou print. Se vazar, faça logout/login para rotacionar.
   - No PowerShell: `$env:OMNI_TOKEN = 'r:...'` (vale só para aquela janela).

## Etapa 0 — Sonda read-only (nenhuma escrita)

```powershell
$env:OMNI_TOKEN = 'r:...'
node scripts/probe-api.mjs <botId-do-bot-de-testes>
```

A sonda responde três perguntas que definem o resto da fase:

| Pergunta | Resultado | Consequência |
|---|---|---|
| CORS permite navegador? | `NAVEGADOR OK` | Push pode ir para a UI do FlowViewer (Fase 4b) |
| | `BLOQUEADO` | Push será **só via script CLI** (Fase 4a) — sem mudança de plano, o CLI já é o começo |
| Token autentica? | `status 200` | Seguimos |
| Backup salvo? | arquivo em `samples/` | É o nosso ponto de restauração |

## Etapa 1 — Primeira escrita: UMA intenção mínima

Com o script de push (a ser construído após a Etapa 0 — `scripts/push-flow.mjs`):

1. No FlowViewer: **Novo fluxo** com o botId de testes → crie **um** nó Mensagem,
   edite o texto → **Exportar JSON**.
2. Push de **uma única intenção** (o script aceita `--only <intentId>`).
3. Verificação na plataforma (é ela quem valida de verdade o schema):
   - A intenção aparece na lista? Na categoria certa?
   - O formulário dela **abre sem erro** e mostra os campos esperados?
   - Salvar pela própria tela da Omni funciona? (Se a tela salva por cima sem
     reclamar, nosso template é 100% compatível.)
   - O simulador do bot responde de acordo?
4. Confirme no GET (`probe-api.mjs` de novo) que o objeto retornado é
   equivalente ao enviado.

## Etapa 2 — Caminhos infelizes (deliberados, ainda no bot de testes)

Testar os erros de propósito para conhecer as respostas da API:

| Teste | Como | O que anotar |
|---|---|---|
| Token expirado | rodar push com token velho | status + corpo (esperado 401) |
| botId alheio | botId de outro workspace | status (esperado 403/404) |
| Intent malformada | remover campo `conditions` do JSON na mão | status + mensagem de validação |
| Push repetido | enviar a mesma intenção 2× | é idempotente? duplica algo? |
| Referência quebrada | intent com `next` para ID inexistente | a API aceita? a tela quebra? |

## Etapa 3 — Fluxo completo + rascunho/publicação

1. Push de um fluxo de ~5 nós (start + escolha com botões + transferência).
2. ~~Pergunta-chave~~ **Confirmado (2026-06-12)**: o push altera só o
   *rascunho*; publicar é um botão manual na plataforma e está fora do escopo
   do FlowViewer. Sanity check nesta etapa: confirmar visualmente que o rascunho
   mudou e o publicado não.
3. Teste de restauração: a tela de versões da Omni permite voltar ao estado
   do backup? Se sim, é nosso plano B oficial de rollback.

## Como reportar erros (template)

Crie uma entrada por problema em `docs/fase4-resultados.md` (ou cole no chat
da sessão do Claude Code) neste formato:

```markdown
## [E1] Título curto do problema            (data)

- **Etapa do protocolo:** (ex.: Etapa 1, passo 3)
- **Ação:** o que foi feito (comando rodado / botão clicado)
- **Request:** método + URL (pode incluir botId de TESTES) + arquivo JSON enviado (anexar/citar)
- **Response:** status HTTP + corpo da resposta (colar)
- **Esperado:** o que deveria acontecer
- **Observado:** o que aconteceu (print da tela da Omni ajuda muito)
- **Reproduz sempre?** sim/não/intermitente
```

**Checklist antes de colar qualquer coisa:**
- [ ] Sem token (`r:...`), sem header `authorization` — se colou sem querer, rotacione o token
- [ ] Sem dados de bot de cliente (só o bot de testes)
- [ ] O JSON enviado está anexado ou referenciado (sem ele não dá para reproduzir)

## Critérios para promover a Fase 4 de "teste" para "pronta"

1. Etapas 1–3 concluídas sem surpresas não documentadas.
2. Confirmado que push não publica sozinho (ou, se publicar, guardrail extra no script).
3. Todos os caminhos infelizes da Etapa 2 com comportamento conhecido e tratado.
4. Backup + restauração validados na prática pelo menos uma vez.
