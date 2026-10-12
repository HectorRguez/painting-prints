import { pageModes } from './projects.js';

export const cacheLimit = 10;
const version = 1;
const requiredArtRevision = { landscapes: 2, fish: 2, maps: 3 };

// Sampling without replacement gives ten distinct pictures before fresh work.
export function pickUnseen(entries, seen, currentSeed, random = Math.random) {
  const available = entries.filter(entry => entry.seed !== currentSeed && !seen.has(entry.seed));
  return available.length ? available[Math.floor(random() * available.length)] : null;
}
export function retainPainting(entries, entry) {
  return [...entries.filter(item => item.seed !== entry.seed), entry].slice(-cacheLimit);
}

export function indexedDbStorage(name, indexedDB = globalThis.indexedDB) {
  let connection;
  const open = () => connection ??= new Promise(resolve => {
    if (!indexedDB) { resolve(null); return; }
    try {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('paintings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = request.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return {
    async get(mode) {
      const db = await open();
      if (!db) return null;
      return new Promise((resolve, reject) => {
        const request = db.transaction('paintings').objectStore('paintings').get(mode);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    },
    async put(mode, value) {
      const db = await open();
      if (!db) return;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction('paintings', 'readwrite');
        transaction.objectStore('paintings').put(value, mode);
        transaction.oncomplete = resolve;
        transaction.onabort = transaction.onerror = () => reject(transaction.error);
      });
    },
  };
}

export function createPaintingCache(base, {
  storage = indexedDbStorage(`painting-cache-v1:${base.pathname}`),
  fetcher = globalThis.fetch, random = Math.random,
} = {}) {
  const pools = new Map(), seen = new Map(), latest = new Map();
  let manifest, persistence = true;
  function stock() {
    return manifest ??= fetcher(new URL('cache/manifest.json', base))
      .then(response => { if (!response.ok) throw new Error('Missing stock'); return response.json(); })
      .catch(() => ({}));
  }
  function pool(mode) {
    if (!pageModes.includes(mode)) throw new Error('Unknown painting type');
    if (!pools.has(mode)) pools.set(mode, (async () => {
      const [saved, bundled] = await Promise.all([
        storage.get(mode).catch(() => null), stock(),
      ]);
      if (saved?.latest) latest.set(mode, saved.latest);
      const entries = [...(Array.isArray(bundled[mode]) ? bundled[mode] : []),
        ...(saved?.version === version && Array.isArray(saved.entries) ? saved.entries : [])];
      return entries.filter(entry => entry?.mode === mode
        && (!requiredArtRevision[mode] || entry.artRevision === requiredArtRevision[mode])
        && typeof entry.seed === 'string' && (entry.asset || entry.payload))
        .reduce(retainPainting, []);
    })());
    return pools.get(mode);
  }
  return {
    async next(mode, currentSeed) {
      const entries = await pool(mode);
      if (!seen.has(mode)) seen.set(mode, new Set());
      const last = !seen.get(mode).size && entries.find(entry => entry.seed === latest.get(mode) && entry.seed !== currentSeed);
      const entry = last || pickUnseen(entries, seen.get(mode), currentSeed, random);
      if (entry) seen.get(mode).add(entry.seed);
      return entry;
    },
    async remember(entry) {
      const entries = retainPainting(await pool(entry.mode), entry);
      pools.set(entry.mode, Promise.resolve(entries));
      if (!seen.has(entry.mode)) seen.set(entry.mode, new Set());
      seen.get(entry.mode).add(entry.seed);
      // A quota or privacy restriction must never prevent viewing the artwork.
      if (persistence) {
        try { await storage.put(entry.mode, { version, entries, latest: entry.seed }); }
        catch { persistence = false; }
      }
      return entry;
    },
    async resolve(entry) {
      if (entry.svg || entry.png) return entry;
      let payload = entry.payload;
      if (!payload) {
        const response = await fetcher(new URL(`cache/${entry.asset}`, base));
        if (!response.ok) throw new Error('Could not load painting');
        payload = await response.blob();
      }
      const text = await new Response(payload.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      const painting = JSON.parse(text);
      if (painting.mode !== entry.mode || painting.seed !== entry.seed) throw new Error('Cached painting mismatch');
      return painting;
    },
  };
}

export async function cacheEntry(painting) {
  const payload = await new Response(new Blob([JSON.stringify(painting)]).stream()
    .pipeThrough(new CompressionStream('gzip'))).blob();
  return { artRevision: painting.artRevision || 1, mode: painting.mode, seed: painting.seed, width: painting.width, height: painting.height, previewWidth: painting.previewWidth, payload };
}
