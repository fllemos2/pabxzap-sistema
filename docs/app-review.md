# App Review — rascunho (ticket wf-pabxzap-13)

Rascunho de 24/10/2026, feito pelo agente com base na pesquisa oficial (vault: `wiki/fontes/fonte-pesquisa-app-review-tech-provider.md`). Revisar antes de submeter.

## O que a Meta exige (resumo da pesquisa)

- App do tipo Business, com ícone 1024×1024, URL da política de privacidade e categoria.
- Para cada permissão, um texto e um vídeo **separados**. Screenshots não são aceitos; rascunho não é revisado.
- Vídeo em 1080p, sem áudio, com interface em inglês ou legendas em inglês.
- Pelo menos uma chamada de API bem-sucedida por permissão nos 30 dias antes de submeter.
- Só a FL² verificada pode começar o App Review; depois vem a Access Verification.

## Checklist antes de submeter

- [ ] Ícone 1024×1024 (logo FL² em fundo branco, sem marcas da Meta)
- [ ] URL da política de privacidade: `https://fl2engsys.com.br/politica-de-privacidade.html`
- [ ] URL de exclusão de dados: `https://fl2engsys.com.br/politica-de-privacidade.html#exclusao`
- [ ] Categoria: *Business and Pages* (conferir as opções na tela)
- [ ] Chamada de API de envio feita no número de teste (ticket wf-pabxzap-15)
- [ ] Template criado no WhatsApp Manager
- [ ] Os dois vídeos gravados
- [ ] Só as permissões necessárias pedidas (não pedir `whatsapp_business_manage_events`)

## Textos (em inglês, para colar nos campos)

### whatsapp_business_messaging

> PabxZap is a customer-service routing system built by FL² Engenharia e Sistemas for small businesses in Brazil that use several WhatsApp Business numbers (one per department). When a customer writes to the company's main number, our app replies with a menu, issues a ticket number and sends a link that opens a chat with the chosen department, with the message already filled in. When the customer writes to that department, our app confirms the arrival; if the customer does not arrive within 15 minutes, the employee who forwarded the customer is alerted. We use this permission to send these service messages (menu, ticket number, forwarding link, short confirmation) and to receive incoming messages through the webhook. The business customer keeps using the WhatsApp Business app on their phones (coexistence).

### whatsapp_business_management

> Our business customers connect their own WhatsApp Business accounts to PabxZap through Embedded Signup. The WhatsApp Business Account stays in the customer's own business portfolio. We use this permission to read the customer's WhatsApp Business Account and phone numbers after onboarding, subscribe our app to the account's webhooks (including the coexistence fields), synchronize contacts and message history as required for WhatsApp Business app users, and manage the message templates used for follow-up messages outside the customer service window.

## Roteiro dos vídeos

Gravar a tela do computador em 1080p, sem áudio. Deixar o navegador em inglês ou adicionar legendas curtas em inglês.

### Vídeo 1 — whatsapp_business_messaging (cerca de 1 min)

1. Legenda: "Sending a message with the WhatsApp Cloud API".
2. Mostrar o App Dashboard › WhatsApp › **API Setup**, com o número de teste e o destinatário.
3. Copiar o cURL de envio e rodar no terminal (ou clicar em *Send message*).
4. Mostrar a resposta da API com o `message id`.
5. Mostrar o WhatsApp do destinatário (WhatsApp Web ou celular espelhado) com a mensagem recebida.

### Vídeo 2 — whatsapp_business_management (cerca de 1 min)

1. Legenda: "Creating a message template".
2. Abrir o **WhatsApp Manager** › Message templates › Create template.
3. Categoria *Utility*, nome `pabxzap_resgate`, idioma Portuguese (BR), texto: "Seu atendimento {{1}} ainda está aberto. Toque no link para continuar."
4. Enviar para aprovação e mostrar o template na lista.

## Depois do App Review

Preencher a **Access Verification** (Admin da FL²): descrever que a FL² usa os dados das empresas clientes só para operar o PabxZap para elas, conforme a política de privacidade. Prazo típico: cerca de 5 dias.
