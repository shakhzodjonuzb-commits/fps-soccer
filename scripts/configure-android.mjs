import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const android = path.join(root, 'android');
if (!fs.existsSync(path.join(android, 'app', 'src', 'main'))) {
  throw new Error('Android platform topilmadi. Avval: npx cap add android');
}
const overlay = path.join(root, 'native', 'android');
const activitySource = path.join(overlay, 'app/src/main/java/uz/fpssoccer/game/MainActivity.java');
const activityTarget = path.join(android, 'app/src/main/java/uz/fpssoccer/game/MainActivity.java');
fs.mkdirSync(path.dirname(activityTarget), { recursive: true });
fs.copyFileSync(activitySource, activityTarget);
const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml');
let manifest = fs.readFileSync(manifestPath, 'utf8');
manifest = manifest.replace(/android:screenOrientation="[^"]*"/g, 'android:screenOrientation="landscape"');
if (!manifest.includes('android:screenOrientation="landscape"')) {
  manifest = manifest.replace(/(<activity\b)/, '$1\n            android:screenOrientation="landscape"');
}
fs.writeFileSync(manifestPath, manifest);

const appGradlePath = path.join(android, 'app', 'build.gradle');
if (fs.existsSync(appGradlePath)) {
  let gradle = fs.readFileSync(appGradlePath, 'utf8');
  gradle = gradle.replace(/namespace\s*(?:=\s*)?['"][^'"]+['"]/, 'namespace = \"uz.fpssoccer.game\"');
  gradle = gradle.replace(/applicationId\s+['"][^'"]+['"]/, 'applicationId \"uz.fpssoccer.game\"');
  if (!gradle.includes('FPS_SOCCER_RELEASE_SIGNING')) {
    gradle = gradle.replace(/android\s*\{/, `android {\n    signingConfigs {\n        release {\n            if (System.getenv('KEYSTORE_FILE')) {\n                storeFile file(System.getenv('KEYSTORE_FILE'))\n                storePassword System.getenv('KEYSTORE_PASSWORD')\n                keyAlias System.getenv('KEY_ALIAS')\n                keyPassword System.getenv('KEY_PASSWORD')\n            }\n        }\n    }\n    // FPS_SOCCER_RELEASE_SIGNING`);
    gradle = gradle.replace(/(buildTypes\s*\{\s*release\s*\{)/, `$1\n            if (System.getenv('KEYSTORE_FILE')) {\n                signingConfig signingConfigs.release\n            }`);
    fs.writeFileSync(appGradlePath, gradle);
  }
}
console.log('Android immersive landscape konfiguratsiyasi qo‘llandi.');
