import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { artworkSvg } from '../../src/artwork-svg.js';
import { measureInk } from '../../src/ink-measurement.js';
const base = new URL('../../public/cache/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
const wasm = await readFile(new URL('../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
for (const [mode, entries] of Object.entries(manifest)) for (const entry of entries) {
  const painting = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, base))));
  entry.inkOffset = await measureInk(artworkSvg(painting, false, true), wasm);
  console.log(mode, entry.seed, entry.inkOffset);
}
await writeFile(new URL('manifest.json', base), JSON.stringify(manifest));
