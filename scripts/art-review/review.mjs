import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { artworkSvg } from '../../src/artwork-svg.js';

// Shared by the new styles. The optional Cairo raster shim runs the app's
// actual line renderer; neither Canvas nor Path2D is a runtime dependency.
export async function reviewArt({ mode, generate, parameters, describe = () => '', examples = [0, 1, 2] }) {
  const args = process.argv.slice(2);
  const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  const count = Number(option('--count', 48)), start = Number(option('--start', 0));
  if (![count, start].every(Number.isInteger) || count < 1 || count > 512 || start < 0) throw Error('Invalid sample range');
  const output = resolve(option('--out', `.artifacts/review/${mode}`)), raster = args.includes('--raster');
  const rasterWidth = Number(option('--width', 1200));
  if (!Number.isInteger(rasterWidth) || rasterWidth < 300 || rasterWidth > 3200) throw Error('Invalid raster width');
  const prefix = option('--prefix', `${mode}-review`), records = [], panels = [];
  const cols = 6, cw = 360, ch = 350, height = Math.ceil(count / cols) * ch;
  await mkdir(output, { recursive: true });
  let canvas, render, grid, ctx;
  if (raster) {
    canvas = await import('canvas');
    const { Path2D, applyPath2DToCanvasRenderingContext } = await import('path2d');
    applyPath2DToCanvasRenderingContext(canvas.CanvasRenderingContext2D);
    globalThis.Path2D = Path2D;
    globalThis.OffscreenCanvas = class {
      constructor(w, h) {
        const c = canvas.createCanvas(w, h);
        c.convertToBlob = async () => new Blob([c.toBuffer('image/png')], { type: 'image/png' });
        return c;
      }
    };
    ({ renderLinePreview: render } = await import('../../src/generators/shared/line-preview.js'));
    grid = canvas.createCanvas(cols * cw, height); ctx = grid.getContext('2d');
    ctx.fillStyle = '#f5f2eb'; ctx.fillRect(0, 0, grid.width, grid.height);
  }
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  for (let i = 0; i < count; i++) {
    const number = start + i, seed = `${prefix}-${String(number).padStart(2, '0')}`;
    const begun = performance.now(), painting = await generate(seed);
    const generationMs = performance.now() - begun;
    const label = String(await describe(painting, seed));
    if (!painting.svg || /NaN|Infinity|<image|<script|<foreignObject/.test(painting.svg)) throw Error(`${seed}: invalid vector geometry`);
    const paths = [...painting.svg.matchAll(/<path\b([^>]+)>/g)];
    if (!paths.length) throw Error(`${seed}: empty drawing`);
    const svg = artworkSvg(painting, true);
    await writeFile(resolve(output, `${seed}.svg`), svg);
    const x = i % cols * cw, y = Math.floor(i / cols) * ch;
    const uri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const safeLabel = label.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    panels.push(`<image x="${x + 8}" y="${y + 8}" width="${cw - 16}" height="${ch - 58}" href="${uri}"/><text x="${x + 12}" y="${y + ch - 29}" font-family="sans-serif" font-size="12">${seed}</text><text x="${x + 12}" y="${y + ch - 11}" font-family="sans-serif" font-size="11">${safeLabel}</text>`);
    let pixels;
    if (raster) {
      const { preview } = await render(painting, { width: rasterWidth, measure: false, background: '#f5f2eb' });
      const bytes = Buffer.from(await preview.arrayBuffer());
      await writeFile(resolve(output, `${seed}.png`), bytes);
      const image = await canvas.loadImage(bytes), specimen = canvas.createCanvas(image.width, image.height);
      const sc = specimen.getContext('2d'); sc.drawImage(image, 0, 0);
      const data = sc.getImageData(0, 0, image.width, image.height).data;
      let ink = 0, edgeInk = 0, left = image.width, right = 0, top = image.height, bottom = 0;
      for (let j = 0; j < data.length; j += 4) {
        if (Math.abs(data[j] - 245) + Math.abs(data[j + 1] - 242) + Math.abs(data[j + 2] - 235) < 35) continue;
        const px = j / 4 % image.width, py = Math.floor(j / 4 / image.width);
        ink++; left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py);
        if (px < 2 || py < 2 || px >= image.width - 2 || py >= image.height - 2) edgeInk++;
      }
      const fraction = ink / (image.width * image.height);
      if (fraction < .0001 || fraction > .9 || edgeInk) throw Error(`${seed}: blank, saturated, or clipped raster (${fraction}, ${edgeInk})`);
      pixels = { pngSha256: hash(bytes), width: image.width, height: image.height,
        inkFraction: fraction, edgeInk, bounds: { left, top, right, bottom } };
      const scale = Math.min((cw - 16) / image.width, (ch - 58) / image.height);
      ctx.drawImage(image, x + (cw - image.width * scale) / 2, y + 8 + (ch - 58 - image.height * scale) / 2, image.width * scale, image.height * scale);
      ctx.fillStyle = '#30302e'; ctx.font = '12px sans-serif'; ctx.fillText(seed, x + 12, y + ch - 29);
      ctx.font = '11px sans-serif'; ctx.fillText(label, x + 12, y + ch - 11, cw - 24);
      if (examples.includes(number)) await writeFile(resolve(output, `${mode}-example-${String(number).padStart(2, '0')}.jpg`), specimen.toBuffer('image/jpeg', { quality: .94 }));
    }
    records.push({ seed, sha256: hash(painting.svg), generationMs, svgBytes: Buffer.byteLength(painting.svg), paths: paths.length,
      label, parameters: parameters ? await parameters(seed) : painting.parameters,
      metrics: painting.metrics, ...pixels });
  }
  const report = { mode, count, start, unique: new Set(records.map(r => r.sha256)).size,
    uniquePngs: raster ? new Set(records.map(r => r.pngSha256)).size : undefined,
    generationMs: { max: Math.max(...records.map(r => r.generationMs)), mean: records.reduce((n, r) => n + r.generationMs, 0) / count },
    svgBytes: { max: Math.max(...records.map(r => r.svgBytes)), mean: records.reduce((n, r) => n + r.svgBytes, 0) / count },
    records };
  if (report.unique !== count || raster && report.uniquePngs !== count) throw Error('Duplicate output in review batch');
  await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2));
  await writeFile(resolve(output, 'contact-sheet.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${cw * cols}" height="${height}"><rect width="100%" height="100%" fill="#f5f2eb"/>${panels.join('')}</svg>`);
  if (raster) {
    await writeFile(resolve(output, 'contact-sheet.png'), grid.toBuffer('image/png'));
    await writeFile(resolve(output, `${mode}-contact.jpg`), grid.toBuffer('image/jpeg', { quality: .93 }));
  }
  console.log(JSON.stringify({ output, ...report, records: undefined }, null, 2));
  return report;
}
