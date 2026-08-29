/* ============================================================
   display.js — the reading controls: text size, high contrast,
   day and night. Self-contained; call setup() once and it takes
   care of the buttons, the announcements and saving.
   ============================================================ */

import { MIN_STEP, MAX_STEP, SCALE, DAY_FROM, DAY_UNTIL } from "./config.js";
import { saveSettings } from "./store.js";

const root = document.documentElement;

let step     = 0;
let high     = false;
let announce = () => {};

/* "auto" follows the clock. "day" and "night" are a deliberate
   choice and are left alone — someone who picks day at nine in the
   evening wants day, and should not be argued with an hour later. */
let mode = "auto";

function byTheClock(){
  const h = new Date().getHours();
  return (h >= DAY_FROM && h < DAY_UNTIL) ? "day" : "night";
}

function showing(){
  return mode === "auto" ? byTheClock() : mode;
}

let elSmaller, elBigger, elContrast, elTheme;

/* ---------------- applying ---------------- */

function applyAll(){
  /* --base drives every size in the app. --step is exposed too, so
     the stylesheet can rearrange the layout at the largest sizes
     where margins and thumbnails stop earning their space. */
  root.style.setProperty("--base", SCALE[step] + "px");
  root.style.setProperty("--step", step);
  root.dataset.step = String(step);

  const now = showing();
  root.dataset.theme    = now;
  root.dataset.contrast = high ? "high" : "normal";

  if(elSmaller) elSmaller.disabled = step <= MIN_STEP;
  if(elBigger)  elBigger.disabled  = step >= MAX_STEP;

  if(elContrast) elContrast.setAttribute("aria-pressed", String(high));

  if(elTheme){
    elTheme.querySelector(".glyph").textContent = now === "night" ? "\u2600" : "\u263E";
    elTheme.dataset.mode = mode;
    elTheme.setAttribute("aria-pressed", String(mode === "night"));
    elTheme.setAttribute("aria-label",
      mode === "auto"  ? "Following the clock. Tap for day."  :
      mode === "day"   ? "Day. Tap for night."                :
                         "Night. Tap to follow the clock.");
  }
}

function hour(h){
  const d = new Date();
  d.setHours(h, 0, 0, 0);
  return d.toLocaleTimeString(undefined, { hour: "numeric" });
}

function persist(){
  saveSettings({ step, high, mode });
}

/* ---------------- public ---------------- */

export function setup(opts){
  announce = opts.announce || announce;

  elSmaller  = document.getElementById("smaller");
  elBigger   = document.getElementById("bigger");
  elContrast = document.getElementById("contrast");
  elTheme    = document.getElementById("theme");

  const saved = opts.settings || {};

  step = Number.isInteger(saved.step) ? saved.step : 0;
  high = saved.high === true;

  if(saved.mode === "auto" || saved.mode === "day" || saved.mode === "night"){
    mode = saved.mode;
  }else if(typeof saved.night === "boolean"){
    /* Carried over from before there was an automatic setting. */
    mode = saved.night ? "night" : "day";
  }else{
    mode = "auto";
  }

  elBigger.addEventListener("click", () => {
    if(step >= MAX_STEP) return;
    step++; applyAll(); persist();
    announce("Text size " + (step + 1) + " of " + (MAX_STEP + 1));
  });

  elSmaller.addEventListener("click", () => {
    if(step <= MIN_STEP) return;
    step--; applyAll(); persist();
    announce("Text size " + (step + 1) + " of " + (MAX_STEP + 1));
  });

  elContrast.addEventListener("click", () => {
    high = !high; applyAll(); persist();
    announce(high ? "High contrast on" : "High contrast off");
  });

  elTheme.addEventListener("click", () => {
    mode = mode === "auto" ? "day" : mode === "day" ? "night" : "auto";
    applyAll(); persist();

    announce(
      mode === "auto"
        ? "Following the clock \u2014 " + (showing() === "day"
            ? "day until " + hour(DAY_UNTIL)
            : "night until " + hour(DAY_FROM))
        : mode === "day" ? "Day, until you change it"
                         : "Night, until you change it"
    );
  });

  /* The app sits open for hours. Recheck when it comes back into
     view rather than running a timer nobody watches. */
  document.addEventListener("visibilitychange", () => {
    if(!document.hidden && mode === "auto") applyAll();
  });

  applyAll();
}
