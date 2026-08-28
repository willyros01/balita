# The doorway prototype

A test, not a change to the app. Nothing in the repository is touched, and
if the answer is no we stop here having spent twenty minutes.

**The question:** newsinfo.inquirer.net refuses GitHub's servers but answers
your iPad. Does it answer Cloudflare's network? If yes, the pages GitHub
cannot reach become reachable.

All of this is done in Safari. Free, no card required.

---

## Part 1 — An account

1. Go to **cloudflare.com** and sign up. Email and a password.
2. It may ask you to add a website. **Skip that** — look for a link saying
   you want to do something else, or just go on to Part 2. Workers do not
   need a domain.

---

## Part 2 — Create the Worker

1. In the sidebar, tap **Compute (Workers)**, or **Workers & Pages**.
2. **Create** → **Start with Hello World!** → **Get started**.
3. **Name:** `wire-doorway`
4. **Deploy**.

It gives you an address like:

```
https://wire-doorway.YOUR-NAME.workers.dev
```

Keep that. It is the doorway.

---

## Part 3 — Put the code in

1. On the Worker's page, tap **Edit code** — or **</> Edit code**, near the
   top right.
2. An editor opens with a few lines of sample code. Select all of it and
   delete it.
3. Open `worker.js` from the zip, select all, copy, and paste it in.
4. Tap **Deploy** — top right.

Wait for it to say deployed.

---

## Part 4 — The test

Open this in Safari, with your own worker address:

```
https://wire-doorway.YOUR-NAME.workers.dev/probe?url=https://newsinfo.inquirer.net/
```

You get a few lines of plain text back. The line that matters is **verdict**.

| What it says | What it means |
|---|---|
| `looks like a real article page` | **It works.** Cloudflare can reach what GitHub cannot. |
| `refused — status 403` | Same wall, different address. We stop. |
| `answered, but served a challenge page` | A bot check. Not usable. |
| `answered, but the page holds almost no text` | Something came back, but not the article. |
| `no answer at all` | Timed out. Try once more before concluding. |

### Then test a real article

Open Wire, tap any Inquirer News story, and use **Read it on Inquirer** to
get the address. Then:

```
https://wire-doorway.YOUR-NAME.workers.dev/probe?url=PASTE-THE-ARTICLE-ADDRESS
```

A front page and an article page can be protected differently, so this
second test is the one that actually decides it.

**Send me both results.**

---

## What happens next

**If it works:** about 40 lines of Worker code already written, and roughly
10 lines in `net.mjs` — a list of hosts to route through the doorway, and a
branch that does it. Everything else stays exactly as it is. The fetcher
still runs on GitHub, still parses with the same extractor, still writes the
same file. It just asks the doorway for the handful of pages it cannot get
itself.

There is a second prize: Workers have a proper scheduler, unlike GitHub's,
which has never once fired. The same Worker could trigger the fetch on time
and settle that too.

**If it does not work:** we have learned that Inquirer News blocks
datacentres generally rather than GitHub specifically, and the honest answer
is to keep it as headlines — which it already is. Delete the Worker and
nothing is left behind.

---

## A note on the code

The Worker will only fetch from a fixed list of news sites, and only ever
reads. That matters: an unrestricted proxy at a public address gets found
and used to launder other people's traffic, usually within days.

The `/fetch` endpoint, which returns the page itself, needs a secret before
it will do anything. That is only set up if the prototype succeeds. `/probe`
is harmless and needs nothing.
