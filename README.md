# PabxZap — sistema

Central de distribuição de atendimento via WhatsApp para o Laboratório João Emídio. Desenvolvido por FL² Engenharia e Sistemas.

O planejamento, as decisões e as regras de negócio ficam no vault `C:\Apps\53-PabxZap` (wiki). Este repositório guarda só o código.

## Estrutura

| Pasta | O que tem | Estado |
|---|---|---|
| `nucleo/` | Regras de negócio puras (TypeScript, sem dependências): menu, protocolo, encaminhamento, chegada, alerta, respostas rápidas, RH e Dono | portado do protótipo, 18 testes |
| `supabase/migrations/` | Esquema do banco | rascunho, não aplicado |
| `supabase/functions/webhook/` | Recebe os eventos da Meta e envia mensagens | a fazer (ticket wf-pabxzap-20) |
| `portal/` | Portal React/Vite | a fazer (ticket wf-pabxzap-23) |
| `docs/` | Rascunhos de apoio (App Review etc.) | em andamento |

## Rodar os testes

Requer Node 22.18 ou mais novo (remove os tipos do TypeScript sem instalar nada):

```
npm test
```

## Como o núcleo funciona

`processar(config, estado, evento)` recebe um evento e devolve o novo estado e os efeitos:

- eventos: `cliente_mensagem`, `atendente_mensagem` (vindo do webhook `smb_message_echoes`), `relogio`, `resgatar`;
- efeitos: `enviar_texto`, `enviar_menu`, `enviar_link`, `alerta`, `alerta_resolvido`.

Quem grava no banco e chama a API da Meta é a camada de fora. Assim as regras ficam testáveis sem banco nem Meta.

## Chaves

Copie `.env.example` para `.env` e preencha. O `.env` está no `.gitignore`.
