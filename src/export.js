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
  const document = painting.mode === 'landscapes'
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
    const drawing = svg.querySelector('g');
    if (background) {
      drawing.style.mixBlendMode = 'multiply';
      const definitions = element(document, 'defs');
      const pattern = element(document, 'pattern', { id: 'paper-texture', patternUnits: 'userSpaceOnUse', width: 512, height: 512 });
      pattern.append(element(document, 'image', { href: painting.texture, width: 512, height: 512 }));
      definitions.append(pattern);
      const paperRect = element(document, 'rect', { width: painting.width, height: painting.height, fill: 'url(#paper-texture)' });
      svg.prepend(definitions, paperRect);
    }
  }
  const title = element(document, 'title');
  title.textContent = painting.mode === 'flowers' ? 'Nonflowers' : 'Shan Shui';
  const description = element(document, 'desc');
  description.textContent = `Artwork by Lingdong Huang. Seed ${painting.seed}.`;
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
  if (background) {
    const texture = await loadImage(painting.texture);
    context.setTransform(canvas.width / painting.width, 0, 0, canvas.height / painting.height, 0, 0);
    context.fillStyle = context.createPattern(texture, 'repeat');
    context.fillRect(0, 0, painting.width, painting.height);
  }
  const url = URL.createObjectURL(new Blob([painting.svg], { type: 'image/svg+xml' }));
  try {
    const drawing = await loadImage(url);
    context.resetTransform();
    context.globalCompositeOperation = background ? 'multiply' : 'source-over';
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
