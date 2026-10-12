(async () => {
const encodeCanvas = self.canvasDataUrl;
// Print adapter for Nonflowers. The original engine remains unmodified.
// Work in its 600-unit coordinate system, drawing at 3x resolution throughout
// the plant's layers (not enlarging a finished 600px bitmap).
const resolution = 3;
if (self.artKernels) paper = function (args) {
  const result = self.artKernels.flowerPaper(Noise.perlinValues(), Prng.s, args);
  Prng.s = result.state;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  canvas.getContext('2d').putImageData(new ImageData(result.pixels, 512, 512), 0, 0);
  return canvas;
};
let paperContext, flowerContext;
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
  // Capture the same plant layers without changing the original composition
  // or consuming any extra random draws for the paper-backed version.
  if (destination === paperContext) Layer.blit(flowerContext, source, args);
};
Layer.filter = function (context, filter) {
  const { width, height } = context.canvas;
  const image = context.getImageData(0, 0, width, height);
  if (self.artKernels && (filter === Filter.fade || filter === Filter.wispy)) {
    self.artKernels.filterFlower(image, Noise.perlinValues(), filter === Filter.wispy, resolution);
    context.putImageData(image, 0, 0);
    return;
  }
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
// Preserve both original paper textures and the rounded paper edge. The
// complete image is still square, as in Nonflowers' original download.
vizParams = function () {};
try {
  // Match the original makeBG -> generate order, including its random draws.
  BGCANV = paper({ col: PAPER_COL0, tex: 10, spr: 0 });
  CTX = Layer.empty();
  CTX.fillStyle = 'white';
  CTX.fillRect(0, 0, 600, 600);
  const texture = paper({ col: PAPER_COL1 });
  for (let x = 0; x < 600; x += 512) {
    for (let y = 0; y < 600; y += 512) CTX.drawImage(texture, x, y);
  }
  paperContext = CTX;
  flowerContext = Layer.empty();
  if (Math.random() <= 0.5) woody({ ctx: CTX, xof: 300, yof: 550 });
  else herbal({ ctx: CTX, xof: 300, yof: 600 });
  const border = squircle(0.98, 3);
  // Both versions share the same border. Compute it once, without allocating
  // small arrays for every pixel in each of the two 1800px canvases.
  const contexts = [CTX, flowerContext];
  const images = contexts.map(ctx => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height));
  const { width, height } = images[0];
  for (let y = 0; y < height; y++) {
    const ny = (y / height - 0.5) * 2;
    for (let x = 0; x < width; x++) {
      const nx = (x / width - 0.5) * 2;
      if (Math.sqrt(Math.pow(nx, 2) + Math.pow(ny, 2)) <= border(Math.atan2(ny, nx))) continue;
      const i = (y * width + x) * 4;
      for (const image of images) image.data.fill(0, i, i + 4);
    }
  }
  contexts.forEach((ctx, i) => ctx.putImageData(images[i], 0, 0));
  const print = Layer.empty();
  for (let x = 0; x < 600; x += 512) {
    for (let y = 0; y < 600; y += 512) print.drawImage(BGCANV, x, y);
  }
  print.drawImage(CTX.canvas, 0, 0, 600, 600);
  self.postMessage({ type: 'painting-ready', mode: 'flowers', seed: SEED,
    png: await encodeCanvas(print.canvas), transparentPng: await encodeCanvas(flowerContext.canvas),
    width: 1800, height: 1800 });
} catch (error) {
  console.error(error);
  self.postMessage({ type: 'painting-error' });
}

})();
