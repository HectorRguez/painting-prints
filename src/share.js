export function isMobileDevice(navigator, coarsePointer) {
  return coarsePointer || navigator?.userAgentData?.mobile === true
    || /Android|iPhone|iPad|iPod/i.test(navigator?.userAgent || '');
}

export function canShareFile(file, navigator) {
  if (!file || typeof navigator?.share !== 'function' || typeof navigator?.canShare !== 'function') return false;
  try { return navigator.canShare({ files: [file] }); } catch { return false; }
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = file.name;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Give Safari time to start consuming the download before revoking the URL.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function deliverFile(file, { mobile, navigator, download = downloadFile }) {
  if (mobile && canShareFile(file, navigator)) {
    try {
      // The file is already prepared. Invoke sharing before the first await,
      // preserving the transient activation from the user's button tap.
      await navigator.share({ files: [file] });
      return 'shared';
    } catch (error) {
      if (error.name === 'AbortError') return 'cancelled';
      download(file);
      return 'downloaded-after-share-failed';
    }
  }
  download(file);
  return 'downloaded';
}
