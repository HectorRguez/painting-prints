import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { artworkSvg } from '../../src/artwork-svg.js';
import { measureInk } from '../../src/ink-measurement.js';
const base = new URL('../../public/cache/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
const source = await readFile(new URL('../../public/generators/landscapes/engine.js', import.meta.url), 'utf8');
const wasm = await readFile(new URL('../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
await mkdir(new URL('landscapes-v2/', base), { recursive: true });
for (const [i, entry] of manifest.landscapes.entries()) {
  const old = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, base))));
  const target = { innerHTML: '' };
  const context = vm.createContext({ console: { log() {} }, btoa, location: { href: `https://cache.local/?seed=${entry.seed}` }, document: { addEventListener() {}, getElementById: () => target } });
  vm.runInContext('window = self = globalThis;', context);
  vm.runInContext(source, context);
  vm.runInContext('MEM.windx = 3200; MEM.windy = 800; calcViewBox = () => "0 0 3200 800"; update();', context);
  const painting = { ...old, artRevision: 2, width: 800 * Math.SQRT2, height: 800, previewWidth: 3200, svg: target.innerHTML };
  const asset = `landscapes-v2/${i}.json.gz`;
  await writeFile(new URL(asset, base), gzipSync(JSON.stringify(painting)));
  const inkOffset = await measureInk(artworkSvg(painting, false, true), wasm);
  inkOffset.x = 0;
  manifest.landscapes[i] = { artRevision: 2, mode: 'landscapes', seed: entry.seed, width: painting.width, height: painting.height, previewWidth: 3200, asset, inkOffset };
  console.log(`Panorama ${i + 1}/10`);
}
await writeFile(new URL('manifest.json', base), JSON.stringify(manifest));
