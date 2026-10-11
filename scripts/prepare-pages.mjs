import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Real directory indexes let GitHub Pages serve direct links and refreshes.
// The app shares its assets and keeps navigation in the browser's history.
const dist = new URL('../dist/', import.meta.url);
const root = await readFile(new URL('index.html', dist), 'utf8');
for (const mode of ['flowers', 'landscapes']) {
  let html = root.replaceAll('./assets/', '../assets/')
    .replaceAll('href="./flowers/"', 'href="../flowers/"')
    .replaceAll('href="./landscapes/"', 'href="../landscapes/"');
  if (mode === 'landscapes') {
    html = html.replace('<title>Painting</title>', '<title>Painting · Shan Shui</title>')
      .replace('id="painting-title">Nonflowers', 'id="painting-title">Shan Shui')
      .replace('https://github.com/LingDong-/nonflowers', 'https://github.com/LingDong-/shan-shui-inf')
      .replace('data-mode="flowers" aria-current="page"', 'data-mode="flowers"')
      .replace('data-mode="landscapes"', 'data-mode="landscapes" aria-current="page"')
      .replace('aria-labelledby="flowers-link"', 'aria-labelledby="landscapes-link"')
      .replace('class="artwork flowers"', 'class="artwork landscapes"');
  } else html = html.replace('<title>Painting</title>', '<title>Painting · Nonflowers</title>');
  const directory = new URL(`${mode}/`, dist);
  await mkdir(directory, { recursive: true });
  await writeFile(new URL('index.html', directory), html);
}
