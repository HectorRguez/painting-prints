import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
await build({entryPoints:['src/engines/map-worker.ts'],outfile:'tmp/map-bake.mjs',bundle:true,platform:'node',format:'esm'});
const { generateMap } = await import('../../tmp/map-bake.mjs');
const manifest=JSON.parse(await readFile('public/cache/manifest.json','utf8'));
await mkdir('public/cache/maps-v3',{recursive:true});
for(const [i,entry] of manifest.maps.entries()) {
  let hash=2166136261;
  for(const char of entry.seed)hash=Math.imul(hash^char.charCodeAt(0),16777619);
  const painting={type:'painting-ready',mode:'maps',artRevision:3,seed:entry.seed,svg:generateMap(hash>>>0||1),width:1000,height:1000,paperColor:'#fff'};
  const stem=`maps-v3/${i}`;
  await writeFile(`public/cache/${stem}.json.gz`,gzipSync(JSON.stringify(painting)));
  Object.assign(entry,{artRevision:3,asset:`${stem}.json.gz`});
  console.log(`3D map ${i+1}/10`);
}
await writeFile('public/cache/manifest.json',JSON.stringify(manifest));
