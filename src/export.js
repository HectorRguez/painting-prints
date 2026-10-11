import { projects } from './projects.js';
const namespace = 'http://www.w3.org/2000/svg';

export function pngBlob(dataUrl) {
  const data = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i++) bytes[i] = data.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}

function element(document, name, attributes = {}) {
  const node = document.createElementNS(namespace, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

export function artworkSvg(painting, background = false) {
  const document = painting.mode !== 'flowers'
    ? new DOMParser().parseFromString(painting.svg, 'image/svg+xml')
    : new DOMParser().parseFromString(`<svg xmlns="${namespace}"/>`, 'image/svg+xml');
  const svg = document.documentElement;
  svg.setAttribute('width', painting.width);
  svg.setAttribute('height', painting.height);
  svg.setAttribute('viewBox', `0 0 ${painting.width} ${painting.height}`);
  if (painting.mode === 'flowers') {
    // Nonflowers is a raster generator. Its SVG embeds the original image.
    svg.append(element(document, 'image', { href: background ? painting.png : painting.transparentPng, width: painting.width, height: painting.height }));
  } else {
    svg.removeAttribute('style');
    svg.style.isolation = 'isolate';
    // Wrap the whole drawing, including occlusion shapes, in one composite.
    const drawing = element(document, 'g');
    while (svg.firstChild) drawing.append(svg.firstChild);
    svg.append(drawing);
    if (painting.mode === 'fish') {
      drawing.querySelector('rect[fill="floralwhite"]')?.remove();
    }
    if (painting.mode === 'galiano' && !background) {
      for (const shape of drawing.querySelectorAll('[fill="floralwhite"]')) shape.setAttribute('fill', 'white');
    }
    if (background && painting.texture) {
      drawing.style.mixBlendMode = 'multiply';
      const definitions = element(document, 'defs');
      const pattern = element(document, 'pattern', { id: 'paper-texture', patternUnits: 'userSpaceOnUse', width: 512, height: 512 });
      pattern.append(element(document, 'image', { href: painting.texture, width: 512, height: 512 }));
      definitions.append(pattern);
      const paperRect = element(document, 'rect', { width: painting.width, height: painting.height, fill: 'url(#paper-texture)' });
      svg.prepend(definitions, paperRect);
    } else if (background) {
      svg.prepend(element(document, 'rect', { width: painting.width, height: painting.height, fill: painting.paperColor || 'white' }));
    } else if (['landscapes', 'galiano'].includes(painting.mode)) {
      // Composite the white occlusion fills first, then turn the finished
      // monochrome drawing into ink opacity. Removing fills individually
      // would expose lines that should be hidden behind foreground objects.
      const definitions = element(document, 'defs');
      const filter = element(document, 'filter', {
        id: 'transparent-ink', x: 0, y: 0, width: painting.width,
        height: painting.height, filterUnits: 'userSpaceOnUse',
        'color-interpolation-filters': 'sRGB',
      });
      filter.append(element(document, 'feColorMatrix', { type: 'matrix',
        values: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 1 0',
      }));
      definitions.append(filter);
      svg.prepend(definitions);
      drawing.setAttribute('filter', 'url(#transparent-ink)');
    }
  }
  const title = element(document, 'title');
  title.textContent = projects[painting.mode].title;
  const description = element(document, 'desc');
  description.textContent = `Artwork by ${projects[painting.mode].author}. Seed ${painting.seed}.`;
  svg.prepend(title, description);
  return new XMLSerializer().serializeToString(svg);
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

export async function prepareExport(painting, settings) {
  let blob;
  if (settings.format === 'png') blob = await artworkPng(painting, undefined, settings.background);
  else if (settings.format === 'svg') blob = new Blob([artworkSvg(painting, settings.background)], { type: 'image/svg+xml' });
  else if (settings.format === 'pdf') {
    const { createPdf } = await import('./pdf.js');
    blob = await createPdf(painting, settings);
  } else throw new Error('Unsupported file type');
  const suffix = settings.format === 'pdf' ? `-${settings.paper}-${settings.orientation}` : '';
  const name = `${painting.mode}-${painting.seed}${suffix}${settings.background ? '-background' : ''}.${settings.format}`;
  return new File([blob], name, { type: blob.type });
}
