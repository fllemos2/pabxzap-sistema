# App Review e Access Verification (ticket wf-pabxzap-13)

Rascunho de 24/10/2026, revisado em 10/11 e em 15/11/2026 pelo agente. Base: pesquisa oficial (vault: `wiki/fontes/fonte-pesquisa-app-review-tech-provider.md`) e decisões de 02/11 (alerta só no portal; resgate por template).

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
| Chamada de `whatsapp_business_messaging` | Feita em 15/11 (Hello World do vídeo 1); vale até 15/12 |
| Chamada de `whatsapp_business_management` | Feita em 15/11 (leituras do `npm run app-review` e criação do template do vídeo 2); vale até 15/12 |
| Template de demonstração | `pabxzap_resgate` criado em 15/11 na conta de teste, sem botão (id 1139284682145891) |
| Os dois vídeos | Gravados em 15/11: `tools/video-app-review/saida/video-1-messaging.mp4` e `video-2-management.mp4` (1920×1080, sem áudio, legendas em inglês) |
| Permissões pedidas | `whatsapp_business_messaging`, `whatsapp_business_management` e `public_profile` (este veio do caso de uso *Facebook Login for Business*; mantido por causa do Embedded Signup) |
| Submissão | **Enviada em 15/11/2026.** Status *Review in progress*; a Meta indica até 20 dias (cerca de 05/12) |

## Textos (em inglês, para colar nos campos)

### whatsapp_business_messaging

> PabxZap is a customer-service routing system built by FL² Engenharia e Sistemas for small businesses in Brazil that use several WhatsApp Business numbers, one per department. When a customer writes to the company's main number, our app replies with a menu, issues a ticket number and sends a link that opens a chat with the chosen department, with the message already filled in. When the customer writes to that department, our app sends a short confirmation. If the customer does not arrive within 15 minutes, an alert is shown on the company's web portal, and the company can resend the link. We use this permission to send these service messages (menu, ticket number, forwarding link, short confirmation and, when the 24-hour window has closed, an approved utility template to remind the customer of the open ticket) and to receive incoming messages through the webhook. The business keeps using the WhatsApp Business app on its phones (coexistence).

### whatsapp_business_management

> Our business customers connect their own WhatsApp Business accounts to PabxZap through Embedded Signup. The WhatsApp Business Account stays in the customer's own business portfolio. We use this permission to read the customer's WhatsApp Business Account and phone numbers after onboarding, subscribe our app to the account's webhooks (including the coexistence fields), synchronize contacts and message history as required for WhatsApp Business app users, and manage the utility message template used to remind a customer of an open ticket outside the customer service window.

## Vídeos

Gravados automaticamente pelo console e pelo gravador de `tools/video-app-review/` (passo a passo em `tools/video-app-review/LEIA-ME.md`). As legendas em inglês estão no próprio vídeo.

| Vídeo | Permissão | O que mostra |
|---|---|---|
| `video-1-messaging.mp4` (37 s) | `whatsapp_business_messaging` | Console do PabxZap › Send test message › resposta com o message ID › WhatsApp Web do destinatário com a mensagem recebida |
| `video-2-management.mp4` (65 s) | `whatsapp_business_management` | Console › Templates › lista da conta › criação do `pabxzap_resgate` (Utility, pt_BR, corpo e exemplos) › ID e status PENDING › o template no WhatsApp Manager |

Template do vídeo 2, corpo: `Olá! Seu atendimento {{1}} com o setor {{2}} ainda está aberto. Responda esta mensagem para continuar a conversa.` (exemplos: `20261110-0042`, `Financeiro`). A Meta recusou a primeira versão, com botão `https://wa.me/{{1}}`: "Direct links to WhatsApp aren't allowed for buttons". O template de produção, na conta do laboratório, ainda depende de decidir como o resgate leva o cliente ao setor.

Para regravar: gerar um token novo (WhatsApp › Basic setup › Step 1. Try it out), colar em `META_TEST_ACCESS_TOKEN` e rodar `npm run video:gravar -- --video 1`. O vídeo 2 se recusa a rodar se o `pabxzap_resgate` já existir.

## Submissão (App Dashboard do app PabxZap)

Os nomes dos menus mudam com frequência; seguir o que a tela pedir.

1. **App settings › Basic:** conferir ícone, URL da política de privacidade, URL de exclusão de dados, categoria e e-mail de contato. Salvar.
2. **Pedir as permissões:** em *Use cases › Connect with customers through WhatsApp › Customize* (ou em *Other tools › Permissions and features*), clicar em **+ Add** / *Request advanced access* em `whatsapp_business_messaging` e `whatsapp_business_management`. Não pedir outras.
3. **Preencher o pedido** (em *App Review › Requests* ou *Required actions*), para cada permissão:
   - colar o texto em inglês da seção "Textos";
   - enviar o vídeo correspondente (vídeo 1 para messaging, vídeo 2 para management);
   - marcar as declarações de uso pedidas.
4. Conferir que as duas chamadas de API aparecem como feitas e clicar em **Submit for review**.
5. Acompanhar em *App Review › Requests*. Se a Meta pedir ajuste, responder pelo próprio pedido.

### Como foi preenchido em 15/11/2026 (para reenvio ou correção)

- **Plataforma:** *Website*, Site URL `https://fl2engsys.com.br/` (exigida para liberar *Reviewer instructions*). Trocar pelo endereço do portal quando ele estiver no ar.
- **Data handling:** um processador, `Supabase, Inc.` (hospedagem/armazenamento e processamento; país da região do projeto + United States). Responsável pelos dados: FABIO DE LIMA LEMOS (FL² Engenharia e Sistemas), CNPJ 40.257.611/0001-34, Brazil. Pedidos de autoridades nos últimos 12 meses: *No*. Políticas marcadas: revisão da legalidade, contestação de pedidos ilegais, minimização de dados e documentação dos pedidos.
- **Reviewer instructions:** *Is Facebook Login integrated?* **No**, porque o Embedded Signup ainda não foi implementado. O texto explica que o site é institucional e que o portal é privado e está em desenvolvimento, lista as APIs usadas e diz que o Facebook Login for Business será usado só no Embedded Signup, apenas com `public_profile`.
- **Campos opcionais:** sem credenciais de teste ("Not applicable"), sem geo-blocking (atende empresas no Brasil), e os dois vídeos anexados também em *supporting documentation*.
- **Risco conhecido:** o `public_profile` pode ser recusado porque o Facebook Login ainda não existe no site. Isso não afeta as duas permissões do WhatsApp; pedir de novo com um vídeo do Embedded Signup quando ele estiver pronto.

## Depois do App Review: Access Verification

Preenchida por um admin da FL². Prazo típico: cerca de 5 dias. Texto sugerido:

> FL² Engenharia e Sistemas (legal name FABIO DE LIMA LEMOS, CNPJ 40.257.611/0001-34) is a Brazilian software company that builds and operates PabxZap, a customer-service routing system for small businesses that use several WhatsApp Business numbers. Our customers onboard their own WhatsApp Business accounts through Embedded Signup and keep them in their own business portfolios. We access their accounts only to operate PabxZap on their behalf: routing customers between departments, sending service messages and showing the company's own service history on a private web portal. We do not sell or share this data, and message history is deleted after 15 days unless the customer defines another period in writing, as stated in our privacy policy: https://fl2engsys.com.br/politica-de-privacidade.html. Our first customer is a dental laboratory in Brazil with 8 WhatsApp Business numbers.
