// Print adapter for Shan Shui. A fixed ISO-paper aspect ratio keeps the same
// complete composition on screen and in A4 and A3 downloads.
try {
  MEM.windx = 800 * Math.SQRT2;
  MEM.windy = 800;
  calcViewBox = function () { return `0 0 ${MEM.windx} ${MEM.windy}`; };
  update();
  const svg = document.getElementById('SVG');
  svg.removeAttribute('style');
  // The original paper texture, drawn with the upstream noise and colors.
  const paper = document.createElement('canvas');
  paper.width = paper.height = 512;
  const context = paper.getContext('2d');
  for (let x = 0; x <= 256; x++) {
    for (let y = 0; y <= 256; y++) {
      let c = 245 + Noise.noise(x * 0.1, y * 0.1) * 10;
      c -= Math.random() * 20;
      context.fillStyle = `rgb(${c.toFixed(0)},${(c * 0.95).toFixed(0)},${(c * 0.85).toFixed(0)})`;
      context.fillRect(x, y, 1, 1); context.fillRect(512 - x, y, 1, 1);
      context.fillRect(x, 512 - y, 1, 1); context.fillRect(512 - x, 512 - y, 1, 1);
    }
  }
  parent.postMessage({ type: 'painting-ready', mode: 'landscapes', seed: SEED,
    svg: new XMLSerializer().serializeToString(svg), texture: paper.toDataURL('image/png'),
    width: MEM.windx, height: MEM.windy }, location.origin);
} catch (error) {
  console.error(error);
  parent.postMessage({ type: 'painting-error' }, location.origin);
}
