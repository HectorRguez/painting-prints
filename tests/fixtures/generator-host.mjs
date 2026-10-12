// Run the shipping classic worker in an isolated Node worker for integration
// tests. Canvas is tested in the browser; generation has no DOM dependency.
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
const url = new URL(`../../public/generators/${workerData.mode}/worker.js`, import.meta.url);
const context = vm.createContext({
  URL, TextEncoder, TextDecoder, performance, crypto: webcrypto, console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  location: { href: url.href },
  fetch: async location => new Response(readFileSync(new URL(location))),
  postMessage: value => parentPort.postMessage(value),
});
context.self = context;
context.importScripts = (...paths) => paths.forEach(path => vm.runInContext(readFileSync(new URL(path, url), 'utf8'), context));
vm.runInContext(readFileSync(url, 'utf8'), context);
context.onmessage({ data: { seed: workerData.seed } });
