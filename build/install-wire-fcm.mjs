#!/usr/bin/env node
// Google Android-only FCM build. Fail closed on invalid/missing Firebase config.
// No Amazon ADM integration; never bundle sender credentials in the APK.
import fs from 'node:fs';
const app='android/app';
const secret=process.env.WIRE_GOOGLE_SERVICES_JSON_B64||'';
if(!secret || !/^[A-Za-z0-9+/=\s]+$/.test(secret))throw Error('Missing or invalid WIRE_GOOGLE_SERVICES_JSON_B64');
const decoded=Buffer.from(secret.replace(/\s/g,''),'base64').toString('utf8');
let json;
try {json=JSON.parse(decoded);}catch {throw Error('Google Android config is not valid JSON');}
if(json.project_info?.project_id!=='wire-news-6da5a' ||
 !(json.client||[]).some(x=>x.client_info?.android_client_info?.package_name==='io.github.willyros01.wire'))
 throw Error('Firebase Android config does not match Wire Firebase project and package');
const dst=app+'/google-services.json';
fs.writeFileSync(dst,decoded,{mode:0o600});
fs.mkdirSync(app+'/src/main/java/io/github/willyros01/wire',{recursive:true});
for(const name of ['WireFcmPlugin.java','WireFcmService.java']){
 const src='android-src/native/'+name;
 if(!fs.existsSync(src))throw Error('Missing native Google Android FCM file '+name);
 fs.copyFileSync(src,app+'/src/main/java/io/github/willyros01/wire/'+name);
}
function patch(path,oldText,newText){
 const before=fs.readFileSync(path,'utf8');
 if(before.split(oldText).length!==2)throw Error('Non-unique native build anchor: '+path);
 fs.writeFileSync(path,before.replace(oldText,newText));
}
const src=app+'/src/main/java/io/github/willyros01/wire/MainActivity.java';
patch(src,'public class MainActivity extends BridgeActivity {}',
 'public class MainActivity extends BridgeActivity {\n'+
 '  @Override public void onCreate(android.os.Bundle saved) {\n'+
 '    registerPlugin(WireFcmPlugin.class);\n'+
 '    super.onCreate(saved);\n'+
 '  }\n'+
 '  @Override protected void onNewIntent(android.content.Intent intent) {\n'+
 '    super.onNewIntent(intent);\n'+
 '    setIntent(intent);\n'+
 '  }\n'+
 '}');
const manifest=app+'/src/main/AndroidManifest.xml';
patch(manifest,'<application','<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <application');
patch(manifest,'</application>',
 '    <service android:name=".WireFcmService" android:exported="false">\n'+
 '      <intent-filter>\n'+
 '        <action android:name="com.google.firebase.MESSAGING_EVENT"/>\n'+
 '      </intent-filter>\n'+
 '    </service>\n'+
 '</application>');
patch(app+'/build.gradle','dependencies {',
 "apply plugin: 'com.google.gms.google-services'\n"+
 'dependencies {\n'+
 "    implementation 'com.google.firebase:firebase-messaging:24.1.1'\n"+
 "    implementation 'com.google.android.gms:play-services-base:18.5.0'");
patch('android/build.gradle','dependencies {',
 "dependencies {\n        classpath 'com.google.gms:google-services:4.4.2'");
console.log('PASS: native Firebase FCM for Google Android configured; ADM not enabled');
