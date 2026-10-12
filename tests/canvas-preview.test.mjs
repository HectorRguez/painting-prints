import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { fishPaths } from '../src/generators/fish/preview.js';
import { mapDrawing } from '../src/generators/maps/preview.js';

test('canvas previews retain every original fish/map path, stroke and map transform', async () => {
  const directory = new URL('../public/cache/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  for (const mode of ['fish', 'maps']) for (const entry of manifest[mode]) {
    const painting = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, directory))));
    const originalPaths = [...painting.svg.matchAll(/<path\b[^>]*\bd="([^"]*)"/g)].map(match => match[1]);
    const drawing = mode === 'maps' ? mapDrawing(painting.svg) : { paths: fishPaths(painting.svg) };
    assert.deepEqual(drawing.paths.map(path => path.d), originalPaths);
    assert.ok(drawing.paths.length > 0);
    for (const path of drawing.paths) {
      assert.equal(path.fill, 'none');
      assert.equal(path.stroke, mode === 'fish' ? 'black' : '#292722');
      assert.ok(Number(path['stroke-width']) > 0);
      assert.equal(path['stroke-linecap'], 'round');
      assert.equal(path['stroke-linejoin'], 'round');
      assert.ok(Number(path.opacity ?? 1) > 0 && Number(path.opacity ?? 1) <= 1);
    }
    if (mode === 'maps') {
      assert.ok(drawing.scale > 0);
      assert.ok(painting.svg.includes(`scale(${drawing.scale}) translate(${drawing.x},${drawing.y})`));
    }
  }
});
