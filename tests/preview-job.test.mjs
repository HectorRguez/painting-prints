import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPreviewJob } from '../src/preview-job.js';

class FakeWorker {
  static instances = [];
  constructor() { FakeWorker.instances.push(this); }
  postMessage(message) { this.message = message; }
  terminate() { this.terminated = true; }
}
test('switching styles terminates pending preview work and ignores its late result', async () => {
  const job = createPreviewJob(() => new FakeWorker());
  const first = job.run({ mode: 'landscapes' });
  const old = FakeWorker.instances.at(-1);
  const rejected = assert.rejects(first, { name: 'AbortError' });
  const second = job.run({ mode: 'fish' });
  const current = FakeWorker.instances.at(-1);
  await rejected;
  assert.equal(old.terminated, true);
  old.onmessage({ data: { entry: { mode: 'landscapes' } } });
  current.onmessage({ data: { entry: { mode: 'fish' } } });
  assert.equal((await second).entry.mode, 'fish');
  assert.equal(current.terminated, true);
});
test('cancel and worker failures settle waiting callers', async () => {
  const job = createPreviewJob(() => new FakeWorker());
  const pending = job.run({});
  const rejected = assert.rejects(pending, { name: 'AbortError' });
  job.cancel();
  await rejected;
  const failure = job.run({});
  FakeWorker.instances.at(-1).onerror({ message: 'broken source' });
  await assert.rejects(failure, /broken source/);
});
