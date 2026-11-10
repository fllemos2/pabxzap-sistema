# App Review e Access Verification (ticket wf-pabxzap-13)

Rascunho de 24/10/2026, revisado em 10/11/2026 pelo agente. Base: pesquisa oficial (vault: `wiki/fontes/fonte-pesquisa-app-review-tech-provider.md`) e decisões de 02/11 (alerta só no portal; resgate por template).

## O que a Meta exige (resumo da pesquisa)

- App do tipo Business, com ícone 1024×1024, URL da política de privacidade e categoria.
- Para cada permissão, um texto e um vídeo **separados**. Screenshots não são aceitos; rascunho não é revisado.
- Vídeo com resolução 1080 ou melhor, **sem áudio**, com interface em inglês ou legendas em inglês; explicar botões que não são óbvios.
- Pelo menos uma chamada de API bem-sucedida por permissão nos 30 dias antes de submeter.
- Só a FL² verificada pode começar o App Review (verificada em 01/11); depois vem a Access Verification.

## Checklist

| Item | Situação |
|---|---|
| Ícone 1024×1024 | Pronto: `site-fl2/icone-app-1024.png` no vault (fundo branco) |
| Política de privacidade | No ar: `https://fl2engsys.com.br/politica-de-privacidade.html` (conferido em 10/11) |
| URL de exclusão de dados | No ar: `https://fl2engsys.com.br/politica-de-privacidade.html#exclusao` |
| Categoria | *Business and Pages* (conferir as opções na tela) |
| Chamada de `whatsapp_business_messaging` | Feita em 29/10 (Hello World); vale até 28/11. Para renovar: `npm run app-review -- --enviar 55DDDNUMERO` |
| Chamada de `whatsapp_business_management` | **Falta.** Gerar o token em API Setup, colar em `META_TEST_ACCESS_TOKEN` e rodar `npm run app-review` (só leitura) |
| Template criado no WhatsApp Manager | Falta: é o vídeo 2 |
| Os dois vídeos | Falta |
| Só as permissões necessárias | Pedir apenas `whatsapp_business_messaging` e `whatsapp_business_management` |

## Textos (em inglês, para colar nos campos)

### whatsapp_business_messaging

> PabxZap is a customer-service routing system built by FL² Engenharia e Sistemas for small businesses in Brazil that use several WhatsApp Business numbers, one per department. When a customer writes to the company's main number, our app replies with a menu, issues a ticket number and sends a link that opens a chat with the chosen department, with the message already filled in. When the customer writes to that department, our app sends a short confirmation. If the customer does not arrive within 15 minutes, an alert is shown on the company's web portal, and the company can resend the link. We use this permission to send these service messages (menu, ticket number, forwarding link, short confirmation and, when the 24-hour window has closed, an approved utility template to resend the link) and to receive incoming messages through the webhook. The business keeps using the WhatsApp Business app on its phones (coexistence).

### whatsapp_business_management

> Our business customers connect their own WhatsApp Business accounts to PabxZap through Embedded Signup. The WhatsApp Business Account stays in the customer's own business portfolio. We use this permission to read the customer's WhatsApp Business Account and phone numbers after onboarding, subscribe our app to the account's webhooks (including the coexistence fields), synchronize contacts and message history as required for WhatsApp Business app users, and manage the utility message template used to resend the forwarding link outside the customer service window.

## Gravação: preparo

- **Resolução:** a tela deste notebook é 1366×768, abaixo do exigido. Gravar com o **Clipchamp** (já vem no Windows 11: *Gravar › Tela*) e exportar em **1080p**; o Clipchamp também põe as legendas em texto. Alternativa: OBS Studio com *Settings › Video › Output (Scaled) Resolution* em 1920×1080.
- **Idioma:** deixar o Facebook em *English (US)* durante a gravação (facebook.com › Settings › Language); o App Dashboard e o WhatsApp Manager acompanham. Assim as legendas ficam só para explicar os passos.
- **Sem áudio:** tirar a trilha de áudio na exportação.
- **Privacidade:** não mostrar tokens inteiros nem o número pessoal completo; cortar ou desfocar no Clipchamp.

## Roteiro dos vídeos

### Vídeo 1 — whatsapp_business_messaging (cerca de 1 min)

| Passo na tela | Legenda (em inglês) |
|---|---|
| App Dashboard › WhatsApp › **API Setup**, com o número de teste e o destinatário | "PabxZap app – WhatsApp API Setup with our test number" |
| Clicar em **Send message** (ou rodar o cURL no terminal) | "Sending a message with the WhatsApp Cloud API" |
| Mostrar a resposta com o `message id` | "The API returns the message ID" |
| Mostrar o WhatsApp do destinatário (WhatsApp Web) com a mensagem recebida | "The message is delivered to the recipient's WhatsApp" |

### Vídeo 2 — whatsapp_business_management (cerca de 1 min 30)

| Passo na tela | Legenda (em inglês) |
|---|---|
| **WhatsApp Manager** › Message templates › **Create template** | "Creating the utility template our app uses to resend the forwarding link" |
| Categoria **Utility**, nome `pabxzap_resgate`, idioma **Portuguese (BR)** | "Category: Utility. Language: Portuguese (Brazil)" |
| Corpo: `Olá! Seu atendimento {{1}} com o setor {{2}} ainda está aberto. Toque no botão abaixo para continuar a conversa.` | "Body with the ticket number and the department name" |
| Exemplos das variáveis: `{{1}}` = `20261110-0042`, `{{2}}` = `Financeiro` | "Sample values for the variables" |
| Botão **Visit website**, texto `Continuar`, URL dinâmica `https://wa.me/{{1}}`, exemplo `5511999999999?text=Protocolo%2020261110-0042` | "Button that opens the chat with the department" |
| **Submit** e mostrar o template na lista | "Template submitted for approval" |

O corpo não começa nem termina com variável, porque a Meta costuma recusar isso (regra a confirmar na tela). Se o botão de URL dinâmica der problema, deixar só o corpo; o link pode ir numa mensagem de serviço depois que o cliente responder.

## Submissão (App Dashboard do app PabxZap)

1. App settings › Basic: ícone, política de privacidade, URL de exclusão, categoria. Salvar.
2. App Review › Permissions and features: pedir *Advanced Access* para as duas permissões.
3. Em cada permissão: colar o texto acima e enviar o vídeo correspondente.
4. Conferir que as duas chamadas de API aparecem como feitas e submeter.

Os nomes dos menus podem variar; seguir o que a tela pedir.

## Depois do App Review: Access Verification

Preenchida por um admin da FL². Prazo típico: cerca de 5 dias. Texto sugerido:

> FL² Engenharia e Sistemas (legal name FABIO DE LIMA LEMOS, CNPJ 40.257.611/0001-34) is a Brazilian software company that builds and operates PabxZap, a customer-service routing system for small businesses that use several WhatsApp Business numbers. Our customers onboard their own WhatsApp Business accounts through Embedded Signup and keep them in their own business portfolios. We access their accounts only to operate PabxZap on their behalf: routing customers between departments, sending service messages and showing the company's own service history on a private web portal. We do not sell or share this data, and message history is deleted after 15 days unless the customer defines another period in writing, as stated in our privacy policy: https://fl2engsys.com.br/politica-de-privacidade.html. Our first customer is a dental laboratory in Brazil with 8 WhatsApp Business numbers.
