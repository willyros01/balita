import test from "node:test";
import assert from "node:assert/strict";
import {JSDOM} from "jsdom";
import {setup} from "./foreground.js";
const drain=async()=>{await new Promise(resolve=>setTimeout(resolve,0));};
test("option 2 opt-in, breaking-only check, read routing, no duplicates, disable",async()=>{
 const dom=new JSDOM('<body data-view="feed"><section class="breaking"><button id="foreground-toggle">Turn on</button><p id="foreground-status"></p></section></body>',{url:"https://localhost",pretendToBeVisual:true});
 const doc=dom.window.document;
 const prev={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
 const originalInterval=globalThis.setInterval;
 globalThis.window=dom.window;globalThis.document=doc;globalThis.localStorage=dom.window.localStorage;
 let handler=null,loaded=0,opened=[],announced=[],articles=[];
 globalThis.setInterval=fn=>{handler=fn;return 1;};
 const onTap=(element,fn)=>element.addEventListener("click",fn);
 const news={id:"bbc-new",title:"BREAKING: New publisher headline",source:"bbc",published:new Date().toISOString()};
 try{
  setup({announce:x=>announced.push(x),onTap,snapshot:()=>({articles}),
    refreshNews:async()=>{loaded++;},openArticle:id=>{opened.push(id);return true;}});
  const toggle=doc.getElementById("foreground-toggle");
  assert.equal(toggle.textContent,"Turn on");
  assert.equal(doc.querySelector(".wire-foreground-alert").hidden,true);
  toggle.click(); await drain();
  assert.equal(toggle.textContent,"Turn off");
  assert.ok(handler,"two-minute interval installed");
  articles=[news];
  await handler(); await drain();
  const banner=doc.querySelector(".wire-foreground-alert");
  assert.equal(banner.hidden,false);
  assert.ok(banner.textContent.includes("New publisher headline"));
  await handler(); await drain();
  assert.equal(doc.querySelectorAll(".wire-foreground-alert").length,1);
  const read=[...banner.querySelectorAll("button")].find(x=>x.textContent==="Read story");
  read.click();
  assert.deepEqual(opened,["bbc-new"]);
  assert.equal(banner.hidden,true);
  await handler(); await drain();
  assert.equal(banner.hidden,true);
  toggle.click(); await drain();
  assert.equal(toggle.textContent,"Turn on");
  assert.match(doc.getElementById("foreground-status").textContent,/OFF/);
  articles=[{...news,id:"bbc-other"}];
  await handler(); await drain();
  assert.equal(banner.hidden,true);
  assert.ok(loaded>=3);
 }finally{
  globalThis.window=prev.window;globalThis.document=prev.document;globalThis.localStorage=prev.localStorage;
  globalThis.setInterval=originalInterval;dom.window.close();
 }
});
