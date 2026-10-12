import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { artworkSvg } from '../../src/artwork-svg.js';
import { renderSvgPng } from '../../src/ink-measurement.js';

const cache = new URL('../../public/cache/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', cache), 'utf8'));
const wasm = await readFile(new URL('../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
await mkdir(new URL('landscapes-preview-v1/', cache), { recursive: true });
for (const [index, entry] of manifest.landscapes.entries()) {
  const painting = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, cache))));
  const preview = await renderSvgPng(artworkSvg(painting, false, true), 4096, wasm);
  entry.previewAsset = `landscapes-preview-v1/${index}.png`;
  await writeFile(new URL(entry.previewAsset, cache), new Uint8Array(await preview.arrayBuffer()));
  console.log(`Landscape ${index + 1}/${manifest.landscapes.length}: ${(preview.size / 1024).toFixed(0)} KB`);
}
await writeFile(new URL('manifest.json', cache), JSON.stringify(manifest));
