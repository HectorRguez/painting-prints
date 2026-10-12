import { createPreviewJob } from './preview-job.js';
import { createInterface } from './interface.js';
import './style.css';
import { createPaintingCache } from './painting-cache.js';
import { projects, publicationDate } from './projects.js';
import { loadSettings, saveSettings } from './export-settings.js';
import { deliverFile, isMobileDevice } from './share.js';
import { createViewer } from './viewer.js';
import { pageFromPath, pageUrl, seedFromSearch } from './pages.js';

// Both the development module and the production bundle live one directory
// below the app root, so assets also resolve correctly from either subpage.
const appBase = new URL(/* @vite-ignore */ '../', import.meta.url);

const paintingCache = createPaintingCache(appBase);
const previewJob = createPreviewJob();
const exportJob = createPreviewJob();
const artwork = document.querySelector('#artwork');
const viewer = createViewer(document.querySelector('#canvas-viewport'), artwork);
const gallery = document.querySelector('.gallery');
const status = document.querySelector('#status');
const regenerate = document.querySelector('#regenerate');
const download = document.querySelector('#download');
const settingsButton = document.querySelector('#settings');
const settingsDialog = document.querySelector('#settings-dialog');
const formatField = document.querySelector('#file-format');
const orientationField = document.querySelector('#orientation');
const paperField = document.querySelector('#page-size');
const backgroundField = document.querySelector('#add-background');
const modes = [...document.querySelectorAll('[data-mode]')];
const interfaceSketch = createInterface();
const paintingAuthor = document.querySelector('#painting-author');
const coarsePointer = matchMedia('(pointer: coarse)');
const phoneLayout = matchMedia('(max-width: 720px)');
const mobile = () => isMobileDevice(navigator, coarsePointer.matches);
const useLandscapeCrop = mode => mode === 'landscapes' && (mobile() || phoneLayout.matches);
let storage;
try { storage = localStorage; } catch { /* Preferences still work for this visit. */ }
const exportSettings = loadSettings(storage, mobile());
const paintings = new Map();
// Retain one decoded preview per style; returning does not fetch or decode it again.
const displayed = new Map();
// Keep one prepared file per generator, rather than accumulating old exports.
const prepared = new Map();
let mode = pageFromPath(location.pathname, appBase.pathname) || 'flowers';
let revision = 0;
let busy = false;
let exporting = false;
let engine;
let timeout;
let restoreSettingsFocus = false;

function updateSelectedPage() {
  const project = projects[mode];
  document.querySelector('#painting-author-name').textContent = project.author;
  const publication = document.querySelector('#painting-date');
  publication.dateTime = project.published;
  publication.textContent = publicationDate(project);
  paintingAuthor.href = project.source;
  document.title = `Painting · ${project.title}`;
  for (const link of modes) {
    const selected = link.dataset.mode === mode;
    link.href = pageUrl(link.dataset.mode, appBase, paintings.get(link.dataset.mode)?.seed).href;
    if (selected) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
    if (selected) {
      gallery.setAttribute('aria-labelledby', link.id);
      interfaceSketch.selectPage(link);
    }
  }
}

function updateExportButton() {
  const file = prepared.get(mode)?.file;
  interfaceSketch.setExporting(exporting);
  document.querySelector('#download-label').textContent = 'Download';
  download.title = file ? `Download ${file.name}` : '';
}
coarsePointer.addEventListener('change', updateExportButton);

function setBusy(value, message = '') {
  busy = value;
  gallery.setAttribute('aria-busy', String(value));
  document.querySelector('#loading-indicator').hidden = !value;
  interfaceSketch.setLoading(value);
  regenerate.disabled = value;
  download.disabled = value || exporting || !paintings.has(mode) || (mobile() && !prepared.has(mode));
  settingsButton.disabled = false;
  interfaceSketch.setMessage(message);
  updateExportButton();
  if (!value && restoreSettingsFocus) {
    settingsButton.focus();
    restoreSettingsFocus = false;
  }
}

async function prepareCurrentExport(token = revision, force = false) {
  const targetMode = mode;
  const entry = paintings.get(targetMode);
  let painting = entry;
  if (!painting) { setBusy(false); return; }
  const settings = exportSettings[targetMode];
  const key = JSON.stringify([painting.seed, settings.format, settings.background,
    ...(settings.format === 'pdf' ? [settings.paper, settings.orientation] : [])]);
  if (prepared.get(targetMode)?.key === key) { setBusy(false); return; }
  exportJob.cancel();
  prepared.delete(targetMode);
  if (!mobile() && !force) { setBusy(false); return; }
  exporting = true;
  setBusy(false);
  try {
    const { file } = await exportJob.run(entry, entry.asset ? new URL(`cache/${entry.asset}`, appBase).href : undefined, settings);
    if (token !== revision) return;
    prepared.set(targetMode, { key, file });
    exporting = false;
    setBusy(false);
  } catch (error) {
    if (token !== revision) return;
    console.error(error);
    exporting = false;
    setBusy(false, 'Could not prepare the file. Open Settings to try again.');
  }
}

function syncPaintingUrl(entry, action = 'replace') {
  const url = new URL(location.href);
  url.searchParams.set('seed', entry.seed);
  if (url.href !== location.href) history[`${action}State`](null, '', url.pathname + url.search + url.hash);
  updateSelectedPage();
}

function frameClass(mode) {
  return `artwork-frame ${mode}${useLandscapeCrop(mode) ? ' landscape-crop' : ''}`;
}

async function showPainting(entry, token = revision, historyAction = 'replace') {
  // Bundled raster previews display directly without fetching/parsing the SVG.
  // Fresh previews are prepared once in a worker and retained in browser storage.
  const cropLandscape = useLandscapeCrop(entry.mode);
  const previewAsset = cropLandscape ? entry.cropPreviewAsset : entry.previewAsset;
  let cached = entry, preview = cropLandscape ? entry.cropPreviewBlob : entry.previewBlob;
  let offset = cropLandscape ? { x: 0, y: 0 } : entry.inkOffset;
  if (!previewAsset && !preview) {
    ({ preview, offset, entry: cached } = await previewJob.run(entry,
      entry.asset ? new URL(`cache/${entry.asset}`, appBase).href : undefined, undefined, { cropLandscape }));
  }
  if (token !== revision) return false;
  const painting = cached;
  const image = new Image();
  image.alt = `Procedurally generated ${projects[painting.mode].label.toLowerCase()}`;
  image.dataset.format = (previewAsset ? previewAsset.endsWith('.png') : preview.type === 'image/png') ? 'png' : 'svg';
  const url = previewAsset ? new URL(`cache/${previewAsset}`, appBase).href : URL.createObjectURL(preview);
  try { image.src = url; await image.decode(); }
  catch (error) { URL.revokeObjectURL(url); throw error; }
  if (token !== revision) { URL.revokeObjectURL(url); return false; }
  // The viewport can cross the phone breakpoint while the worker is rendering.
  if (cropLandscape !== useLandscapeCrop(painting.mode)) {
    URL.revokeObjectURL(url);
    return showPainting(cached, token, historyAction);
  }
  const previous = displayed.get(painting.mode);
  if (previous) URL.revokeObjectURL(previous.url);
  displayed.set(painting.mode, { image, url, cropLandscape });
  paintings.set(painting.mode, cached);
  void paintingCache.remember(cached);
  artwork.parentElement.className = frameClass(painting.mode);
  artwork.className = `artwork ${painting.mode}`;
  image.style.transform = `translate(${offset.x}%, ${offset.y}%)`;
  artwork.replaceChildren(image);
  viewer.reset();
  syncPaintingUrl(cached, historyAction);
  return true;
}

function cancelCurrentWork() {
  revision++;
  exporting = false;
  clearTimeout(timeout);
  engine?.terminate();
  previewJob.cancel();
  exportJob.cancel();
  engine = undefined;
}

async function nextPainting({ cachedFirst = false, seed = null, historyAction = 'replace' } = {}) {
  if (busy) return;
  cancelCurrentWork();
  const token = revision;
  setBusy(true);
  try {
    const cached = seed ? await paintingCache.find(mode, seed)
      : cachedFirst ? await paintingCache.next(mode, paintings.get(mode)?.seed) : null;
    if (token !== revision) return;
    if (cached) {
      if (await showPainting(cached, token, historyAction)) void prepareCurrentExport(token);
    } else {
      if (token === revision) generatePainting(token, seed, historyAction);
    }
  } catch (error) {
    if (token !== revision) return;
    console.error(error);
    setBusy(false, 'Could not load the painting. Please try Create.');
  }
}

function generatePainting(token, requestedSeed, historyAction) {
  const targetMode = mode;
  const seed = requestedSeed || Date.now().toString(36) + '-' + crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
  const url = new URL(`generators/${mode}/worker.js`, appBase);
  url.searchParams.set('seed', seed);
  if (mode === 'maps') url.searchParams.set('revision', '4');
  if (mode !== 'landscapes') url.searchParams.set('engine', 'wasm-v1');
  const worker = new Worker(url);
  engine = worker;
  const finish = () => {
    clearTimeout(timeout);
    worker.terminate();
    if (engine === worker) engine = undefined;
  };
  const fail = message => {
    finish();
    if (token === revision) setBusy(false, message);
  };
  worker.onerror = () => fail('Could not make the painting. Please try Create.');
  worker.onmessage = async ({ data }) => {
    if (token !== revision) return;
    if (!['painting-ready', 'painting-error'].includes(data?.type)) return;
    finish();
    if (data.type === 'painting-error') {
      setBusy(false, 'Could not make the painting. Please try Create.');
      return;
    }
    try {
      const painting = { ...data, mode: targetMode, seed };
      if (await showPainting(painting, token, historyAction)) void prepareCurrentExport(token);
    } catch (error) {
      if (token !== revision) return;
      console.error(error);
      setBusy(false, 'Could not show the painting. Please try Create.');
    }
  };
  timeout = setTimeout(() => fail('Generation took too long. Please try Create.'), 120_000);
  worker.postMessage({ mode: targetMode, seed });
}
regenerate.addEventListener('click', () => void nextPainting({ historyAction: 'push' }));
status.addEventListener('click', event => {
  if (!event.target.closest('#retry-painting')) return;
  event.preventDefault();
  void nextPainting();
});

async function showPage(nextMode, seed = null) {
  const remembered = paintings.get(nextMode);
  const matches = remembered && (!seed || remembered.seed === seed);
  const matchingPreview = matches && displayed.get(nextMode)?.cropLandscape === useLandscapeCrop(nextMode);
  if (nextMode === mode && !busy && matchingPreview) { syncPaintingUrl(remembered); return; }
  // Back/Forward can arrive while an image or export is still being prepared.
  // Save an open settings panel, then invalidate all work from the old page.
  if (settingsDialog.open) closeSettings();
  cancelCurrentWork();
  restoreSettingsFocus = false;
  mode = nextMode;
  updateSelectedPage();
  artwork.parentElement.className = frameClass(mode);
  artwork.className = `artwork ${mode}`;
  artwork.replaceChildren();
  viewer.reset();
  if (matchingPreview) {
    artwork.replaceChildren(displayed.get(mode).image);
    viewer.reset();
    syncPaintingUrl(remembered);
    void prepareCurrentExport(revision);
  } else if (matches) {
    const token = revision;
    setBusy(true);
    try {
      if (await showPainting(paintings.get(mode), token)) await prepareCurrentExport(token);
    } catch (error) {
      if (token !== revision) return;
      console.error(error);
      setBusy(false, 'Could not show the painting. Please try Create.');
    }
  } else {
    setBusy(false);
    void nextPainting({ cachedFirst: !seed, seed });
  }
}
for (const link of modes) {
  link.addEventListener('click', event => {
    // Keep normal link behavior for new tabs, modifier keys and context menus.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const nextMode = link.dataset.mode;
    const target = new URL(link.href);
    if (location.href !== target.href) history.pushState(null, '', target.pathname + target.search);
    void showPage(nextMode, seedFromSearch(target.search));
  });
}
window.addEventListener('popstate', () => {
  const nextMode = pageFromPath(location.pathname, appBase.pathname);
  if (nextMode) void showPage(nextMode, seedFromSearch(location.search));
});
phoneLayout.addEventListener('change', () => {
  if (!busy && mode === 'landscapes') void showPage(mode, paintings.get(mode)?.seed);
});

download.addEventListener('click', async () => {
  if (busy || exporting) return;
  const token = revision;
  let file = prepared.get(mode)?.file;
  // Desktop downloads may prepare on demand. Phone files are prepared before
  // the tap, preserving the user activation needed by the native share sheet.
  if (!file && !mobile()) {
    await prepareCurrentExport(token, true);
    if (token !== revision) return;
    file = prepared.get(mode)?.file;
  }
  if (!file) return;
  exporting = true;
  setBusy(false);
  try {
    const result = await deliverFile(file, { mobile: mobile(), navigator });
    if (token !== revision) return;
    exporting = false;
    setBusy(false, result === 'downloaded-after-share-failed' ? 'Sharing was unavailable. Your file was downloaded instead.' : '');
  } catch (error) {
    if (token !== revision) return;
    exporting = false;
    console.error(error);
    setBusy(false, 'Could not save the file. Please try again.');
  }
});

function updateSettingsFields() {
  const pdf = formatField.value === 'pdf';
  orientationField.disabled = !pdf;
  paperField.disabled = !pdf;
}
settingsButton.addEventListener('click', () => {
  const settings = exportSettings[mode];
  formatField.value = settings.format;
  orientationField.value = settings.orientation;
  paperField.value = settings.paper;
  backgroundField.checked = settings.background;
  updateSettingsFields();
  settingsDialog.showModal();
  interfaceSketch.syncSettings();
});
formatField.addEventListener('change', updateSettingsFields);
function closeSettings() {
  exportSettings[mode] = { format: formatField.value, orientation: orientationField.value, paper: paperField.value, background: backgroundField.checked };
  saveSettings(storage, exportSettings);
  if (busy) {
    settingsDialog.close();
    settingsButton.focus();
    return;
  }
  revision++;
  exporting = false;
  restoreSettingsFocus = true;
  settingsDialog.close();
  // Disable exporting synchronously with Done/Escape, rather than waiting
  // for the browser's queued close event and briefly exposing the old file.
  void prepareCurrentExport();
}
settingsDialog.querySelector('form').addEventListener('submit', event => {
  event.preventDefault();
  closeSettings();
});
settingsDialog.addEventListener('cancel', event => {
  event.preventDefault();
  closeSettings();
});
settingsDialog.addEventListener('click', event => {
  if (event.target !== settingsDialog) return;
  const bounds = settingsDialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeSettings();
});
// The landing page opens Flowers without adding an extra Back-button step.
if (location.pathname !== pageUrl(mode, appBase).pathname) {
  history.replaceState(null, '', pageUrl(mode, appBase).pathname + location.search + location.hash);
}
history.scrollRestoration = 'manual';
updateSelectedPage();
void nextPainting({ cachedFirst: true, seed: seedFromSearch(location.search) });
