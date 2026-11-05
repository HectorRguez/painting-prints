// Run after npm run build. CI installs Playwright separately so the art app
// keeps its runtime dependencies unchanged.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { chromium } from 'playwright';
import { projects, pageModes } from '../src/projects.js';

const root = resolve('dist');
const output = resolve('.artifacts/browser');
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
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
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
async function waitForSaved(page, mode, seed) {
  await page.waitForFunction(async ({ mode, seed }) => {
    return new Promise(resolve => {
      const request = indexedDB.open('painting-cache-v1:/');
      request.onerror = () => resolve(false);
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('paintings')) { db.close(); resolve(false); return; }
        const read = db.transaction('paintings').objectStore('paintings').get(mode);
        read.onsuccess = () => { db.close(); resolve(read.result?.latest === seed); };
        read.onerror = () => { db.close(); resolve(false); };
      };
    });
  }, { mode, seed }, { timeout: 10_000 });
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
  } else if (format === 'pdf') assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  else {
    assert.ok(bytes.toString().startsWith('<svg'));
    assert.ok(!/NaN|Infinity/.test(bytes.toString()));
  }
  return { format, background, bytes: bytes.length };
}
try {
  browser = await chromium.launch();
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
    await ready(page);
    assert.equal(await page.locator(`[data-mode="${mode}"]`).getAttribute('aria-current'), 'page');
    assert.equal(await page.title(), `Painting · ${projects[mode].label}`);
    await page.screenshot({ path: resolve(output, `${mode}-desktop.png`) });
    await waitForSaved(page, mode, seed);
    const originalGenerations = generations;
    await page.reload();
    await ready(page);
    assert.equal(generations, originalGenerations, 'Reload must reuse the cached drawing');
    const exports = [];
    for (const [format, background] of [['png', false], ['png', true], ['svg', false], ['pdf', false]]) {
      exports.push(await download(page, mode, format, background));
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
    const fitting = await mobile.locator('#artwork').evaluate(art => {
      const bounds = art.getBoundingClientRect();
      const viewport = document.querySelector('#canvas-viewport').getBoundingClientRect();
      return bounds.width <= viewport.width + 1 && bounds.height <= viewport.height + 1;
    });
    assert.ok(fitting, 'The complete new artwork must fit on the phone initially');
    await mobile.screenshot({ path: resolve(output, `${mode}-phone.png`) });
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
  finally { await new Promise(resolve => server.close(resolve)); }
}
