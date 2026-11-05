// Run after npm run prepare-generators. Uses actual shipping workers and
// browser renderers; Playwright is an optional documentation dependency.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const root = resolve('.'), output = resolve('docs/samples');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Procedural samples</title>'); return; }
    const file = resolve(root, '.' + decodeURIComponent(pathname));
    if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const seeds = {
  flowers: ['painting-stock-v1-flowers-0', 'painting-stock-v1-flowers-1'],
  landscapes: ['painting-stock-v1-landscapes-0', 'painting-stock-v1-landscapes-3'],
  leaves: ['leaf-review-008', 'leaf-review-017'],
  snowflakes: ['snowflake-review-000', 'snowflake-review-007'],
  seascapes: ['seascape-review-33', 'seascape-review-01'],
  ribbons: ['ribbons-review-00', 'ribbons-review-16'],
  dunes: ['dunes-review-09', 'dunes-review-15'],
  brushwork: ['brushwork-review-11', 'brushwork-review-16'],
};
let browser;
const records = [];
const selected = process.argv.find(argument => argument.startsWith('--styles='))?.split('=')[1].split(',');
try {
  browser = await chromium.launch();
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  for (const [mode, examples] of Object.entries(seeds)) for (const [index, seed] of examples.entries()) {
    if (selected && !selected.includes(mode)) continue;
    const result = await page.evaluate(async ({ mode, seed }) => {
      const painting = await new Promise((resolve, reject) => {
        const worker = new Worker(`/public/generators/${mode}/worker.js?seed=${encodeURIComponent(seed)}`);
        const timeout = setTimeout(() => finish(new Error('Generation timed out')), 180000);
        function finish(error, value) { clearTimeout(timeout); worker.terminate(); error ? reject(error) : resolve(value); }
        worker.onerror = event => finish(new Error(event.message));
        worker.onmessage = ({ data }) => {
          if (data.type === 'painting-ready') finish(null, data);
          else if (data.type === 'painting-error') finish(new Error(data.message || 'Generation failed'));
        };
        worker.postMessage({ mode, seed });
      });
      const { renderLinePreview } = await import('/src/generators/shared/line-preview.js');
      const { renderLandscapePreview } = await import('/src/generators/landscapes/preview.js');
      const images = [];
      for (const panorama of painting.previewWidth ? [false, true] : [false]) {
        const viewWidth = panorama ? painting.previewWidth : painting.width;
        const width = panorama ? 1600 : 1000, height = Math.round(width * painting.height / viewWidth);
        const canvas = new OffscreenCanvas(width, height), context = canvas.getContext('2d');
        context.fillStyle = '#f5f2eb'; context.fillRect(0, 0, width, height);
        const blob = mode === 'flowers' ? await (await fetch(painting.transparentPng)).blob()
          : mode === 'landscapes' ? (await renderLandscapePreview(painting, { crop: !panorama, measure: false })).preview
          : (await renderLinePreview(painting, { crop: !panorama, width, measure: false })).preview;
        const image = await createImageBitmap(blob);
        context.drawImage(image, 0, 0, width, height); image.close();
        const jpg = await canvas.convertToBlob({ type: 'image/jpeg', quality: .94 });
        const base64 = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(jpg); });
        images.push({ panorama, width, height, base64 });
      }
      return { mode, seed, artRevision: painting.artRevision, sourceWidth: painting.previewWidth || painting.width,
        printWidth: painting.width, height: painting.height, images };
    }, { mode, seed });
    const files = [];
    for (const { base64, ...image } of result.images) {
      const file = `${mode}-${index + 1}${image.panorama ? '-panorama' : ''}.jpg`, bytes = Buffer.from(base64, 'base64');
      await writeFile(resolve(output, file), bytes);
      files.push({ file, ...image, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
    records.push({ ...result, images: files });
    console.log(`${mode}: ${seed} → ${files.map(f => f.file).join(', ')}`);
  }
  if (errors.length) throw Error(errors.join('\n'));
  const previous = selected ? await readFile(resolve(output, 'manifest.json'), 'utf8').then(JSON.parse).catch(() => []) : [];
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify([...previous.filter(record => !selected.includes(record.mode)), ...records], null, 2) + '\n');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
