import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { artworkSvg } from '../src/artwork-svg.js';

test('direct cached previews preserve the original pixels or vectors for all thirty paintings', async () => {
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
        assert.equal(preview.toString(), artworkSvg(painting, false, true));
        assert.ok(!preview.toString().includes('<image'));
      }
    }
  }
});
