/**
 * Copies impit into dist/node_modules so it ships inside the VSIX.
 *
 * impit cannot be bundled: it is a native module whose binary lives in a
 * per-platform package (impit-win32-x64-msvc, impit-darwin-arm64, ...) that it
 * resolves at runtime. So the bundle keeps a bare `require('impit')`, and
 * something has to put impit where that require can find it. `.vscodeignore`
 * excludes node_modules and `vsce --no-dependencies` excludes it again, but
 * dist/ ships, and Node resolves `require('impit')` from dist/extension.js by
 * walking up into dist/node_modules first. No packaging flags needed.
 *
 * Only the platform packages actually installed are copied, which means the
 * host's platform. Releasing for others means running this on each one and
 * publishing a `vsce package --target <platform>` VSIX per platform.
 */

import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'node_modules');
const TARGET = join(ROOT, 'dist', 'node_modules');

const NATIVE = [{ name: 'impit', binaryPrefix: 'impit-' }];

/**
 * Copies one package into dist/node_modules.
 *
 * @param {string} name Package directory name.
 * @returns {Promise<boolean>} True when the package existed and was copied.
 */
async function copyPackage(name) {
  const from = join(SOURCE, name);
  if (!existsSync(from)) {
    return false;
  }
  const to = join(TARGET, name);
  await rm(to, { recursive: true, force: true });
  await cp(from, to, { recursive: true });
  console.log(`copied ${name}`);
  return true;
}

const installed = await readdir(SOURCE);
await mkdir(TARGET, { recursive: true });

for (const { name, binaryPrefix } of NATIVE) {
  if (!(await copyPackage(name))) {
    throw new Error(`${name} is missing from node_modules — install first`);
  }

  // The platform packages are optional dependencies, so only the ones matching
  // this host are present. Shipping none would leave impit unable to load its
  // binary, which is a broken VSIX rather than a smaller one.
  const binaries = installed.filter((entry) => entry.startsWith(binaryPrefix));
  if (binaries.length === 0) {
    throw new Error(`No ${binaryPrefix}* package found; ${name} cannot load without one`);
  }
  for (const binary of binaries) {
    await copyPackage(binary);
  }
}
