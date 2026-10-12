import { artworkSvg } from './artwork-svg.js';
export { artworkSvg } from './artwork-svg.js';

export function pngBlob(dataUrl) {
  const data = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not prepare the painting.'));
    image.src = url;
  });
}

export async function artworkPng(painting, dimensions, background = false) {
  if (painting.mode === 'flowers') return pngBlob(background ? painting.png : painting.transparentPng);
  const canvas = document.createElement('canvas');
  canvas.width = dimensions?.width || 3200;
  canvas.height = dimensions?.height || Math.round(canvas.width * painting.height / painting.width);
  const context = canvas.getContext('2d');
  const url = URL.createObjectURL(new Blob([artworkSvg(painting, background)], { type: 'image/svg+xml' }));
  try {
    const drawing = await loadImage(url);
    context.resetTransform();
    context.globalCompositeOperation = 'source-over';
    context.drawImage(drawing, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Could not prepare the image.')), 'image/png'));
  } finally { URL.revokeObjectURL(url); }
}

export async function prepareExport(painting, settings, renderPng = artworkPng) {
  let blob;
  if (settings.format === 'png') blob = await renderPng(painting, undefined, settings.background);
  else if (settings.format === 'svg') blob = new Blob([artworkSvg(painting, settings.background)], { type: 'image/svg+xml' });
  else if (settings.format === 'pdf') {
    const { createPdf } = await import('./pdf.js');
    blob = await createPdf(painting, settings, renderPng);
  } else throw new Error('Unsupported file type');
  const suffix = settings.format === 'pdf' ? `-${settings.paper}-${settings.orientation}` : '';
  const name = `${painting.mode}-${painting.seed}${suffix}${settings.background ? '-background' : ''}.${settings.format}`;
  return new File([blob], name, { type: blob.type });
}
