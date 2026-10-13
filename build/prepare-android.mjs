#!/usr/bin/env node
// Android-only packaging: read live Wire shell, never package or alter fetched news.
// All modifications happen exclusively in generated www/ on balita/android.
import fs from 'node:fs';
import path from 'node:path';
const files=[
 'index.html','app.css','app.js','config.js','display.js','feed.js','reader.js',
 'sources.js','store.js','lock.js','sun.js','sw.js','notifications.js','ui.js',
 'tokens.css','version.js','manifest.webmanifest','sources.json',
 'icon-180.png','icon-192.png','icon-512.png','icon-maskable-512.png'
];
fs.rmSync('www',{recursive:true,force:true});fs.mkdirSync('www');
for(const file of files){
 if(!fs.existsSync(file)) throw Error('Missing original Wire shell: '+file);
 fs.copyFileSync(file,path.join('www',file));
}
for(const file of ['android-src/android-adapter.js','android-src/notifications.js']){
 if(!fs.existsSync(file)) throw Error('Missing Android adapter '+file);
}
const sub=(file,from,to)=>{
 const p=path.join('www',file),s=fs.readFileSync(p,'utf8');
 if(s.split(from).length!==2)throw Error('Unsafe Android patch '+file+': '+from.slice(0,60));
 fs.writeFileSync(p,s.replace(from,to));
};
sub('index.html','<script type="module" src="app.js"></script>',
  '<script src="android-adapter.js"></script>\n<script type="module" src="app.js"></script>');
sub('app.js','const res = await fetch(feedUrl, { cache: "no-store" });\n    if(!res.ok) throw new Error("HTTP " + res.status);\n\n    const data = await res.json();',
  'const data = await window.WireAndroid.loadFeed();');
sub('app.js','const response = await fetch(url, { cache: "no-store" });\n    if(!response.ok) return null;\n\n    const article = await response.json();',
  'const article = await window.WireAndroid.loadArticle(articleId);\n    if(!article) return null;');

// Only after the feed is ready may an explicit native notification tap
// resolve its exact article ID. Cold-start and resume paths share this.
sub('app.js','  await loadArticles();\n\n  /* Only sends the reader back',
  '  await loadArticles();\n  if(window.WireAndroid?.installRouteHandler) window.WireAndroid.installRouteHandler(route => resolveAndOpenRoute(route));\n\n  /* Only sends the reader back');

sub('app.js','function registerWorker(){\n','function registerWorker(){\n  if(window.WireAndroid) return; // no service worker under Capacitor localhost\n');

// Android-only navigation: use immediate pointerdown for the in-page Back
// control, plus click for keyboard/accessibility, guarded by actual view state.
// The native hardware Back listener uses the SAME reader.close() function.
sub('reader.js','onTap(back, () => close(ctx));',`
  // Fire HD 8 may deliver pointerup without a click when the WebView reflows.
  // Keep the previously accepted early pointerdown and restore Wire's shared
  // pointerup/click fallback; the reader state guard ensures one close only.
  const returnToHeadlines = event => {
    if (event.type === "pointerdown" && event.pointerType === "mouse" &&
        event.button !== 0) return;
    if (document.body.dataset.view !== "reader") return;
    if (event.cancelable) event.preventDefault();
    close(ctx);
  };
  back.addEventListener("pointerdown", returnToHeadlines);
  onTap(back, returnToHeadlines);`);
sub('reader.js','  window.scrollTo(0, feedScrollY);',
  '  requestAnimationFrame(() => window.scrollTo(0, feedScrollY));');
sub('app.js','/* ---------------- stories ---------------- */',`/* Android system Back routes to the same in-app navigation as the visible
   Back button; never let WebView leave the bundled app unexpectedly. */
if (window.WireAndroid) {
  const nativeApp = window.Capacitor?.Plugins?.App;
  if (!nativeApp?.addListener) throw Error("Missing Capacitor App Back handler");
  nativeApp.addListener("backButton", () => {
    const view = document.body.dataset.view;
    if (view === "reader") reader.close(ctx);
    else if (view === "manage") ctx.show("feed");
    else window.Capacitor?.Plugins?.App?.minimizeApp?.();
  });
}
/* ---------------- stories ---------------- */`);

/* Version is Android-only. Production Web Wire stays at its own version. */

/* Fallback only: never modify/replace native ADM or FCM configuration. */
sub('index.html','<section class="breaking" aria-labelledby="breaking-title">',`
<section class="breaking wire-foreground-setting" aria-labelledby="foreground-title">
  <div class="breaking-copy">
    <h2 id="foreground-title">Alerts while Wire is open</h2>
    <p id="foreground-status">Optional on-screen alerts. No background alerts.</p>
  </div>
  <button class="primary breaking-toggle" id="foreground-toggle" type="button" aria-pressed="false">Turn on</button>
</section>
<section class="breaking" aria-labelledby="breaking-title">`);
sub('app.js','import * as notifications from "./notifications.js";',
  'import * as notifications from "./notifications.js";\\nimport * as foreground from "./foreground.js";'.replace('\\n','\n'));
sub('app.js','  notifications.setup({ announce, onTap });',`
  notifications.setup({ announce, onTap });
  foreground.setup({
    announce, onTap,
    snapshot: () => ({ articles: state.articles }),
    refreshNews: async () => { await loadArticles(); ctx.refresh(); },
    openArticle: id => {
      const story = state.articles.find(a => a.id === id);
      if(!story) return false;
      state.filter = story.source;
      ctx.refresh();
      ctx.openArticle(id);
      return true;
    }
  });`);
fs.copyFileSync('android-src/foreground-alerts.mjs','www/foreground-alerts.mjs');
fs.copyFileSync('android-src/foreground.js','www/foreground.js');
fs.appendFileSync('www/app.css',fs.readFileSync('android-src/foreground-alert.css','utf8'));
fs.appendFileSync('www/app.css', '\\n/* Fire HD 8 Back: preserve a large hit target; avoid gesture-related cancellation. */\\n.back { touch-action: manipulation; min-height: max(var(--tap), 3.2rem); }\\n'.replaceAll('\\n','\n'));
sub('version.js','export const VERSION    = "0.17.54";',
  'export const VERSION    = "0.17.59";');
sub('version.js','export const BUILD_DATE = "2026-09-23";',
  'export const BUILD_DATE = "2026-10-13";');
fs.copyFileSync('android-src/android-adapter.js','www/android-adapter.js');
fs.copyFileSync('android-src/notifications.js','www/notifications.js');
// Explicitly prevent shipping an old news feed in the APK. Always use live main.
if(fs.existsSync('www/articles.json')||fs.existsSync('www/articles'))throw Error('Stale news bundled');
const live=fs.readFileSync('www/app.js','utf8');
if(!live.includes('window.WireAndroid.loadFeed()')||!live.includes('window.WireAndroid.loadArticle(articleId)'))
 throw Error('Native reader did not route to live feed');
console.log('PASS: Android Wire shell packaged; fetcher, article data and Web Push are not bundled');
