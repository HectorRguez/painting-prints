import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { projects, pageModes } from '../src/projects.js';

const dist = new URL('../dist/', import.meta.url);
const root = await readFile(new URL('index.html', dist), 'utf8');
for (const mode of pageModes) {
  const project = projects[mode];
  let html = root.replaceAll('./assets/', '../assets/')
    .replace('<title>Painting</title>', `<title>Painting · ${project.title}</title>`)
    .replace('https://github.com/LingDong-/nonflowers', project.source)
    .replace('>Lingdong Huang</a>', `>${project.author}</a>`)
    .replace(' aria-current="page"', '')
    .replace(`data-mode="${mode}"`, `data-mode="${mode}" aria-current="page"`)
    .replace('aria-labelledby="flowers-link"', `aria-labelledby="${mode}-link"`)
    .replace('class="artwork flowers"', `class="artwork ${mode}"`)
    .replace('class="artwork-frame flowers"', `class="artwork-frame ${mode}"`);
  for (const page of pageModes) html = html.replaceAll(`href="./${page}/"`, `href="../${page}/"`);
  const directory = new URL(`${mode}/`, dist);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), html);
}
