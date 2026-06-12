# pojlib-expo

`pojlib-expo` is an Expo module that exposes the Android `Pojlib` runtime to React Native.

It is intended for Quest-style launcher apps that need to:

- sign into Minecraft accounts
- create and manage Pojlib instances
- install extra mods or Modrinth versions
- prelaunch and hand off into the dedicated VR runtime activity
- read live and archived logs from JavaScript

## Platform Support

Current support:

- Android: supported
- iOS: stub only, no Pojlib runtime
- Web: stub only, no Pojlib runtime

Android builds now bundle SDL3 from the official SDL Android archive so mods that rely on `libsdl4j`, such as Controlify, can load `libSDL3.so` at runtime.

If you call most runtime APIs on iOS or web, they will throw.

## Repository Layout

- `src/`, `android/`, `ios/`: the Expo module
- `Pojlib-reference/`: the bundled Pojlib fork/runtime sources
- `example/`: the AmethystXR reference launcher app

## Installation

### 1. Add the package

```bash
npm install pojlib-expo
```

There is currently no dedicated config plugin for this package.

If you are using Expo managed workflow, install it first and then prebuild:

```bash
npx expo prebuild
```

For bare React Native projects, make sure Expo modules are already configured in the app before adding this package.

### 2. Android requirements

This module is Android-only in practice. The important baseline requirements are:

- `minSdkVersion` must be at least `29`
- the app must build for `arm64-v8a`
- the app must run with the native Android project present (`expo prebuild` / bare app)

### Java runtime requirements

Pojlib now reads Mojang's `javaVersion.majorVersion` metadata and selects a matching Android runtime per Minecraft version.

Current behavior:

- Java 22 remains the default bundled runtime target
- versions that require Java 25 will look for `runtimes/JRE-25`
- if `runtimes/JRE` already contains a newer compatible runtime, it can still be reused

Java 25 now has a default release asset target too:

- default Java 25 download URL: `https://github.com/QuestCraftPlusPlus/android-openjdk-build-multiarch/releases/latest/download/JRE25.zip`

You can provide or override Java 25 in one of these ways:

- manually install a Java 25 runtime into `files/runtimes/JRE-25`
- or add `POJLIB_JRE_25_URL=<runtime zip url>` to `custom_env.txt`

If the default `JRE25.zip` release asset is missing and no override is configured, launch will fail with an explicit runtime error instead of silently trying to boot with Java 22.

### Building a Java 25 runtime

This repo now includes helper scripts for the QuestCraft `buildjre24` runtime repo:

- [`scripts/prepare-jre25-runtime-build.ps1`](scripts/prepare-jre25-runtime-build.ps1): clones/prepares a `buildjre25` branch from `buildjre24`
- [`scripts/pack-jre25-runtime.sh`](scripts/pack-jre25-runtime.sh): merges the repacked arm64 output into the `JRE25.zip` archive that Pojlib installs

Typical flow:

```powershell
pwsh ./scripts/prepare-jre25-runtime-build.ps1
```

That prepares a checkout under `runtime-build/android-openjdk-build-multiarch/` with:

- workflow matrix changed to Java 25
- `5_clonejdk.sh` switched to `graalvm/labs-openjdk` branch `jdk25`
- `6_buildjdk.sh` using `JAVA_HOME` as the boot JDK
- `patches/jre_24` copied to `patches/jre_25`
- `10_packjrezip.sh` added

After the upstream build finishes and `9_repackjre.sh` has produced `universal.tar.xz` and `bin-arm64.tar.xz`, run:

```bash
./10_packjrezip.sh /path/to/repacked/output JRE25.zip
```

Upload that archive to a GitHub release as asset name `JRE25.zip`. Pojlib will then be able to fetch it from the default Java 25 URL above.

The reference launcher uses `expo-build-properties` like this:

```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "android": {
            "minSdkVersion": 29
          }
        }
      ]
    ]
  }
}
```

### 3. Android manifest setup

The module already contributes its own manifest entries through manifest merge. That means you do not need to manually add the bundled VR activity or the OpenXR permission to your app manifest in the normal case.

The module manifest contributes:

- `org.khronos.openxr.permission.OPENXR_SYSTEM`
- `android.permission.RECORD_AUDIO`
- required OpenGL ES / VR head tracking features
- OpenXR runtime broker queries
- `dev.justfeli.pojlibexpo.PojlibVrActivity`
- Oculus focus-aware metadata
- supported Quest device metadata

The contributed manifest lives at [android/src/main/AndroidManifest.xml](android/src/main/AndroidManifest.xml).

### 4. App-level Quest launcher setup

If your host app is itself a Quest VR launcher, you should mirror the reference app’s launcher configuration as well.

Recommended app manifest additions:

- keep the launcher activity landscape
- keep the Oculus/Quest metadata on the app if you are targeting the Quest launcher shell

Reference app manifest:

- [example/android/app/src/main/AndroidManifest.xml](example/android/app/src/main/AndroidManifest.xml)

Important entries from the reference app:

```xml
<meta-data android:name="com.oculus.vr.focusaware" android:value="true" />
<meta-data android:name="com.oculus.intent.category.VR" android:value="vr_only" />
```

And on the launcher activity:

```xml
android:screenOrientation="sensorLandscape"
```

If your app is not a Quest launcher shell, but only uses the module inside another Android experience, treat those app-level Quest entries as optional and evaluate them for your host app.

Do not mark the launcher application itself as a Pico immersive app unless you explicitly want the launcher to open in VR immediately on Pico devices. The reference app intentionally avoids the Pico `pvr.*` application metadata so the flat launcher stays flat until the explicit VR handoff.

### 5. Optional microphone permission flow

The module declares `RECORD_AUDIO`, but gameplay no longer depends on the permission being granted.

Recommended approach:

- request microphone permission in your launcher activity if you want voice chat
- do not block gameplay if it is denied

Reference launcher implementation:

- [example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt](example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt)

## Quick Start

Typical Android flow:

1. initialize the bridge
2. check status
3. log in
4. create or load an instance
5. prelaunch the instance
6. launch into the VR activity

Example:

```ts
import {
  initializePojlib,
  getPojlibStatus,
  getPojlibSupportedVersions,
  installDefaultPojlibInstance,
  loginToPojlib,
  prelaunchPojlibInstance,
  launchPojlibInstance,
} from 'pojlib-expo';

await initializePojlib();

const status = await getPojlibStatus();
const versions = await getPojlibSupportedVersions();

await loginToPojlib();

const instance = await installDefaultPojlibInstance({
  minecraftVersion: versions[0],
  instanceName: 'My Instance',
  modLoader: 'Fabric',
});

const refreshed = await getPojlibStatus();
const accountUuid = refreshed.currentAccount?.uuid;
if (!accountUuid) {
  throw new Error('Login did not produce a current account.');
}

await prelaunchPojlibInstance(instance.instanceName);
await launchPojlibInstance(instance.instanceName, accountUuid);
```

## Public API

High-level exports from [src/index.ts](src/index.ts):

### Status and setup

- `isPojlibBridgeAvailable()`
- `getPojlibGitBranch()`
- `initializePojlib()`
- `configurePojlib(config)`
- `getPojlibStatus()`
- `getPojlibSupportedVersions()`
- `hasPojlibConnection()`

### Accounts

- `listPojlibAccounts()`
- `loginToPojlib(accountUUID?)`
- `removePojlibAccount(uuid)`

### Instances

- `loadPojlibInstances()`
- `getPojlibInstance(instanceName)`
- `createPojlibInstance(options)`
- `installDefaultPojlibInstance(options)`
- `createPojlibInstanceFromMrpack(options)`
- `deletePojlibInstance(instanceName)`

### Projects / mods

- `addPojlibExtraProject(options)`
- `addPojlibModrinthVersion(options)`
- `hasPojlibExtraProject(instanceName, name)`
- `removePojlibExtraProject(instanceName, name)`

### Launch

- `prelaunchPojlibInstance(instanceName)`
- `launchPojlibInstance(instanceName, accountUUID?)`

### Diagnostics

- `getPojlibDownloadStatus()`
- `readPojlibLatestLog()`
- `readPojlibPreviousLog()`

The main types live in [src/PojlibExpo.types.ts](src/PojlibExpo.types.ts).

## Notes About Instances and Images

Each instance can carry `instanceImageURL`.

Supported values:

- remote URL
- absolute local file path

That is what the reference launcher uses for per-instance logos.

## Logs and Events

The native module emits `onLog` events through Expo events.

In React, the reference launcher subscribes with `useEvent`:

```ts
import { useEvent } from 'expo';
import PojlibExpo from 'pojlib-expo';

const logEvent = useEvent(PojlibExpo, 'onLog');
```

Reference implementation:

- [example/App.tsx](example/App.tsx)

## Building the Module Locally

From the repository root:

```bash
npm install
npm run build
```

If you update the bundled Pojlib AAR, the helper script is:

```bash
npm run sync:pojlib-aar
```

The Android module also expects the SDL Android archive at `android/libs/SDL3-3.2.16.aar`. This repository vendors that file because Controlify depends on SDL3 natives being present inside the APK.

## Reference Launcher

The AmethystXR launcher is in [example/](example/).

See [example/README.md](example/README.md) for:

- local Android run instructions
- EAS build commands
- Quest-specific app settings
- how the reference UI is structured

## Licensing

- `Pojlib-reference/`: LGPL v3
- the Expo module in this repository: MIT
- `example/`: MIT
