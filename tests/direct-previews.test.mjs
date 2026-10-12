import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

test('direct cached previews use high-resolution bitmaps with independent original sources for all thirty paintings', async () => {
  const directory = new URL('../public/cache/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  for (const mode of ['flowers', 'fish', 'maps']) {
    assert.equal(manifest[mode].length, 10);
    for (const entry of manifest[mode]) {
      const painting = JSON.parse(gunzipSync(await readFile(new URL(entry.asset, directory))));
      const preview = await readFile(new URL(entry.previewAsset, directory));
      assert.equal(typeof entry.inkOffset.y, 'number');
      if (mode === 'flowers') {
        assert.deepEqual(preview, Buffer.from(painting.transparentPng.split(',')[1], 'base64'));
        assert.equal(preview.readUInt32BE(16), 1800);
        assert.equal(preview.readUInt32BE(20), 1800);
      } else {
        assert.equal(preview.subarray(1, 4).toString(), 'PNG');
        assert.equal(preview.readUInt32BE(16), 3200);
        assert.equal(preview.readUInt32BE(20), Math.round(3200 * painting.height / painting.width));
        assert.ok(painting.svg.includes('<path'));
        assert.ok(!painting.svg.includes('<image'));
      }
    }
  }
});
