UPLOADING THIS FIX

This zip has only three files in it, on purpose. It is a precise fix,
not a full rebuild, so only these three files need to change.

sw.js
app.js
version.js

STEPS

Unzip this on your iPad.

Open your repository on github.com.

For each of the three files above: open that file in the repository,
tap the pencil icon to edit it, select everything currently there and
delete it, then paste in the matching file from this zip. Commit each
one separately, or use Add file, upload files and drag in all three
at once if you would rather do it in a single commit — either way
works, since these three are the only ones being replaced.

AFTER UPLOADING

Nothing needs to be re-run for this. It takes effect the next time the
service worker updates on your phone, which usually happens on its own
within a little while of opening the app, or immediately if you delete
the Home Screen icon and re-add it.

To actually see whether the fix worked, the real test is receiving a
genuine breaking-news notification while the app is backgrounded, and
tapping it. If it opens directly to that story instead of wherever the
app was left, it worked.
