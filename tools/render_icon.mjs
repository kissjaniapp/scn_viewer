/** Generate raster sizes from the SAME branded SVG used by the UI.
 * The Windows .ico is assembled by tools/make_icon.py.
 */
import { Resvg } from '@resvg/resvg-js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const svg=await readFile(path.join(root,'viewer/job-viewer-logo.svg'),'utf8');
const directory=path.join(root,'installer','.icon-sizes');
await mkdir(directory,{recursive:true});
for (const size of [16,24,32,48,64,128,256]) {
 const renderer=new Resvg(svg,{fitTo:{mode:'width',value:size}});
 const png=renderer.render().asPng();
 await writeFile(path.join(directory,`${size}.png`),png);
 console.log(`JOB logo: ${size}x${size} png`);
}
