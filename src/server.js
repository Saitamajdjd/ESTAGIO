import { createServer as httpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { JsonStore } from './storage.js';
import { act, createDeal, ensure, recordEvent } from './domain.js';
import { runAutomation } from './automation.js';
import { publicState } from './view.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const staticFiles = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req) {
  ensure(req.headers['content-type']?.split(';')[0] === 'application/json', 'Utilize Content-Type application/json.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    ensure(size <= 3 * 1024 * 1024, 'Requisição muito grande (máximo 3 MB).', 413);
    chunks.push(chunk);
  }
  try {
    const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    ensure(input && typeof input === 'object' && !Array.isArray(input), 'Envie um objeto JSON.');
    return input;
  } catch (error) { ensure(false, error.status ? error.message : 'JSON inválido.', 400); }
}
export function createApp(store = new JsonStore()) {
  return httpServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      ensure(/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host), 'Host não permitido.', 403);
      if (req.headers.origin) ensure(req.headers.origin === `http://${host}`, 'Origem não permitida.', 403);
      const { pathname } = new URL(req.url, `http://${host}`);
      if (req.method === 'GET' && staticFiles[pathname]) {
        const [file, type] = staticFiles[pathname];
        const content = await readFile(resolve(publicDir, file));
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        return res.end(content);
      }
      if (req.method === 'GET' && pathname === '/api/state') return json(res, 200, publicState(await store.read()));
      if (req.method === 'GET' && pathname === '/api/health') return json(res, 200, { status: 'ok' });
      const download = pathname.match(/^\/api\/documents\/([^/]+)$/);
      if (req.method === 'GET' && download) {
        const state = await store.read();
        const document = state.documents.find(d => d.id === download[1]);
        ensure(document, 'Documento não encontrado.', 404);
        res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(document.name)}`, 'Cache-Control': 'no-store' });
        return res.end(Buffer.from(document.base64, 'base64'));
      }
      if (req.method === 'POST') {
        const input = await body(req);
        let result;
        if (pathname === '/api/demo/reset') {
          ensure(Number.isSafeInteger(input.revision), 'Atualize o painel antes de restaurar a demonstração.');
          const reset = await store.reset(input.revision);
          result = { result: reset, revision: reset.revision };
        }
        else if (pathname === '/api/deals') result = await store.transact(state => createDeal(state, input), input.revision);
        else if (pathname === '/api/simulate') result = await store.transact(state => runAutomation(state, input.date, { source: 'simulator', dealId: input.dealId || null }), input.revision);
        else if (pathname.match(/^\/api\/deals\/[^/]+\/actions$/)) {
          const dealId = pathname.split('/')[3];
          result = await store.transact(state => act(state, dealId, input.action, input.payload || {}), input.revision);
        } else if (pathname.match(/^\/api\/notifications\/[^/]+\/read$/)) {
          result = await store.transact(state => {
            const notification = state.notifications.find(n => n.id === pathname.split('/')[3]);
            ensure(notification, 'Notificação não encontrada.', 404);
            ensure(notification.recipient === 'consultant', 'Mensagem ao proprietário permanece pendente; não há integração de envio.');
            if (notification.status === 'pending') {
              notification.status = 'read';
              recordEvent(state, { dealId: notification.dealId, cycleId: notification.cycleId, type: 'notification-read', key: `${notification.id}:read`, message: 'Consultor registrou a leitura do aviso interno.' });
            }
            return notification;
          }, input.revision);
        } else ensure(false, 'Rota não encontrada.', 404);
        return json(res, 200, result);
      }
      json(res, 404, { error: 'Recurso não encontrado.' });
    } catch (error) {
      if (error.status >= 500 || !error.status) console.error(error.message);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : 'Falha ao processar a solicitação. Consulte o terminal do servidor.' });
      else res.end();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  const store = new JsonStore();
  await store.read();
  const server = createApp(store);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Porta ${port} ocupada. No PowerShell use $env:PORT=3001; npm.cmd start` : error.message);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`\nLocaFlux — demonstração complementar do case NIA\nLocal: http://localhost:${port}\nDados: ${store.file}\nVerificação manual pela interface ou CLI. Nenhum agendador configurado.\n`);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
}
