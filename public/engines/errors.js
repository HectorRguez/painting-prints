window.addEventListener('error', () => {
  parent.postMessage({ type: 'painting-error' }, location.origin);
});
