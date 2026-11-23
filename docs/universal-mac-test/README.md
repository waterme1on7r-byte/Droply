# Droply Universal Mac — ISOLATED TEST CLONE

**Test page:** https://waterme1on7r-byte.github.io/Droply/universal-mac-test/

This folder is intentionally separate from `docs/index.html` (the live website).
The page reproduces **only the Mac download experience** and is visibly labelled
`UNIVERSAL MAC • TEST BUILD`. The normal site, stable installers and download
buttons are not changed by this experiment.

## Repo locations

| Purpose | Path |
| --- | --- |
| Isolated test landing page | `docs/universal-mac-test/index.html` |
| Test page UI styles and download lookup | `docs/universal-mac-test/{style.css,preview.js}` |
| Separate test build config | `.github/universal-mac-test.build.cjs` |
| Universal binary and identity checks | `.github/verify-universal-mac-test.cjs` |
| Test-only build and prerelease | `.github/workflows/universal-mac-test.yml` |
| Website regression checks | `web/test/universal-mac-test.test.mjs` |

## Isolation (production safety)

- Product name: `Droply Universal Test` — separate macOS `.app` and `userData`.
- App ID: `com.droply.universaltest` (stable Droply remains `com.droply.app`).
- Package metadata: `droply-universal-test` (independent local profile and friend code).
- Build output: `dist-universal-test/`, *never* the stable `dist/`.
- Release: a GitHub **pre-release** with tag `universal-mac-test-vX.Y.Z-runN` and
  file `Droply-Universal-Test-X.Y.Z-universal.dmg`. This never replaces
  `releases/latest` or its stable Mac installers.
- The workflow verifies x86_64 and arm64 code slices, preview bundle ID, package
  identity, required startup files, and disk image before publishing.
- The preview site only offers the test DMG once a matching published prerelease exists.
- Do not rename the preview bundle to `Droply.app` or manually replace the stable app.
- The test app still connects to Droply's normal network service, so avoid production
  file transfers when evaluating a preview and expect its own fresh device identity.

## Testing and promotion

1. Wait for `Universal Mac test build` GitHub Action to complete successfully.
2. Open the preview URL and download the **test** DMG on Apple Silicon (M4) and Intel.
3. Check that Finder shows `Droply Universal Test.app`; verify launching and basic transfers.
4. Confirm normal `Droply.app`, its friends, and settings are unaffected.
5. Only after explicit approval, make a *separate* production release change.
   Nothing in this folder automatically promotes the test build to stable.

To generate another preview, manually dispatch the `Universal Mac test build` workflow
on `main`, which produces a uniquely numbered prerelease.
