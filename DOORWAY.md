# Turning on the doorway

Ten minutes. Makes Inquirer News read in full instead of headline-only.

Everything is already built and uploaded. What remains is one shared
password, written in two places so the two ends recognise each other.

**Nothing breaks if you skip this.** Without the two secrets the fetcher
behaves exactly as it does now.

---

## First — invent a password

Any long string nobody could guess. Made-up words are fine, and easier to
retype than random characters:

```
wire-doorway-brass-lantern-9174
```

Use your own. Write it down; you will paste it twice.

---

## Part 1 — Update the Worker

The code changed since you pasted it: a stray space in an address used to
fail silently, and the error now names what it saw.

1. **dash.cloudflare.com** → **Workers & Pages** → **wire-doorway**
2. Open the editor — the **</>** icon, or **Quick edit**
3. Select all, delete, paste the new `worker.js` from the zip
4. **Deploy**

---

## Part 2 — Tell the Worker the password

1. Still on **wire-doorway** → **Settings**
2. Find **Variables and Secrets**, or **Environment Variables**
3. **Add** →

   | Field | Value |
   |---|---|
   | Type | **Secret** — not Text |
   | Name | `WIRE_KEY` |
   | Value | your password |

4. **Save and deploy**

**Secret, not plain text.** A plain variable is readable from the
dashboard; a secret is write-only once saved.

---

## Part 3 — Tell GitHub the same password

1. Open **github.com/YOUR-USERNAME/balita**
2. **Settings** — the repository's, along the top, not your account's
3. Sidebar: **Secrets and variables** → **Actions**
4. **New repository secret**, twice:

   | Name | Value |
   |---|---|
   | `WIRE_KEY` | the same password, exactly |
   | `WIRE_DOOR_URL` | `https://wire-doorway.YOUR-NAME.workers.dev` |

For the address: no slash at the end, and no `/fetch` — just the plain
worker address, as it appears in Cloudflare.

The two passwords must match character for character. A trailing space
counts.

---

## Part 4 — Run it

**Actions** → **Fetch news** → **Run workflow**.

### What the log should say

Second line:

```
Doorway configured — refused hosts will be fetched through it
```

If it says *No doorway configured*, one of the two GitHub secrets is missing
or misspelled. The names are case-sensitive.

### Then look at Inquirer News

Before:

```
Inquirer News   40 stories  (page 0, feed 0, summary only 40, reused 0)
```

After:

```
Inquirer News   40 stories  (page 40, feed 0, summary only 0, reused 0)
```

`page 40` means the doorway worked. Those stories now read in full.

Nothing else in the log should change.

---

## If it does not work

| In the log | Meaning | Fix |
|---|---|---|
| `No doorway configured` | GitHub cannot see the secrets | Part 3 — check both names |
| `inqn — HTTP 401` | The passwords differ | Compare Part 2 and Part 3, character by character |
| `inqn — HTTP 403` | The Worker refused the host | The address must be in `ALLOWED` in `worker.js` |
| `inqn — HTTP 403` still, from Inquirer | Cloudflare is being refused too | Unlikely — the probe returned 200. Tell me. |
| Everything unchanged | Old stories are reused, not re-fetched | Correct. Only new stories go through the doorway. Wait for the next batch. |

---

## What this does and does not do

**Does:** fetch pages from `newsinfo.inquirer.net` through Cloudflare, which
that site answers, and hand the HTML back to GitHub to parse.

**Does not:** change anything else. Parsing, ad-stripping and writing
`articles.json` all happen where they always did. Every other outlet is
fetched directly, as before.

**To add another outlet later:** put its host in two places — `ALLOWED` in
`worker.js`, and `THROUGH_THE_DOOR` in `net.mjs`. Both, or it will not
route.

**To turn it off:** delete the two GitHub secrets. The fetcher returns to
its previous behaviour immediately, with no other change.
