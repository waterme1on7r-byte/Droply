# DROPLY

Share your device code, add a friend, and send files or folders. New devices connect automatically; there is no invitation or administrator approval in normal onboarding.

This repository contains the Electron desktop app, signaling server, tests and GitHub release workflows.

## Desktop app

Run `npm ci`, `npm start`, `npm test` or `npm run dist` from the repository root. Copy config.example.js to config.js and configure the public signaling URL. Never put administrator credentials or database passwords in desktop config.

New macOS builds require macOS 12 (Monterey) or later.

## Signaling server

Run `npm ci` then `npm start` from `server/`. See [server/README.md](server/README.md) for environment settings and migration details. From the root, `npm run server:test` runs the server suite after installing server dependencies.

Render source: waterme1on7r-byte/Droply, branch main, root directory empty, build command `npm --prefix server ci`, start command `npm --prefix server start`. Preserve the existing Render environment variables and service URL when changing its repository.

## Releases

Build workflows create draft releases in this repository. Keep old key-bearing installers private. The updater feed for new builds is this repository's GitHub Releases. Existing 2.8.1 installations point to the old releases repository and need one manual upgrade after migration. macOS automatic installation still requires code signing.
