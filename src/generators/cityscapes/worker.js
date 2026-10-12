import { serve, seedNumber, drawing, line, fitLines } from '../shared/port.js';
serve(async seed => {
  importScripts('wasm_exec.js');
  const go = new self.Go();
  const response = await fetch(new URL('engine.wasm', self.location.href));
  if (!response.ok) throw new Error('Could not load cityscape engine');
  const { instance } = await WebAssembly.instantiate(await response.arrayBuffer(), go.importObject);
  const running = go.run(instance);
  // go.run registers the callback before reaching main's blocking select.
  if (typeof self.renderCityscape !== 'function') throw new Error('Cityscape engine did not initialize');
  const coordinates = JSON.parse(self.renderCityscape(seedNumber(seed)));
  const art = drawing(fitLines(coordinates, 1414, 1000, 65).map(points => ({ d: line(points), width: 0.85 })), { width: 1414, height: 1000 });
  // The host terminates this disposable worker after receiving its result.
  running.catch(error => console.error(error));
  return art;
});
