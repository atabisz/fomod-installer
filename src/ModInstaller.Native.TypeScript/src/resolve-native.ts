import * as path from 'path';
import * as fs from 'fs';

// node-gyp-build searches prebuilds/{platform}-{arch}/ for the correct binary,
// falling back to build/Release/ if a local compilation exists.
// The package root is one level up from dist/ where this file lives at runtime.
const packageRoot = path.resolve(__dirname, '..');

// The .node addon links against ModInstaller.Native (.dll/.so).
// On Linux, dlopen() checks LD_LIBRARY_PATH for each call, so setting it
// before require() / node-gyp-build ensures the companion .so is found
// regardless of the rpath baked into the .node file.
if (process.platform === 'linux') {
  const prebuildDir = path.join(packageRoot, 'prebuilds', `linux-${process.arch}`);
  if (fs.existsSync(prebuildDir)) {
    const current = process.env.LD_LIBRARY_PATH || '';
    process.env.LD_LIBRARY_PATH = current ? `${prebuildDir}:${current}` : prebuildDir;
  }
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const addon: any = require('node-gyp-build')(packageRoot);
