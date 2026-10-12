import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { inkOffset } from './preview-layout.js';
let ready;
export async function measurePngInk(png) {
  const image = await createImageBitmap(png);
  try {
    const width = 384, height = Math.max(1, Math.round(width * image.height / image.width));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, width, height);
    return inkOffset(context.getImageData(0, 0, width, height));
  } finally { image.close(); }
}

export async function measureInk(svg, wasm) {
  await (ready ??= initWasm(wasm));
  // This small off-thread rendering is only used for alignment. Cached source
  // and SVG downloads retain all of the original geometry.
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: 384 }, font: { loadSystemFonts: false } });
  let pixels;
  try {
    pixels = renderer.render();
    return inkOffset({ data: pixels.pixels, width: pixels.width, height: pixels.height });
  } finally { pixels?.free(); renderer.free(); }
}

export async function renderSvgPng(svg, width, wasm) {
  return (await renderSvgPreview(svg, width, wasm, false)).preview;
}

// Alignment can use the already-rendered preview pixels: no second SVG parse
// or rasterization, and its bounds match the image the viewer actually sees.
export async function renderSvgPreview(svg, width, wasm, measure = true) {
  await (ready ??= initWasm(wasm));
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } });
  let image;
  try {
    image = renderer.render();
    return {
      preview: new Blob([image.asPng()], { type: 'image/png' }),
      offset: measure ? inkOffset({ data: image.pixels, width: image.width, height: image.height }) : undefined,
    };
  } finally { image?.free(); renderer.free(); }
}
