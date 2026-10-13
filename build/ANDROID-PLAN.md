# Wire Android migration — isolated reader build

Status: Android 0.17.54 reader APK preparation. The existing `main` branch and its news-fetch workflow remain the ONLY production news source. No Android APK has been device-accepted.

## Isolation
- Existing repo: `willyros01/balita`, `android` branch only.
- Server: `main` workflow `.github/workflows/feeds.yml` fetches/filters news, writes `articles.json` and `articles/*.json`, then sends web push alerts. GitHub cron can be late; repository_dispatch on `main` is current working trigger.
- The `android` copy of `feeds.yml` is restricted to `main` for both push and its job guard. Do NOT run a second fetcher from Android branch.
- Android reader uses `https://willyros01.github.io/balita/articles.json` and direct `articles/{id}.json`. It does not package stale articles, load publisher RSS directly, or send alerts.
- Native adapter caches a successful complete feed in app-private Filesystem DATA for offline reading; errors do not turn incomplete data into success. It retains existing 50px max font setting/contrast and reader UI.
- Capacitor native WebView does NOT have working Web Push service workers; Android notification toggle remains disabled and says so until native messaging implemented.

## Notifications: explicit gate; NOT implemented by this reader APK
- Device capability detection rather than brand string: Amazon A3L Messaging 1.1.1 should choose ADM on Fire OS and FCM on Google Android where available.
- A3L is a proprietary vendor AAR supplied by Amazon, not obtainable from Maven in current build. Amazon requires Amazon Developer Console security profile, matching APK signature, ADM API key, ADM OAuth client credentials, and Google Firebase Android `google-services.json`.
- Actual APK signing fingerprint must be registered for ADM. Native tokens must be mapped to provider (FCM/ADM) and stored separately from existing web subscriptions, preserving `main` web push.
- Sender currently uses FCM HTTP v1 and targets web tokens; it must branch on provider and add authenticated ADM requests before native push can be enabled.
- Native receive/tap must preserve the exact article ID, 30-minute freshness limit, source heading and Back navigation; verify on both Fire HD 8 and regular Google Android. No server/Firebase changes without proven credentials and a reversible deployment.
- Missing credentials or A3L SDK must fail visibly, NOT pretend notifications work.

## Signing / delivery
- Android signing key must be permanent and separate from other apps. Required GitHub repository secrets: `WIRE_SIGNING_KEYSTORE_BASE64`, `WIRE_SIGNING_PASSWORD`. Signing keys/password NEVER committed.
- Alias `wire`; PKCS12 RSA 3072 certificate SHA256 `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`.
- `android-apk.yml` validates and compiles a non-published APK before the permanently signed build. Missing signing secrets fail closed, never publish a random-key APK.
- Public Cuberoot website publication requires an explicitly implemented, verified exact-artifact publisher. It is NOT configured by this reader build.
- Do not uninstall existing Web Wire or change its settings. Android beta test acceptance: install, large font, source filtering, scroll, article Back, refresh, network loss/offline cached story, orientation, UI resume. Notifications separately FAIL/PENDING until native credentials delivered and real-device tests pass.
