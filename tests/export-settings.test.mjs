import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultSettings, loadSettings, saveSettings } from '../src/export-settings.js';
import { prepareExport } from '../src/export.js';
import { pageModes } from '../src/projects.js';

test('phones default to shareable PNG; desktop defaults to PDF with sensible per-art orientation', () => {
  assert.equal(defaultSettings('flowers', true).format, 'png');
  assert.equal(defaultSettings('landscapes', true).format, 'png');
  assert.deepEqual(defaultSettings('flowers'), { format: 'pdf', orientation: 'portrait', paper: 'a4', background: false });
  assert.deepEqual(defaultSettings('landscapes'), { format: 'pdf', orientation: 'landscape', paper: 'a4', background: false });
});

test('per-art preferences survive reload and malformed entries are individually repaired', () => {
  let value;
  const storage = { getItem: () => value, setItem: (key, data) => { value = data; } };
  const settings = { flowers: { format: 'svg', orientation: 'landscape', paper: 'a3', background: true }, landscapes: defaultSettings('landscapes') };
  saveSettings(storage, settings);
  assert.deepEqual(loadSettings(storage, true), { ...Object.fromEntries(pageModes.map(mode => [mode, defaultSettings(mode, true)])), ...settings });
  value = JSON.stringify({ flowers: { format: 'html', orientation: 'landscape', paper: 'a0' }, landscapes: settings.landscapes });
  assert.deepEqual(loadSettings(storage).flowers, { format: 'pdf', orientation: 'landscape', paper: 'a4', background: false });
  value = '{broken';
  assert.deepEqual(loadSettings(storage).flowers, defaultSettings('flowers'));
});

test('blocked storage leaves current-visit settings usable', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSettings(storage, true).flowers, defaultSettings('flowers', true));
  assert.doesNotThrow(() => saveSettings(storage, {}));
});

test('older preferences and invalid background values default to no paper', () => {
  const storage = { getItem: () => JSON.stringify({ flowers: { format: 'png', background: 'false' }, landscapes: { format: 'svg' } }) };
  assert.equal(loadSettings(storage).flowers.background, false);
  assert.equal(loadSettings(storage).landscapes.background, false);
});

test('flower PNG selects the exact foreground or original composition and ignores PDF page settings', async () => {
  const original = new Uint8Array([137,80,78,71,13,10,26,10]);
  const foreground = new Uint8Array([...original, 1]);
  const dataUrl = bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
  const painting = { mode: 'flowers', seed: 'test', png: dataUrl(original), transparentPng: dataUrl(foreground) };
  for (const background of [false, true]) {
    const file = await prepareExport(painting, { format: 'png', orientation: 'landscape', paper: 'a3', background });
    assert.equal(file.name, `flowers-test${background ? '-background' : ''}.png`);
    assert.equal(file.type, 'image/png');
    assert.deepEqual(new Uint8Array(await file.arrayBuffer()), background ? original : foreground);
  }
});
