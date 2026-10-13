#!/usr/bin/env bash
# Wire Android permanent signing: no ephemeral release fallback.
set -euo pipefail
umask 077
test -n "$WIRE_SIGNING_KEYSTORE_BASE64"
test -n "$WIRE_SIGNING_PASSWORD"
APP=android/app
test -s "$APP/build.gradle"
printf '%s' "$WIRE_SIGNING_KEYSTORE_BASE64" | base64 --decode > "$APP/wire-signing.p12"
chmod 600 "$APP/wire-signing.p12"
keytool -list -keystore "$APP/wire-signing.p12" -storetype PKCS12 -storepass "$WIRE_SIGNING_PASSWORD" -alias wire >/dev/null 2>&1 ||
  { echo "::error title=Invalid Wire signing secrets::Keystore/password/alias invalid"; exit 1; }
ACTUAL="$(keytool -list -v -keystore "$APP/wire-signing.p12" -storetype PKCS12 -storepass "$WIRE_SIGNING_PASSWORD" -alias wire | sed -n 's/^[[:space:]]*SHA256: *//p' | head -1 | tr -d ':' | tr 'A-F' 'a-f')"
EXPECTED=662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866
[ "$ACTUAL" = "$EXPECTED" ] || { echo "::error title=Wire signing identity changed::Refusing another certificate"; exit 1; }
cat > "$APP/wire-sign.gradle" <<'GRADLE'
android {
    signingConfigs {
        wirePersistent {
            storeFile file("wire-signing.p12")
            storePassword System.getenv("WIRE_SIGNING_PASSWORD")
            keyAlias "wire"
            keyPassword System.getenv("WIRE_SIGNING_PASSWORD")
            storeType "PKCS12"
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.wirePersistent
        }
    }
}
GRADLE
if ! grep -Fq 'apply from: "wire-sign.gradle"' "$APP/build.gradle"; then
  printf '\napply from: "wire-sign.gradle"\n' >> "$APP/build.gradle"
fi
echo "PASS: permanent Wire signing identity verified"
