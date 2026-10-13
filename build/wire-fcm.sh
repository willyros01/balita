#!/usr/bin/env bash
# Wire Firebase Android setup — Google Cloud Shell; safe to re-run.
# Creates Android app ONLY if missing; never creates another Firebase project.
set -euo pipefail
umask 077
command -v gcloud >/dev/null || { echo "Run in Google Cloud Shell"; exit 1; }
export WIRE_TOKEN="$(gcloud auth print-access-token)"
python3 - <<'PY'
import base64,json,os,time
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from urllib.parse import urlencode
PROJECT='wire-news-6da5a'
PACKAGE='io.github.willyros01.wire'
ROOT='https://firebase.googleapis.com/v1beta1/'
def call(method,path,data=None):
    body=None if data is None else json.dumps(data).encode()
    headers={'Authorization':'Bearer '+os.environ['WIRE_TOKEN'],'Accept':'application/json'}
    if body is not None: headers['Content-Type']='application/json'
    try:
        with urlopen(Request(ROOT+path,body,headers,method=method),timeout=30) as r:
            return json.load(r)
    except HTTPError as e:
        raise RuntimeError('Firebase HTTP '+str(e.code)+': '+e.read(400).decode(errors='replace')) from None
def find():
    apps=[];page=''
    while True:
        param=urlencode({'pageSize':100,**({'pageToken':page} if page else {})})
        data=call('GET',f'projects/{PROJECT}/androidApps?'+param)
        apps+=data.get('apps',[])
        page=data.get('nextPageToken','')
        if not page:break
    return [a for a in apps if a.get('packageName')==PACKAGE]
print('Checking Firebase app for',PACKAGE,'in',PROJECT)
a=find()
if len(a)>1:raise RuntimeError('More than one matching Android app; refusing to guess.')
if not a:
    print('No matching app found; registering Wire Android in existing project.')
    task=call('POST',f'projects/{PROJECT}/androidApps',
              {'displayName':'Wire Android','packageName':PACKAGE})
    name=task.get('name','')
    if not name.startswith('operations/'):
        raise RuntimeError('Registration did not return an operation. Inspect Firebase console.')
    for i in range(30):
        task=call('GET',name)
        if task.get('done'):break
        time.sleep(2)
    else:raise RuntimeError('Registration unfinished; inspect console before retry.')
    if task.get('error'):raise RuntimeError('Registration failed: '+str(task['error']))
    a=find()
    if len(a)!=1:raise RuntimeError('Could not confirm registration; inspect console.')
else:
    print('Existing Android app found; reused unchanged.')
app=a[0]
name=app.get('name','')
if not name.startswith('projects/'+PROJECT+'/androidApps/'):
    raise RuntimeError('Wrong Firebase project.')
config=call('GET',name+'/config')
if config.get('configFilename')!='google-services.json':
    raise RuntimeError('Unexpected Firebase config file name.')
raw=base64.b64decode(config['configFileContents'],validate=True)
cfg=json.loads(raw)
if cfg.get('project_info',{}).get('project_id')!=PROJECT:
    raise RuntimeError('Firebase JSON project mismatch.')
if not any(c.get('client_info',{}).get('android_client_info',{}).get('package_name')==PACKAGE
           for c in cfg.get('client',[])):
    raise RuntimeError('Firebase JSON Android package mismatch.')
for filename,data in [('wire-google.json',raw),('wire-b64.txt',base64.b64encode(raw)+b'\n')]:
    fd=os.open(filename,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    with os.fdopen(fd,'wb') as f:f.write(data)
print('PASS: Wire Android Firebase config saved; no Firestore data or rules changed.')
print('App ID:',app.get('appId','unknown'))
print('Open wire-b64.txt; copy its entire single line to GitHub Actions')
print('secret WIRE_GOOGLE_SERVICES_JSON_B64. Do not commit the file.')
PY
unset WIRE_TOKEN
