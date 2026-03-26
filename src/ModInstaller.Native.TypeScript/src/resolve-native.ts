import * as path from 'path';
import * as fs from 'fs';

const SUPPORTED_PLATFORMS: Record<string, string> = {
  'win32-x64': 'win32-x64',
  'linux-x64': 'linux-x64',
};

function getPlatformDir(): string {
  const key = `${process.platform}-${process.arch}`;
  const dir = SUPPORTED_PLATFORMS[key];
  if (!dir) {
    throw new Error(
      `Unsupported platform: ${key}. ` +
      `Supported platforms: ${Object.keys(SUPPORTED_PLATFORMS).join(', ')}`
    );
  }
  return dir;
}

function findNativeBinary(): string {
  const platformDir = getPlatformDir();
  const binaryName = 'modinstaller.node';

  // Search upward from __dirname to find the platform directory.
  // When webpack-bundled: __dirname is dist/, binary is at dist/<platform>/
  // When tsc-compiled for tests: __dirname is dist/src/, binary is at dist/<platform>/
  // When running via vitest (TS directly): __dirname is src/, binary is at dist/<platform>/
  const searchRoots = [__dirname];

  // Also check dist/ relative to package root (for vitest which runs from src/)
  const distDir = path.resolve(__dirname, '..', 'dist');
  if (!searchRoots.includes(distDir)) {
    searchRoots.push(distDir);
  }

  for (const root of searchRoots) {
    let searchDir = root;
    for (let i = 0; i < 4; i++) {
      const candidate = path.join(searchDir, platformDir, binaryName);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
      const parent = path.dirname(searchDir);
      if (parent === searchDir) break;
      searchDir = parent;
    }
  }

  throw new Error(
    `Native binary not found for ${platformDir}. ` +
    `Searched upward from ${__dirname}`
  );
}

const nativePath = findNativeBinary();

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const addon: any = require(nativePath);
