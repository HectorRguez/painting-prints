import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gunzipSync, gzipSync } from 'node:zlib';
import vm from 'node:vm';
const base = new URL('../../public/cache/', import.meta.url);
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../../public/engines/unframed-art.js', import.meta.url), 'utf8'), context);
const manifest = JSON.parse(await readFile(new URL('manifest.json', base), 'utf8'));
for (const mode of ['fish']) {
  await mkdir(new URL(`${mode}-v2/`, base), { recursive: true });
  for (const [i, entry] of manifest[mode].entries()) {
    const painting = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, base))));
    painting.svg = context.unframeDrawing(mode, painting.svg);
    painting.artRevision = 2;
    entry.artRevision = 2;
    entry.asset = `${mode}-v2/${i}.json.gz`;
    await writeFile(new URL(entry.asset, base), gzipSync(JSON.stringify(painting)));
  }
  console.log(`Updated ${manifest[mode].length} ${mode} originals`);
}
await writeFile(new URL('manifest.json', base), JSON.stringify(manifest));
