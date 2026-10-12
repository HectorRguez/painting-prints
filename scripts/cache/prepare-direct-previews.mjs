import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { artworkSvg } from '../../src/artwork-svg.js';

// Flowers already contain finished pixels; fish/maps remain real vectors.
// These small preview files avoid downloading print sources or starting WASM
// just to display the first cached painting. Landscape previews have their own
// rasterization script because their geometry is much more expensive to draw.
const cache = new URL('../../public/cache/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', cache), 'utf8'));
for (const mode of ['flowers', 'fish', 'maps']) {
  const directory = `${mode}-preview-v1/`;
  await mkdir(new URL(directory, cache), { recursive: true });
  let sourceBytes = 0, previewBytes = 0;
  for (const [index, entry] of manifest[mode].entries()) {
    const source = await readFile(new URL(entry.asset, cache));
    const painting = JSON.parse(gunzipSync(source));
    if (painting.mode !== mode || painting.seed !== entry.seed) throw new Error('Cached painting mismatch');
    const png = mode === 'flowers';
    const preview = png ? Buffer.from(painting.transparentPng.split(',')[1], 'base64')
      : Buffer.from(artworkSvg(painting, false, true));
    entry.previewAsset = `${directory}${index}.${png ? 'png' : 'svg'}`;
    await writeFile(new URL(entry.previewAsset, cache), preview);
    sourceBytes += source.length;
    previewBytes += preview.length;
  }
  console.log(`${mode}: ${(previewBytes / 1e6).toFixed(2)} MB of direct previews; ${(sourceBytes / 1e6).toFixed(2)} MB of compressed export sources retained`);
}
await writeFile(new URL('manifest.json', cache), JSON.stringify(manifest));
