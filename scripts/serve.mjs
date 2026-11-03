// Servidor estático mínimo para `dist/` (sem dependências).
// Uso: node scripts/serve.mjs [porta] [pasta]   (padrão: 8080 e dist/; também PORT=…)
// Porta 0 escolhe uma porta livre; a porta real é impressa em "Servindo … em http://localhost:PORTA/".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// Resolve a URL para um arquivo dentro de `raiz`; devolve null se escapar da pasta.
export function resolverCaminho(raiz, urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (p.includes('\0')) return null;
  const alvo = path.resolve(raiz, '.' + path.posix.normalize('/' + p));
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;
  return alvo;
}

export function criarServidor(raiz) {
  const base = path.resolve(raiz);
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let alvo = resolverCaminho(base, req.url || '/');
    if (!alvo) { res.writeHead(400).end('Requisição inválida'); return; }
    try {
      if (fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'index.html');
    } catch { /* cai no 404 abaixo */ }
    fs.readFile(alvo, (err, dados) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado'); return; }
      res.writeHead(200, {
        'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream',
        'Content-Length': dados.length,
        'Cache-Control': 'no-store',
      });
      res.end(req.method === 'HEAD' ? undefined : dados);
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raizPadrao = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const porta = Number(process.argv[2] ?? process.env.PORT ?? 8080);
  const raiz = process.argv[3] ? path.resolve(process.argv[3]) : raizPadrao;
  if (!fs.existsSync(raiz)) {
    console.error(`Pasta ${raiz} não existe. Rode "node build.mjs" antes.`);
    process.exit(1);
  }
  const srv = criarServidor(raiz);
  srv.listen(porta, '127.0.0.1', () => {
    console.log(`Servindo ${raiz} em http://localhost:${srv.address().port}/`);
  });
}
