import { roughLine, roughCircle, roughArrow, variants } from 'drawably';

// Drawably has no icon pack: compose its public pen primitives and boil frames.
const shapes = {
  regenerate(o) {
    // Two opposing semicircles with short, explicit arrowheads. The generic
    // roughArrow uses 12px heads, too large for a 28px refresh icon.
    const arc = (start, seed) => {
      const points = Array.from({ length: 9 }, (_, i) => {
        const angle = start + i / 8 * Math.PI * .85;
        return [14 + 8 * Math.cos(angle), 14 + 8 * Math.sin(angle)];
      });
      return points.slice(1).map((point, i) => roughLine(...points[i], ...point, { ...o, seed: seed + i })).join(' ');
    };
    return arc(Math.PI, o.seed) + arc(0, o.seed + 20)
      + roughLine(16, 10.4, 21.1, 10.4, o) + roughLine(21.1, 5.3, 21.1, 10.4, o)
      + roughLine(12, 17.6, 6.9, 17.6, o) + roughLine(6.9, 22.7, 6.9, 17.6, o);
  },
  download: o => roughArrow(14, 4, 14, 19, o) + roughLine(5, 19, 5, 24, o)
    + roughLine(5, 24, 23, 24, o) + roughLine(23, 24, 23, 19, o),
  share: o => roughArrow(14, 19, 14, 4, o) + roughLine(5, 15, 5, 24, o)
    + roughLine(5, 24, 23, 24, o) + roughLine(23, 24, 23, 15, o),
  settings: o => [7, 14, 21].map((y, i) => roughLine(4, y, 24, y, { ...o, seed: o.seed + i })
    + roughCircle([10, 19, 12][i], y, 2.5, { ...o, seed: o.seed + i + 4 })).join(' '),
};

export function buttonIcon(button, initial) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('drawably-svg', 'button-icon');
  button.prepend(svg);
  let current;
  return function update(name = initial) {
    if (name === current) return;
    current = name;
    const paths = variants(shapes[name], { seed: 318, roughness: .35, boil: .12 });
    svg.replaceChildren(...paths.map((d, i) => {
      const path = document.createElementNS(svg.namespaceURI, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'drawably-boil');
      path.dataset.i = String(i);
      return path;
    }));
  };
}
