/* ============================================================
   notifications.js — explicit, per-device breaking-news opt in.

   Push has its own Firebase app and anonymous device identity. It
   does not enable account login or settings synchronisation.
   ============================================================ */

import { PUSH_FIREBASE, PUSH_VAPID_KEY } from "./config.js";

const ENABLED_KEY = "wire.breaking.enabled";
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
  if(auth.currentUser) return auth.currentUser;
  return (await authMod.signInAnonymously(auth)).user;
}

async function worker(){
  if(!("serviceWorker" in navigator)){
    throw new Error("Push notifications are not supported by this browser.");
  }
  await navigator.serviceWorker.register("sw.js");
  return navigator.serviceWorker.ready;
}

async function subscribe(){
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
      updatedAt: firestoreMod.serverTimestamp()
    },
    { merge: true }
  );

  saveEnabled(true);
}

async function unsubscribe(){
  const { firestoreMod, messagingMod } = await loadFirebase();
  const user = await deviceUser();

  await firestoreMod.deleteDoc(
    firestoreMod.doc(db, "pushSubscriptions", user.uid)
  );
  await messagingMod.deleteToken(messaging).catch(() => false);
  saveEnabled(false);
}

function paint(button, status){
  const on = savedEnabled() && "Notification" in window &&
    Notification.permission === "granted";
  button.disabled = busy;
  button.setAttribute("aria-pressed", on ? "true" : "false");
  button.textContent = busy ? "Please wait…" : on ? "Turn off" : "Turn on";
  status.textContent = busy
    ? "Updating this device…"
    : on
      ? "On for this device. Focus and Do Not Disturb remain in control."
      : "Off for this device. Only strictly marked breaking stories can alert you.";
}

export function setup({ announce, onTap }){
  const button = document.getElementById("breaking-toggle");
  const status = document.getElementById("breaking-status");
  if(!button || !status) return;

  paint(button, status);

  onTap(button, async () => {
    if(busy) return;
    busy = true;
    paint(button, status);
    try{
      if(savedEnabled()){
        await unsubscribe();
        announce("Breaking-news notifications are off on this device.", "done");
      }else{
        await subscribe();
        announce("Breaking-news notifications are on for this device.", "done");
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
  if(savedEnabled() && "Notification" in window && Notification.permission === "granted"){
    subscribe().then(() => paint(button, status)).catch(err => {
      console.warn("Could not refresh the notification address.", err);
    });
  }
}
