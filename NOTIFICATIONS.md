# Breaking-news notifications

This document is the complete operating contract for Wire's notification
feature. The reading app still works without notifications, and notification
registration is separate from reading settings and source preferences.

## Fixed project resources

| Resource | Value |
|---|---|
| Firebase project | `wire-news-6da5a` |
| Google Cloud project number | `927723710869` |
| Firestore database | `(default)`, location `nam5` |
| Web app | `Wire Web` |
| Sender service account | `wire-news-sender@wire-news-6da5a.iam.gserviceaccount.com` |
| Workload Identity pool | `wire-github` |
| Workload Identity provider | `balita-main` |
| Allowed GitHub repository | `willyros01/balita` |
| Allowed GitHub ref | `refs/heads/main` |

The web app configuration and VAPID public key in `config.js` are public
identifiers. No private service-account key belongs in the repository.

## Device registration interface

1. The reader taps **Turn on** under **Breaking-news notifications**.
2. `notifications.js` asks the browser for notification permission.
3. Firebase Anonymous Authentication creates a device-local identity.
4. Firebase Cloud Messaging returns a registration token using the public
   VAPID key and the existing `sw.js` registration.
5. The app writes one document to:

   ```text
   pushSubscriptions/{anonymous-auth-uid}
   ```

The document schema is:

```text
token      string       FCM registration token
enabled    boolean      true while subscribed
updatedAt  timestamp    server-generated refresh time
```

Firestore rules allow an authenticated anonymous device to read, create,
update, or delete only the document whose id matches its own UID. Every other
client read or write is denied. The server-side sender uses IAM and is not
governed by client security rules.

The deployed rule source is preserved as `firestore.rules`. Update that file
whenever the deployed rules change so the security boundary remains auditable.

Turning notifications off deletes the subscription document and asks FCM to
delete the local token. Clearing all browser data can leave an old document;
the sender removes it after FCM reports that the token is unregistered.

## Breaking-news decision policy

All gates must pass. The sender does not infer importance from subject matter.

### Approved sources

| Feed id | Outlet |
|---|---|
| `inq` | Inquirer |
| `inqn` | Inquirer News |
| `inqg` | Inquirer Global |
| `cbc` | CBC Top Stories |
| `bbc` | BBC World |
| `gma` | GMA News |
| `dw` | DW English |
| `abs` | ABS-CBN |

### Approved publisher markers

The headline must begin with one of these publisher-written markers, followed
by punctuation, or place the marker in square brackets:

```text
Breaking:
Just In:
Urgent:
Live:
[Breaking]
[Just In]
[Urgent]
[Live]
```

Matching is case-insensitive. A marker appearing later in a headline does not
qualify. Ordinary headlines and headlines from every other source are ignored.

### Hard frequency limits

| Limit | Value |
|---|---|
| Per workflow run | 1 alert maximum |
| All sources combined | 1 alert maximum in any rolling 30-minute period |
| Per article | Once only |

Every qualifying story is marked seen, including one suppressed by a limit.
Suppressed stories do not form a backlog and cannot create a later flood.
`breaking-state.json` holds this deduplication and quota state. Its first
baseline was created without sending any historical alerts.

### Manual Inquirer delivery test

An operator may open **Actions → Fetch news → Run workflow**, select
**Send one clearly labelled test alert from the newest unseen Inquirer story**,
and run the workflow. This manual-only path selects one unseen story from the
three Inquirer feeds without requiring a publisher marker and prefixes its
notification title with `[Test]`. It still enforces the shared rolling
30-minute limit and requires at least one subscribed device.

Scheduled, external, and push-triggered runs cannot activate test mode and
continue to require every approved publisher-marker gate.

## GitHub-to-Google interface

`.github/workflows/feeds.yml` requests GitHub's short-lived OIDC token with:

```yaml
permissions:
  contents: write
  id-token: write
```

`google-github-actions/auth@v3` exchanges that identity through:

```text
projects/927723710869/locations/global/workloadIdentityPools/wire-github/providers/balita-main
```

The provider admits only the repository and `main` branch listed above. The
resulting access token is passed in memory to `breaking-notify.mjs`. It is not
stored in GitHub, printed, or committed.

Authentication and notification steps are non-blocking for the news fetch. A
temporary Google or FCM failure is shown as a workflow warning, while the new
`articles.json` is still committed so notifications cannot make the reader
stale.

The sender service account has only the project roles needed to read/delete
subscription documents and send FCM messages:

```text
roles/datastore.user
roles/firebasecloudmessaging.admin
```

## Sender interfaces

The sender lists subscription documents through the Firestore REST API and
sends a data-only message through FCM HTTP v1. The data fields are strings:

```text
articleId   Wire article id
sourceName  display name, limited to 40 characters
title       publisher headline, limited to 220 characters
```

Web Push headers are:

```text
TTL: 3600
Urgency: normal
```

Before FCM is called, the workflow publishes both the complete feed and one
stable endpoint for every current article:

```text
articles/{articleId}.json
```

This makes the notification ID directly addressable and prevents deep linking
from depending on the complete feed being refreshed first.

No sound, critical-alert setting, time-sensitive setting, or persistent prompt
is requested. The operating system therefore remains responsible for Focus,
Do Not Disturb, notification summaries, and user notification settings.

## Service-worker interface

`sw.js` receives the data message, displays one notification tagged with the
article id, and opens:

```text
./?article={articleId}
```

If Wire is closed, the query string opens the Home Screen app. Because iOS can
replace that URL with the app's start URL, the service worker also repeats a
`wire-open-article` message briefly while the new page starts. `app.js`
registers its listener before loading storage or feed data, queues the id until
the interface is ready, and ignores duplicate messages.

Before either path wakes the app, the worker also writes the article id to the
dedicated `wire-notification-route-v1` browser cache. That cache is deliberately
preserved across shell-cache upgrades. On startup, `pageshow`, and return from
the background, the page reads the saved destination, refreshes the feed if
needed, opens that exact article, and then deletes the record. This durable
handoff covers iOS suspending an already-open app before a one-time worker
message can be handled. It never falls back to the first feed article.

The page first requests `articles/{articleId}.json` and verifies that the ID in
the response exactly matches the notification. It then selects the article's
publisher grouping before opening the reader. The reader's Back button returns
to that grouping at the notified headline rather than to a previous All
Sources position.

The saved route also contains the tap time. If the article endpoint is absent,
the page refreshes `articles.json`. Once that file reports a completed fetch
later than the tap and still does not contain the requested ID, the route is
expired, its retry timer is cancelled, and its cache record is deleted. Until
that conclusive newer feed exists, a transient publication or network delay is
retried. This prevents an unavailable old ID from polling forever or delaying a
newer notification.

The worker uses `clients.openWindow()` for the article URL whether Wire is
closed or suspended. That browser-owned launch route is the path verified to
work on iPhone; `WindowClient.navigate()` remains only a fallback because iOS
may ignore it while restoring an existing Home Screen app. After launch, the
worker repeats the article message for five seconds. The page also checks the
dedicated cache on window focus, `pageshow`, and visibility return. These are
independent routes to the same id: launch URL, persistent cache, and worker
message.

For background resume, the worker broadcasts the ID to every matching Wire
window before foregrounding and repeatedly re-queries and broadcasts afterward.
It also focuses and navigates the returned client. Because iOS can restore an
old Home Screen view without emitting any lifecycle event, the page checks the
durable route cache once per second whenever its JavaScript is running. This
heartbeat is the final authority and does not depend on `focus`, `pageshow`,
`visibilitychange`, or a one-time worker message.

The service worker rejects click destinations outside its own GitHub Pages
scope.

## Required Firebase Console settings

1. **Authentication → Sign-in method → Anonymous:** Enabled.
2. **Authentication → Settings → Authorized domains:**
   `willyros01.github.io` must be present.
3. **Project settings → Cloud Messaging → Web Push certificates:** the public
   key in `config.js` must be the active key.
4. Firestore rules must restrict clients to their own
   `pushSubscriptions/{uid}` document.

## Acceptance test

1. Wait for the GitHub Pages deployment of version `0.17.8`.
2. On iPhone or iPad, remove the previous Home Screen installation and install
   Wire again if the notification control does not appear.
3. Open Wire from its Home Screen icon.
4. Tap **Turn on** and allow notifications.
5. Confirm the status reads **On for this device**.
6. In GitHub Actions, run **Fetch news**. A normal run should report
   `No new strictly marked breaking stories.` and send nothing.
7. Do not manufacture a live alert by editing `articles.json`. Use the isolated
   test procedure below before any production-message test is added.
8. Turn on device Focus or Do Not Disturb before a real notification test and
   confirm the operating system suppresses or delays it according to the
   device's own settings.

## Failure guide

| Message | Meaning |
|---|---|
| `auth/unauthorized-domain` | Add `willyros01.github.io` under Firebase Authentication authorized domains |
| Permission was not granted | Enable notifications in device settings, then reopen the installed app |
| Browser cannot enable notifications | On iPhone/iPad, install to the Home Screen and open from the icon |
| Could not read subscriptions | Check the sender's Firestore IAM role |
| FCM HTTP 403 | Check the Cloud Messaging IAM role and API |
| No subscribed devices | Turn on notifications in the installed app |
| No new strictly marked stories | Normal; nothing passed every gate |

## Emergency stop

To stop delivery without changing the app, disable the **Fetch news** workflow
or remove `roles/firebasecloudmessaging.admin` from the sender service account.
To stop one device, tap **Turn off** in Wire.
