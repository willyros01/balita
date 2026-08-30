/* ============================================================
   ui.js — telling the reader what just happened.

   Until 0.8.0 every message in this app went into a hidden
   element meant for screen readers. Nothing was ever shown. A tap
   on Restore did arm the button and did say so — silently. From
   the outside it looked like nothing worked.

   Two things here, and both are visible:
     toast()    a short line confirming what happened
     confirm()  a real question with two buttons
   ============================================================ */

let toastEl = null;
let toastTimer = null;
let liveEl = null;

function ensure(){
  if(!toastEl){
    toastEl = document.createElement("div");
    toastEl.className = "toast";
    toastEl.setAttribute("role", "status");
    toastEl.setAttribute("aria-live", "polite");
    toastEl.hidden = true;
    document.body.appendChild(toastEl);
  }
  if(!liveEl) liveEl = document.getElementById("announce");
}

/* ---------------- toast ---------------- */

/* kind: "done" | "undone" | "warn" */
export function toast(message, kind = "done", action){
  ensure();
  window.clearTimeout(toastTimer);

  toastEl.className = "toast toast-" + kind;
  toastEl.innerHTML = "";

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  toastEl.appendChild(text);

  if(action && action.label && typeof action.onTap === "function"){
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = action.label;
    btn.addEventListener("click", () => {
      hide();
      action.onTap();
    });
    toastEl.appendChild(btn);
  }

  toastEl.hidden = false;
  /* next frame, so the transition actually runs */
  window.requestAnimationFrame(() => toastEl.classList.add("toast-in"));

  /* An offer to undo needs longer than a plain confirmation. */
  toastTimer = window.setTimeout(hide, action ? 9000 : 3800);

  /* Screen readers get it too, as they always did. */
  if(liveEl){
    liveEl.textContent = "";
    window.setTimeout(() => { liveEl.textContent = message; }, 40);
  }
}

function hide(){
  if(!toastEl) return;
  toastEl.classList.remove("toast-in");
  window.setTimeout(() => { if(toastEl) toastEl.hidden = true; }, 200);
}

/* ---------------- confirm ----------------
   Replaces the arm-and-wait button, which disarmed itself after
   five seconds. Tapping it repeatedly re-armed and disarmed it
   forever, so it could never actually fire. A question with two
   buttons cannot fail that way. */

export function confirm(opts){
  return new Promise(resolve => {
    const backdrop = document.createElement("div");
    backdrop.className = "sheet-backdrop";

    const sheet = document.createElement("div");
    sheet.className = "sheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-modal", "true");
    sheet.setAttribute("aria-labelledby", "sheet-title");

    const h = document.createElement("h2");
    h.className = "sheet-title";
    h.id = "sheet-title";
    h.textContent = opts.title;

    const p = document.createElement("p");
    p.className = "sheet-body";
    p.textContent = opts.body || "";

    const row = document.createElement("div");
    row.className = "sheet-row";

    const no = document.createElement("button");
    no.type = "button";
    no.className = "sheet-btn sheet-no";
    no.textContent = opts.cancelLabel || "Cancel";

    const yes = document.createElement("button");
    yes.type = "button";
    yes.className = "sheet-btn " + (opts.danger ? "sheet-danger" : "sheet-yes");
    yes.textContent = opts.confirmLabel || "Yes";

    row.append(no, yes);
    sheet.append(h);
    if(opts.body) sheet.append(p);
    sheet.append(row);
    backdrop.appendChild(sheet);
    document.body.appendChild(backdrop);

    const previously = document.activeElement;

    const close = answer => {
      document.removeEventListener("keydown", onKey);
      backdrop.remove();
      if(previously && previously.focus) previously.focus();
      resolve(answer);
    };

    const onKey = e => {
      if(e.key === "Escape") close(false);
      /* Keep the keyboard inside the dialog while it is open. */
      if(e.key === "Tab"){
        const items = [no, yes];
        const i = items.indexOf(document.activeElement);
        e.preventDefault();
        items[(i + (e.shiftKey ? items.length - 1 : 1)) % items.length].focus();
      }
    };

    no.addEventListener("click", () => close(false));
    yes.addEventListener("click", () => close(true));
    backdrop.addEventListener("click", e => { if(e.target === backdrop) close(false); });
    document.addEventListener("keydown", onKey);

    window.requestAnimationFrame(() => {
      backdrop.classList.add("sheet-in");
      no.focus();   /* the safe option, not the destructive one */
    });
  });
}
