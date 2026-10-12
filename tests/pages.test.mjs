import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pageFromPath, pageUrl, pageModes, seedFromSearch } from '../src/pages.js';

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

test('every generator supports a direct URL and a refresh', () => {
  const base = new URL('https://example.com/painting-prints/');
  for (const mode of pageModes) {
    assert.equal(pageFromPath(pageUrl(mode, base).pathname, base.pathname), mode);
    assert.equal(pageFromPath(`/painting-prints/${mode}/index.html`, base.pathname), mode);
  }
});

test('shared seeds round-trip through every style URL without altering special characters', () => {
  const base = new URL('https://example.com/painting-prints/');
  for (const mode of pageModes) for (const seed of ['painting-stock-v1-fish-0', 'fresh-123', 'snow 雪 & = / ? #']) {
    const url = pageUrl(mode, base, seed);
    assert.equal(seedFromSearch(url.search), seed);
    assert.equal(pageFromPath(url.pathname, base.pathname), mode);
    assert.equal(url.hash, '');
  }
  assert.equal(seedFromSearch(''), null);
  assert.equal(seedFromSearch('?seed='), null);
  assert.equal(seedFromSearch(`?seed=${'x'.repeat(257)}`), null);
});
