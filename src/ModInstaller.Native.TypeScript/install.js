#!/usr/bin/env node

'use strict';

try {
  // Try to load the addon — works if a prebuild or previous build exists
  require('node-gyp-build')(__dirname);
} catch (_) {
  // Prebuild missing or not loadable for this platform.
  // Unlike pure-C addons we cannot fall back to node-gyp rebuild here because
  // building from source also requires the .NET 9 SDK (for the Native AOT
  // shared library that the N-API addon links against).
  // Just log a warning — the real error surfaces when user code imports the package.
  console.warn(
    '[@nexusmods/fomod-installer-native] No prebuilt binary found for ' +
    process.platform + '-' + process.arch + '. ' +
    'The package may not work on this platform.'
  );
}
