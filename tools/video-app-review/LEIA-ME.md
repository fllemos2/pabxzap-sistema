# Vídeos do App Review da Meta

Grava os dois vídeos pedidos no App Review (um por permissão), em 1920×1080, sem áudio e com legendas em inglês:

- `saida/video-1-messaging.mp4`: `whatsapp_business_messaging` (envia o `hello_world` e mostra a mensagem chegando no WhatsApp Web);
- `saida/video-2-management.mp4`: `whatsapp_business_management` (cria o template `pabxzap_resgate` e mostra no WhatsApp Manager).

O roteiro e os textos estão em `docs/app-review.md`. A gravação é feita pelo Playwright no Chrome instalado, sem depender da tela do notebook.

## Uma vez

1. `npm install`. Se aparecer erro de ffmpeg do Playwright ao gravar, rode `npx playwright install ffmpeg` (não baixa navegador).
2. No `.env`, preencha `META_TEST_RECIPIENT` com o telefone do destinatário de teste (só dígitos, com 55 e DDD). Esse número precisa estar na lista de destinatários do número de teste (API Setup).
3. Ensaio, sem chamar a Meta: `npm run video:ensaio`. Assista os dois MP4 em `saida/`. Eles aparecem com o selo amarelo "REHEARSAL" e com páginas "PLACEHOLDER" no lugar do WhatsApp Web e do WhatsApp Manager. **Não envie esses vídeos para a Meta.**
4. Login: `npm run video:login`. No Chrome que abrir, entre no Facebook (deixe o idioma em *English (US)*) e no WhatsApp Web (leia o QR code com o celular do destinatário de teste). Depois, feche o navegador.

## Gravar de verdade

1. Gere o token em App Dashboard › WhatsApp › API Setup e cole em `META_TEST_ACCESS_TOKEN` no `.env` (vence em 24 h).
2. Feche o WhatsApp Web em outros navegadores e o Chrome do `video:login`.
3. Vídeo 1: `npm run video:gravar -- --video 1`. **Envia a mensagem de verdade.** Pode repetir quantas vezes quiser.
4. Vídeo 2: `npm run video:gravar -- --video 2`. **Cria o template de verdade, e só dá para fazer uma vez** (veja abaixo).
5. Assista os dois MP4 em `saida/` antes de enviar: confira que nenhum número pessoal aparece sem desfoque.

Com `npm run video:gravar` sem `--video`, grava os dois em sequência.

## Se algo falhar

- Se o gravador parar no meio, o que já foi gravado fica em `saida/<nome>-parcial.mp4`.
- "O WhatsApp Web pediu o QR code" ou "O Facebook pediu login": rode `npm run video:login` de novo.
- "O template não apareceu no WhatsApp Manager": abra o WhatsApp Manager no `video:login`, vá até *Message templates*, copie a URL da barra de endereço para `META_WA_MANAGER_URL` no `.env` e grave de novo só o vídeo 2 (leia antes a seção seguinte).

### Se o vídeo 2 precisar ser regravado

O gravador se recusa a gravar o vídeo 2 quando o `pabxzap_resgate` já existe, porque o botão *Create template* daria erro na tela. Nesse caso, use o `video-2-management-parcial.mp4` (que já mostra a criação) ou apague o template no WhatsApp Manager antes de gravar de novo. A Meta pode impedir que um nome apagado seja reusado por algum tempo, por isso é melhor acertar a URL do WhatsApp Manager no ensaio e no `video:login` antes de gravar.

## Privacidade

- O token fica só no servidor local (`console/servidor.mjs`); a página do console nunca o recebe, e as respostas são limpas antes de ir para a tela.
- O telefone do destinatário aparece mascarado (`+55 •• •••••-1234`), inclusive na resposta da API.
- No WhatsApp Web, o perfil próprio e a lista de conversas ficam desfocados, exceto a conversa com o número de teste. Se a página mudar de estrutura, a lista inteira é desfocada.
- O `message id` (`wamid…`) aparece inteiro, porque a Meta quer vê-lo.

## Arquivos

| Arquivo | O que faz |
|---|---|
| `console/servidor.mjs` | Console em `http://localhost:5178` (aba Messaging e aba Templates); `--ensaio` simula as respostas |
| `console/meta.mjs` | Chamadas à Graph API e a definição do template `pabxzap_resgate` |
| `console/publico/` | Página do console e as páginas "placeholder" do ensaio |
| `gravar.mjs` | Roteiro dos vídeos: legendas, cursor, realce, abas e conversão para MP4 |
| `sobreposicao.mjs` | Legenda, cursor e realce injetados na página; máscara do WhatsApp Web |
| `login.mjs` | Abre o perfil persistente (`.perfil/`) para o login único |
