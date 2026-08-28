/* ============================================================
   store.js — keeps your sources and reading settings.

   Two backings, same interface:
     Firestore  when config.FIREBASE is filled in — syncs devices
     Device     otherwise — works fine, just does not sync

   Nothing else in the app knows or cares which is in use.
   ============================================================ */

import { FIREBASE, DEFAULT_SOURCES } from "./config.js";

const KEY_SOURCES  = "wire.sources";
const KEY_SETTINGS = "wire.settings";
const KEY_REMOVED  = "wire.removed";
const DOC_PATH     = "wire/user";

/* The app was called Balita until 0.5.0. Anyone who used it before
   that has settings under the old names; move them across once so
   nobody loses their text size or their feed list in the rename. */
const OLD_KEYS = { "wire.sources": "balita.sources", "wire.settings": "balita.settings" };

let db = null;
let fs = null;          /* Firestore functions, loaded on demand */

/* Some browsers refuse storage in private mode. Never let that
   take the app down — fall back to memory and carry on. */
const memory = {};

function localRead(key){
  try{
    let raw = window.localStorage.getItem(key);

    if(raw === null && OLD_KEYS[key]){
      raw = window.localStorage.getItem(OLD_KEYS[key]);
      if(raw !== null){
        window.localStorage.setItem(key, raw);
        window.localStorage.removeItem(OLD_KEYS[key]);
      }
    }

    return raw ? JSON.parse(raw) : null;
  }catch(e){
    return memory[key] ?? null;
  }
}

function localWrite(key, value){
  memory[key] = value;
  try{
    window.localStorage.setItem(key, JSON.stringify(value));
  }catch(e){
    /* memory copy already holds it */
  }
}

/* ---------------- setup ---------------- */

export async function init(){
  if(!FIREBASE) return { synced: false };

  try{
    const appMod = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
    fs = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
    const app = appMod.initializeApp(FIREBASE);
    db = fs.getFirestore(app);
    return { synced: true };
  }catch(err){
    console.warn("Firestore unavailable, using this device only.", err);
    db = null;
    return { synced: false, error: err };
  }
}

async function cloudRead(){
  if(!db) return null;
  try{
    const snap = await fs.getDoc(fs.doc(db, DOC_PATH));
    return snap.exists() ? snap.data() : null;
  }catch(err){
    console.warn("Could not read from Firestore.", err);
    return null;
  }
}

async function cloudWrite(patch){
  if(!db) return;
  try{
    await fs.setDoc(fs.doc(db, DOC_PATH), patch, { merge: true });
  }catch(err){
    console.warn("Could not save to Firestore.", err);
  }
}

/* ---------------- sources ---------------- */

/* The list the fetcher actually works from. */
async function fetchStandard(){
  try{
    const res = await fetch("sources.json", { cache: "no-cache" });
    if(res.ok){
      const list = await res.json();
      if(Array.isArray(list) && list.length) return list;
    }
  }catch(err){
    /* offline, or the file is missing */
  }
  return DEFAULT_SOURCES.map(s => ({ ...s }));
}

/* Bring the saved list up to date with the standard one.

   Until 0.7.0 the saved list simply won over sources.json, so a feed
   added there — or an address corrected there — never reached a
   device that had already run once. CNN sat switched off for exactly
   this reason.

   The rules: an outlet you have keeps your on/off choice but takes
   the current address and name. An outlet you do not have is added.
   An outlet you deliberately removed stays removed. Anything you
   added yourself is left alone. */
function merge(saved, standard, removed){
  const out = saved.map(s => ({ ...s }));
  const byId = new Map(out.map(s => [s.id, s]));

  for(const std of standard){
    const mine = byId.get(std.id);
    if(mine){
      mine.name  = std.name;
      mine.tag   = std.tag;
      mine.url   = std.url;
      mine.color = std.color;
      continue;
    }
    if(removed.includes(std.id)) continue;
    out.push({ ...std });
  }

  return out;
}

export async function loadSources(){
  const standard = await fetchStandard();
  const removed  = localRead(KEY_REMOVED) || [];

  const cloud = await cloudRead();
  if(cloud && Array.isArray(cloud.sources) && cloud.sources.length){
    const merged = merge(cloud.sources, standard, removed);
    localWrite(KEY_SOURCES, merged);
    return merged;
  }

  const local = localRead(KEY_SOURCES);
  if(Array.isArray(local) && local.length){
    return merge(local, standard, removed);
  }

  return standard.map(s => ({ ...s }));
}

export async function saveSources(sources){
  localWrite(KEY_SOURCES, sources);
  await cloudWrite({ sources });
}

/* Remembering what was removed is what stops a merge putting it
   straight back on the next load. */
export function markRemoved(id){
  const list = localRead(KEY_REMOVED) || [];
  if(!list.includes(id)){
    list.push(id);
    localWrite(KEY_REMOVED, list);
  }
}

export function unmarkRemoved(id){
  const list = (localRead(KEY_REMOVED) || []).filter(x => x !== id);
  localWrite(KEY_REMOVED, list);
}

/* Back to the list the fetcher works from, everything switched on. */
export async function restoreStandard(){
  localWrite(KEY_REMOVED, []);
  const standard = (await fetchStandard()).map(s => ({ ...s, on: true }));
  await saveSources(standard);
  return standard;
}

/* ---------------- settings ---------------- */

export async function loadSettings(){
  const cloud = await cloudRead();
  if(cloud && cloud.settings){
    localWrite(KEY_SETTINGS, cloud.settings);
    return cloud.settings;
  }
  return localRead(KEY_SETTINGS) || {};
}

export async function saveSettings(settings){
  localWrite(KEY_SETTINGS, settings);
  await cloudWrite({ settings });
}
