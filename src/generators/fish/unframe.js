// Adapt the pinned upstream SVG formats before previewing or exporting them.
// Keep occlusion fills; only remove the publisher's frame and caption strokes.
function unframeFish(svg) {
  svg = svg.replace(/<rect x="10" y="10" width="500" height="300"[^>]*\/>/, '');
  // Fishdraw emits the caption as final polylines in a separate bottom band.
  // Its fish geometry ends at y=290; the letter strokes start at y=291.1.
  svg = svg.replace(/d="([^"]*)"/g, (attribute, d) => {
    if (!d.includes('M ')) return attribute;
    const lines = d.split(/(?=M )/).filter(line => {
      const values = line.match(/-?\d+(?:\.\d+)?/g)?.map(Number);
      return !values?.length || values.some((value, i) => i % 2 === 1 && value < 291);
    });
    return `d="${lines.join('')}"`;
  });
  return svg;
}
