#!/usr/bin/env node

'use strict';

var path = require('path');
var fs = require('fs');

try {
  // Try to load the addon — works if a prebuild or previous build exists
  require('node-gyp-build')(__dirname);
} catch (_) {
  // Prebuild missing or broken — compile the .node from source.
  // The .dll/.so/.lib ship inside prebuilds/ — copy them next to binding.gyp
  // so node-gyp can link against them.
  var platformDir = path.join(__dirname, 'prebuilds', process.platform + '-' + process.arch);
  if (fs.existsSync(platformDir)) {
    fs.readdirSync(platformDir).forEach(function (file) {
      if (/\.(dll|lib|so)$/i.test(file)) {
        var src = path.join(platformDir, file);
        var dst = path.join(__dirname, file);
        fs.copyFileSync(src, dst);
      }
    });
  }

  var result = require('child_process').spawnSync(
    'node-gyp', ['rebuild', '--jobs', 'max'],
    { stdio: 'inherit', cwd: __dirname, shell: true }
  );
  process.exit(result.status != null ? result.status : 1);
}
