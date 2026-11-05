import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { projects, pageModes } from '../src/projects.js';
import { pageFromPath, pageUrl } from '../src/pages.js';

const retained = ['flowers', 'landscapes', 'leaves', 'snowflakes', 'seascapes', 'ribbons', 'dunes', 'brushwork'];
test('integrated gallery exposes all eight retained styles consistently', async () => {
  assert.deepEqual(pageModes, retained);
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.deepEqual([...html.matchAll(/data-mode="([^"]+)"/g)].map(m => m[1]), retained);
  const manifest = JSON.parse(await readFile(new URL('../public/cache/manifest.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), pageModes.filter(mode => projects[mode].bundled !== false).sort());
  for (const mode of pageModes.filter(mode => projects[mode].bundled === false)) {
    assert.ok(Number.isInteger(projects[mode].artRevision) && projects[mode].artRevision > 0, `${mode}: revision supports cache upgrades`);
  }
});

test('retired styles have no route, generator source or bundled cache', async () => {
  const base = new URL('https://example.test/painting-prints/');
  for (const mode of ['cityscapes', 'buildings', 'folds', 'interference']) {
    assert.equal(pageFromPath(`/painting-prints/${mode}/`, base.pathname), null);
    assert.throws(() => pageUrl(mode, base), /Unknown painting page/);
    for (const path of [`src/generators/${mode}`, `public/cache/${mode}`]) {
      await assert.rejects(access(new URL(`../${path}`, import.meta.url)), { code: 'ENOENT' });
    }
  }
});
