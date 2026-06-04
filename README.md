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

The contributed manifest lives at [android/src/main/AndroidManifest.xml](/C:/Users/flori/Documents/Coding/pojlib-expo/android/src/main/AndroidManifest.xml).

### 4. App-level Quest launcher setup

If your host app is itself a Quest VR launcher, you should mirror the reference app’s launcher configuration as well.

Recommended app manifest additions:

- mark the application as a VR app
- keep the launcher activity landscape
- keep the Oculus/Quest metadata on the app

Reference app manifest:

- [example/android/app/src/main/AndroidManifest.xml](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/AndroidManifest.xml)

Important entries from the reference app:

```xml
<meta-data android:name="pvr.app.type" android:value="vr" />
<meta-data android:name="pvr.display.orientation" android:value="180" />
<meta-data android:name="pvr.sdk.version" android:value="OpenXR" />
<meta-data android:name="com.oculus.vr.focusaware" android:value="true" />
<meta-data android:name="com.oculus.intent.category.VR" android:value="vr_only" />
```

And on the launcher activity:

```xml
android:screenOrientation="sensorLandscape"
```

If your app is not a Quest launcher shell, but only uses the module inside another Android experience, treat those app-level Quest entries as optional and evaluate them for your host app.

### 5. Optional microphone permission flow

The module declares `RECORD_AUDIO`, but gameplay no longer depends on the permission being granted.

Recommended approach:

- request microphone permission in your launcher activity if you want voice chat
- do not block gameplay if it is denied

Reference launcher implementation:

- [example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt](/C:/Users/flori/Documents/Coding/pojlib-expo/example/android/app/src/main/java/xyz/amethystxr/launcher/MainActivity.kt)

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

High-level exports from [src/index.ts](/C:/Users/flori/Documents/Coding/pojlib-expo/src/index.ts):

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

The main types live in [src/PojlibExpo.types.ts](/C:/Users/flori/Documents/Coding/pojlib-expo/src/PojlibExpo.types.ts).

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

- [example/App.tsx](/C:/Users/flori/Documents/Coding/pojlib-expo/example/App.tsx)

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

## Reference Launcher

The AmethystXR launcher is in [example/](/C:/Users/flori/Documents/Coding/pojlib-expo/example).

See [example/README.md](/C:/Users/flori/Documents/Coding/pojlib-expo/example/README.md) for:

- local Android run instructions
- EAS build commands
- Quest-specific app settings
- how the reference UI is structured

## Licensing

- `Pojlib-reference/`: LGPL v3
- the Expo module in this repository: MIT
- `example/`: MIT
