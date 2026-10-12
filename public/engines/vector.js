const params = new URLSearchParams(location.search);
const mode = params.get('mode');
const seed = params.get('seed');
const worker = new Worker(mode === 'maps' ? 'map-worker.js?revision=4' : 'drawing-worker.js');
worker.onmessage = ({ data }) => parent.postMessage({ ...data, mode, seed }, location.origin);
worker.onerror = () => parent.postMessage({ type: 'painting-error', mode }, location.origin);
worker.postMessage({ mode, seed });
addEventListener('pagehide', () => worker.terminate());
