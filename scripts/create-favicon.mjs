import { writeFile } from 'node:fs/promises';
import { roughRoundedRect, roughLine, roughCircle } from 'drawably';

// Use Drawably's own pen geometry, with fewer details and heavier strokes
// so the little framed painting remains legible in a browser tab.
const pen = { seed: 73, roughness: .6, boil: 0 };
const line = (x1, y1, x2, y2, seed) => roughLine(x1, y1, x2, y2, { ...pen, seed });
const frame = roughRoundedRect(6, 10, 52, 44, 5, pen);
const mountains = line(13, 44, 27, 26, 74) + line(27, 26, 40, 44, 75)
  + line(34, 36, 42, 31, 76) + line(42, 31, 51, 44, 77)
  + line(13, 45, 51, 45, 78);
const sun = roughCircle(44, 22, 3.5, { ...pen, seed: 79 });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
<title>Painting</title>
<style>
  :root { color: #171715; }
  @media (prefers-color-scheme: dark) { :root { color: #f5f2eb; } }
</style>
<g stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none">
<path d="${frame}"/>
<path d="${mountains}"/>
<path d="${sun}" fill="currentColor" stroke-width="1"/>
</g>
</svg>\n`;
await writeFile(new URL('../public/favicon.svg', import.meta.url), svg);
