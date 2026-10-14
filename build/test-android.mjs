#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8');
assert.match(read('.github/workflows/feeds.yml'),/branches:\s*\[main\]/);
assert.match(read('.github/workflows/feeds.yml'),/if:\s*github\.ref == 'refs\/heads\/main'/);
const pkg=JSON.parse(read('package.json'));
for(const dep of ['@capacitor/core','@capacitor/android','@capacitor/filesystem','@capacitor/app'])
 assert.ok(pkg.dependencies[dep],dep+' missing');
const cfg=JSON.parse(read('capacitor.config.json'));
assert.equal(cfg.appId,'io.github.willyros01.wire');
assert.equal(cfg.webDir,'www');
assert.match(read('www/app.js'),/window\.WireAndroid\.loadFeed\(\)/);
assert.match(read('www/app.js'),/window\.WireAndroid\.loadArticle\(articleId\)/);
assert.match(read('www/app.js'),/if\(window\.WireAndroid\) return;/);
assert.match(read('www/app.js'),/addListener\("backButton"/);
assert.match(read('www/app.js'),/reader\.close\(ctx\)/);
assert.ok(!read('www/reader.js').includes('back.addEventListener("pointerdown"'));
assert.ok(read('www/reader.js').includes('back.addEventListener("touchend"'));
assert.ok(read('www/reader.js').includes('window.setTimeout('));
assert.ok(read('www/reader.js').includes('el.querySelector(".back") === back'));
assert.match(read('www/app.css'),/touch-action: manipulation/);
assert.match(read('www/reader.js'),/requestAnimationFrame\(\(\) => window\.scrollTo\(0, feedScrollY\)\)/);
assert.match(read('www/notifications.js'),/Amazon Fire ADM or Google Android FCM/);
assert.match(read('www/notifications.js'),/plugin\.available\(\)/);
assert.match(read('www/notifications.js'),/plugin\.register\(\{silent:true\}\)/);
assert.match(read('build/android-build.sh'),/bash build\/wadm\.sh/);
assert.match(read('build/wadm.sh'),/node build\/install-wire-push\.mjs/);
assert.match(read('android-src/native/WirePushPlugin.java'),/A3LMessaging\.getToken\(\)/);
assert.match(read('android-src/native/WirePushPlugin.java'),/void available\(PluginCall call\)/);
assert.match(read('android-src/native/WireMessagingService.java'),/extends A3LMessagingService/);
assert.match(read('www/version.js'),/0\.17\.60/);
assert.equal(fs.existsSync('www/foreground-alerts.mjs'),true);
assert.equal(fs.existsSync('www/foreground.js'),true);
assert.match(read('www/app.js'),/foreground\.setup\(\{/);
assert.match(read('www/app.js'),/state\.filter = story\.source/);
assert.match(read('www/index.html'),/id="foreground-toggle"/);
assert.match(read('www/app.css'),/\.wire-foreground-alert/);
assert.match(read('www/notifications.js'),/Amazon Fire ADM or Google Android FCM/);
assert.match(read('www/notifications.js'),/\['adm','fcm'\]/);
assert.match(read('www/notifications.js'),/pushSubscriptions\//);
assert.match(read('www/android-adapter.js'),/https:\/\/willyros01\.github\.io\/balita\//);
assert.match(read('www/android-adapter.js'),/wire-news-last-good\.json/);
assert.match(read('www/android-adapter.js'),/installRouteHandler/);
assert.match(read('www/android-adapter.js'),/takeRoute\(\)/);
assert.match(read('www/app.js'),/installRouteHandler\(route => resolveAndOpenRoute\(route\)\)/);
assert.equal(fs.existsSync('www/articles.json'),false);
assert.equal(fs.existsSync('www/articles'),false);
assert.equal(fs.existsSync('www/fetch-feeds.mjs'),false);
assert.match(read('build/android-sign.sh'),/WIRE_SIGNING_KEYSTORE_BASE64/);
assert.match(read('build/android-sign.sh'),/WIRE_SIGNING_PASSWORD/);
// Evaluate packaged adapter with mocked Capacitor on a Fire tablet.
let writes=[],remote=0;
const cache={};
const filesystem={
 writeFile:async({path,data})=>{writes.push(path);cache[path]=data;},
 readFile:async({path})=>{if(!cache[path])throw Error('not found');return {data:cache[path]};}
};
let online=true, wrong=false;
const feed={version:'0.17.20',updated:'2026-10-12T20:00:00Z',sources:[{id:'bbc'}],articles:[{id:'bbc-abc123',source:'bbc',title:'Example'}]};
const context={
 window:{Capacitor:{isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{Filesystem:filesystem}},addEventListener:()=>{}},
 document:{addEventListener:()=>{},visibilityState:'visible'},
 AbortController, setTimeout,clearTimeout,JSON,Promise,console,
 fetch:async url=>{remote++;if(!online)throw Error('Offline');return {ok:true,json:async()=>url.includes('/articles/')?{id:wrong?'bad':'bbc-abc123'}:feed}}
};
vm.createContext(context);vm.runInContext(read('www/android-adapter.js'),context);
const api=context.window.WireAndroid;
assert.equal((await api.loadFeed()).articles.length,1);
assert.equal(writes.length,1);
online=false;
assert.equal((await api.loadFeed()).articles.length,1);
assert.equal((await api.loadArticle('bbc-abc123')).id,'bbc-abc123');
assert.equal(await api.loadArticle('../private'),null);
online=true;wrong=true;
assert.equal((await api.loadArticle('bbc-abc123')).id,'bbc-abc123'); // can't display other story
console.log('PASS Wire Android: native bridge, correct feed origin, offline cache, validated article ID, no duplicate fetcher or fake notifications');
