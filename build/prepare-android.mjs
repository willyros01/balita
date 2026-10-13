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
sub('app.js','function registerWorker(){\n','function registerWorker(){\n  if(window.WireAndroid) return; // no service worker under Capacitor localhost\n');
fs.copyFileSync('android-src/android-adapter.js','www/android-adapter.js');
fs.copyFileSync('android-src/notifications.js','www/notifications.js');
// Explicitly prevent shipping an old news feed in the APK. Always use live main.
if(fs.existsSync('www/articles.json')||fs.existsSync('www/articles'))throw Error('Stale news bundled');
const live=fs.readFileSync('www/app.js','utf8');
if(!live.includes('window.WireAndroid.loadFeed()')||!live.includes('window.WireAndroid.loadArticle(articleId)'))
 throw Error('Native reader did not route to live feed');
console.log('PASS: Android Wire shell packaged; fetcher, article data and Web Push are not bundled');
