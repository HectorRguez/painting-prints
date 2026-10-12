import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

// Flowers already contain transparent pixels; retain them without rasterizing.
const cache = new URL('../../public/cache/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('manifest.json', cache), 'utf8'));
const directory = 'flowers-preview-v1/';
await mkdir(new URL(directory, cache), { recursive: true });
for (const [index, entry] of manifest.flowers.entries()) {
  const painting = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, cache))));
  if (painting.mode !== 'flowers' || painting.seed !== entry.seed) throw new Error('Cached painting mismatch');
  entry.previewAsset = `${directory}${index}.png`;
  await writeFile(new URL(entry.previewAsset, cache), Buffer.from(painting.transparentPng.split(',')[1], 'base64'));
}
await writeFile(new URL('manifest.json', cache), JSON.stringify(manifest));
