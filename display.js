/* ============================================================
   display.js — the reading controls: text size, high contrast,
   day and night. Self-contained; call setup() once and it takes
   care of the buttons, the announcements and saving.
   ============================================================ */

import { MIN_STEP, MAX_STEP, SCALE, DAY_FROM, DAY_UNTIL,
         LATITUDE, LONGITUDE } from "./config.js";
import { daylight, sunTimes } from "./sun.js";
import { onTap } from "./ui.js";
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
  return daylight(new Date(), LATITUDE, LONGITUDE, DAY_FROM, DAY_UNTIL);
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

function clockTime(d){
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/* Say when it will change, using the real times rather than a rule
   of thumb. Somebody who knows sunset is at ten past six should see
   ten past six. */
function followingText(){
  const now = new Date();
  const t = sunTimes(now, LATITUDE, LONGITUDE);
  if(!t) return "Following the clock";

  return showing() === "day"
    ? "Following the sun \u2014 night at " + clockTime(t.sunset)
    : "Following the sun \u2014 day at " + clockTime(t.sunrise);
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

  onTap(elBigger, () => {
    if(step >= MAX_STEP) return;
    step++; applyAll(); persist();
    announce("Text size " + (step + 1) + " of " + (MAX_STEP + 1));
  });

  onTap(elSmaller, () => {
    if(step <= MIN_STEP) return;
    step--; applyAll(); persist();
    announce("Text size " + (step + 1) + " of " + (MAX_STEP + 1));
  });

  onTap(elContrast, () => {
    high = !high; applyAll(); persist();
    announce(high ? "High contrast on" : "High contrast off");
  });

  onTap(elTheme, () => {
    mode = mode === "auto" ? "day" : mode === "day" ? "night" : "auto";
    applyAll(); persist();

    announce(mode === "auto" ? followingText()
           : mode === "day"  ? "Day, until you change it"
                             : "Night, until you change it");
  });

  /* The app sits open for hours. Recheck when it comes back into
     view rather than running a timer nobody watches. */
  document.addEventListener("visibilitychange", () => {
    if(!document.hidden && mode === "auto") applyAll();
  });

  applyAll();
}
