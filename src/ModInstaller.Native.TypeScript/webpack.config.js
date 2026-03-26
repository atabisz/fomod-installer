const webpack = require('vortex-api/bin/webpack').default;

const config = webpack('fomod-installer-native', __dirname, 5);

// resolve-native is kept as a separate runtime file (not bundled) because it
// uses dynamic require() to load platform-specific .node binaries at runtime.
config.externals = config.externals || {};
config.externals['./resolve-native'] = './resolve-native';

module.exports = config;