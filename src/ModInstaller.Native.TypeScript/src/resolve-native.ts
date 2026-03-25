import * as path from 'path';

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

const platformDir = getPlatformDir();
const nativePath = path.join(__dirname, platformDir, 'modinstaller.node');

// eslint-disable-next-line @typescript-eslint/no-var-requires
export const addon: any = require(nativePath);
