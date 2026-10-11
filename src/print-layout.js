import { projects } from './projects.js';
export function printLayout(mode, paper = 'a4', orientation = projects[mode]?.orientation) {
  if (!projects[mode] || !['a4', 'a3'].includes(paper)
    || !['portrait', 'landscape'].includes(orientation)) throw new Error('Unsupported print layout');
  const [short, long] = paper === 'a3' ? [297, 420] : [210, 297];
  const [width, height] = orientation === 'portrait' ? [short, long] : [long, short];
  if (mode === 'flowers') {
    const side = short - 30;
    return { orientation, format: paper, width, height,
      art: { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side } };
  }
  const ratio = projects[mode].ratio;
  const artHeight = Math.min(height - 20, (width - 20) / ratio);
  const artWidth = artHeight * ratio;
  return {
    orientation, format: paper, width, height,
    art: { x: (width - artWidth) / 2, y: (height - artHeight) / 2, width: artWidth, height: artHeight },
  };
}
