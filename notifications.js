/* ============================================================
   notifications.js — explicit, per-device breaking-news opt in.

   Push has its own Firebase app and anonymous device identity. It
   does not enable account login or settings synchronisation.
   ============================================================ */

import { PUSH_FIREBASE, PUSH_VAPID_KEY } from "./config.js";
import { VERSION } from "./version.js";

const ENABLED_KEY = "wire.breaking.enabled";
const ADDRESS_REVISION_KEY = "wire.push.addressRevision";
const ADDRESS_REVISION = "wire-push-0.17.22";
let refreshError = "";
let repairNeeded = false;
const SDK = "https://www.gstatic.com/firebasejs/10.12.2/";

let app;
let auth;
let db;
let messaging;
let modules;
let busy = false;

function savedEnabled(){
  try{ return localStorage.getItem(ENABLED_KEY) === "true"; }
  catch(err){ return false; }
}

function saveEnabled(value){
  try{ localStorage.setItem(ENABLED_KEY, value ? "true" : "false"); }
  catch(err){ /* The visible state still works for this session. */ }
}

function savedAddressRevision(){
  try{ return localStorage.getItem(ADDRESS_REVISION_KEY) || ""; }
  catch(err){ return ""; }
}

function saveAddressRevision(value){
  try{ localStorage.setItem(ADDRESS_REVISION_KEY, value); }
  catch(err){ /* Registration still works for this session. */ }
}

function standalone(){
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

async function loadFirebase(){
  if(modules) return modules;

  const [appMod, authMod, firestoreMod, messagingMod] = await Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js"),
    import(SDK + "firebase-messaging.js")
  ]);

  if(!(await messagingMod.isSupported())){
    throw new Error("Push notifications are not supported by this browser.");
  }

  app = appMod.initializeApp(PUSH_FIREBASE, "wire-push");
  auth = authMod.getAuth(app);
  db = firestoreMod.getFirestore(app);
  messaging = messagingMod.getMessaging(app);
  modules = { authMod, firestoreMod, messagingMod };
  return modules;
}

async function deviceUser(){
  const { authMod } = await loadFirebase();
  await auth.authStateReady();
  if(auth.currentUser) return auth.currentUser;
  return (await authMod.signInAnonymously(auth)).user;
}

async function worker(){
  if(!("serviceWorker" in navigator)){
    throw new Error("Push notifications are not supported by this browser.");
  }
  const registration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
  await registration.update();
  return navigator.serviceWorker.ready;
}

async function subscribe({ repair = false } = {}){
  if(!PUSH_FIREBASE || !PUSH_VAPID_KEY){
    throw new Error("Breaking-news notifications are not configured yet.");
  }

  if(!("Notification" in window)){
    const hint = /iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone()
      ? " Add Wire to the Home Screen first, then open it from its icon."
      : "";
    throw new Error("This browser cannot enable notifications." + hint);
  }

  let permission = Notification.permission;
  if(permission === "default") permission = await Notification.requestPermission();
  if(permission !== "granted"){
    throw new Error("Notification permission was not granted.");
  }

  const { firestoreMod, messagingMod } = await loadFirebase();
  const [user, registration] = await Promise.all([deviceUser(), worker()]);
  /* Replacing an iOS Web Push subscription can require a user gesture.
     Destructive repair therefore runs only from the Repair button. */
  if(repair){
    await messagingMod.deleteToken(messaging).catch(() => false);
    const oldSubscription = await registration.pushManager.getSubscription();
    if(oldSubscription) await oldSubscription.unsubscribe().catch(() => false);
  }
  const token = await messagingMod.getToken(messaging, {
    vapidKey: PUSH_VAPID_KEY,
    serviceWorkerRegistration: registration
  });
  if(!token) throw new Error("The device did not provide a notification address.");

  await firestoreMod.setDoc(
    firestoreMod.doc(db, "pushSubscriptions", user.uid),
    {
      token,
      enabled: true,
      addressRevision: ADDRESS_REVISION,
      appVersion: VERSION,
      userAgent: String(navigator.userAgent || "").slice(0, 300),
      updatedAt: firestoreMod.serverTimestamp()
    },
    { merge: true }
  );

  saveAddressRevision(ADDRESS_REVISION);
  repairNeeded = false;
  refreshError = "";
  saveEnabled(true);
}

async function unsubscribe(){
  const { firestoreMod, messagingMod } = await loadFirebase();
  const [user, registration] = await Promise.all([deviceUser(), worker()]);

  await firestoreMod.deleteDoc(
    firestoreMod.doc(db, "pushSubscriptions", user.uid)
  );
  await messagingMod.deleteToken(messaging).catch(() => false);
  /* deleteToken removes Firebase's address, but iOS can retain the dead
     browser PushSubscription underneath it. If that subscription is reused,
     FCM accepts messages that never reach the device. A deliberate Turn off
     must remove both layers so the next Turn on creates a genuinely new
     Apple Web Push address. */
  const oldSubscription = await registration.pushManager.getSubscription();
  if(oldSubscription) await oldSubscription.unsubscribe().catch(() => false);
  saveAddressRevision("");
  saveEnabled(false);
}

function paint(button, status){
  const on = savedEnabled() && "Notification" in window &&
    Notification.permission === "granted";
  button.disabled = busy;
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.textContent = busy ? "Please wait…" : repairNeeded ? "Repair notifications" : on ? "Turn off" : "Turn on";
  status.textContent = busy
    ? "Updating…"
    : repairNeeded
      ? "Notification address needs repair. Tap Repair notifications once."
    : refreshError
      ? "Could not update notifications. Reopen Wire and try again."
      : on
      ? "Notifications are on."
      : "Notifications are off.";
}

export function setup({ announce, onTap }){
  const button = document.getElementById("breaking-toggle");
  const status = document.getElementById("breaking-status");
  if(!button || !status) return;

  repairNeeded = savedEnabled() && "Notification" in window &&
    Notification.permission === "granted" &&
    savedAddressRevision() !== ADDRESS_REVISION;
  paint(button, status);

  onTap(button, async () => {
    if(busy) return;
    busy = true;
    paint(button, status);
    try{
      if(repairNeeded){
        await subscribe({ repair: true });
        announce("Notifications repaired.", "done");
      }else if(savedEnabled()){
        await unsubscribe();
        announce("Notifications turned off.", "done");
      }else{
        /* A Turn on tap is the required iOS user gesture. Always use it to
           discard any surviving stale browser subscription before enrolling. */
        await subscribe({ repair: true });
        announce("Notifications turned on.", "done");
      }
    }catch(err){
      console.warn("Could not change notification setting.", err);
      announce(err && err.message ? err.message : "Could not change notifications.", "warn");
    }finally{
      busy = false;
      paint(button, status);
    }
  });

  /* Refresh a previously granted token quietly. Permission is never
     requested here; only a deliberate tap may show that prompt. */
  if(!repairNeeded && savedEnabled() && "Notification" in window && Notification.permission === "granted"){
    subscribe().then(() => paint(button, status)).catch(err => {
      refreshError = err.message || "Unknown error";
      paint(button, status);
      console.warn("Could not refresh the notification address.", err);
    });
  }
}
