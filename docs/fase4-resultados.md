# Fase 4 — Resultados dos testes

Bot de testes: `2a3859ff-62d5-4c01-ae60-6ae2f812e786` (sandbox, sem canais de cliente).

## Etapa 0 — Sonda read-only (2026-06-12)

| Verificação | Resultado |
|---|---|
| CORS `localhost:5173` | `allow-origin: *` → **navegador OK** |
| CORS `andrewsmartins.github.io` | `allow-origin: *` → **navegador OK** |
| GET autenticado | HTTP 200, 1 intenção (só o start) |
| Backup | salvo em `samples/` |

**Consequência:** CORS é aberto (`*`), então a Fase 4b (push pela UI do Fluxo)
é tecnicamente viável no futuro. Por ora seguimos com o CLI (`push-flow.mjs`).

## Etapa 1 — Push de uma intenção (2026-06-12)

- POST de 1 intenção (`nova_intencao_1`) → **HTTP 200**, criada no rascunho.
- **ACHADO CRÍTICO:** `POST /v1/{botId}/intents/{id}` com um ID que ainda não
  existe **ignora o ID enviado e gera outro** (devolvido no corpo da resposta).
  POST num ID já existente **atualiza in-place**.
  - Impacto: o push ingênuo (enviar tudo de uma vez) deixaria todas as
    referências `next`/`choices` apontando para IDs que o servidor descartou →
    fluxo quebrado.
  - **Solução implementada** (`push-flow.mjs`): push em 2 passadas — 1ª cria e
    captura os IDs reais; 2ª remapeia todas as referências (`next.intent`,
    `action.choices`, `error.next`, `fallbackIntents`) para os IDs reais e
    reenvia. Confirmado funcionando na Etapa 3.

## Etapa 2 — Caminhos infelizes (2026-06-12)

| Teste | Resultado | Observação |
|---|---|---|
| Token inválido | HTTP 403 `custom-403-access-denied` | rejeitado, sem escrita |
| botId inexistente/alheio | HTTP 403 | mesmo código; sem vazamento |
| ID novo no POST | ID ignorado, outro gerado | ver achado da Etapa 1 |

### Pendências da Etapa 2 — concluídas (2026-06-15)

Rodadas via `scripts/etapa2-unhappy.mjs --bot <botTestes> --yes` (backup automático
antes de escrever). Resultado da API + validação manual na tela da Omni:

| Teste | API | Tela / simulador da Omni |
|---|---|---|
| **Intent sem `conditions`** | HTTP 200 — **aceita** (servidor não valida) | Aparece na lista sem quebrar; formulário abre e edita normal — a tela **backfilla uma "Condição Padrão" vazia**, como intenção recém-criada (só erros no console, sem impacto funcional) |
| **Push duplicado** (mesmo POST 2×) | HTTP 200/200 — **duplica** (2 IDs distintos) | — (confirma o achado da Etapa 1: POST com ID novo sempre gera ID novo, então re-rodar o push do mesmo arquivo cria cópias) |
| **Ref `next` quebrada** (UUID inexistente) | HTTP 200 — **aceita e armazena** a ref fantasma (confirmado via GET) | Formulário abre; o campo **"Próximo Fluxo" sinaliza erro e fica vazio, exigindo preenchimento**. No simulador, a intenção envia a mensagem e **volta ao Start** (fallback padrão do sistema) |

**Conclusão para a Fase 4b:** a API aceita payloads inválidos silenciosamente
(sem `conditions`, refs quebradas). Logo o **Fluxo precisa ser o validador antes
do push** — não dá para confiar no servidor para barrar. Reforça a decisão de
bloquear o push na UI quando `validateFlow` acusar **erros** (ID duplicado, sem
nome, sem condições). Ref interna quebrada hoje é só *aviso* no `validateFlow`;
como a plataforma a trata como erro a preencher, vale **promover ref quebrada a
erro bloqueante** antes de habilitar o push pela UI.

## Etapa 3 — Fluxo encadeado + remapeamento (2026-06-12)

- Fluxo `start → mensagem → espera` montado no app e exportado.
- Push de 2 criações + 1 atualização (start) → **4/4 operações HTTP 200**.
- Verificação no servidor: **cadeia íntegra, zero referências órfãs**.
  - `start → nova_intencao_1 (c6ac5b59) → nova_intencao_2 (8b28a385)`.
- **Confirmado:** o remapeamento de IDs em 2 passadas funciona ponta a ponta.

## Confirmado sobre rascunho vs. publicação

Push altera somente o **rascunho** (confirmado pelo Andy + comportamento
observado). Publicar é botão manual na plataforma — fora do escopo do Fluxo.

## Validação manual na tela da Omni — APROVADA (2026-06-12)

Todos os itens do checklist confirmados pelo Andy: intenções na lista e
categoria certas, formulários abrem sem erro, mensagem configurada correta,
**salvar pela própria tela da Omni funciona** (compatibilidade total do
template), simulador percorre a cadeia start → mensagem → espera, e o
publicado permanece intocado. **Fase 4a validada ponta a ponta.**

## Etapa 4 — DELETE é de consistência eventual + validação do rollback (2026-06-15)

Ao limpar o bot de testes (rollback do estado de 8 intenções para só o `start`),
descobrimos um comportamento crítico da API:

- **`DELETE /v1/{botId}/intents/{id}` responde 200 mas a remoção é EVENTUAL.**
  Um GET logo após uma passada de deletes ainda lista parte das intenções
  "deletadas" (lag de réplica de leitura). Reproduzido: passada 1 levou 8→5,
  passada 2 levou 5→3; só um laço **deletar → esperar ~4s → reverificar**
  convergiu para 1 (só o `start`). Dois GETs seguidos davam o mesmo número, ou
  seja, não era o GET pegando estado intermediário — a réplica estabiliza atrás.
- **Correção aplicada:** `scripts/rollback-bot.mjs` virou um laço com
  reverificação (até 6 rodadas, espera de 4s) e só reporta sucesso quando o GET
  confirma que restou apenas o que o backup mantém — antes ele confiava no 200 e
  podia declarar "concluído" deixando lixo no bot.
- **Implicação para a Fase 4b:** qualquer operação que dependa de "ler logo após
  escrever/deletar" precisa tolerar lag. O push (Fase 4a) não é afetado porque o
  remapeamento usa o ID devolvido no corpo do POST, não um GET subsequente.

**Critério 4 do protocolo (backup + restauração na prática) — CUMPRIDO.** O
backup limpo (`samples/backup-...-03-15-08-066Z.json`, só o `start`) restaurou o
bot ao estado pristino: GET final = 1 intenção, `start.conditions[0].next.intent`
= `""` (sem referência pendente). Todas as operações ficaram **exclusivamente no
bot `2a3859ff-62d5-4c01-ae60-6ae2f812e786`** (endpoints sempre `/v1/{botId}/...`).

### Resumo dos critérios de "pronta" (TESTE-FASE4.md)

1. Etapas 1–3 concluídas sem surpresas não documentadas — **OK**.
2. Push não publica sozinho (só rascunho) — **OK** (confirmado pelo Andy).
3. Caminhos infelizes da Etapa 2 com comportamento conhecido e tratado — **OK**
   (token inválido/botId alheio → 403; sem `conditions` → API aceita, tela
   backfilla; push duplicado → duplica; ref quebrada → API aceita, tela marca
   erro a preencher e simulador cai no Start).
4. Backup + restauração validados na prática — **OK** (esta etapa).

**Fase 4a está PRONTA.** Único débito técnico levantado: promover "ref interna
quebrada" de aviso para erro bloqueante no `validateFlow` antes de habilitar o
push pela UI (Fase 4b), já que a plataforma a trata como erro.

## Fase 4b — Push e restore pela UI (validados na plataforma real, 2026-06-15)

A Fase 4b levou o push (e depois o restore) do CLI para a UI do Fluxo. Núcleo em
`src/utils/pushFlow.ts` e `src/utils/restoreFlow.ts` (funções puras com `fetch`
injetável), diálogos `PushDialog`/`RestoreDialog` e botões Enviar/Restaurar na
TopBar. Cobertura automatizada: 100 testes Vitest + 2 smokes Playwright
(`smoke-phase4b.mjs` e `smoke-phase4b-restore.mjs`) que mockam `window.fetch` —
**sem tocar a API real**.

### Push pela UI — APROVADO

Andy validou na plataforma real: importou um fluxo no Fluxo e enviou pelo botão
**Enviar** (token em memória, confirmação dos últimos 6 do botId, trava de bot de
testes, dry-run, backup baixado antes do 1º POST). A importação no bot ocorreu
perfeitamente e o fluxo funcionou no simulador da Omni — mesmo resultado do CLI.

### Restore pela UI — APROVADO (restore COMPLETO, fiel ao backup)

Primeiro o restore foi entregue como *delete-only* (só removia o excedente). Andy
apontou que **restore tem que voltar ao estado real do backup**, não só apagar.
Reescrito para as 3 operações: **excluir** o excedente, **recriar** o que sumiu
(com remap de IDs em 2 passadas, reusando o `pushFlow`) e **sobrescrever** o
resto. Ordem obrigatória **deletar → recriar/atualizar** (recriar antes faria a
exclusão apagar o que acabou de criar). Snapshot de segurança do estado atual é
baixado antes de destruir.

Validado na plataforma real: foi possível restaurar tanto um **fluxo completo**
quanto **só o start** — o restore **remove e adiciona conforme necessário**,
deixando o bot idêntico ao backup. Confirmado pelo Andy.

**Conclusão: Fase 4b PRONTA.** Push e restore pela UI funcionam ponta a ponta na
plataforma real, batendo com o CLI. Entregue na v0.13.0.

## Pendências para validação MANUAL na tela da Omni

O bot de testes está com 4 intenções (resíduo das etapas 1 e 3). Antes/depois
de validar, dá para limpar com:

```powershell
$env:OMNI_TOKEN = 'r:...'
# dry-run primeiro:
node scripts/rollback-bot.mjs 2a3859ff-62d5-4c01-ae60-6ae2f812e786 samples/backup-...-03-15-08-066Z.json
# executar:
node scripts/rollback-bot.mjs 2a3859ff-62d5-4c01-ae60-6ae2f812e786 samples/backup-...-03-15-08-066Z.json --yes
```

Checklist de validação na tela (você):
- [SIM] As intenções aparecem na lista do bot, na categoria certa?
- [SIM] O formulário de cada uma **abre sem erro**?
- [SIM] A mensagem de texto aparece como configurada?
- [SIM] Salvar pela própria tela da Omni funciona (compatibilidade total)?
- [SIM] O simulador percorre a cadeia start → mensagem → espera?
- [SIM] O rascunho mudou e o publicado **não** (até você publicar manualmente)?
