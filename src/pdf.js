import { projects } from './projects.js';
import { jsPDF } from 'jspdf';
import { printLayout } from './print-layout.js';
import { artworkPng } from './export.js';

export async function createPdf(painting, settings) {
  const layout = printLayout(painting.mode, settings.paper, settings.orientation);
  const pdf = new jsPDF({ orientation: layout.orientation, unit: 'mm', format: layout.format, compress: true });
  pdf.setProperties({ title: projects[painting.mode].title, author: `Artwork by ${projects[painting.mode].author}`, subject: `Seed ${painting.seed}` });
  const { x, y, width, height } = layout.art;
  const png = await artworkPng(painting, {
    width: Math.ceil(width / 25.4 * 300), height: Math.ceil(height / 25.4 * 300),
  }, settings.background);
  pdf.addImage(new Uint8Array(await png.arrayBuffer()), 'PNG', x, y, width, height, undefined, 'FAST');
  return pdf.output('blob');
}
