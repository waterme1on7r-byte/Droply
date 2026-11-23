// Production Universal Mac DMG only: preserves the established Droply identity and files.
// The existing Intel/ARM installers and in-app update metadata remain unchanged.
const production = require('../package.json').build;
module.exports = {
  ...production,
  appId: production.appId,
  productName: production.productName,
  directories: { output: 'dist-universal-release' },
  mac: {
    ...production.mac,
    target: [{ target: 'dmg', arch: ['universal'] }],
    // Required for this Electron build: merging ASARs produced an empty archive.
    // JavaScript source is shared between the architectures.
    mergeASARs: false,
    artifactName: 'Droply-${version}-universal.${ext}'
  },
  dmg: { ...production.dmg, title: 'Droply' },
  publish: []
};
