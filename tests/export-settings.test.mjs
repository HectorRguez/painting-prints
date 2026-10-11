import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, saveSettings } from '../src/export-settings.js';
import { prepareExport } from '../src/export.js';

test('phones default to shareable PNG; desktop defaults to PDF with sensible per-art orientation', () => {
  assert.equal(defaultSettings('flowers', true).format, 'png');
  assert.equal(defaultSettings('landscapes', true).format, 'png');
  assert.deepEqual(defaultSettings('flowers'), { format: 'pdf', orientation: 'portrait', paper: 'a4' });
  assert.deepEqual(defaultSettings('landscapes'), { format: 'pdf', orientation: 'landscape', paper: 'a4' });
});

test('per-art preferences survive reload and malformed entries are individually repaired', () => {
  let value;
  const storage = { getItem: () => value, setItem: (key, data) => { value = data; } };
  const settings = { flowers: { format: 'svg', orientation: 'landscape', paper: 'a3' }, landscapes: defaultSettings('landscapes') };
  saveSettings(storage, settings);
  assert.deepEqual(loadSettings(storage, true), settings);
  value = JSON.stringify({ flowers: { format: 'html', orientation: 'landscape', paper: 'a0' }, landscapes: settings.landscapes });
  assert.deepEqual(loadSettings(storage).flowers, { format: 'pdf', orientation: 'landscape', paper: 'a4' });
  value = '{broken';
  assert.deepEqual(loadSettings(storage).flowers, defaultSettings('flowers'));
});

test('blocked storage leaves current-visit settings usable', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSettings(storage, true).flowers, defaultSettings('flowers', true));
  assert.doesNotThrow(() => saveSettings(storage, {}));
});

test('flower PNG preserves the exact original file bytes and ignores PDF page settings', async () => {
  const bytes = new Uint8Array([137,80,78,71,13,10,26,10]);
  const painting = { mode: 'flowers', seed: 'test', png: `data:image/png;base64,${Buffer.from(bytes).toString('base64')}` };
  const file = await prepareExport(painting, { format: 'png', orientation: 'landscape', paper: 'a3' });
  assert.equal(file.name, 'flowers-test.png');
  assert.equal(file.type, 'image/png');
  assert.deepEqual(new Uint8Array(await file.arrayBuffer()), bytes);
});
