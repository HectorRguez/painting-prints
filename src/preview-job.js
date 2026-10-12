// A style switch can terminate parsing/compression as well as generation.
export function createPreviewJob(makeWorker = () => new Worker(new URL('./preview-worker.js', import.meta.url), { type: 'module' })) {
  let active;
  return {
    cancel() {
      if (!active) return;
      active.worker.terminate();
      active.reject(new DOMException('Painting changed', 'AbortError'));
      active = undefined;
    },
    run(entry, assetUrl, settings) {
      this.cancel();
      return new Promise((resolve, reject) => {
        const worker = makeWorker();
        active = { worker, reject };
        const finish = (error, value) => {
          worker.terminate();
          if (active?.worker === worker) active = undefined;
          error ? reject(error) : resolve(value);
        };
        worker.onmessage = ({ data }) => finish(data.error ? new Error(data.error) : null, data);
        worker.onerror = event => finish(new Error(event.message || 'Could not prepare painting'));
        worker.postMessage({ entry, assetUrl, settings });
      });
    },
  };
}
