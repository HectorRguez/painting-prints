function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0 || 1;
}
self.onmessage = async ({ data: { mode, seed } }) => {
  try {
    let svg, width, height;
    if (mode === 'fish') {
      importScripts('../upstream/fishdraw/fishdraw.js');
      jsr = str_to_seed(seed);
      const name = binomen();
      svg = draw_svg(main(name));
      width = 520; height = 320;
    } else if (mode === 'galiano') {
      // The author publishes this source without a license. Load the pinned
      // original from its publisher instead of redistributing it in our repo.
      const response = await fetch('https://raw.githubusercontent.com/LingDong-/galiano-drawing/b35a8c905a0312e1721c0cd4fad8e8c8110ca061/main.js');
      if (!response.ok) throw new Error('Could not load Galiano');
      const source = (await response.text()).replaceAll('0x5EED', String(hash(seed)));
      new Function('require', source)(name => {
        if (name !== 'fs') throw new Error('Unsupported module');
        return { writeFileSync: (_path, value) => { svg = value; } };
      });
      width = 544; height = 832;
    } else throw new Error('Unknown drawing');
    self.postMessage({ type: 'painting-ready', svg, width, height, paperColor: 'floralwhite' });
  } catch (error) { self.postMessage({ type: 'painting-error', message: String(error) }); }
};
