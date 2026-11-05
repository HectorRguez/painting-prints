// Optional Cairo review of the app renderer's paper and transparent PNGs.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCanvas, loadImage, CanvasRenderingContext2D } from 'canvas';
import { Path2D, applyPath2DToCanvasRenderingContext } from 'path2d';
import { generateBrushwork } from '../../src/generators/brushwork/generate.js';
import { renderLinePreview } from '../../src/generators/shared/line-preview.js';
import { artworkSvg } from '../../src/artwork-svg.js';

applyPath2DToCanvasRenderingContext(CanvasRenderingContext2D);
globalThis.Path2D = Path2D;
globalThis.OffscreenCanvas = class {
  constructor(width, height) {
    const canvas = createCanvas(width, height);
    canvas.convertToBlob = async () => new Blob([canvas.toBuffer('image/png')], { type: 'image/png' });
    return canvas;
  }
};
const index = process.argv.indexOf('--out'), output = resolve(index < 0 ? '.artifacts/brushwork-exports' : process.argv[index + 1]);
await mkdir(output, { recursive: true });
const examples = [6, 11, 16, 22, 23, 25, 26, 34], records = [];
const sheet = createCanvas(1080, examples.length * 380), context = sheet.getContext('2d');
context.fillStyle = '#f5f2eb'; context.fillRect(0, 0, sheet.width, sheet.height);
async function render(art, background) {
  const { preview } = await renderLinePreview(art, { width: 1600, measure: false, background });
  const bytes = Buffer.from(await preview.arrayBuffer()), image = await loadImage(bytes);
  const canvas = createCanvas(image.width, image.height), ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
  return { bytes, image, pixels: ctx.getImageData(0, 0, image.width, image.height).data };
}
for (const [row, number] of examples.entries()) {
  const seed = `brushwork-review-${String(number).padStart(2, '0')}`, art = generateBrushwork(seed);
  const transparent = await render(art), paper = await render(art, '#f5f2eb');
  const composite = createCanvas(1600, 1600), ctx = composite.getContext('2d');
  ctx.fillStyle = '#f5f2eb'; ctx.fillRect(0, 0, 1600, 1600); ctx.drawImage(transparent.image, 0, 0);
  const data = ctx.getImageData(0, 0, 1600, 1600).data;
  let empty = 0, opaque = 0, partial = 0, maximumDifference = 0, edgeAlpha = 0;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = transparent.pixels[i + 3], x = i / 4 % 1600, y = Math.floor(i / 4 / 1600);
    if (!alpha) empty++; else if (alpha === 255) opaque++; else partial++;
    if (x < 2 || y < 2 || x >= 1598 || y >= 1598) edgeAlpha += alpha;
    for (let c = 0; c < 4; c++) maximumDifference = Math.max(maximumDifference, Math.abs(data[i + c] - paper.pixels[i + c]));
    assert.equal(paper.pixels[i + 3], 255);
  }
  assert.ok(empty > 1600 * 1600 * .5 && opaque > 1000 && partial > 100, seed);
  assert.equal(edgeAlpha, 0); assert.ok(maximumDifference <= 2, `${seed}: compositing changed pigment colors`);
  assert.ok(!artworkSvg(art, false).includes('<rect'), 'Transparent SVG has no paper rectangle');
  if (row === 0) {
    const recolored = await render(generateBrushwork(seed, { palette: 'violet', hueShift: 35, saturation: 1.4 }));
    for (let i = 3; i < transparent.pixels.length; i += 4) assert.equal(recolored.pixels[i], transparent.pixels[i], 'Color controls preserve every texture alpha pixel');
  }
  await writeFile(resolve(output, `${seed}-transparent.png`), transparent.bytes);
  await writeFile(resolve(output, `${seed}-paper.png`), paper.bytes);
  for (let col = 0; col < 3; col++) {
    const x = col * 360, y = row * 380;
    if (col === 1) for (let cy = 0; cy < 344; cy += 16) for (let cx = 0; cx < 344; cx += 16) {
      context.fillStyle = ((cx + cy) / 16) % 2 ? '#d0d4d6' : '#edf0f0';
      context.fillRect(x + 8 + cx, y + 8 + cy, Math.min(16, 344 - cx), Math.min(16, 344 - cy));
    }
    if (col === 2) { context.fillStyle = '#28323b'; context.fillRect(x + 8, y + 8, 344, 344); }
    context.drawImage(col ? transparent.image : paper.image, x + 8, y + 8, 344, 344);
    context.fillStyle = '#30302e'; context.font = '12px sans-serif';
    context.fillText(`${number} · ${art.parameters.palette} · ${['paper', 'transparent / checker', 'transparent / dark'][col]}`, x + 10, y + 371);
  }
  records.push({ seed, palette: art.parameters.palette, emptyPixels: empty, opaquePixels: opaque,
    antialiasedPixels: partial, edgeAlpha, maximumPaperCompositeDifference: maximumDifference });
}
await writeFile(resolve(output, 'brushwork-transparency.jpg'), sheet.toBuffer('image/jpeg', { quality: .94 }));
await writeFile(resolve(output, 'report.json'), JSON.stringify({ width: 1600, count: examples.length, records }, null, 2));
console.log(JSON.stringify({ output, examples: examples.length, transparentAndPaper: 'passed', colorOnlyAlphaInvariance: 'passed' }));
