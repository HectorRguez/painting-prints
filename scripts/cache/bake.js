import { gzipSync, zipSync, strToU8 } from '../../node_modules/fflate/esm/browser.js';
import { pageModes, projects } from '../../src/projects.js';
import { renderLinePreview } from '../../src/generators/shared/line-preview.js';
const base = new URL('../../public/', import.meta.url);
const files = {};
let manifest = {};
const requested = new URLSearchParams(location.search).get('styles')?.split(',');
const styles = requested ? pageModes.filter(mode => requested.includes(mode)) : pageModes;
document.querySelector('#start').textContent = `Prepare ${styles.length * 10} paintings`;
function generate(mode, seed) {
  return new Promise((resolve, reject) => {
    const url = new URL(`generators/${mode}/worker.js`, base);
    url.searchParams.set('seed', seed);
    const worker = new Worker(url);
    const timer = setTimeout(() => finish(new Error('Generation timed out')), 180000);
    function finish(error, painting) {
      clearTimeout(timer); worker.terminate();
      error ? reject(error) : resolve({ ...painting, mode, seed });
    }
    worker.onmessage = ({ data }) => {
      if (data?.type === 'painting-ready') finish(null, data);
      else if (data?.type === 'painting-error') finish(new Error(data.message || 'Generation failed'));
    };
    worker.onerror = event => finish(new Error(event.message || 'Generation failed'));
    worker.postMessage({ mode, seed });
  });
}
document.querySelector('#start').onclick = async () => {
  document.querySelector('#start').disabled = true;
  try {
    const response = await fetch(new URL('cache/manifest.json', base));
    if (!response.ok) throw new Error('Could not read the existing cache manifest');
    manifest = await response.json();
    for (const mode of styles) {
      manifest[mode] = [];
      for (let i = 0; i < 10; i++) {
        document.querySelector('#progress').textContent = `Preparing ${mode} ${i + 1}/10`;
        const seed = `painting-stock-v1-${mode}-${i}`;
        const painting = await generate(mode, seed);
        const stem = `${mode}${['fish', 'landscapes'].includes(mode) ? '-v2' : ''}/${i}`;
        files[`${stem}.json.gz`] = gzipSync(strToU8(JSON.stringify(painting)), { level: 6 });
        const entry = { artRevision: painting.artRevision || 1, mode, seed, width: painting.width, height: painting.height, previewWidth: painting.previewWidth, asset: `${stem}.json.gz` };
        if (projects[mode].renderer === 'lines') {
          const { preview, offset } = await renderLinePreview(painting);
          files[`${stem}.png`] = new Uint8Array(await preview.arrayBuffer());
          Object.assign(entry, { previewAsset: `${stem}.png`, inkOffset: offset });
        }
        manifest[mode].push(entry);
      }
    }
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    document.querySelector('#progress').textContent = `Ready: ${styles.length * 10} paintings, ${Math.round(Object.values(files).reduce((sum, v) => sum + v.length, 0) / 1048576)} MB`;
    document.querySelector('#save').disabled = false;
  } catch (error) { document.querySelector('#progress').textContent = String(error); console.error(error); }
};
document.querySelector('#save').onclick = () => {
  const url = URL.createObjectURL(new Blob([zipSync(files, { level: 0 })], { type: 'application/zip' }));
  const a = document.createElement('a'); a.href = url; a.download = 'painting-stock-v1.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
};
