/* Wire Android native reader adapter. Generated app only, never copied to balita/main.
 * It reads THE SAME public feed main publishes and stores the last complete feed.
 * No news harvesting, credentials or notification token handling runs here.
 */
(function(){
  'use strict';
  const ROOT='https://willyros01.github.io/balita/';
  const STORAGE='DATA';
  function nativeFs(){
    const c=window.Capacitor;
    if(!c||!c.isNativePlatform||!c.isNativePlatform()||
       !c.getPlatform||c.getPlatform()!=='android') return null;
    return c.Plugins&&c.Plugins.Filesystem||null;
  }
  const fs=nativeFs();
  function ensureArticleId(id){return /^[a-z0-9-]{1,100}$/i.test(String(id||''));}
  async function fetchJSON(relative){
    const ctl=new AbortController();
    const timeout=setTimeout(()=>ctl.abort(),12000);
    try{
      const res=await fetch(ROOT+relative,{cache:'no-store',signal:ctl.signal});
      if(!res.ok)throw Error('HTTP '+res.status);
      return await res.json();
    }finally{clearTimeout(timeout);}
  }
  async function readSafe(path){
    if(!fs)return null;
    try{
      const raw=await fs.readFile({path,directory:STORAGE,encoding:'utf8'});
      return JSON.parse(raw.data);
    }catch(e){return null;}
  }
  async function saveSafe(path,data){
    if(!fs)throw Error('Native offline Filesystem plugin is missing');
    // A write completes before cached state is used; no success on failed writes.
    await fs.writeFile({path,directory:STORAGE,data:JSON.stringify(data),encoding:'utf8',recursive:true});
  }
  async function loadFeed(){
    try{
      const data=await fetchJSON('articles.json');
      if(!data||!Array.isArray(data.articles)||!Array.isArray(data.sources)||!data.updated){
        throw Error('Invalid Wire news payload');
      }
      // The news is usable immediately even when local caching fails.
      try{await saveSafe('wire-news-last-good.json',data);}catch(err){
        console.warn('Wire offline copy was not saved',err);
      }
      return data;
    }catch(err){
      const cached=await readSafe('wire-news-last-good.json');
      if(cached&&Array.isArray(cached.articles)&&Array.isArray(cached.sources)&&cached.updated){
        return cached;
      }
      throw Error('Cannot reach Wire news and no offline copy exists: '+(err.message||err));
    }
  }
  async function loadArticle(articleId){
    if(!ensureArticleId(articleId)) return null;
    try{
      const data=await fetchJSON('articles/'+encodeURIComponent(articleId)+'.json');
      if(!data||data.id!==articleId)throw Error('Wrong article identifier');
      return data;
    }catch(err){
      const cached=await readSafe('wire-news-last-good.json');
      return cached?.articles?.find(a=>a.id===articleId)||null;
    }
  }
  // Planned push adapter later invokes app's exact article route.
  // No fake FCM/ADM registration and no fabricated notification delivery.
  window.WireAndroid=Object.freeze({loadFeed,loadArticle,newsBase:ROOT,
      platform:fs?'android':'unsupported'});
})();
