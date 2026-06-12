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

- [App.tsx](App.tsx): launcher UI and JS integration
- [app.json](app.json): Expo config
- [android/app/src/main/AndroidManifest.xml](android/app/src/main/AndroidManifest.xml): Quest launcher manifest setup
- [android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt](android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt): launcher activity

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

## Java runtimes

The launcher now supports Minecraft versions that declare newer Java requirements in Mojang metadata.

Current runtime behavior:

- default runtime folder: `files/runtimes/JRE`
- Java 25 runtime folder: `files/runtimes/JRE-25`
- default Java 25 download asset: `https://github.com/QuestCraftPlusPlus/android-openjdk-build-multiarch/releases/latest/download/JRE25.zip`
- Java 25 can also be supplied with `POJLIB_JRE_25_URL=<runtime zip url>` in `custom_env.txt`

If you need to produce that archive yourself, use the root repo helpers:

```powershell
pwsh ../scripts/prepare-jre25-runtime-build.ps1
```

Then, in the prepared runtime repo after the upstream build/repack steps:

```bash
./10_packjrezip.sh /path/to/repacked/output JRE25.zip
```

If a version requires Java 25 and the launcher cannot find a compatible installed runtime, default `JRE25.zip` release asset, or configured Java 25 override URL, launch fails with a clear runtime-missing error.

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

Important pieces in [android/app/src/main/AndroidManifest.xml](android/app/src/main/AndroidManifest.xml):

- `com.oculus.vr.focusaware=true`
- `com.oculus.intent.category.VR=vr_only`
- `MainActivity` with `android:screenOrientation="sensorLandscape"`

Those app-level entries are specific to the Quest launcher shell. The module itself contributes the dedicated `PojlibVrActivity` and OpenXR-related entries through its own manifest.

The launcher intentionally does not include Pico `pvr.*` application metadata. On Pico, those flags can cause the launcher itself to open directly in immersive VR instead of staying as a flat launcher and only switching during the explicit handoff to `PojlibVrActivity`.

## Microphone Permission

The launcher requests `RECORD_AUDIO` on startup in:

- [android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt](android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt)

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

- [MainActivity.kt](android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt)
- [PojlibVrActivity.java](../android/src/main/java/dev/justfeli/pojlibexpo/PojlibVrActivity.java)

## License

This launcher app is MIT licensed.
