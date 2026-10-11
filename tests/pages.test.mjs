import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFromPath, pageUrl } from '../src/pages.js';

test('subpage links stay under the GitHub Pages project root', () => {
  const base = new URL('https://hectorrguez.github.io/painting-prints/');
  assert.equal(pageUrl('flowers', base).href, 'https://hectorrguez.github.io/painting-prints/flowers/');
  assert.equal(pageUrl('landscapes', base).href, 'https://hectorrguez.github.io/painting-prints/landscapes/');
  assert.throws(() => pageUrl('../another-site', base), /Unknown painting page/);
});

test('direct folder, index and landing-page URLs select the right generator', () => {
  const base = '/painting-prints/';
  for (const suffix of ['', 'index.html', 'flowers', 'flowers/', 'flowers/index.html']) {
    assert.equal(pageFromPath(base + suffix, base), 'flowers');
  }
  for (const suffix of ['landscapes', 'landscapes/', 'landscapes/index.html']) {
    assert.equal(pageFromPath(base + suffix, base), 'landscapes');
  }
  assert.equal(pageFromPath('/painting-prints/unknown/', base), null);
  assert.equal(pageFromPath('/painting-prints/landscapesindex.html', base), null);
  assert.equal(pageFromPath('/another-project/landscapes/', base), null);
  assert.equal(pageFromPath('/landscapes/', '/'), 'landscapes');
});
