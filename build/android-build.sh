#!/usr/bin/env bash
# Wire Android: exact published news source and fail-closed permanent signing.
set -euo pipefail
umask 077
npm install --no-audit --no-fund
node build/prepare-android.mjs
node build/test-android.mjs
npx cap add android
npx cap sync android
test -s icon-512.png
java build/AndroidIcons.java icon-512.png android/app/src/main/res
node <<'JS'
const fs=require('fs');
const p='android/app/build.gradle';
const content=fs.readFileSync(p,'utf8');
const code=100000+Number(process.env.GITHUB_RUN_NUMBER||1);
if(!Number.isSafeInteger(code)||code<=0||code>2100000000)throw Error('invalid Android versionCode');
if(!/^\s*versionCode\s+\d+/m.test(content)||!/^\s*versionName\s+["'][^"']+["']/m.test(content))throw Error('Android Gradle version fields changed');
fs.writeFileSync(p,content.replace(/^(\s*versionCode\s+)\d+/m,'$1'+code).replace(/^(\s*versionName\s+)["'][^"']+["']/m,'$1"0.17.54"'));
JS
bash build/android-sign.sh
trap 'rm -f android/app/wire-signing.p12 android/app/wire-sign.gradle' EXIT
cd android
chmod +x ./gradlew
./gradlew --no-daemon assembleDebug
APK=app/build/outputs/apk/debug/app-debug.apk
test -s "$APK"
SDK="$ANDROID_HOME"
test -n "$SDK"
SIGNER="$(find "$SDK/build-tools" -name apksigner -type f | sort -V | tail -1)"
test -n "$SIGNER"
"$SIGNER" verify --verbose --print-certs "$APK"
ACTUAL="$("$SIGNER" verify --print-certs "$APK" | sed -n 's/^.*certificate SHA-256 digest: *//p' | head -1 | tr 'A-F' 'a-f')"
EXPECTED=662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866
[ "$ACTUAL" = "$EXPECTED" ] || { echo "::error title=Unexpected APK signature::Failing closed"; exit 1; }
echo "Verified Wire APK signer SHA256: $ACTUAL"
sha256sum "$APK"
