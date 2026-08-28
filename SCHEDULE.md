# Setting up the schedule

The app updates only when you press Run workflow. This fixes that.

Twenty minutes, all in Safari, free, no card. Two accounts, two things to
create. Every value you need to type is written out below — nothing is left
for you to work out.

**Have `schedule-diagram.svg` open beside this** if you want to see how the
three pieces fit together.

---

## Before you start

Write your GitHub username here, because you will need it twice:

```
YOUR-USERNAME = ________________
```

It is the name in the address of your repository:
`github.com/`**`YOUR-USERNAME`**`/balita`

The repository is called **balita**, not wire. The app was renamed; the
repository was not.

---

# Part 1 — Make the key

A key proves the message is really from you. Without one GitHub ignores it.

### 1.1

Go to **github.com** and sign in.

### 1.2

Tap your **picture, top right** → **Settings**.

Not the repository's settings. Your account's.

### 1.3

Scroll to the very bottom of the left sidebar → **Developer settings**.

It is the last item. Easy to miss.

### 1.4

**Personal access tokens** → **Fine-grained tokens** → **Generate new token**.

Fine-grained, not "Tokens (classic)". If you only see classic, look for a
link offering the fine-grained kind.

### 1.5

Fill the form in exactly like this:

| Field | What to put |
|---|---|
| Token name | `wire-scheduler` |
| Description | leave empty |
| Expiration | **1 year** — or "No expiration" if offered |
| Resource owner | your own username |

### 1.6 — Repository access

Choose **Only select repositories**.

A box appears. Tap it and pick **balita**.

Do not choose "All repositories". This key should be able to touch one
thing and nothing else.

### 1.7 — Permissions

Find **Repository permissions**. It is a long list, alphabetical.

Scroll to **Contents**. Change its dropdown from *No access* to:

```
Read and write
```

**Contents is the only one you change.** Metadata will tick itself
read-only; that is normal and required.

### 1.8

Scroll to the bottom → **Generate token**.

### 1.9 — Copy it now

A long string appears, starting `github_pat_`.

**It is shown once and never again.** Tap **Copy**, then paste it into a
note, an email to yourself, anywhere you can get at it in five minutes.

If you lose it, delete the token and make another. No harm done.

---

# Part 2 — Make the job

### 2.1

Go to **cron-job.org** → **Sign up** → email and password → confirm the
email they send.

### 2.2

**Create cronjob** — a button near the top.

### 2.3 — Title

```
Wire news
```

### 2.4 — URL

Type this, with your own username in place of `YOUR-USERNAME`:

```
https://api.github.com/repos/YOUR-USERNAME/balita/dispatches
```

Check it carefully:

- `api.github.com`, not `github.com`
- `repos`, plural
- `balita`, not wire
- `dispatches`, plural, no slash at the end

### 2.5 — Schedule

Choose **Every 30 minutes**, or whatever the wording is for it.

If it offers exact minutes, use **7** and **37** rather than 0 and 30 — the
half hour is when everybody else's jobs run.

### 2.6 — Open the advanced settings

There is a section called **Advanced**, or a tab beside "Common". Open it.
The next three steps are all in there.

### 2.7 — Request method

Change from `GET` to:

```
POST
```

**This one matters more than any other setting.** A GET will do nothing at
all, quietly.

### 2.8 — Request body

Find the large empty box, labelled **Request body** or **POST data**. Put in
exactly this, including the braces and quotation marks:

```
{"event_type":"fetch-news"}
```

`fetch-news` must match exactly — that is the name the workflow listens for.

### 2.9 — Headers

Find **Headers** — usually a small table with **Add header** beneath it. Add
three, one at a time.

| Name | Value |
|---|---|
| `Accept` | `application/vnd.github+json` |
| `Content-Type` | `application/json` |
| `Authorization` | `Bearer github_pat_YOUR-KEY-HERE` |

For the third, type the word `Bearer`, then one space, then paste the key
from step 1.9.

It should read like this, all on one line:

```
Bearer github_pat_11ABCDE...
```

**A missing `Bearer ` is the single most common mistake.** The key on its
own will be rejected.

### 2.10

**Create** — or Save.

---

# Part 3 — Test it

On the job's page, find **Test run** — usually a button top right.

### What you want

A response of **204**, or a green tick, and an empty body.

204 means "done, nothing to say". It is the correct answer here, and there
is no message with it. An empty response is success, not a failure.

### Then check GitHub

Open **github.com/YOUR-USERNAME/balita** → **Actions**.

Within a few seconds a new run appears. Open it, and under the title it
should say it was triggered by **repository_dispatch** rather than manually.

**That is the proof.** Something outside GitHub started a run.

---

## If the test fails

| Response | What it means | What to do |
|---|---|---|
| **204** | Success | Nothing. Check the Actions tab. |
| **401** | The key was rejected | Step 2.9 — is `Bearer ` in front, with a space? |
| **404** | GitHub cannot find it | Two causes. Check the address in 2.4 for a typo. If that is right, the key lacks permission — GitHub returns 404 rather than 403 to avoid revealing that a private repository exists. Redo 1.6 and 1.7. |
| **403** | Refused | The key expired, or was deleted. Make a new one. |
| **422** | The message was malformed | Step 2.8 — the body must be exactly `{"event_type":"fetch-news"}` |
| **200 with a page of text** | It sent a GET, not a POST | Step 2.7. |

If it returns 204 but nothing appears in Actions, the workflow file is out
of date — it needs the `repository_dispatch` trigger added in 0.8.0. Check
`.github/workflows/feeds.yml` contains the line `repository_dispatch:`.

---

## Afterwards

Nothing to maintain. It runs every half hour on its own.

**To confirm it is really working:** tomorrow, open the Actions tab and look
for runs you did not start. Several, spaced evenly, means it is keeping
time.

**The app's About panel** shows a **Fetched** line. Once this is running it
should never be more than about half an hour old.

**In a year** the key expires and the job starts failing. cron-job.org will
email you. Make a new key by repeating Part 1, and paste it into step 2.9.

**To pause it**, switch the job off on cron-job.org. To stop it entirely,
delete the token on GitHub — that revokes it instantly, whatever else
happens.
