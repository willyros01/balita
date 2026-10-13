#!/usr/bin/env node
// Fail closed: native push is installed only when official SDK and BOTH
// vendor credentials exist; never pretend Android Web Push is native push.
import fs from 'node:fs';
const root='android/app';
const need=p=>{if(!fs.existsSync(p)||fs.statSync(p).size===0)throw Error('Native push prerequisite missing: '+p)};
need(root+'/libs/A3LMessaging-1.1.1.aar');
need(root+'/google-services.json');
need(root+'/src/main/assets/api_key.txt');
const config=JSON.parse(fs.readFileSync(root+'/google-services.json','utf8'));
if(config.project_info?.project_id!=='wire-news-6da5a'||
  !(config.client||[]).some(c=>c.client_info?.android_client_info?.package_name==='io.github.willyros01.wire'))
  throw Error('Firebase Android config does not match Wire project and package');
const destination=root+'/src/main/java/io/github/willyros01/wire';
fs.mkdirSync(destination,{recursive:true});
for(const file of ['WirePushPlugin.java','WireMessagingService.java']){
  need('android-src/native/'+file);
  fs.copyFileSync('android-src/native/'+file,destination+'/'+file);
}
function patch(p,oldValue,newValue){
 const content=fs.readFileSync(p,'utf8');
 if(content.split(oldValue).length!==2)throw Error('Android native anchor changed: '+p);
 fs.writeFileSync(p,content.replace(oldValue,newValue));
}
patch(destination+'/MainActivity.java',
  'public class MainActivity extends BridgeActivity {}',
  'public class MainActivity extends BridgeActivity {\n'+
  '  @Override public void onCreate(android.os.Bundle saved) {\n'+
  '    registerPlugin(WirePushPlugin.class);\n'+
  '    super.onCreate(saved);\n'+
  '  }\n'+
  '  @Override protected void onNewIntent(android.content.Intent intent) {\n'+
  '    super.onNewIntent(intent);\n'+
  '    setIntent(intent);\n'+
  '  }\n'+
  '}');
const manifest=root+'/src/main/AndroidManifest.xml';
patch(manifest,'<application','<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>\n    <application');
patch(manifest,'</application>',
  '    <receiver android:name=".WireMessagingService"\n'+
  '        android:exported="false" android:enabled="true">\n'+
  '        <intent-filter>\n'+
  '            <action android:name="com.amazon.A3L.messaging.intent.REGISTRATION"/>\n'+
  '            <action android:name="com.amazon.A3L.messaging.intent.MESSAGE"/>\n'+
  '        </intent-filter>\n'+
  '    </receiver>\n'+
  '    <meta-data android:name="com.a3l.clsName"\n'+
  '        android:value="io.github.willyros01.wire.WireMessagingService"/>\n'+
  '</application>');
patch(root+'/build.gradle','dependencies {',
  "apply plugin: 'com.google.gms.google-services'\n"+'dependencies {\n'+
  "    implementation files('libs/A3LMessaging-1.1.1.aar')\n"+
  "    implementation 'com.google.firebase:firebase-messaging:23.0.0'");
patch('android/build.gradle','dependencies {',
  "dependencies {\n        classpath 'com.google.gms:google-services:4.4.2'");
console.log('Wire native A3L registered; ADM/FCM service will be compiled');
