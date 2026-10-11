import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canShareFile, deliverFile, isMobileDevice } from '../src/share.js';

const file = new File(['image data'], 'painting.png', { type: 'image/png' });

test('mobile sharing sends the prepared file during the original tap, with no URL share', async () => {
  let activation = true;
  let called = false;
  const navigator = {
    canShare: data => data.files[0] === file,
    share(data) {
      assert.equal(activation, true);
      assert.deepEqual(data, { files: [file] });
      assert.equal(this, navigator);
      called = true;
      return Promise.resolve();
    },
  };
  const result = deliverFile(file, { mobile: true, navigator, download() { assert.fail('Unexpected download'); } });
  activation = false;
  assert.equal(called, true);
  assert.equal(await result, 'shared');
});

test('canceling the native sheet does not save a file', async () => {
  const navigator = { canShare: () => true, share: () => Promise.reject(new DOMException('Canceled', 'AbortError')) };
  assert.equal(await deliverFile(file, { mobile: true, navigator, download() { assert.fail('Canceled share downloaded'); } }), 'cancelled');
});

test('unsupported file sharing and desktop both download the chosen file', async () => {
  for (const mobile of [false, true]) {
    let downloaded;
    const navigator = { canShare: () => false, share() { assert.fail('Unsupported share attempted'); } };
    assert.equal(await deliverFile(file, { mobile, navigator, download: value => { downloaded = value; } }), 'downloaded');
    assert.equal(downloaded, file);
  }
  const navigator = { canShare: () => true, share() { assert.fail('Desktop should download'); } };
  assert.equal(await deliverFile(file, { mobile: false, navigator, download() {} }), 'downloaded');
});

test('a native sharing failure falls back to the same file and reports it', async () => {
  let downloaded;
  const navigator = { canShare: () => true, share: () => Promise.reject(new DOMException('Blocked', 'NotAllowedError')) };
  assert.equal(await deliverFile(file, { mobile: true, navigator, download: value => { downloaded = value; } }), 'downloaded-after-share-failed');
  assert.equal(downloaded, file);
});

test('capability checks tolerate missing APIs and validate files rather than links', () => {
  assert.equal(canShareFile(file, {}), false);
  assert.equal(canShareFile(file, { share() {}, canShare() { throw new Error('blocked'); } }), false);
  assert.equal(isMobileDevice({ userAgent: 'iPhone' }, false), true);
  assert.equal(isMobileDevice({ userAgent: 'Macintosh' }, true), true);
  assert.equal(isMobileDevice({ userAgent: 'Desktop' }, false), false);
});
