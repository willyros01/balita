#!/usr/bin/env bash
# Wire ADM/FCM A3L dependency install (no GitHub login).
# This script is shared by check and permanent-signer jobs; secrets never logged.
set -euo pipefail
umask 077
if [ -z "${WIRE_ADM_API_KEY:-}" ] || [ -z "${WIRE_GOOGLE_SERVICES_JSON_B64:-}" ]; then
  echo "::error title=Missing ADM/FCM credentials::Both vendor configurations are mandatory for this build."
  exit 1
fi
install -d -m 0700 android/app/libs android/app/src/main/assets
printf '%s' "$WIRE_GOOGLE_SERVICES_JSON_B64" | base64 --decode > android/app/google-services.json
printf '%s' "$WIRE_ADM_API_KEY" > android/app/src/main/assets/api_key.txt
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fLsS --retry 3 --connect-timeout 12 --max-time 120 \
  'https://amzndevresources.com/a3l/sdk/A3LMessaging_SDK_1.1.1.zip' -o "$TMP/sdk.zip"
unzip -tqq "$TMP/sdk.zip"
unzip -q "$TMP/sdk.zip" -d "$TMP/sdk"
AAR="$(find "$TMP/sdk" -type f -name 'A3LMessaging-1.1.1.aar' -print -quit)"
if [ -z "$AAR" ]; then echo "::error title=Missing SDK::A3L 1.1.1 AAR not found"; exit 1; fi
install -m 0600 "$AAR" android/app/libs/A3LMessaging-1.1.1.aar
node build/install-wire-push.mjs
echo "PASS: A3L ADM + FCM device credentials installed without sender secrets."
