// One worker-local buffer. Jobs terminate their worker when finished/cancelled.
export function kernelMemory(api) {
  const base = 65536;
  function ensure(bytes) {
    const shortage = base + bytes - api.memory.buffer.byteLength;
    if (shortage > 0) api.memory.grow(Math.ceil(shortage / 65536));
  }
  return { base, ensure };
}
