// Run after npm run build. CI installs Playwright separately so the art app
// keeps its runtime dependencies unchanged.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { projects, pageModes } from '../src/projects.js';

const external = process.argv.find(argument => argument.startsWith('--url='))?.slice(6);
const root = resolve('dist');
const output = resolve(external ? '.artifacts/deployment' : '.artifacts/browser');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.wasm': 'application/wasm',
  '.json': 'application/json', '.gz': 'application/gzip', '.ttf': 'font/ttf' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let path = resolve(root, `.${pathname}`);
    if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
    if ((await stat(path)).isDirectory()) path = resolve(path, 'index.html');
    response.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' });
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
if (!external) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = external ? external.replace(/\/$/, '') : `http://127.0.0.1:${server.address().port}`;
const basePath = new URL(base + '/').pathname;
const cacheName = `painting-cache-v1:${basePath}`;
let browser;
const results = [];

async function ready(page) {
  await page.waitForFunction(() => {
    const image = document.querySelector('#artwork img');
    return image?.complete && image.naturalWidth > 0
      && document.querySelector('.gallery').getAttribute('aria-busy') === 'false'
      && !document.querySelector('#download').disabled;
  }, null, { timeout: 120_000 });
  assert.equal(await page.locator('#status').innerText(), '');
}
async function assertArtworkFits(page, mode, label) {
  const layout = await page.locator('#artwork').evaluate(art => {
    const bounds = art.getBoundingClientRect();
    const viewport = document.querySelector('#canvas-viewport').getBoundingClientRect();
    const image = art.querySelector('img');
    return { width: bounds.width, height: bounds.height, viewportWidth: viewport.width,
      viewportHeight: viewport.height, naturalRatio: image.naturalWidth / image.naturalHeight,
      panoramic: art.parentElement.classList.contains('panoramic'),
      cropped: art.parentElement.classList.contains('landscape-crop'),
      inside: bounds.left >= viewport.left - 1 && bounds.right <= viewport.right + 1
        && bounds.top >= viewport.top - 1 && bounds.bottom <= viewport.bottom + 1 };
  });
  assert.ok(layout.width > 0 && layout.height > 0, `${label}: artwork must have visible dimensions`);
  const wide = projects[mode].panoramic && !layout.cropped;
  if (wide) {
    assert.ok(layout.panoramic && layout.width >= layout.viewportWidth - 1, `${label}: panorama spans the viewport`);
    assert.ok(layout.height <= layout.viewportHeight + 1, `${label}: panorama keeps its vertical margin`);
  } else {
    assert.ok(layout.width <= layout.viewportWidth + 1 && layout.height <= layout.viewportHeight + 1
      && layout.inside, `${label}: the complete print composition fits in the viewport`);
  }
  const ratio = layout.width / layout.height;
  assert.ok(Math.abs(ratio - (wide ? 4 : projects[mode].ratio)) < .002, `${label}: preserve the generator's page ratio`);
  assert.ok(Math.abs(ratio - layout.naturalRatio) < .002, `${label}: do not distort the preview image`);
}
async function waitForSaved(page, mode, seed, artRevision = projects[mode].artRevision) {
  await page.waitForFunction(async ({ mode, seed, artRevision, cacheName }) => {
    return new Promise(resolve => {
      const request = indexedDB.open(cacheName);
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('paintings')) { db.close(); resolve(false); return; }
        const read = db.transaction('paintings').objectStore('paintings').get(mode);
        read.onsuccess = () => {
          db.close();
          const entry = read.result?.entries?.find(entry => entry.seed === seed);
          resolve(read.result?.latest === seed && (!artRevision || entry?.artRevision === artRevision));
        };
        read.onerror = () => { db.close(); resolve(false); };
      };
    });
  }, { mode, seed, artRevision, cacheName }, { timeout: 10_000 });
}

async function retireSavedRevision(page, mode, seed) {
  await page.evaluate(({ mode, seed, cacheName }) => new Promise((resolve, reject) => {
    const request = indexedDB.open(cacheName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('paintings', 'readwrite');
      const store = transaction.objectStore('paintings');
      const read = store.get(mode);
      read.onsuccess = () => {
        const value = read.result;
        value.entries.find(entry => entry.seed === seed).artRevision = 0;
        store.put(value, mode);
      };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), { mode, seed, cacheName });
}
async function download(page, mode, format, background) {
  await page.locator('#settings').click();
  await page.locator('#file-format').selectOption(format);
  await page.locator('#add-background').setChecked(background);
  await page.locator('#settings-done').click();
  await ready(page);
  const pending = page.waitForEvent('download', { timeout: 120_000 });
  await page.locator('#download').click();
  const file = await pending;
  assert.equal(await file.failure(), null);
  const path = resolve(output, `${mode}-${background ? 'paper' : 'transparent'}.${format}`);
  await file.saveAs(path);
  const bytes = await readFile(path);
  assert.ok(bytes.length > 100, 'Export must contain an image');
  if (format === 'png') {
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 3200);
    assert.ok(Math.abs(bytes.readUInt32BE(16) / bytes.readUInt32BE(20) - projects[mode].ratio) < .002);
    const pixels = await page.evaluate(async encoded => {
      const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${encoded}`)).blob());
      const canvas = new OffscreenCanvas(image.width, image.height), context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      const data = context.getImageData(0, 0, image.width, image.height).data;
      let transparent = 0, opaque = 0, ink = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] === 0) transparent++;
        if (data[i + 3] === 255) opaque++;
        if (data[i + 3] > 20 && Math.abs(data[i] - 245) + Math.abs(data[i + 1] - 242) + Math.abs(data[i + 2] - 235) > 35) ink++;
      }
      image.close();
      return { total: data.length / 4, transparent, opaque, ink, cornerAlpha: data[3] };
    }, bytes.toString('base64'));
    assert.ok(pixels.ink > pixels.total * .0001 && pixels.ink < pixels.total * .9, 'PNG export must contain visible artwork');
    if (background) {
      assert.equal(pixels.opaque, pixels.total, 'Paper export must be fully opaque');
    } else {
      assert.ok(pixels.transparent > pixels.total * .05, 'Transparent export must retain transparent paper');
      assert.equal(pixels.cornerAlpha, 0, 'Transparent export must not bake in a paper rectangle');
    }
  } else if (format === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  else {
    assert.ok(bytes.toString().startsWith('<svg'));
    assert.ok(!/NaN|Infinity/.test(bytes.toString()));
  }
  return { format, background, bytes: bytes.length };
}
try {
  for (const mode of ['cityscapes', 'buildings', 'folds', 'interference']) {
    for (const path of external ? [] : [mode, `generators/${mode}`, `cache/${mode}`]) {
      await assert.rejects(stat(resolve(root, path)), { code: 'ENOENT' });
    }
    assert.equal((await fetch(`${base}/${mode}/`)).status, 404);
  }
  const manifest = external ? await (await fetch(`${base}/cache/manifest.json`)).json()
    : JSON.parse(await readFile(resolve(root, 'cache/manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['flowers', 'landscapes']);
  browser = await chromium.launch();
  // Exercise the combined app in one session: the independent per-style checks
  // below cannot catch a stale menu entry or state leaking between generators.
  const navigation = await browser.newContext({ viewport: { width: 1024, height: 800 } });
  const gallery = await navigation.newPage(), navigationErrors = [], displayedSeeds = {};
  gallery.on('pageerror', error => navigationErrors.push(String(error)));
  await gallery.goto(`${base}/flowers/`);
  await ready(gallery);
  assert.deepEqual(await gallery.locator('.modes [data-mode]').evaluateAll(links => links.map(link => link.dataset.mode)), pageModes);
  assert.deepEqual(await gallery.locator('#painting-style option').evaluateAll(options => options.map(option => option.value)), pageModes);
  for (const mode of pageModes) {
    await gallery.locator(`[data-mode="${mode}"]`).click();
    await ready(gallery);
    assert.equal(await gallery.locator('.modes [aria-current="page"]').count(), 1);
    assert.equal(await gallery.locator('#painting-style').inputValue(), mode);
    assert.equal(new URL(gallery.url()).pathname, `${basePath}${mode}/`);
    assert.equal(await gallery.locator('.credit').isVisible(), Boolean(projects[mode].showCredit), `${mode}: only adapted engines show credits and dates`);
    await assertArtworkFits(gallery, mode, `${mode} combined desktop navigation`);
    displayedSeeds[mode] = new URL(gallery.url()).searchParams.get('seed');
    const visibleTab = await gallery.locator(`[data-mode="${mode}"]`).evaluate(link => {
      const r = link.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth;
    });
    assert.ok(visibleTab, `${mode}: selected desktop tab stays visible`);
  }
  await gallery.screenshot({ path: resolve(output, 'gallery-desktop.png') });
  await gallery.setViewportSize({ width: 390, height: 844 });
  for (const mode of pageModes) {
    await gallery.selectOption('#painting-style', mode);
    await ready(gallery);
    assert.equal(new URL(gallery.url()).pathname, `${basePath}${mode}/`);
    assert.equal(new URL(gallery.url()).searchParams.get('seed'), displayedSeeds[mode]);
    await assertArtworkFits(gallery, mode, `${mode}: shared-session phone switch`);
  }
  assert.deepEqual(navigationErrors, []);
  await gallery.screenshot({ path: resolve(output, 'gallery-phone.png') });
  await writeFile(resolve(output, 'navigation.json'), JSON.stringify({ modes: pageModes, seeds: displayedSeeds, desktop: 'passed', phone: 'passed', retiredRoutes: 'absent' }, null, 2));
  await navigation.close();
  console.log('Combined gallery: all eight styles navigate on desktop/phone; retired routes/assets are absent');
  for (const mode of pageModes.filter(mode => projects[mode].bundled === false)) {
    const seed = `browser-review-${mode}`;
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
    const page = await context.newPage();
    const errors = [], failed = [];
    page.on('pageerror', error => errors.push(String(error)));
    page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
    let generations = 0;
    page.on('worker', worker => { if (worker.url().includes(`/generators/${mode}/worker.js`)) generations++; });
    await page.goto(`${base}/${mode}/?seed=${seed}`);
    try { await ready(page); } catch (error) {
      await page.screenshot({ path: resolve(output, `${mode}-failure.png`) });
      throw new Error(`${mode}: ${error.message}; status=${await page.evaluate(() => document.querySelector('#status')?.textContent || '')}; errors=${JSON.stringify(errors)}; requests=${JSON.stringify(failed)}`);
    }
    assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-current'), 'page');
    assert.equal(await page.title(), `Painting · ${projects[mode].label}`);
    await assertArtworkFits(page, mode, `${mode}: desktop layout`);
    await page.screenshot({ path: resolve(output, `${mode}-desktop.png`) });
    await waitForSaved(page, mode, seed);
    const originalGenerations = generations;
    if (projects[mode].panoramic) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForSelector('.artwork-frame.landscape-crop');
      await ready(page);
      await assertArtworkFits(page, mode, `${mode}: desktop resized to central crop`);
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.waitForSelector('.artwork-frame.panoramic:not(.landscape-crop)');
      await ready(page);
      await assertArtworkFits(page, mode, `${mode}: restored full panorama`);
      assert.equal(generations, originalGenerations, 'Changing preview crop must reuse the same source');
    }
    await page.reload();
    await ready(page);
    assert.equal(generations, originalGenerations, 'Reload must reuse the cached drawing');
    if (projects[mode].artRevision) {
      await retireSavedRevision(page, mode, seed);
      await page.goto(`${base}/${mode}/`);
      await ready(page);
      assert.equal(new URL(page.url()).searchParams.get('seed'), seed, 'An upgrade must preserve the latest seed');
      assert.equal(generations, originalGenerations + 1, 'An old revision must regenerate exactly once');
      await waitForSaved(page, mode, seed);
      await page.reload();
      await ready(page);
      assert.equal(generations, originalGenerations + 1, 'The upgraded revision must stay cached');
    }
    const exports = [];
    for (const [format, background] of [['png', false], ['png', true], ['svg', false], ['pdf', false]]) {
      exports.push(await download(page, mode, format, background));
    }
    if (projects[mode].panoramic) {
      const originalSvg = await readFile(resolve(output, `${mode}-transparent.svg`), 'utf8');
      const beforePan = await page.locator('#artwork').evaluate(art => art.style.transform);
      await page.locator('#canvas-viewport').focus();
      await page.keyboard.press('ArrowRight');
      assert.notEqual(await page.locator('#artwork').evaluate(art => art.style.transform), beforePan, 'Wide scene must pan');
      await download(page, mode, 'svg', false);
      assert.equal(await readFile(resolve(output, `${mode}-transparent.svg`), 'utf8'), originalSvg, 'Panning must not change the fixed central export');
    }
    await page.locator('#regenerate').click();
    await ready(page);
    assert.notEqual(new URL(page.url()).searchParams.get('seed'), seed);
    await page.goBack();
    await ready(page);
    assert.equal(new URL(page.url()).searchParams.get('seed'), seed);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    await context.close();

    const phone = await browser.newContext({ viewport: { width: 390, height: 844 },
      isMobile: true, hasTouch: true, deviceScaleFactor: 1, acceptDownloads: true });
    const mobile = await phone.newPage();
    mobile.on('pageerror', error => errors.push(String(error)));
    await mobile.goto(`${base}/${mode}/?seed=${seed}`);
    await ready(mobile);
    assert.equal(await mobile.locator('#painting-style').isVisible(), true);
    assert.equal(await mobile.locator('#painting-style').inputValue(), mode);
    assert.equal(await mobile.locator('.modes').isVisible(), false);
    await assertArtworkFits(mobile, mode, 'Initial phone layout');
    await mobile.screenshot({ path: resolve(output, `${mode}-phone.png`) });
    for (const [label, viewport] of [['rotated', { width: 844, height: 390 }],
      ['narrow', { width: 320, height: 568 }]]) {
      await mobile.setViewportSize(viewport);
      await assertArtworkFits(mobile, mode, `${label} phone layout`);
      await mobile.screenshot({ path: resolve(output, `${mode}-phone-${label}.png`) });
    }
    assert.deepEqual(errors, []);
    await phone.close();
    results.push({ mode, seed, desktop: 'passed', mobile: 'passed', cache: 'passed', exports });
    await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(`${mode}: page, cache, history, exports and phone layout passed`);
  }
  assert.ok(results.length, 'Expected at least one on-demand generator');
} catch (error) {
  let index = 0;
  for (const context of browser?.contexts() || []) for (const page of context.pages()) {
    try { await page.screenshot({ path: resolve(output, `failure-${index++}.png`) }); } catch { /* The page may have crashed. */ }
  }
  await writeFile(resolve(output, 'failure.txt'), String(error.stack || error));
  throw error;
} finally {
  try { await browser?.close(); }
  finally { if (!external) await new Promise(resolve => server.close(resolve)); }
}
