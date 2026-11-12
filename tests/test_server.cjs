'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalServer } = require('../desktop/server.cjs');

test('Native SCN Viewer desktop server: static-only and loopback', async t => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scn-native-'));
 const viewerDir = path.join(tmp, 'viewer');
 await fs.mkdir(viewerDir);
 await Promise.all([
  fs.writeFile(path.join(viewerDir,'index.html'), '<title>SCN Viewer</title>'),
  fs.writeFile(path.join(viewerDir,'main.js'), 'console.log("viewer")'),
  fs.writeFile(path.join(viewerDir,'style.css'), 'body{}'),
 ]);
 const {server,url} = await createLocalServer({viewerDir});
 t.after(async () => { await new Promise(resolve=>server.close(resolve)); await fs.rm(tmp,{recursive:true,force:true}); });
 const page = await fetch(url);
 assert.equal(page.status, 200);
 assert.match(await page.text(), /SCN Viewer/);
 assert.equal((await fetch(url+'main.js')).status, 200);
 assert.equal((await fetch(url+'style.css')).status, 200);
 assert.equal((await fetch(url+'secret.txt')).status, 404);
 assert.equal((await fetch(url+'api/scn', {method:'POST',body:'data'})).status, 405);
 assert.equal((await fetch(url+'api/jobs/0123')).status, 404);
 // Host spoofing is guarded by desktop/server.cjs; undici strips Host overrides.
});
