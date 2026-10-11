import { projects, pageModes } from './projects.js';
export const formats = ['pdf', 'png', 'svg'];
export const orientations = ['portrait', 'landscape'];
export const papers = ['a4', 'a3'];
const storageKey = 'painting-export-v1';

export function defaultSettings(mode, mobile = false) {
  return { format: mobile ? 'png' : 'pdf', orientation: projects[mode].orientation, paper: 'a4', background: false };
}

export function loadSettings(storage, mobile = false) {
  let saved;
  try { saved = JSON.parse(storage?.getItem(storageKey)); } catch { /* Use defaults if storage is unavailable or malformed. */ }
  return Object.fromEntries(pageModes.map(mode => {
    const defaults = defaultSettings(mode, mobile);
    const value = saved?.[mode];
    return [mode, {
      format: formats.includes(value?.format) ? value.format : defaults.format,
      orientation: orientations.includes(value?.orientation) ? value.orientation : defaults.orientation,
      paper: papers.includes(value?.paper) ? value.paper : defaults.paper,
      background: typeof value?.background === 'boolean' ? value.background : defaults.background,
    }];
  }));
}

export function saveSettings(storage, settings) {
  try { storage?.setItem(storageKey, JSON.stringify(settings)); } catch { /* Settings still work for this visit. */ }
}
