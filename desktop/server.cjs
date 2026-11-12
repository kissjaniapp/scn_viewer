'use strict';
// Minimal loopback HTTP server for SCN Viewer's own Electron window.
// The SCN is parsed locally in the renderer; files are not uploaded anywhere.
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const ASSETS = Object.freeze({
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/main.js': ['main.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
});
function reply(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}
async function createLocalServer({ viewerDir } = {}) {
  if (!viewerDir) throw new Error('Nincs megadva a Viewer telepítési könyvtára.');
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    if (req.headers.host !== `127.0.0.1:${address.port}`) { reply(res, 403, 'Tiltott cím.'); return; }
    if (req.method !== 'GET') { reply(res, 405, 'Nem támogatott művelet.'); return; }
    let pathname;
    try { pathname = new URL(req.url || '/', origin).pathname; }
    catch { reply(res, 400, 'Hibás cím.'); return; }
    const asset = ASSETS[pathname];
    if (!asset) { reply(res, 404, 'Nem található.'); return; }
    const pathnameOnDisk = path.join(viewerDir, asset[0]);
    try {
      await fsp.access(pathnameOnDisk);
      res.writeHead(200, {
        'Content-Type': asset[1],
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'",
      });
      fs.createReadStream(pathnameOnDisk).on('error', () => res.destroy()).pipe(res);
    } catch { reply(res, 500, 'Hiányzik egy telepített fájl.'); }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}
module.exports = { createLocalServer };
