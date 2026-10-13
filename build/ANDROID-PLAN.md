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

## Initial Android build result — 2026-10-12
- Source commit `c716430298967b7a545d69f41acd8cdd63aa8056`.
- GitHub Actions workflow run **38335679403**.
- **PASS:** package generation, Android reader compatibility tests (live main feed address, article identity, offline data validation, Android branch fetch guard) and native Gradle Java compilation.
- **BLOCKED by design:** signing job refused to continue because new private Actions secrets `WIRE_SIGNING_KEYSTORE_BASE64` and `WIRE_SIGNING_PASSWORD` have not yet been configured. **No permanently signed APK artifact exists yet.**
- Generated key is PKCS12 alias `wire`, RSA 3072, SHA256 `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`; delivered outside GitHub as private backup + value files.
- After owner enters both secrets, retry only the failed signing job, verify signer and artifact, then separately decide whether to release a reader-only APK or wait for full native notifications.
- **Native FCM/ADM implementation remains gated:** Amazon A3L SDK AAR and ADM developer security profile/API key/OAuth client credentials and Android Firebase `google-services.json` are required, and must be integrated/verified. **No live native notifications are claimed**, and existing `main` push sender is unchanged.

## Signed reader beta and Cuberoot publication — verified 2026-10-12/13
- GitHub Actions run `38335679403`, rerun attempt 2: **SUCCESS** for native Android compile, deterministic Android reader checks, permanent signed APK verification and artifact upload.
- GitHub Actions artifact `wire-android-signed-reader-apk`, ID `11784669728`, compiled from source `c716430298967b7a545d69f41acd8cdd63aa8056`.
- APK signer SHA256 `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`; APK SHA256 `bf78a5eb0e79cb74199ac688c17702a7982cedc9e5670ea298d82eeb42d3b4e2`.
- Cuberoot publisher run `38338400986`: **SUCCESS**, copying the exact signed artifact (4,230,178 bytes) to `downloads/wire.apk`; website release descriptor `downloads/wire-build.json`. Certificate and SHA256 checked before publication.
- Cuberoot Pages deployment `38338424779`: **SUCCESS**.
- Public reader-beta APK: `https://www.cuberoot-systems.com/downloads/wire.apk?build=38335679403`.
- Website includes a dynamically verified Wire reader-beta download button. No repository URL exposed to end users.
- **Physical Fire HD 8 tests remain pending:** install/open, load news feed, open one article, Back returns to publisher group, large fonts, rotation, airplane-mode cache and reopen. Passing CI does not establish these device results.
- **Native notifications still NOT IMPLEMENTED:** Android button clearly disabled. Separate A3L/ADM/FCM credentials, server routing and Fire + Google Android acceptance testing are required. Live `balita/main` news workflow and web notifications remain unchanged.

## October 2026 Android Back and native notifications implementation

### Back button
Android-only build patches `reader.js` to use a deterministic pointerdown/click handler (single actual-view transition), restores headline scroll in requestAnimationFrame, and wires Capacitor App's native Back event to the same `reader.close(ctx)`. The existing Web/iOS code in `main` remains unchanged.

### Native notifications (A3L receiver, provider detection, registration, routing code staged)
- Android Java `WirePushPlugin` uses A3L Messaging to identify **ADM vs FCM by available service**, obtains the correct registration token, and requests OS notification permission on Android 13+.
- `WireMessagingService` handles delivery from either provider; publishes a local notification only for a valid 30-minute article ID, never an arbitrary URL. An explicit notification tap passes articleId+sentAt into MainActivity. The JavaScript adapter opens that exact article and Back returns to its source.
- `android-src/notifications.js` supports per-install opt-in, Firebase anonymous identity over HTTPS, Firestore `pushSubscriptions/{uid}`, and explicit removal on opt-out. The provider field is `adm` or `fcm`. Web subscriptions without a provider remain `web`. The token is not reused across installations.
- `android-src/native-sender.mjs` supplies provider-specific FCM Android TTL=1800s vs legacy webpush TTL=1800 and ADM `expiresAfter=1800` with Amazon OAuth. `breaking-notify.mjs` is patched **on the Android development branch only**, with guarded Firestore `provider` parsing; **do not copy this into live main before full acceptance**, because the server requires ADM OAuth credentials and valid registered tokens.
- The Android APK build **fails closed** on partial native credentials, does not fabricate token registration, and compiles the reader-only beta when neither native credential exists.
- Official Amazon A3L Messaging 1.1.1 SDK is downloaded over HTTPS during the native-enabled build. It is not committed to this repository. The native Android Firebase configuration is also injected on the runner and removed, never committed.
- Native build needs GitHub Actions secrets **`WIRE_GOOGLE_SERVICES_JSON_B64`** (entire Firebase Android `google-services.json` base64) and **`WIRE_ADM_API_KEY`** (Amazon Developer Console API key for package `io.github.willyros01.wire` signed by SHA256 `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`). The ADM OAuth sender additionally needs **`WIRE_ADM_CLIENT_ID`** and **`WIRE_ADM_CLIENT_SECRET`** on the production fetch workflow.
- **BLOCKED without vendor credentials and real-device tests**: Native A3L compilation, real ADM/FCM token issuance, delivery in foreground/background/killed app, notification tap → exact article → source Back, opt out; keep production push unchanged in meantime.

## Verification after Android Back repair — October 12/13, 2026

- User reported intermittent on-screen Back failure while viewing detailed news on Fire HD 8.
- Back patch uses single-action pointerdown/click with reader-view state guard, Android hardware Back listener, deferred scroll restoration and exact source return.
- GitHub Actions run `38340060586` **SUCCESS**, source SHA `67b7e6eb76bcd56855d250ca70984cd3b1056485`. Native Android source checks, native sender unit tests, Android Java compilation, signed APK signature and artifact checks passed.
- Artifact `11786628798`; APK SHA256 `0191ff2cd50246121e84cb83175503be70247f99832077a6a81d705423bd4267`; bytes `4238244`; persistent signing certificate SHA256 `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`.
- Cuberoot publisher run `38340416421` **SUCCESS** and deployed metadata `downloads/wire-build.json` now identifies exactly that source, SHA and signing identity. Cuberoot Pages run `38340437668` follows publisher.
- Download `https://www.cuberoot-systems.com/downloads/wire.apk?build=38340060586`; device acceptance of Back and offline behavior remains pending.
- Native push receiver, opt-in, delivery routing and server provider logic are implemented **as source on the android branch**, with unit tests passing, but A3L native SDK integration is not compiled or activated in this beta because both Fire/Google provider credentials are missing. `main` news fetch and web push have not changed. Do not claim notification feature PASS until Amazon/Firebase credentials, A3L compile, server adapter deployment and Fire + Google on-device tests all pass.

## 2026-10-13 — Option 2: on-screen alerts while Android Wire is open

- User accepted the Back-button fix on a physical Fire tablet; requested an interim option with no Amazon registration. Amazon ADM identity verification deferred.
- Android-only `notifications-foreground.js` replaces the disabled toggle. It enables/disables **in-app alerts only**, checks the existing published news feed every two minutes only when `document.visibilityState === 'visible'`, and resumes checks when back online/foreground.
- Matches the *same* publisher-approved breaking/urgent/live/just-in headline markers and eligible sources as the existing web push sender; suppresses stories more than 30 minutes old, future/invalid timestamps, and previously seen IDs. First launch saves a baseline to avoid old-news floods. Stores a bounded seen set on device. No new fetcher, server writes, Firestore changes or Web Push changes.
- High-contrast panel, large adjustable text, minimum large tap targets, **Read story**/Dismiss, exact article ID, source selection so Back returns to the correct source. Overlay is hidden while the reader/manage view is displayed. The on-screen toggle text explicitly discloses that no alerts arrive when Wire is closed.
- On-screen check mode is **independent** of Amazon ADM and Google FCM. The previously staged optional native provider code is unchanged and inactive; the native build now requires explicit environment variable `WIRE_ENABLE_NATIVE_PUSH=1`, in addition to vendor prerequisites, so the newly-entered Firebase secret alone cannot trigger an unintended incomplete native build.
- App version for this Android build is `0.17.55`; existing production web `main` stays `0.17.54`. Signed APK publication and physical acceptance must be verified before claiming PASS. **No OS notification permission prompt, status-bar push or closed-app delivery.** Real device tests: toggle ON, wait/check for approved new marked stories, open/dismiss overlay, Back behavior, high-contrast/large text, restore from background, toggle OFF and confirm silence.
- Planned native ADM/FCM implementation remains separate and requires vendor credentials, compiled SDK validation and physical delivery/tap tests.

## Option 2 signed APK and Cuberoot publication — 2026-10-13
- Fire tablet owner accepted previous Back button repair (device-reported PASS).
- New foreground-only in-app breaking-news alert APK **0.17.55**, GitHub Actions workflow run **38346315104** and source **02cf9e343de64b132e75cdb8b3890db3ed66f94a**, **PASS**: pure alert tests (6), UI interaction (1), native sender regression (5), Android Java compilation, permanent APK signing and artifact creation.
- Signed APK artifact ID **11789865080**; APK SHA256 **7995e809fdd1eb460f84284b6bb490ce498ac9ceb7d229a0615b3b340e4a2c1d**, **4,239,013 bytes**. Signer SHA256 **662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866** (unchanged).
- Cuberoot publish run **38346661140**: PASS. Cuberoot metadata `downloads/wire-build.json` validated exact source_sha, run_id, artifact_id, APK hash, signer and bytes. Cuberoot Pages run **38346688307**: PASS.
- Public URL: `https://www.cuberoot-systems.com/downloads/wire.apk?build=38346315104`. Site button labels Android Beta, with on-screen alerts while open. Independent live HTTP download was not confirmed by web tool (access unavailable); GitHub publisher/Pages evidence passed.
- The native ADM/FCM messaging bridge is **NOT** enabled. The newly entered Google Firebase secret does not alter this behavior; only an explicitly authorized native build after vendor setup should enable native notification support. No native background/closed-app delivery.
- Device acceptance outstanding: install over previous Wire APK, toggle ON, status visible, 2-minute checks while foreground, receive and read a genuinely newly marked story, dismiss, restored source Back, large fonts/high contrast, toggle OFF; no claims of physical foreground alert PASS until user reports.

## 2026-10-13 — User rejected Option 2; Google FCM authorized separately

- User explicitly requested removal of the interim foreground-only 2-minute in-app notification system. New Android build removes its overlay, polling worker, and state/UI test files and reinstates the native push toggle.
- Google Android FCM is now a **separate** native module from Amazon ADM. The developer console ADM account/credentials are *not required* to compile or run FCM on supported Google Play Android devices.
- Native Android FCM plugin checks Play services availability, supports explicit notification opt-in and Android 13 runtime permission, registers per-app-instance FCM token, persists it in Firestore via existing anonymous Firebase auth flow, and returns explicit notification tap article IDs. The native Firebase Messaging service uses data-only FCM to issue Android system notifications, validates article ID and 30-minute age, and uses immutable PendingIntent with exact story ID. Token renewals reconcile when the app resumes and are not sent to the server without opt-in.
- Fire tablets without Google Play services display that ADM is not available yet. Existing separate A3L ADM source is retained but not compiled or activated. No misleading Amazon system push.
- Native FCM APK requires verified secret `WIRE_GOOGLE_SERVICES_JSON_B64`; both CI compile and signed build must have exactly matching Firebase project `wire-news-6da5a`, package `io.github.willyros01.wire`. Missing/incorrect config fails the build, never produces an unsigned/fake native push APK.
- Google native FCM sender **still requires a reviewed production main news-sender change** to route subscriptions with provider `fcm` to the Android FCM HTTP v1 message type while preserving existing web push for provider `web` and unspecified provider. Stage and verify before production change.
- Android version `0.17.56` (web stays at current production version). Require green CI, exact signed APK artifact, Cuberoot publisher hash/certificate and Pages deployment. Real on-device Google Android token registration and background/cold notification tap acceptance must still be reported independently.

## 2026-10-13 — ADM credentials entered, unified Fire/Google Android APK
- Owner confirmed GitHub Actions secrets `WIRE_ADM_API_KEY`, `WIRE_ADM_CLIENT_ID`, and `WIRE_ADM_CLIENT_SECRET` are entered on balita; values never extracted or published. Amazon security profile "Wire ADM" attached and ADM enabled for package `io.github.willyros01.wire` and permanent signer SHA-256 `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`.
- Android `0.17.57` uses Amazon's A3L Messaging 1.1.1 abstraction: Fire ADM and Google Android FCM use one plugin, token registration, opt-in state and exact-ID route. The previous Google-only APK `0.17.56` remains fallback until new signed build and device tests pass.
- `build/wadm.sh` provides one identical setup for the CI compile and signed build, validates both vendor credentials, downloads the official A3L SDK ZIP and installs AAR, copies Google `google-services.json` and Amazon `api_key.txt` only on the CI runner, then validates package/project. No Amazon OAuth client ID/secret is embedded. Build must fail closed if prereqs are missing.
- The old 2-minute foreground alert ("Option 2") remains **REMOVED**; native notifications are system push and work in the background when service/OS permits. No duplicate FCM/ADM service registration.
- Production `main` Fetch News remains the single sender. ADM routing requires reading `provider: "adm"` Firestore subscriptions and POST via Amazon OAuth, without changing approved news markers, 30-minute TTL or existing web/FCM behavior. The manual test_inquirer option uses this same sender after subscription opt-in.
- PASS must be supported by successful CI SDK compile, signed APK artifact, Cuberoot hash/certificate/deploy checks, and physical Fire notification opt-in, receipt background and tap-to-exact-article/Back tests. Source presence alone is not proof of device delivery.

## Verified ADM/FCM CI and Cuberoot delivery — 2026-10-13
- Amazon A3L Messaging SDK **1.1.1** fetched and integrated; first compile failed because receiver imported Firebase RemoteMessage instead of Amazon A3L RemoteMessage. Corrected in `android-src/native/WireMessagingService.java`, commit `e3b145fd6a302486260efac2dabae8955f86087c`.
- Android CI run **38476575525** PASS: reader tests, A3L ADM/FCM receiver/plugin Java compilation, permanent signing, exact SHA256 signer `662478ca576fec4f6914e7e446d017f359353970e76bfd4ec8d1318d2bb04866`, uploaded artifact **11855190304**. Signed APK SHA256 `139e0c3444eda4f37920897018d96d3ecbfafc28ea797bce0bac1f4e0d2c96d4`, **4,621,710 bytes**.
- Main sender commit `a717e409037169968793bace0d9ae547433564b3` added Amazon ADM OAuth and sender routing via `adm.mjs` and `adm.test.mjs`, keeping existing web/FCM source markers, manual Inquirer test input, and TTL 1800. Main Fetch News run **38476763930** PASS with new ADM/web/FCM tests and same scheduled sender; external receipt remains unproven.
- Cuberoot publish run **38477118887** PASS. Metadata `downloads/wire-build.json` channel `android-adm-fcm-beta` has exact matching source SHA/run ID/artifact ID, APK SHA and permanent signer. Cuberoot Pages run **38477164064** must independently complete successfully before asserting public page updated.
- Download `https://www.cuberoot-systems.com/downloads/wire.apk?build=38476575525`. **Await physical Fire tablet acceptance:** install over current APK; click Turn on, verify shows **ADM** not FCM; push manual Fetch News Inquirer test when subscribed, inspect sender log and Fire notification in foreground/background, tap exact article, Back returns publisher. Device delivery is NOT YET PASS.
- Sender secret values never committed; Amazon `WIRE_ADM_API_KEY` in build only, `WIRE_ADM_CLIENT_ID`/`WIRE_ADM_CLIENT_SECRET` only in main sender job. Device config secret is bundled as Amazon requires. No Appstore submission.

## 2026-10-13 — Optional on-screen fallback added to native 0.17.57 baseline
- Android-only 0.17.58 retains all compiled A3L Amazon ADM and Google FCM native notification components and their existing opt-in.
- A **separate** opt-in "Alerts while Wire is open" checks only publisher-marked, approved-source breaking stories with 30-minute recency, every two minutes only while visible. It shows a large high-contrast Read story/Dismiss panel and routes by exact article ID; Back returns to source.
- On-screen fallback automatically pauses and quietly baselines if native push is enabled on the device, preventing duplicate in-app and system alerts; no background or killed-app delivery is claimed for the fallback.
- No changes to balita/main, production fetcher or web push. All changes are restricted to android-src/, Android package script, tests, and Android release version. The native ADM/FCM bridge remains unchanged.
- CI includes pure deterministic filters and jsdom UI opt-in, read, dismiss, deduplication tests; native A3L/FCM compilation, APK signature, Cuberoot published artifact and physical testing still required before claiming this new APK is accepted.
