'use strict';

// Self-contained local HTTP host for the Electron desktop window.
// No browser tab, hidden PowerShell process, fixed port, or internet is required.
const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');

const MAX_SCN_BYTES = 50 * 1024 * 1024;
const JOB_ID = /^[a-f0-9]{32}$/;
const STATIC_FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/main.js': ['main.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};
const BRIDGE_ROOT = path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ScnViewerBridge');

function writeResponse(res, status, body, type = 'application/json; charset=utf-8') {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self' data: blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'",
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function exists(file) {
  try { await fsp.access(file); return true; } catch { return false; }
}

async function createLocalServer({ viewerDir, bridgeRoot = BRIDGE_ROOT } = {}) {
  if (!viewerDir) throw new Error('Hiányzik a Viewer programkönyvtára.');
  const queue = path.join(bridgeRoot, 'queue');
  await fsp.mkdir(queue, { recursive: true });

  const server = http.createServer(async (req, res) => {
    req.setTimeout(30000, () => req.destroy());
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    const requestHost = req.headers.host;
    if (requestHost !== `127.0.0.1:${address.port}`) {
      writeResponse(res, 403, { error: 'Tiltott szervercím.' });
      return;
    }
    const pathname = new URL(req.url || '/', origin).pathname;
    try {
      if (pathname === '/api/scn' && req.method === 'POST') {
        if (req.headers.origin !== origin || req.headers['x-scn-viewer'] !== '1' || req.headers['content-type'] !== 'application/octet-stream') {
          writeResponse(res, 403, { error: 'Tiltott SCN-kérés.' });
          return;
        }
        const lengthString = req.headers['content-length'];
        const length = Number(lengthString);
        if (!/^\d+$/.test(lengthString || '') || !Number.isSafeInteger(length) || length < 1) {
          writeResponse(res, 400, { error: 'Hiányzó vagy hibás SCN-fájlméret.' });
          return;
        }
        if (length > MAX_SCN_BYTES) {
          writeResponse(res, 413, { error: 'Legfeljebb 50 MB-os SCN megnyitható.' });
          return;
        }
        const id = crypto.randomUUID().replace(/-/g, '');
        const base = path.join(queue, id);
        const part = `${base}.part`;
        const input = `${base}.scn`;
        let received = 0;
        try {
          req.on('data', chunk => { received += chunk.length; if (received > length) req.destroy(); });
          await pipeline(req, fs.createWriteStream(part, { flags: 'wx' }));
          if (received !== length) throw new Error('Hiányos SCN-fájl.');
          await fsp.rename(part, input);
          // KitchenDraw Bridge observes only completed uploads marked *.pending.
          await fsp.writeFile(`${base}.pending`, 'ready', 'ascii');
        } catch (error) {
          await Promise.allSettled([fsp.rm(part, { force: true }), fsp.rm(input, { force: true })]);
          if (!res.destroyed) writeResponse(res, 400, { error: `SCN átvitel sikertelen: ${error.message}` });
          return;
        }
        writeResponse(res, 202, { id, state: 'pending' });
        return;
      }

      if (req.method !== 'GET') {
        writeResponse(res, 405, { error: 'Nem támogatott HTTP művelet.' });
        return;
      }
      if (pathname === '/api/health') {
        const heartbeat = path.join(bridgeRoot, 'heartbeat');
        let connected = false;
        try { connected = Date.now() - (await fsp.stat(heartbeat)).mtimeMs < 6000; } catch {}
        writeResponse(res, 200, { server: true, bridge: connected });
        return;
      }
      const match = /^\/api\/(jobs|model|manifest)\/([a-f0-9]{32})$/.exec(pathname);
      if (match) {
        const [, kind, id] = match;
        if (!JOB_ID.test(id)) { writeResponse(res, 400, { error: 'Hibás azonosító.' }); return; }
        const base = path.join(queue, id);
        if (kind === 'jobs') {
          const state = await exists(`${base}.error.txt`) ? 'error' :
            (await exists(`${base}.done`) && await exists(`${base}.obj`)) ? 'done' :
            await exists(`${base}.working`) ? 'working' :
            await exists(`${base}.pending`) ? 'pending' : 'not_found';
          const result = { state };
          if (state === 'error') result.message = (await fsp.readFile(`${base}.error.txt`, 'utf8')).slice(0, 2000);
          writeResponse(res, 200, result);
          return;
        }
        if (!await exists(`${base}.done`)) { writeResponse(res, 404, { error: 'A modell még nincs kész.' }); return; }
        const filepath = kind === 'model' ? `${base}.obj` : `${base}.manifest.json`;
        if (!await exists(filepath)) { writeResponse(res, 404, { error: 'Nincs exportált fájl.' }); return; }
        res.writeHead(200, {
          'Content-Type': kind === 'model' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        });
        fs.createReadStream(filepath).on('error', () => res.destroy()).pipe(res);
        return;
      }

      const asset = STATIC_FILES[pathname];
      if (!asset) { writeResponse(res, 404, { error: 'Nem található.' }); return; }
      const assetPath = path.join(viewerDir, asset[0]);
      if (!await exists(assetPath)) { writeResponse(res, 500, { error: 'Hiányzik az alkalmazás egyik fájlja.' }); return; }
      res.writeHead(200, {
        'Content-Type': asset[1], 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Content-Security-Policy': "default-src 'self' blob: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' blob: data:"
      });
      fs.createReadStream(assetPath).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      writeResponse(res, 500, { error: `Helyi hiba: ${error.message}` });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.removeListener('error', reject); resolve(); });
  });
  return { server, url: `http://127.0.0.1:${server.address().port}/`, queue };
}

module.exports = { createLocalServer, MAX_SCN_BYTES };
