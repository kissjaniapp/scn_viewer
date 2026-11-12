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

test('SCN placement data: same-origin, persistent within app userData and non-destructive', async t => {
 const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scn-placement-'));
 const viewerDir = path.join(tmp,'viewer');
 const dataDir = path.join(tmp,'userdata');
 await fs.mkdir(viewerDir);
 await fs.writeFile(path.join(viewerDir,'index.html'),'SCN');
 const {server,url} = await createLocalServer({viewerDir,dataDir});
 t.after(async () => {
  await new Promise(resolve=>server.close(resolve));
  await fs.rm(tmp,{recursive:true,force:true});
 });
 const hash='f'.repeat(64), endpoint=url+'api/placement/'+hash;
 const missing=await fetch(endpoint);
 assert.equal(missing.status,200);
 assert.deepEqual((await missing.json()).adjustments,{});
 const options={method:'POST',headers:{'Content-Type':'application/json','X-Scn-Viewer':'1',Origin:url.slice(0,-1)},body:JSON.stringify({adjustments:{223:[0,-60,40]}})};
 assert.equal((await fetch(endpoint,{...options,headers:{...options.headers,Origin:'http://malicious.invalid'}})).status,403);
 assert.equal((await fetch(endpoint,{...options,body:JSON.stringify({adjustments:{223:[0,Infinity,0]}})})).status,400);
 assert.equal((await fetch(endpoint,{...options,body:JSON.stringify({adjustments:{223:[40000,0,0]}})})).status,400);
 const put=await fetch(endpoint,options);
 assert.equal(put.status,200);
 assert.equal((await put.json()).saved,true);
 assert.deepEqual((await (await fetch(endpoint)).json()).adjustments,{'223':[0,-60,40]});
 const filename=path.join(dataDir,'scn-positions',hash+'.json');
 const stored=JSON.parse(await fs.readFile(filename,'utf8'));
 assert.deepEqual(stored.adjustments,{'223':[0,-60,40]});
 assert.equal((await fetch(url+'api/placement/not-a-hash')).status,404);
 // A new random local port must still access the same on-disk correction.
 await new Promise(resolve=>server.close(resolve));
 const resumed = await createLocalServer({viewerDir,dataDir});
 try {
  const restored=await (await fetch(resumed.url+'api/placement/'+hash)).json();
  assert.deepEqual(restored.adjustments,{'223':[0,-60,40]});
 } finally { await new Promise(resolve=>resumed.server.close(resolve)); }
});
