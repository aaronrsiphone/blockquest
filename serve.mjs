// Tiny zero-dependency static server for the BLOCKQUEST production build,
// with a local-only /__update endpoint that runs `git pull`.
import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, 'dist');
const port = 8044;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

http
  .createServer((req, res) => {
    // Local update endpoint: runs `git pull` in the repo root.
    // The custom header makes cross-origin abuse from web pages impossible
    // (it forces a CORS preflight, which we never answer).
    if (req.method === 'POST' && req.url === '/__update') {
      if (req.headers['x-requested-with'] !== 'blockquest') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, output: 'forbidden' }));
      }
      execFile('git', ['pull'], { cwd: __dirname }, (err, stdout, stderr) => {
        const output = ((stdout || '') + (stderr || '')).trim().slice(0, 4000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: !err, output: output || (err ? String(err.message) : 'done') }));
      });
      return;
    }

    let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (p === '/') p = '/index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        return res.end('not found');
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream' });
      res.end(data);
    });
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`BLOCKQUEST running at http://localhost:${port}`);
  });
