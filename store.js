/* ============================================================
   store.js — keeps your sources and reading settings.

   Two backings, same interface:
     Firestore  when config.FIREBASE is filled in — syncs devices
     Device     otherwise — works fine, just does not sync

   Nothing else in the app knows or cares which is in use.
   ============================================================ */

import { FIREBASE, DEFAULT_SOURCES } from "./config.js";

const KEY_SOURCES  = "balita.sources";
const KEY_SETTINGS = "balita.settings";
const DOC_PATH     = "balita/user";

let db = null;
let fs = null;          /* Firestore functions, loaded on demand */

/* Some browsers refuse storage in private mode. Never let that
   take the app down — fall back to memory and carry on. */
const memory = {};

function localRead(key){
  try{
    const raw = window.localStorage.getItem(key);
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

export async function loadSources(){
  const cloud = await cloudRead();
  if(cloud && Array.isArray(cloud.sources) && cloud.sources.length){
    localWrite(KEY_SOURCES, cloud.sources);   /* keep an offline copy */
    return cloud.sources;
  }

  const local = localRead(KEY_SOURCES);
  if(Array.isArray(local) && local.length) return local;

  /* First run. sources.json is the list the fetcher works from, so
     starting there means the app and the fetcher agree. */
  try{
    const res = await fetch("sources.json", { cache: "no-cache" });
    if(res.ok){
      const list = await res.json();
      if(Array.isArray(list) && list.length) return list;
    }
  }catch(err){
    /* fall through to the built-in list */
  }

  return DEFAULT_SOURCES.map(s => ({ ...s }));
}

export async function saveSources(sources){
  localWrite(KEY_SOURCES, sources);
  await cloudWrite({ sources });
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
