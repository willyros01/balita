import assert from "node:assert/strict";
import test from "node:test";
import {JSDOM} from "jsdom";
import {setup} from "./notifications-foreground.js";
const now=()=>new Date().toISOString();
const a=(id,title="BREAKING: Test article")=>({id,title,source:"bbc",published:now()});
const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
test("Android in-app alerts enable, read exact story, deduplicate, disable",async()=>{
 const dom=new JSDOM('<!doctype html><body data-view="feed"><button id="breaking-toggle"></button><p id="breaking-status"></p></body>',{url:"https://localhost/",pretendToBeVisual:true});
 const old={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,setInterval:globalThis.setInterval};
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=dom.window.localStorage;
 let recurring;globalThis.setInterval=(fn,ms)=>{assert.equal(ms,120000);recurring=fn;return 1;};
 try{
  const state={articles:[a("bbc-1")]};
  let next=[];
  const opened=[],messages=[];
  const refreshNews=async()=>{state.articles=[...state.articles,...next];next=[];};
  const button=document.getElementById("breaking-toggle");
  setup({announce:(msg)=>messages.push(msg),onTap:(el,fn)=>el.addEventListener("click",fn),
   snapshot:()=>state,refreshNews,
   openArticle:id=>{opened.push(id);document.body.dataset.view="reader";return true;}});
  assert.equal(button.disabled,false);
  assert.equal(button.getAttribute("aria-pressed"),"false");
  assert.match(document.getElementById("breaking-status").textContent,/OFF/);
  button.click();await tick();
  assert.equal(button.getAttribute("aria-pressed"),"true");
  assert.ok(document.querySelector(".wire-foreground-alert").hidden);
  next=[a("bbc-2")];await recurring();await tick();
  const panel=document.querySelector(".wire-foreground-alert");
  assert.equal(panel.hidden,false);
  assert.match(panel.textContent,/BREAKING: Test article/);
  panel.querySelector("button").click();await tick();
  assert.deepEqual(opened,["bbc-2"]);
  assert.equal(panel.hidden,true);
  await recurring();await tick();
  assert.equal(panel.hidden,true,"already-seen article must not re-alert");
  button.click();await tick();
  assert.equal(button.getAttribute("aria-pressed"),"false");
  next=[a("bbc-3")];await recurring();await tick();
  assert.equal(panel.hidden,true,"disabled alerts must remain disabled");
 }finally{
  globalThis.document=old.document;globalThis.window=old.window;
  globalThis.localStorage=old.localStorage;globalThis.setInterval=old.setInterval;
  dom.window.close();
 }
});
