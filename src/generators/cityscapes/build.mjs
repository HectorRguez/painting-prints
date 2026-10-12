import { cp, copyFile, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
export async function prepare(output) {
  const source = new URL('./', import.meta.url);
  const go = process.env.PAINTING_GO || 'go';
  const temp = new URL('go-build/', output);
  await mkdir(temp, { recursive: true });
  try {
    await cp(new URL('upstream/ln/', source), new URL('ln/', temp), { recursive: true });
    // Browser canvas replaces the optional desktop PNG writer. Excluding it
    // removes gg and its font/image dependencies without changing visibility.
    const pathFile = new URL('ln/path.go', temp);
    const path = await readFile(pathFile, 'utf8');
    await writeFile(pathFile, path.replace('\n\t"github.com/fogleman/gg"', '')
      .replace(/func \(p Paths\) WriteToPNG[\s\S]*?\n}\n/, ''));
    await copyFile(new URL('main.go', source), new URL('main.go', temp));
    await writeFile(new URL('go.mod', temp), 'module painting\n\ngo 1.24\n');
    execFileSync(go, ['build', '-trimpath', '-ldflags=-s -w', '-o', fileURLToPath(new URL('engine.wasm', output)), '.'], {
      cwd: fileURLToPath(temp), env: { ...process.env, GOOS: 'js', GOARCH: 'wasm', CGO_ENABLED: '0' }, stdio: 'inherit',
    });
    const goroot = execFileSync(go, ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
    await copyFile(`${goroot}/lib/wasm/wasm_exec.js`, new URL('wasm_exec.js', output));
    await copyFile(new URL('upstream/LICENSE.md', source), new URL('LICENSE.md', output));
    await build({ entryPoints: [fileURLToPath(new URL('worker.js', source))], bundle: true,
      format: 'iife', minify: true, outfile: fileURLToPath(new URL('worker.js', output)) });
  } finally { await rm(temp, { recursive: true, force: true }); }
}
