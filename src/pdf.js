import { jsPDF } from 'jspdf';
import { printLayout } from './print-layout.js';
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not prepare the painting for download.'));
    image.src = url;
  });
}
async function landscapeBitmap(painting, art) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(art.width / 25.4 * 300);
  canvas.height = Math.ceil(art.height / 25.4 * 300);
  const context = canvas.getContext('2d');
  const texture = await loadImage(painting.texture);
  context.setTransform(canvas.width / painting.width, 0, 0, canvas.height / painting.height, 0, 0);
  context.fillStyle = context.createPattern(texture, 'repeat');
  context.fillRect(0, 0, painting.width, painting.height);
  const svgUrl = URL.createObjectURL(new Blob([painting.svg], { type: 'image/svg+xml' }));
  try {
    const drawing = await loadImage(svgUrl);
    context.resetTransform();
    context.globalCompositeOperation = 'multiply';
    context.drawImage(drawing, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
export async function downloadPainting(painting, paper = 'a4') {
  const layout = printLayout(painting.mode, paper);
  const pdf = new jsPDF({ orientation: layout.orientation, unit: 'mm', format: layout.format, compress: true });
  pdf.setProperties({ title: painting.mode === 'flowers' ? 'Nonflowers' : 'Shan Shui', author: 'Artwork by Lingdong Huang', subject: `Seed ${painting.seed}` });
  const png = painting.mode === 'flowers' ? painting.png : await landscapeBitmap(painting, layout.art);
  const { x, y, width, height } = layout.art;
  pdf.addImage(png, 'PNG', x, y, width, height, undefined, 'FAST');
  pdf.save(`${painting.mode}-${painting.seed}-${layout.format}.pdf`);
}
