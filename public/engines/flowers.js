// Print adapter for Nonflowers. The original engine remains unmodified.
// Work in its 600-unit coordinate system, drawing at 3x resolution throughout
// the plant's layers (not enlarging a finished 600px bitmap).
const resolution = 3;
Layer.empty = function (w = 600, h = w) {
  const canvas = document.createElement('canvas');
  canvas.width = w * resolution;
  canvas.height = h * resolution;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.scale(resolution, resolution);
  return context;
};
Layer.blit = function (destination, source, args = {}) {
  destination.globalCompositeOperation = args.ble === 'normal' ? 'source-over' : (args.ble || 'source-over');
  destination.drawImage(source.canvas, args.xof || 0, args.yof || 0,
    source.canvas.width / resolution, source.canvas.height / resolution);
};
Layer.filter = function (context, filter) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  const pixels = image.data;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const x = (i / 4) % width / resolution;
    const y = Math.floor(i / 4 / width) / resolution;
    const result = filter(x, y, pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
    pixels[i] = result[0]; pixels[i + 1] = result[1]; pixels[i + 2] = result[2]; pixels[i + 3] = result[3];
  }
  context.putImageData(image, 0, 0);
};
Layer.bound = function (context) {
  const { width, height } = context.canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let xmin = width, xmax = 0, ymin = height, ymax = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] === 0) continue;
    const index = (i - 3) / 4;
    const x = index % width;
    const y = Math.floor(index / width);
    xmin = Math.min(xmin, x); xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
  }
  return { xmin: xmin / resolution, xmax: xmax / resolution, ymin: ymin / resolution, ymax: ymax / resolution };
};
// The print has straight square edges; the upstream squircle mask is omitted.
vizParams = function () {};
try {
  CTX = Layer.empty();
  const texture = paper({ col: PAPER_COL1 });
  for (let x = 0; x < 600; x += 512) {
    for (let y = 0; y < 600; y += 512) CTX.drawImage(texture, x, y);
  }
  if (Math.random() <= 0.5) woody({ ctx: CTX, xof: 300, yof: 550 });
  else herbal({ ctx: CTX, xof: 300, yof: 580 });
  parent.postMessage({ type: 'painting-ready', mode: 'flowers', seed: SEED,
    png: CTX.canvas.toDataURL('image/png'), width: 1800, height: 1800 }, location.origin);
} catch (error) {
  console.error(error);
  parent.postMessage({ type: 'painting-error' }, location.origin);
}
