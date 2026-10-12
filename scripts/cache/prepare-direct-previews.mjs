import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { renderSvgPng } from '../../src/ink-measurement.js';
import { artworkSvg } from '../../src/artwork-svg.js';

// All runtime previews are bitmaps; fish/maps keep their vector export sources.
// Offline cache baking uses resvg, so it does not need a browser or native dependency.
// These small preview files avoid downloading print sources or starting WASM
// just to display the first cached painting. Landscape previews have their own
// rasterization script because their geometry is much more expensive to draw.
const cache = new URL('../../public/cache/', import.meta.url);
const wasm = readFile(new URL('../../node_modules/@resvg/resvg-wasm/index_bg.wasm', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('manifest.json', cache), 'utf8'));
for (const mode of ['flowers', 'fish', 'maps']) {
  const directory = `${mode}-preview-v${mode === 'maps' ? 3 : mode === 'fish' ? 2 : 1}/`;
  await mkdir(new URL(directory, cache), { recursive: true });
  let sourceBytes = 0, previewBytes = 0;
  for (const [index, entry] of manifest[mode].entries()) {
    const source = await readFile(new URL(entry.asset, cache));
    const painting = JSON.parse(gunzipSync(source));
    if (painting.mode !== mode || painting.seed !== entry.seed) throw new Error('Cached painting mismatch');
    const preview = mode === 'flowers' ? Buffer.from(painting.transparentPng.split(',')[1], 'base64')
      : Buffer.from(await (await renderSvgPng(artworkSvg(painting, false, true), 3200, wasm)).arrayBuffer());
    entry.previewAsset = `${directory}${index}.png`;
    await writeFile(new URL(entry.previewAsset, cache), preview);
    sourceBytes += source.length;
    previewBytes += preview.length;
  }
  console.log(`${mode}: ${(previewBytes / 1e6).toFixed(2)} MB of direct previews; ${(sourceBytes / 1e6).toFixed(2)} MB of compressed export sources retained`);
}
await writeFile(new URL('manifest.json', cache), JSON.stringify(manifest));
