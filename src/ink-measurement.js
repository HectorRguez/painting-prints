import { initWasm, Resvg } from '@resvg/resvg-wasm';
import { inkOffset } from './preview-layout.js';
let ready;
export async function measureInk(svg, wasm) {
  await (ready ??= initWasm(wasm));
  // A small off-thread rendering is only used for alignment. Display and
  // downloads retain the complete SVG and all of its original geometry.
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: 384 }, font: { loadSystemFonts: false } });
  let pixels;
  try {
    pixels = renderer.render();
    return inkOffset({ data: pixels.pixels, width: pixels.width, height: pixels.height });
  } finally { pixels?.free(); renderer.free(); }
}

export async function renderSvgPng(svg, width, wasm) {
  await (ready ??= initWasm(wasm));
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: false } });
  let image;
  try {
    image = renderer.render();
    return new Blob([image.asPng()], { type: 'image/png' });
  } finally { image?.free(); renderer.free(); }
}
