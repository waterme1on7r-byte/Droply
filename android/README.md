# DROPLY for Android

This is a separate Android app project. It hosts the existing Droply renderer in Android WebView and supplies an Android-only native bridge for encrypted device credentials, signaling, notifications, file selection and Downloads storage. The Windows and macOS Electron build does not include this directory.

The Gradle build copies `index.html`, `settings.js` and `settings.css` from the repository root, then adds the Android-only layout and bridge. Friend requests, transfer approval, and data-channel framing match the desktop app. WebRTC encrypts the peer-to-peer connection automatically, with no manual connection-code step.

## Build

Open this `android/` directory in Android Studio and build the `app` module, or run `gradlew.bat assembleDebug` from this directory. The project uses the installed Android SDK and Java 17 or newer. It supports phones, tablets and Android TV from the same APK; Android TV receives a dedicated remote-first layout.

The first Android release is a separate application (`com.droply.android`) and creates its own device code and encrypted device credential. It does not import or change Windows/macOS profiles.

## Android-specific behavior

- Android file selection uses the system document picker. Folder sending uses the system folder picker and streams file chunks directly rather than loading whole files into memory.
- Received files are saved to `Downloads/Droply` by default. If “Ask where to save” is enabled, Android asks for a destination folder for each accepted transfer.
- Device credentials are protected by Android Keystore. No signaling-server administrator secret is included in the APK.
- The Android TV layout is designed for D-pad navigation and large-screen viewing.

## Release status

The project must be built and exercised on real Android phones and Android TV devices before publishing. Android background execution, system file providers, WebView/WebRTC support, and TV remote focus behavior vary across devices.
