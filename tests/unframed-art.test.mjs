import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import vm from 'node:vm';
const context = vm.createContext({});
vm.runInContext(await readFile(new URL('../public/engines/unframed-art.js', import.meta.url), 'utf8'), context);
for (const mode of ['fish']) test(`${mode} loses its printed frame and lettering while preserving drawing geometry`, async () => {
  const source = JSON.parse(gunzipSync(await readFile(new URL('./fixtures/fish-original.json.gz', import.meta.url)))).svg;
  const clean = context.unframeDrawing(mode, source);
  assert.ok(clean.length < source.length);
  assert.equal(context.unframeDrawing(mode, clean), clean);
  if (mode === 'fish') {
    assert.ok(!clean.includes('width="500" height="300"'));
    const fishStart = source.indexOf('M ');
    assert.ok(clean.includes(source.slice(fishStart, fishStart + 200)));
    const d = clean.match(/ d="([^"]*)"/s)[1];
    for (const line of d.split(/(?=M )/).filter(s => s.includes('M '))) {
      const numbers = line.match(/-?\d+(?:\.\d+)?/g).map(Number);
      assert.ok(numbers.some((n, i) => i % 2 === 1 && n < 290));
    }
  }
});
