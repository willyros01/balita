import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {open} from '../www/reader.js';

// Tests of the GENERATED Android reader, including an entire Fire touch:
// the old pointerdown patch changed to feed before pointerup, allowing
// the remaining finger event to open the feed card underneath.
function setup(filter='bbc'){
 const dom=new JSDOM('<body data-view="feed"><button id="card"></button><article id="reader" tabindex="-1"></article></body>',{url:'https://localhost',pretendToBeVisual:true});
 const saved={window:globalThis.window,document:globalThis.document};
 globalThis.window=dom.window;globalThis.document=dom.window.document;
 let scroll=210,closed=0,refreshes=0;
 const tasks=[];
 Object.defineProperty(dom.window,'scrollY',{get:()=>scroll,configurable:true});
 dom.window.scrollTo=(_x,y)=>{scroll=y;};
 dom.window.requestAnimationFrame=cb=>cb();
 dom.window.setTimeout=cb=>{tasks.push(cb);return tasks.length;};
 const ctx={
  state:{filter,articles:[{id:'bbc-wire-1',source:'bbc',title:'Fire test story',published:'2026-10-13T22:00:00Z',summary:'Text'}]},
  sourceOf:id=>id==='bbc'?{id:'bbc',name:'BBC World',color:'#222',tag:'BBC'}:null,
  show:view=>{dom.window.document.body.dataset.view=view;if(view==='feed')closed++;},
  refresh:()=>{refreshes++;},announce:()=>{}
 };
 const openStory=()=>{
  open(ctx,'bbc-wire-1');assert.equal(dom.window.document.body.dataset.view,'reader');
  const back=dom.window.document.querySelector('.back');
  assert.ok(back);assert.match(back.textContent,/BBC World headlines/);
  return back;
 };
 const fire=(target,type,pointerType='touch',button=0)=>{
  const evt=new dom.window.Event(type,{bubbles:true,cancelable:true});
  Object.defineProperties(evt,{pointerType:{value:pointerType},button:{value:button}});
  target.dispatchEvent(evt);
 };
 const flush=()=>{let limit=12;while(tasks.length){if(--limit===0)throw Error('back timer loop');tasks.shift()();}};
 const card=dom.window.document.querySelector('#card');
 card.addEventListener('pointerup',()=>{if(dom.window.document.body.dataset.view==='feed')openStory();});
 return {dom,ctx,openStory,fire,flush,card,closed:()=>closed,scroll:()=>scroll,refreshes:()=>refreshes,
  done:()=>{globalThis.window=saved.window;globalThis.document=saved.document;dom.window.close();}};
}
test('pointerdown alone never navigates; pointercancel does not navigate',()=>{
 const t=setup();try{
  const b=t.openStory();t.fire(b,'pointerdown');t.fire(b,'pointercancel');t.flush();
  assert.equal(t.dom.window.document.body.dataset.view,'reader');assert.equal(t.closed(),0);
 }finally{t.done();}
});
test('a complete touch cannot release over a now-exposed feed card',()=>{
 const t=setup();try{
  const b=t.openStory();t.fire(b,'pointerdown');
  const released=t.dom.window.document.body.dataset.view==='feed'?t.card:b;
  t.fire(released,'pointerup');t.flush();
  assert.equal(t.dom.window.document.body.dataset.view,'feed');
  assert.equal(t.closed(),1);assert.equal(t.scroll(),210);
 }finally{t.done();}
});
test('Fire pointerup works when no click is delivered',()=>{
 const t=setup();try{
  t.fire(t.openStory(),'pointerup');
  assert.equal(t.dom.window.document.body.dataset.view,'reader');t.flush();
  assert.equal(t.dom.window.document.body.dataset.view,'feed');assert.equal(t.closed(),1);
 }finally{t.done();}
});
test('Fire touchend works without pointerup or click',()=>{
 const t=setup();try{t.fire(t.openStory(),'touchend');t.flush();assert.equal(t.closed(),1);}finally{t.done();}
});
test('pointerdown pointerup touchend click make one return only',()=>{
 const t=setup();try{
  const b=t.openStory();
  for(const ev of ['pointerdown','pointerup','touchend','click'])t.fire(b,ev);
  assert.equal(t.dom.window.document.body.dataset.view,'reader');
  t.flush();assert.equal(t.closed(),1);
 }finally{t.done();}
});
test('keyboard click alone returns to headlines',()=>{
 const t=setup();try{t.fire(t.openStory(),'click','',0);t.flush();assert.equal(t.closed(),1);}finally{t.done();}
});
test('nonprimary mouse pointerup and click cannot close',()=>{
 const t=setup();try{
  const b=t.openStory();t.fire(b,'pointerup','mouse',2);t.fire(b,'click','mouse',2);t.flush();
  assert.equal(t.closed(),0);assert.equal(t.dom.window.document.body.dataset.view,'reader');
 }finally{t.done();}
});
test('old queued Back cannot close a subsequently reopened article',()=>{
 const t=setup();try{
  t.fire(t.openStory(),'pointerup');t.openStory();t.flush();
  assert.equal(t.closed(),0);assert.equal(t.dom.window.document.body.dataset.view,'reader');
 }finally{t.done();}
});
test('each fresh Back works after opening another article',()=>{
 const t=setup();try{
  t.fire(t.openStory(),'pointerup');t.flush();
  t.fire(t.openStory(),'pointerup');t.flush();
  assert.equal(t.closed(),2);
 }finally{t.done();}
});
test('All Sources opens publisher headlines for Back rather than mixed feed',()=>{
 const t=setup('ALL');try{
  t.fire(t.openStory(),'pointerup');t.flush();
  assert.equal(t.ctx.state.filter,'bbc');assert.equal(t.refreshes(),1);
  assert.equal(t.closed(),1);
 }finally{t.done();}
});
