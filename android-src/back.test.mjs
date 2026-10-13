import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {open} from '../www/reader.js';

// Fire HD 8 regression: WebView may emit pointerup without click after reflow.
// Test the GENERATED Android reader, not untouched production reader.js.
function harness(){
  const dom=new JSDOM('<body data-view="feed"><article id="reader" tabindex="-1"></article></body>',{
    url:'https://localhost',pretendToBeVisual:true
  });
  const saved={window:globalThis.window,document:globalThis.document};
  globalThis.window=dom.window;
  globalThis.document=dom.window.document;
  let y=210,closed=0;
  Object.defineProperty(dom.window,'scrollY',{get:()=>y,configurable:true});
  dom.window.scrollTo=(_x,next)=>{y=next;};
  dom.window.requestAnimationFrame=cb=>cb();
  const ctx={
    state:{filter:'bbc',articles:[{
      id:'bbc-wire-1',source:'bbc',title:'A marked article',
      published:'2026-10-13T22:00:00Z',summary:'Example story'
    }]},
    sourceOf:id=>id==='bbc'?{id:'bbc',name:'BBC World',color:'#222',tag:'BBC'}:null,
    show:view=>{dom.window.document.body.dataset.view=view;if(view==='feed')closed++;},
    announce:()=>{}
  };
  const back=()=>{
    open(ctx,'bbc-wire-1');
    assert.equal(dom.window.document.body.dataset.view,'reader');
    const button=dom.window.document.querySelector('#reader .back');
    assert.ok(button);
    assert.match(button.textContent,/BBC World headlines/);
    return button;
  };
  const fire=(el,type,pointerType='touch',button=0)=>{
    const evt=new dom.window.Event(type,{bubbles:true,cancelable:true});
    Object.defineProperties(evt,{pointerType:{value:pointerType},button:{value:button}});
    el.dispatchEvent(evt);
  };
  return {dom,ctx,back,fire,getCloseCount:()=>closed,scroll:()=>y,done:()=>{
    globalThis.window=saved.window;globalThis.document=saved.document;
    dom.window.close();
  }};
}
test('Fire-only pointerup without click returns to publisher headlines',()=>{
 const t=harness();try{
  const btn=t.back();
  t.fire(btn,'pointerup');
  assert.equal(t.dom.window.document.body.dataset.view,'feed');
  assert.equal(t.getCloseCount(),1);
  assert.equal(t.ctx.state.filter,'bbc');
  assert.equal(t.scroll(),210);
 }finally{t.done();}
});
test('pointerdown, pointerup, click from one touch closes exactly once',()=>{
 const t=harness();try{
  const btn=t.back();
  for(const type of ['pointerdown','pointerup','click'])t.fire(btn,type);
  assert.equal(t.getCloseCount(),1);
  assert.equal(t.dom.window.document.body.dataset.view,'feed');
 }finally{t.done();}
});
test('keyboard/accessibility click works without any pointer event',()=>{
 const t=harness();try{
  const btn=t.back();
  t.fire(btn,'click','',0);
  assert.equal(t.getCloseCount(),1);
 }finally{t.done();}
});
test('nonprimary mouse button does not close reader',()=>{
 const t=harness();try{
  const btn=t.back();
  t.fire(btn,'pointerdown','mouse',2);
  assert.equal(t.dom.window.document.body.dataset.view,'reader');
  t.fire(btn,'pointerdown','touch',0);
  assert.equal(t.getCloseCount(),1);
 }finally{t.done();}
});
test('after reopening another article, fresh Back control works again',()=>{
 const t=harness();try{
  t.fire(t.back(),'pointerup');
  t.fire(t.back(),'pointerup');
  assert.equal(t.getCloseCount(),2);
 }finally{t.done();}
});
