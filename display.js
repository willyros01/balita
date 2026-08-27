/* ============================================================
   display.js — the reading controls: text size, high contrast,
   day and night. Self-contained; call setup() once and it takes
   care of the buttons, the announcements and saving.
   ============================================================ */

import { MIN_STEP, MAX_STEP } from "./config.js";
import { saveSettings } from "./store.js";

const root = document.documentElement;

let step     = 0;
let night    = false;
let high     = false;
let announce = () => {};

let elSmaller, elBigger, elContrast, elTheme;

/* ---------------- applying ---------------- */

function applyAll(){
  root.style.setProperty("--step", step);
  root.dataset.theme    = night ? "night" : "day";
  root.dataset.contrast = high  ? "high"  : "normal";

  if(elSmaller) elSmaller.disabled = step <= MIN_STEP;
  if(elBigger)  elBigger.disabled  = step >= MAX_STEP;

  if(elContrast) elContrast.setAttribute("aria-pressed", String(high));

  if(elTheme){
    elTheme.setAttribute("aria-pressed", String(night));
    elTheme.querySelector(".glyph").textContent = night ? "\u2600" : "\u263E";
    elTheme.setAttribute("aria-label", night ? "Day mode" : "Night mode");
  }
}

function persist(){
  saveSettings({ step, night, high });
}

/* ---------------- public ---------------- */

export function setup(opts){
  announce = opts.announce || announce;

  elSmaller  = document.getElementById("smaller");
  elBigger   = document.getElementById("bigger");
  elContrast = document.getElementById("contrast");
  elTheme    = document.getElementById("theme");

  const saved = opts.settings || {};

  step  = Number.isInteger(saved.step) ? saved.step : 0;
  high  = saved.high === true;

  /* If the reader has never chosen, follow whatever the phone
     or laptop is already set to. */
  night = typeof saved.night === "boolean"
    ? saved.night
    : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);

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
    night = !night; applyAll(); persist();
    announce(night ? "Night mode on" : "Day mode on");
  });

  applyAll();
}
