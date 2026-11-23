// Preview-only electron-builder configuration. NEVER use for stable Droply releases.
// Pulls the production source/files but assigns its own app identity and data directory.
const production = require('../package.json').build;

module.exports = {
  ...production,
  appId: 'com.droply.universaltest',
  productName: 'Droply Universal Test',
  // Electron uses packaged productName for app.getName() and userData, so
  // this preview cannot overwrite the installed Droply profile/friends.
  extraMetadata: {
    name: 'droply-universal-test',
    productName: 'Droply Universal Test'
  },
  directories: { output: 'dist-universal-test' },
  mac: {
    ...production.mac,
    target: [{ target: 'dmg', arch: ['universal'] }],
    // The app source is architecture-neutral JS; retain its complete ASAR when combining CPU slices.
    mergeASARs: false,
    artifactName: 'Droply-Universal-Test-${version}-${arch}.${ext}',
    identity: null
  },
  dmg: { ...production.dmg, title: 'Droply Universal Test' },
  // No stable update feed and no auto-published installer.
  publish: []
};
