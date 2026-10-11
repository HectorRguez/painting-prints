export const pageModes = ['flowers', 'landscapes'];

export function pageFromPath(pathname, basePath) {
  if (!pathname.startsWith(basePath)) return null;
  const page = pathname.slice(basePath.length).replace(/(^|\/)index\.html$/, '').replace(/\/$/, '');
  if (!page) return 'flowers';
  return pageModes.includes(page) ? page : null;
}

export function pageUrl(mode, base) {
  if (!pageModes.includes(mode)) throw new Error('Unknown painting page');
  return new URL(`${mode}/`, base);
}
