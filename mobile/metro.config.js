const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Keep Expo defaults and add the monorepo workspace root (pnpm / shared packages)
const workspaceRoot = path.resolve(__dirname, '..');
config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

config.resolver.unstable_enablePackageExports = false;

module.exports = config;
