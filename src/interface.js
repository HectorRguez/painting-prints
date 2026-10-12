import { drawablyButton, drawablyCard, drawablyCheckbox, drawablySelect, drawablyUnderline, drawablyDivider } from 'drawably';
import { buttonIcon } from './button-icons.js';
import { createRegenerationMark } from './regeneration-mark.js';
import 'drawably/style.css';
import 'drawably/font.css';

// Keep Drawably's original stroke, roughness, motion and interaction defaults.
const pen = { stroke: '#000', fill: '#000', paper: '#f5f2eb' };

export function createInterface() {
  const regenerationMark = createRegenerationMark(document.querySelector('#canvas-viewport'), document.querySelector('#artwork'));
  const buttons = new Map([...document.querySelectorAll('.painting-app button')].map(button => [
    button.id, drawablyButton(button, { ...pen, variant: button.dataset.variant || 'outline' }),
  ]));
  buttonIcon(document.querySelector('#regenerate'), 'regenerate')();
  buttonIcon(document.querySelector('#settings'), 'settings')();
  const exportIcon = buttonIcon(document.querySelector('#download'), 'download');
  exportIcon();
  buttonIcon(document.querySelector('.spinner-sketch'), 'regenerate')();
  for (const divider of document.querySelectorAll('.section-divider')) drawablyDivider(divider, pen);
  drawablyUnderline(document.querySelector('#painting-author'), pen);
  const dialog = document.querySelector('#settings-dialog');
  drawablyCard(dialog, pen);
  for (const field of dialog.querySelectorAll('select')) {
    const wrapper = document.createElement('span');
    wrapper.className = 'select-sketch';
    field.before(wrapper);
    wrapper.append(field);
    drawablySelect(wrapper, pen);
  }
  const checkbox = document.querySelector('#add-background');
  const box = document.createElement('span');
  checkbox.before(box);
  box.append(checkbox);
  drawablyCheckbox(box, pen);

  let messageUnderline;
  let underline;
  let current;
  return {
    setMessage(message) {
      const status = document.querySelector('#status');
      messageUnderline?.destroy();
      messageUnderline = undefined;
      const retry = message.includes('Regenerate');
      document.querySelector('.gallery').dataset.failed = String(retry);
      status.replaceChildren();
      if (retry) {
        const [before, after] = message.split('Regenerate');
        const link = document.createElement('a');
        link.id = 'retry-painting';
        link.href = '#regenerate';
        link.textContent = 'Regenerate';
        status.append(before, link, after);
        messageUnderline = drawablyUnderline(link, pen);
      } else status.textContent = message;
    },
    setExporting(loading) { buttons.get('download').setState(loading ? 'loading' : 'idle'); },
    setLoading(loading) {
      buttons.get('regenerate').setState(loading ? 'loading' : 'idle');
      regenerationMark.setLoading(loading);
    },
    selectPage(link) {
      if (current === link) return;
      underline?.destroy();
      current = link;
      const label = link.querySelector('.tab-label');
      underline = drawablyUnderline(label, pen);
    },
    syncSettings() {
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    },
  };
}
