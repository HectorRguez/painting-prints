export function printLayout(mode, paper = 'a4') {
  if (mode === 'flowers') {
    return { orientation: 'portrait', format: 'a4', width: 210, height: 297, art: { x: 15, y: 58.5, width: 180, height: 180 } };
  }
  if (mode !== 'landscapes' || !['a4', 'a3'].includes(paper)) throw new Error('Unsupported print layout');
  const [width, height] = paper === 'a3' ? [420, 297] : [297, 210];
  const ratio = Math.SQRT2;
  const artHeight = Math.min(height - 20, (width - 20) / ratio);
  const artWidth = artHeight * ratio;
  return {
    orientation: 'landscape', format: paper, width, height,
    art: { x: (width - artWidth) / 2, y: (height - artHeight) / 2, width: artWidth, height: artHeight },
  };
}
