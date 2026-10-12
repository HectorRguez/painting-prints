import { scribbleFill, variants } from 'drawably';

// Reuse the same Drawably hatching primitive as the Create button.
export function createRegenerationMark(viewport, artwork) {
  const namespace = 'http://www.w3.org/2000/svg';
  const mark = document.createElement('div');
  mark.id = 'regeneration-mark';
  mark.hidden = true;
  mark.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(namespace, 'svg');
  svg.classList.add('drawably-svg');
  mark.append(svg);
  viewport.append(mark);

  function draw() {
    if (mark.hidden) return;
    const bounds = artwork.getBoundingClientRect();
    const width = Math.min(viewport.clientWidth, bounds.width);
    const height = Math.min(viewport.clientHeight, bounds.height);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.width = `${width}px`;
    svg.style.height = `${height}px`;
    svg.replaceChildren(...variants(options =>
      scribbleFill(2, 2, width - 4, height - 4, options),
    { seed: 912, roughness: 1, boil: .3 }).map((d, i) => {
      const path = document.createElementNS(namespace, 'path');
      path.setAttribute('d', d);
      path.classList.add('drawably-boil');
      path.dataset.i = String(i);
      return path;
    }));
  }
  const observer = new ResizeObserver(draw);
  observer.observe(viewport);
  return {
    setLoading(loading) {
      const replacing = loading && Boolean(artwork.firstElementChild);
      mark.hidden = !replacing;
      viewport.dataset.replacing = String(replacing);
      viewport.inert = loading;
      viewport.setAttribute('aria-disabled', String(loading));
      draw();
    },
  };
}
