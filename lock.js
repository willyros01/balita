/* ============================================================
   lock.js — the passcode on the admin settings.

   The question worth answering first: where does a password live in
   an app with no server?

   Not in the code. Anyone can read `config.js` — it sits in a public
   repository and is downloaded by every browser that opens the app.
   A password written there is a password published.

   Not in storage as text either, for the same reason in miniature:
   anything readable is eventually read.

   So it is never stored at all. What is stored is a SHA-256 hash of
   it, which cannot be turned back into the passcode. Entering a
   passcode hashes it and compares. The hash is useless to anyone who
   finds it, and the passcode exists only in your head.

   What this does and does not protect

   It stops someone picking up the tablet and changing a setting.
   That is the whole of the threat here — a household device, not a
   bank.

   It does not stop a determined person with the device, because
   everything the app knows is on the device. Anyone who can open the
   browser's storage can clear the hash and set their own. That is
   true of every app of this kind, and pretending otherwise would be
   worse than saying so.
   ============================================================ */

import { loadSettings, saveSettings } from "./store.js";

async function hash(text){
  /* Salted so the same passcode does not produce the same hash as
     it would in some other app, and so a table of common hashes is
     no use against it. */
  const data = new TextEncoder().encode("wire.v1|" + text);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function isSet(){
  const s = await loadSettings();
  return typeof s.lock === "string" && s.lock.length === 64;
}

export async function setPasscode(text){
  const s = await loadSettings();
  s.lock = await hash(text);
  await saveSettings(s);
}

export async function check(text){
  const s = await loadSettings();
  if(!s.lock) return false;
  return s.lock === await hash(text);
}

export async function clearPasscode(){
  const s = await loadSettings();
  delete s.lock;
  await saveSettings(s);
}

/* ---------------- the reminder ---------------- */

export async function tokenExpiry(){
  const s = await loadSettings();
  return s.tokenExpiry || null;      /* "YYYY-MM-DD" */
}

export async function setTokenExpiry(date){
  const s = await loadSettings();
  if(date) s.tokenExpiry = date; else delete s.tokenExpiry;
  await saveSettings(s);
}

/* How many days are left, or null if no date is set. */
export function daysUntil(date){
  if(!date) return null;
  const then = new Date(date + "T00:00:00");
  if(Number.isNaN(then.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((then - today) / 86400000);
}
