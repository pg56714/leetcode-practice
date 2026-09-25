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
import { copyFile, mkdir, readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(ROOT, 'node_modules');
const TARGET = join(ROOT, 'dist', 'node_modules');

const NATIVE = [{ name: 'impit', binaryPrefix: 'impit-' }];

/** Every file under a directory, as paths relative to it. */
async function filesUnder(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const children = await filesUnder(join(dir, entry.name));
      found.push(...children.map((child) => join(entry.name, child)));
    } else {
      found.push(entry.name);
    }
  }
  return found;
}

/**
 * Copies one package into dist/node_modules, file by file.
 *
 * Deliberately never deletes the destination first. A running Extension
 * Development Host holds the .node binary mapped into memory, and on Windows a
 * recursive delete removes everything it can before failing on that one file —
 * leaving a package with its binary but no package.json, which cannot be
 * required at all. That shipped in a VSIX once.
 *
 * So an identical file is left alone, a differing one is overwritten, and one
 * that cannot be replaced because it is in use is reported rather than taken
 * for success.
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

  let copied = 0;
  let unchanged = 0;

  for (const file of await filesUnder(from)) {
    const source = join(from, file);
    const destination = join(to, file);
    await mkdir(dirname(destination), { recursive: true });

    if (existsSync(destination)) {
      const [current, existing] = await Promise.all([stat(source), stat(destination)]);
      if (
        current.size === existing.size &&
        (await readFile(source)).equals(await readFile(destination))
      ) {
        unchanged++;
        continue;
      }
    }

    try {
      await copyFile(source, destination);
      copied++;
    } catch (err) {
      const code = /** @type {{ code?: string }} */ (err).code;
      if ((code === 'EPERM' || code === 'EBUSY') && existsSync(destination)) {
        throw new Error(
          `${name}/${file} is in use and differs; close the Extension Development Host and rebuild`,
          { cause: err },
        );
      } else {
        throw err;
      }
    }
  }

  console.log(`${name}: ${copied} copied, ${unchanged} already current`);
  return true;
}

/**
 * Refuses to finish on a package Node could not load.
 *
 * The failure this guards against is silent: everything packages and installs,
 * and the extension then degrades to a transport Cloudflare blocks. Cheaper to
 * catch here than in a bug report.
 *
 * @param {string} name Package directory name.
 */
async function assertRequirable(name) {
  const manifest = join(TARGET, name, 'package.json');
  if (!existsSync(manifest)) {
    throw new Error(
      `${relative(ROOT, manifest)} is missing, so require('${name}') would fail. ` +
        'Delete dist/node_modules and build again.',
    );
  }
}

const installed = await readdir(SOURCE);
await mkdir(TARGET, { recursive: true });

for (const { name, binaryPrefix } of NATIVE) {
  if (!(await copyPackage(name))) {
    throw new Error(`${name} is missing from node_modules — install first`);
  }
  await assertRequirable(name);

  // The platform packages are optional dependencies, so only the ones matching
  // this host are present. Shipping none would leave impit unable to load its
  // binary, which is a broken VSIX rather than a smaller one.
  const binaries = installed.filter((entry) => entry.startsWith(binaryPrefix));
  if (binaries.length === 0) {
    throw new Error(`No ${binaryPrefix}* package found; ${name} cannot load without one`);
  }
  for (const binary of binaries) {
    await copyPackage(binary);
    await assertRequirable(binary);
  }
}
