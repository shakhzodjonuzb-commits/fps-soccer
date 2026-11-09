# Build and verification

## Toolchain

- Node.js 22.12 or newer (CI pins 22.16.0)
- npm
- Java 21
- Android SDK platform/build tools required by the Capacitor Android template
- Android device/emulator for runtime and performance verification

## Web build

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run build
```

The production web bundle is emitted to `dist/`.

## First Android build

The Android project is generated from the Capacitor configuration, then the app-specific native activity and Gradle signing setup are applied.

```bash
npm install
npm run build
npx cap add android
node scripts/configure-android.mjs
npx cap sync android
cd android
./gradlew --no-daemon assembleDebug
```

Debug APK path:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

For subsequent web asset changes:

```bash
npm run build
npx cap sync android
cd android && ./gradlew --no-daemon assembleDebug
```

## Signed release APK

Configure these GitHub Actions secrets:

- `KEYSTORE_BASE64` — base64-encoded PKCS12/JKS keystore
- `KEYSTORE_PASSWORD`
- `KEY_ALIAS`
- `KEY_PASSWORD`

Create and push a version tag such as `v0.1.0`. The workflow attempts `assembleRelease` only when all signing secrets are present. The keystore is written to the ephemeral GitHub runner directory and is not committed to the repository.

For a local release build, set the same environment variables, with `KEYSTORE_FILE` pointing to the keystore file, then run:

```bash
npm run build
npx cap sync android
node scripts/configure-android.mjs
cd android
./gradlew --no-daemon assembleRelease
```

## GitHub Actions

`.github/workflows/android.yml` runs source hygiene checks, TypeScript checking, Vitest, the production web build, generates the Capacitor Android project, builds the debug APK, and uploads it as `fps-soccer-debug-apk`. Tag builds may also upload a signed release APK.

## Verification status for this source package

The source files received syntax parsing and the 14 career-domain assertions were executed directly against transpiled domain modules. The official `npm run typecheck`, `npm test`, `npm run build`, and Gradle APK tasks still need to be run in a network-enabled environment with dependencies and Android SDK installed. Do not interpret the presence of a workflow file as a successful CI run.

A `package-lock.json` is intentionally not fabricated. Generate it using `npm install` with access to the npm registry, verify it, and commit it before claiming fully reproducible npm installs.
