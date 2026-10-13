/* Android Option 2: breaking-news checks only while Wire is visible.
 * This is an in-app alert, NOT a device/background push notification.
 * Native ADM/FCM implementation is retained separately for later.
 */
import {POLL_MS,idsOf,discover} from "./foreground-alerts.mjs";
const ENABLE="wire.foreground.enabled.v1";
const NATIVE="wire.push.android.enabled.v1";
const SEEN="wire.foreground.seen.v1";
let active=false,known=[],pending=[],working=false,shown=false;
const get=(key)=>{try{return localStorage.getItem(key);}catch(_){return null;}};
const set=(key,val)=>{try{localStorage.setItem(key,val);return true;}catch(_){return false;}};
function baseline(snapshot){
  known=idsOf(snapshot().articles).slice(-1500);
  set(SEEN,JSON.stringify(known));
}
function restore(snapshot){
  const raw=get(SEEN);
  if(!raw){baseline(snapshot);return;}
  try{
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed)||!parsed.every(x=>typeof x==="string")){
      baseline(snapshot);return;
    }
    known=parsed.slice(-1500);
  }catch(_){baseline(snapshot);}
}
function alertPanel(onTap,openArticle,announce){
  const panel=document.createElement("aside");
  panel.className="wire-foreground-alert";
  panel.setAttribute("role","alert");
  panel.hidden=true;
  const lead=document.createElement("strong");
  lead.textContent="BREAKING NEWS";
  const story=document.createElement("p");
  story.className="wire-foreground-headline";
  const controls=document.createElement("div");
  controls.className="wire-foreground-buttons";
  const read=document.createElement("button");
  read.type="button";read.textContent="Read story";
  const dismiss=document.createElement("button");
  dismiss.type="button";dismiss.textContent="Dismiss";
  controls.append(read,dismiss);
  panel.append(lead,story,controls);
  document.body.appendChild(panel);
  const render=()=>{
    if(!active||!pending.length||document.body.dataset.view!=="feed"){panel.hidden=true;shown=false;return;}
    if(shown)return;
    const next=pending[0];
    story.textContent=next.title;
    panel.hidden=false;shown=true;
  };
  const advance=()=>{
    pending.shift();shown=false;panel.hidden=true;
    // Do not instantly cover the article with a second alert.
    if(document.body.dataset.view==="feed")render();
  };
  onTap(read,()=>{
    if(!pending.length)return;
    const id=pending[0].id;
    advance();
    if(!openArticle(id))announce("The story is no longer in the current headlines.","warn");
  });
  onTap(dismiss,advance);
  return {render,clear:()=>{pending=[];shown=false;panel.hidden=true;}};
}
export function setup({announce,onTap,snapshot,refreshNews,openArticle}){
  const button=document.getElementById("foreground-toggle");
  const status=document.getElementById("foreground-status");
  if(!button||!status||!snapshot||!refreshNews||!openArticle)return;
  active=get(ENABLE)==="true";
  restore(snapshot);
  const alert=alertPanel(onTap,openArticle,announce);
  const nativeEnabled=()=>get(NATIVE)==="true";
  const paint=()=>{
    button.disabled=false;
    button.setAttribute("aria-pressed",String(active));
    button.textContent=active?"Turn off":"Turn on";
    status.textContent=active
      ? nativeEnabled()?"Foreground fallback paused because native notifications are ON.":
       "On-screen breaking alerts ON. Checks every 2 minutes while Wire is open. No alerts when closed."
      :"On-screen breaking alerts OFF. Works while Wire is open; no Amazon setup required.";
  };
  paint();
  const tick=async()=>{
    if(!active||working||document.visibilityState!=="visible")return;
    if(nativeEnabled()){
      // When system push is enabled, this fallback stays quiet and
      // baselines known marked headlines to avoid duplicate notifications.
      alert.clear();baseline(snapshot);paint();return;
    }
    working=true;
    try{
      // Use the SAME news reader/cache as the existing app; no second fetcher.
      await refreshNews();
      if(!active)return;
      const result=discover(snapshot().articles,known);
      known=result.seen;
      set(SEEN,JSON.stringify(known)); // record before display; no duplicate alert
      const queued=new Set(pending.map(a=>a.id));
      for(const item of result.alerts){
        if(!queued.has(item.id)){pending.push(item);queued.add(item.id);}
      }
      pending=pending.slice(-10);
      alert.render();
    }catch(err){
      console.warn("Wire on-screen breaking check failed; next check will retry",err);
    }finally{working=false;}
  };
  onTap(button,()=>{
    active=!active;
    set(ENABLE,String(active));
    if(active){
      // Each activation starts from what is already visible; no backlog flood.
      baseline(snapshot);
      announce("On-screen breaking alerts enabled while Wire is open.","done");
      void tick();
    }else{
      alert.clear();
      announce("On-screen breaking alerts turned off.","done");
    }
    paint();
  });
  setInterval(()=>void tick(),POLL_MS);
  document.addEventListener("visibilitychange",()=>{
    if(document.visibilityState==="visible")void tick();
  });
  window.addEventListener("online",()=>void tick());
  // Show any queued alert after returning to the headlines view.
  document.addEventListener("click",()=>setTimeout(()=>alert.render(),0));
}
