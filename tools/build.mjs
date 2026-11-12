import { build } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(path.join(dist, 'viewer'), { recursive: true });

await build({
  entryPoints: [path.join(root, 'viewer/main.js')],
  outfile: path.join(dist, 'viewer/main.js'),
  bundle: true,
  platform: 'browser',
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  logLevel: 'info',
});

let html = await readFile(path.join(root, 'viewer/index.html'), 'utf8');
const importMap = /\s*<script\s+type="importmap">[\s\S]*?<\/script>/i;
if (!importMap.test(html)) throw new Error('Missing import map in source HTML. Review offline bundle update.');
html = html.replace(importMap, '');
await writeFile(path.join(dist, 'viewer/index.html'), html, 'utf8');
await cp(path.join(root, 'viewer/style.css'), path.join(dist, 'viewer/style.css'));
console.log('Offline Windows application staged in dist/.');
