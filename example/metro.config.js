// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const config = getDefaultConfig(__dirname);
const parentDir = path.resolve(__dirname, '..');
const parentPackageJson = path.join(parentDir, 'package.json');
const hasParentPackage =
  fs.existsSync(parentPackageJson) &&
  (() => {
    try {
      return JSON.parse(fs.readFileSync(parentPackageJson, 'utf8')).name === 'pojlib-expo';
    } catch {
      return false;
    }
  })();

// npm v7+ will install ../node_modules/react and ../node_modules/react-native because of peerDependencies.
// To prevent the incompatible react-native between ./node_modules/react-native and ../node_modules/react-native,
// excludes the one from the parent folder when bundling.
config.resolver.blockList = [
  ...Array.from(config.resolver.blockList ?? []),
  new RegExp(path.resolve('..', 'node_modules', 'react')),
  new RegExp(path.resolve('..', 'node_modules', 'react-native')),
];

config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, './node_modules'),
  path.resolve(__dirname, '../node_modules'),
];

if (hasParentPackage) {
  config.resolver.extraNodeModules = {
    ...(config.resolver.extraNodeModules ?? {}),
    'pojlib-expo': parentDir,
  };
}

if (hasParentPackage) {
  config.watchFolders = [...(config.watchFolders ?? []), parentDir];
}

config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

module.exports = config;
