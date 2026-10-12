import { pageModes } from './projects.js';
export { pageModes };

export function pageFromPath(pathname, basePath) {
  if (!pathname.startsWith(basePath)) return null;
  const page = pathname.slice(basePath.length).replace(/(^|\/)index\.html$/, '').replace(/\/$/, '');
  if (!page) return 'flowers';
  return pageModes.includes(page) ? page : null;
}

export function seedFromSearch(search) {
  const seed = new URLSearchParams(search).get('seed');
  return seed && seed.length <= 256 ? seed : null;
}

export function pageUrl(mode, base, seed) {
  if (!pageModes.includes(mode)) throw new Error('Unknown painting page');
  const url = new URL(`${mode}/`, base);
  if (seed) url.searchParams.set('seed', seed);
  return url;
}
