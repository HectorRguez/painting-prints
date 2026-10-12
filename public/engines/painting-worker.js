// Run the original browser generators away from the interface. Their adapters
// only need a canvas and, for Shan Shui, a string destination for its SVG.
self.window = self;
const background = { innerHTML: '' };
self.document = {
  addEventListener() {},
  createElement(tag) {
    if (tag !== 'canvas') throw new Error(`Unsupported drawing element: ${tag}`);
    return new OffscreenCanvas(1, 1);
  },
  getElementById(id) {
    if (id === 'BG') return background;
    if (id === 'SVG') return { removeAttribute() {} };
    throw new Error(`Unsupported drawing target: ${id}`);
  },
};
self.XMLSerializer = class { serializeToString() { return background.innerHTML; } };
self.parent = { postMessage: data => self.postMessage(data) };
self.canvasDataUrl = async canvas => {
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new FileReaderSync().readAsDataURL(blob);
};
self.onmessage = ({ data: { mode } }) => {
  try {
    if (mode === 'flowers') importScripts('../upstream/nonflowers/main.js', 'flowers.js');
    else if (mode === 'landscapes') importScripts('landscape-engine.js', 'landscapes.js');
    else throw new Error('Unsupported generator');
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
