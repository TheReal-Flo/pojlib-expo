# AmethystXR Launcher

This directory contains the reference Quest launcher app for `pojlib-expo`.

It shows how to:

- initialize Pojlib from React Native
- sign into Microsoft / Minecraft accounts
- create Fabric or NeoForge instances
- manage instance logos
- inspect and upload logs
- browse Modrinth inside the app
- prelaunch and hand off into the dedicated VR activity

## What This App Is

`example/` is not a generic Expo sample anymore. It is the AmethystXR launcher app used to exercise the module in a real Quest-oriented setup.

Core files:

- [App.tsx](/C:/Users/flori/Documents/Coding/pojlib-expo/example/App.tsx): launcher UI and JS integration
- [app.json](/C:/Users/flori/Documents/Coding/pojlib-expo/example/app.json): Expo config
- [android/app/src/main/AndroidManifest.xml](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/AndroidManifest.xml): Quest launcher manifest setup
- [android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt): launcher activity

## Requirements

- Node/npm installed
- Android SDK / Android Studio
- Quest-capable Android environment
- `arm64-v8a` target

Important Android settings already configured here:

- package id: `xyz.amethystxr.launcher`
- app name: `AmethystXR`
- `minSdkVersion 29`
- `newArchEnabled=true`
- `hermesEnabled=true`
- launcher orientation: landscape
- Quest VR app metadata in the manifest

## Install Dependencies

From this directory:

```bash
npm install
```

The app consumes the local packaged module tarball:

```json
"pojlib-expo": "file:vendor/pojlib-expo-0.1.3.tgz"
```

So if you rebuild the module package in the repo root, refresh the vendored tarball before rebuilding this app.

## Run Locally

From `example/`:

```bash
npx expo run:android
```

If you only want Metro/dev UI:

```bash
npm start
```

## EAS Builds

Stable APK profile:

```bash
eas build --platform android --profile apk
```

Experimental optimized profile:

```bash
eas build --platform android --profile apk-optimized
```

The optimized profile re-enables shrinking/minification and is expected to be more fragile.

## Quest / Manifest Setup

This launcher adds app-level Quest metadata on top of the library manifest merge.

Important pieces in [android/app/src/main/AndroidManifest.xml](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/AndroidManifest.xml):

- `pvr.app.type=vr`
- `pvr.display.orientation=180`
- `pvr.sdk.version=OpenXR`
- `com.oculus.vr.focusaware=true`
- `com.oculus.intent.category.VR=vr_only`
- `MainActivity` with `android:screenOrientation="sensorLandscape"`

Those app-level entries are specific to the launcher shell. The module itself contributes the dedicated `PojlibVrActivity` and OpenXR-related entries through its own manifest.

## Microphone Permission

The launcher requests `RECORD_AUDIO` on startup in:

- [android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt)

This is only to avoid stalling the VR handoff later. Gameplay itself is not blocked if the permission is denied.

## UI Structure

Main sections in the launcher:

- Home
- Installations
- Skins
- Changelog
- Download Content
- Settings

Notable behaviors:

- instance cards use loader logos or per-instance custom logos
- account selectors use Minecraft head images when available
- Modrinth runs inside a WebView with an install confirmation modal
- the downloader path is prepared to carry page-derived image URLs for future modpack icons

## Troubleshooting

### Android build issues

Check:

- `minSdkVersion` is still `29`
- the app still builds `arm64-v8a`
- the vendored `pojlib-expo` tarball is current

### Pojlib bridge unavailable

This app assumes Android. iOS/web do not provide a working runtime implementation.

### Voice chat prompt timing

If microphone permission timing regresses, check:

- [MainActivity.kt](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt)
- [PojlibVrActivity.java](/C:/Users/flori/Documents/Coding/pojlib-expo/android/src/main/java/dev/justfeli/pojlibexpo/PojlibVrActivity.java)

## License

This launcher app is MIT licensed.
