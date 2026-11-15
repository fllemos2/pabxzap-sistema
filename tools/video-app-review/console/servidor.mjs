// Servidor do console de demonstração do App Review (http://localhost:5178).
// O token da Meta fica só neste processo; o navegador recebe apenas respostas já limpas.
//
// Uso isolado (para conferir a tela):
//   node --env-file-if-exists=.env tools/video-app-review/console/servidor.mjs --ensaio
// Sem --ensaio, os botões chamam a Meta de verdade (enviam mensagem e criam o template).

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarMeta, TEMPLATE_RESGATE } from './meta.mjs';

const PUBLICO = fileURLToPath(new URL('./publico/', import.meta.url));
export const PORTA = 5178;

const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

// Páginas locais que substituem o WhatsApp Web e o WhatsApp Manager no modo ensaio.
const PAGINAS = {
  '/': 'index.html',
  '/placeholder/whatsapp-web': 'placeholder-whatsapp-web.html',
  '/placeholder/whatsapp-manager': 'placeholder-whatsapp-manager.html',
};

export async function iniciarServidor({ ensaio = false, porta = PORTA, env = process.env, log = console.log } = {}) {
  const meta = criarMeta({ ensaio, env, log });
  if (!ensaio) {
    const falta = meta.faltando();
    if (falta.length) throw new Error(`Preencha no .env: ${falta.join(', ')}`);
  }

  const json = (res, status, obj) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  const rotas = {
    'GET /api/estado': async () => {
      const c = await meta.conta();
      return {
        ensaio,
        destinatario: meta.destinatarioMascarado(),
        numeroTeste: c.numeroTeste,
        nomeNumero: c.nomeNumero,
        template: TEMPLATE_RESGATE,
      };
    },
    'POST /api/enviar': () => meta.enviarHelloWorld(),
    'GET /api/templates': () => meta.listarTemplates(),
    'POST /api/templates': () => meta.criarTemplate(),
  };

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const rota = rotas[`${req.method} ${url.pathname}`];
    try {
      if (rota) return json(res, 200, await rota());
      const arquivo = PAGINAS[url.pathname] ?? url.pathname.slice(1);
      if (req.method !== 'GET' || arquivo.includes('..') || !/^[\w.-]+$/.test(arquivo)) return json(res, 404, { erro: 'não encontrado' });
      const corpo = await readFile(join(PUBLICO, arquivo));
      res.writeHead(200, { 'Content-Type': TIPOS[extname(arquivo)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(corpo);
    } catch (e) {
      if (e.code === 'ENOENT') return json(res, 404, { erro: 'não encontrado' });
      log(`erro em ${req.method} ${url.pathname}: ${e.message}`);
      json(res, 200, { ok: false, erro: e.message });
    }
  });

  await new Promise((ok, falha) => {
    servidor.once('error', (e) => falha(e.code === 'EADDRINUSE' ? new Error(`A porta ${porta} já está em uso. Feche o outro console e tente de novo.`) : e));
    servidor.listen(porta, '127.0.0.1', ok);
  });
  log(`console em http://localhost:${porta} (${ensaio ? 'MODO ENSAIO: respostas simuladas, nada vai para a Meta' : 'MODO REAL: os botões chamam a Meta'})`);

  return {
    url: `http://localhost:${porta}`,
    conta: () => meta.conta(),
    // Usado pelo gravador para não tentar criar de novo um template que já existe.
    templateExiste: async () => {
      const r = await meta.listarTemplates();
      if (!r.ok) throw new Error(`não consegui listar os templates (HTTP ${r.status}).`);
      return (r.dados?.data ?? []).some((t) => t.name === TEMPLATE_RESGATE.name);
    },
    fechar: () => new Promise((ok) => servidor.close(ok)),
  };
}

// Execução direta: node servidor.mjs [--ensaio]
if (process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase()) {
  iniciarServidor({ ensaio: process.argv.includes('--ensaio') }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
