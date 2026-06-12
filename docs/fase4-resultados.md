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

(Pendentes para rodar manualmente se quiser cobertura total: intent malformada
sem `conditions`, push duplicado da mesma intenção.)

## Etapa 3 — Fluxo encadeado + remapeamento (2026-06-12)

- Fluxo `start → mensagem → espera` montado no app e exportado.
- Push de 2 criações + 1 atualização (start) → **4/4 operações HTTP 200**.
- Verificação no servidor: **cadeia íntegra, zero referências órfãs**.
  - `start → nova_intencao_1 (c6ac5b59) → nova_intencao_2 (8b28a385)`.
- **Confirmado:** o remapeamento de IDs em 2 passadas funciona ponta a ponta.

## Confirmado sobre rascunho vs. publicação

Push altera somente o **rascunho** (confirmado pelo Andy + comportamento
observado). Publicar é botão manual na plataforma — fora do escopo do Fluxo.

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
- [ ] As intenções aparecem na lista do bot, na categoria certa?
- [ ] O formulário de cada uma **abre sem erro**?
- [ ] A mensagem de texto aparece como configurada?
- [ ] Salvar pela própria tela da Omni funciona (compatibilidade total)?
- [ ] O simulador percorre a cadeia start → mensagem → espera?
- [ ] O rascunho mudou e o publicado **não** (até você publicar manualmente)?
