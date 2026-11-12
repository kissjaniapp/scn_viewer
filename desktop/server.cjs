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
function jsonReply(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

function isValidCorrections(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > 2000) return false;
  return entries.every(([id, offset]) => /^[0-9]{1,6}$/.test(id) &&
    Array.isArray(offset) && offset.length === 3 &&
    offset.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 30000));
}

function reply(res, code, message) {
  res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(message);
}
async function createLocalServer({ viewerDir, dataDir } = {}) {
  if (!viewerDir) throw new Error('Nincs megadva a Viewer telepítési könyvtára.');
  const server = http.createServer(async (req, res) => {
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    if (req.headers.host !== `127.0.0.1:${address.port}`) { reply(res, 403, 'Tiltott cím.'); return; }
    let pathname;
    try { pathname = new URL(req.url || '/', origin).pathname; }
    catch { reply(res, 400, 'Hibás cím.'); return; }
    const placementMatch = /^\/api\/placement\/([a-f0-9]{64})$/.exec(pathname);
    if (placementMatch && dataDir) {
      const filename = path.join(dataDir, 'scn-positions', placementMatch[1] + '.json');
      if (req.method === 'GET') {
        try {
          const saved = JSON.parse(await fsp.readFile(filename, 'utf8'));
          jsonReply(res, 200, { adjustments: isValidCorrections(saved.adjustments) ? saved.adjustments : {} });
        } catch (error) {
          if (error.code === 'ENOENT') jsonReply(res, 200, { adjustments: {} });
          else jsonReply(res, 500, { error: 'A korábbi igazítások nem olvashatók.' });
        }
        return;
      }
      if (req.method !== 'POST' || req.headers.origin !== origin ||
          req.headers['x-scn-viewer'] !== '1' ||
          req.headers['content-type']?.split(';')[0] !== 'application/json') {
        reply(res, 403, 'Tiltott módosítás.'); return;
      }
      try {
        let byteCount = 0;
        const chunks = [];
        for await (const chunk of req) {
          byteCount += chunk.length;
          if (byteCount > 65536) { jsonReply(res, 413, { error: 'Túl sok pozícióadat.' }); return; }
          chunks.push(chunk);
        }
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!isValidCorrections(parsed.adjustments)) {
          jsonReply(res, 400, { error: 'Érvénytelen milliméteres eltolás.' }); return;
        }
        const directory = path.dirname(filename);
        await fsp.mkdir(directory, { recursive: true });
        const temp = filename + '.' + process.pid + '.tmp';
        try {
          await fsp.writeFile(temp, JSON.stringify({ adjustments: parsed.adjustments }), { flag: 'w' });
          await fsp.rename(temp, filename);
        } finally { await fsp.rm(temp, { force: true }).catch(() => {}); }
        jsonReply(res, 200, { saved: true });
      } catch { jsonReply(res, 400, { error: 'Hibás pozícióadat.' }); }
      return;
    }
    if (req.method !== 'GET') { reply(res, 405, 'Nem támogatott művelet.'); return; }
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
