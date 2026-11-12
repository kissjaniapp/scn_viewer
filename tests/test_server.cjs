'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createLocalServer } = require('../desktop/server.cjs');

test('Electron desktop local server: UI, API, SCN upload and Bridge response', async (t) => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'scn-viewer-test-'));
  const viewerDir = path.join(tmp, 'viewer');
  const bridgeRoot = path.join(tmp, 'bridge');
  await fs.mkdir(viewerDir);
  await fs.writeFile(path.join(viewerDir, 'index.html'), '<!doctype html><title>SCN Viewer</title>');
  await fs.writeFile(path.join(viewerDir, 'main.js'), 'console.log("viewer")');
  await fs.writeFile(path.join(viewerDir, 'style.css'), 'body{}');
  const { server, url, queue } = await createLocalServer({ viewerDir, bridgeRoot });
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(tmp, { recursive: true, force: true }); });

  const index = await fetch(url);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /SCN Viewer/);
  assert.match(index.headers.get('content-type'), /text\/html/);
  const js = await fetch(url + 'main.js');
  assert.equal(js.status, 200);
  assert.match(await js.text(), /viewer/);
  const missing = await fetch(url + 'not-a-file.txt');
  assert.equal(missing.status, 404);
  const health = await (await fetch(url + 'api/health')).json();
  assert.deepEqual(health, { server: true, bridge: false });

  const headers = { 'Content-Type': 'application/octet-stream', 'X-Scn-Viewer': '1', 'Origin': url.slice(0, -1) };
  const rejected = await fetch(url + 'api/scn', { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' }, body: Buffer.from('SCN') });
  assert.equal(rejected.status, 403);

  const uploaded = await fetch(url + 'api/scn', { method: 'POST', headers, body: Buffer.from('SCN SAMPLE') });
  assert.equal(uploaded.status, 202);
  const { id } = await uploaded.json();
  assert.match(id, /^[a-f0-9]{32}$/);
  assert.equal((await fs.readFile(path.join(queue, id + '.scn'))).toString(), 'SCN SAMPLE');
  assert.equal((await (await fetch(url + `api/jobs/${id}`)).json()).state, 'pending');
  await fs.writeFile(path.join(queue, id + '.obj'), 'o Sample\nv 0 0 0\n');
  await fs.writeFile(path.join(queue, id + '.manifest.json'), JSON.stringify({ source: 'test' }));
  await fs.writeFile(path.join(queue, id + '.done'), 'ok');
  assert.equal((await (await fetch(url + `api/jobs/${id}`)).json()).state, 'done');
  assert.match(await (await fetch(url + `api/model/${id}`)).text(), /o Sample/);
  assert.deepEqual(await (await fetch(url + `api/manifest/${id}`)).json(), { source: 'test' });
  await fs.writeFile(path.join(bridgeRoot, 'heartbeat'), 'active');
  assert.equal((await (await fetch(url + 'api/health')).json()).bridge, true);
});
