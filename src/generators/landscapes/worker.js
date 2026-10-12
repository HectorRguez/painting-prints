importScripts('../shared/canvas.js');
self.onmessage = () => {
  try { importScripts('engine.js', 'generate.js'); }
  catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
