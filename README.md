# PabxZap — sistema

Central de distribuição de atendimento via WhatsApp para o Laboratório João Emídio. Desenvolvido por FL² Engenharia e Sistemas.

O planejamento, as decisões e as regras de negócio ficam no vault `C:\Apps\53-PabxZap` (wiki). Este repositório guarda só o código.

## Estrutura

| Pasta | O que tem | Estado |
|---|---|---|
| `nucleo/` | Regras de negócio puras (TypeScript, sem dependências): menu, protocolo, encaminhamento, chegada, alerta, resgates, horário e feriados, respostas rápidas, RH e Dono | ajustado às decisões até 17/11, 34 testes |
| `supabase/migrations/` | Esquema do banco | aplicado em 10/11/2026 (`npm run migrar`) |
| `scripts/migrar.mjs` | Aplica as migrações pendentes usando `SUPABASE_DB_URL` do `.env` | pronto |
| `supabase/functions/webhook/` | Recebe os eventos da Meta, passa pelo núcleo e envia menu, link e avisos | publicado; falta o token da Meta (tickets wf-pabxzap-20 e 22) |
| `supabase/functions/_compartilhado/` | Banco (PostgREST), envio pela Meta e o orquestrador `executarEvento` (protocolo atômico) | pronto, com testes |
| `scripts/numeros-de-teste.mjs` | Fase de teste: o número de teste da Meta faz o papel da Recepção (`npm run numeros:teste`) | aplicado |
| `portal/` | Portal React/Vite | a fazer (ticket wf-pabxzap-23) |
| `docs/` | Rascunhos de apoio (App Review etc.) | em andamento |

## Rodar os testes

Requer Node 22.18 ou mais novo (remove os tipos do TypeScript sem instalar nada):

```
npm test
```

## Como o núcleo funciona

`processar(config, estado, evento)` recebe um evento e devolve o novo estado e os efeitos:

- eventos: `cliente_mensagem`, `atendente_mensagem` (vindo do webhook `smb_message_echoes`; o link reenviado conta como resgate pelo app), `relogio`, `resgatar` (botão do portal);
- efeitos: `enviar_texto`, `enviar_menu`, `enviar_link` (com `porTemplate` no resgate fora da janela de 24 h), `alerta`, `alerta_resolvido`, `resgate`, `nao_concluido`.

Quem grava no banco e chama a API da Meta é a camada de fora. Assim as regras ficam testáveis sem banco nem Meta.

## Chaves

Copie `.env.example` para `.env` e preencha. O `.env` está no `.gitignore`.
