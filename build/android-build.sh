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

# Optional full native A3L provider integration. One signed APK supports ADM
# on Amazon Fire and FCM on Google Android only when BOTH provider configs exist.
# Never substitute dummy Android credentials; never enable a partial SDK.
if [ "${WIRE_ENABLE_NATIVE_PUSH:-0}" = "1" ]; then
  if [ -z "$WIRE_GOOGLE_SERVICES_JSON_B64" ] || [ -z "$WIRE_ADM_API_KEY" ]; then
    echo "::error title=Incomplete native push configuration::Both Google Android JSON and Amazon ADM API key are required."
    exit 1
  fi
  install -d -m 0700 android/app/libs android/app/src/main/assets
  printf '%s' "$WIRE_GOOGLE_SERVICES_JSON_B64" | base64 --decode > android/app/google-services.json
  printf '%s' "$WIRE_ADM_API_KEY" > android/app/src/main/assets/api_key.txt
  TMP_A3L="$(mktemp -d)"
  trap 'rm -rf "$TMP_A3L"; rm -f android/app/google-services.json android/app/src/main/assets/api_key.txt android/app/wire-signing.p12 android/app/wire-sign.gradle' EXIT
  curl --fail --location --silent --show-error --retry 3 \
    https://amzndevresources.com/a3l/sdk/A3LMessaging_SDK_1.1.1.zip \
    --output "$TMP_A3L/a3l.zip"
  unzip -tqq "$TMP_A3L/a3l.zip"
  unzip -q "$TMP_A3L/a3l.zip" -d "$TMP_A3L/extract"
  AAR="$(find "$TMP_A3L/extract" -type f -name 'A3LMessaging-1.1.1.aar' | head -1)"
  test -n "$AAR"
  install -m 0600 "$AAR" android/app/libs/A3LMessaging-1.1.1.aar
  node build/install-wire-push.mjs
  echo "A3L native provider adapter enabled (still requires on-device acceptance testing)."
else
  echo "::notice title=Foreground-alert beta::A3L system push disabled; on-screen alerts run while Wire is open."
fi
java build/AndroidIcons.java icon-512.png android/app/src/main/res
node <<'JS'
const fs=require('fs');
const p='android/app/build.gradle';
const content=fs.readFileSync(p,'utf8');
const code=100000+Number(process.env.GITHUB_RUN_NUMBER||1);
if(!Number.isSafeInteger(code)||code<=0||code>2100000000)throw Error('invalid Android versionCode');
if(!/^\s*versionCode\s+\d+/m.test(content)||!/^\s*versionName\s+["'][^"']+["']/m.test(content))throw Error('Android Gradle version fields changed');
fs.writeFileSync(p,content.replace(/^(\s*versionCode\s+)\d+/m,'$1'+code).replace(/^(\s*versionName\s+)["'][^"']+["']/m,'$1"0.17.55"'));
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
