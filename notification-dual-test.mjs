import { readFile } from "node:fs/promises";

const project = "wire-news-6da5a";
const token = process.env.GOOGLE_ACCESS_TOKEN;
if(!token) throw new Error("GOOGLE_ACCESS_TOKEN is missing.");

const feed = JSON.parse(await readFile("articles.json", "utf8"));
const stories = (feed.articles || [])
  .filter(article => article?.id && ["inq", "inqn", "inqg"].includes(article.source))
  .sort((a, b) => Date.parse(b.published || 0) - Date.parse(a.published || 0))
  .slice(0, 2);
if(stories.length < 2) throw new Error("Two Inquirer stories are required for this test.");

const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const subscriptions = [];
let pageToken = "";
do {
  const query = new URLSearchParams({ pageSize: "300" });
  if(pageToken) query.set("pageToken", pageToken);
  const response = await fetch(
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/pushSubscriptions?${query}`,
    { headers }
  );
  if(!response.ok) throw new Error(`Subscription lookup failed: HTTP ${response.status}`);
  const body = await response.json();
  for(const document of body.documents || []){
    const value = document.fields || {};
    if(value.token?.stringValue && value.enabled?.booleanValue !== false){
      subscriptions.push(value.token.stringValue);
    }
  }
  pageToken = body.nextPageToken || "";
} while(pageToken);
if(!subscriptions.length) throw new Error("No enabled notification subscriptions were found.");

const now = Date.now();
const cases = [
  {
    label: "STALE",
    article: stories[1],
    sentAt: new Date(now - 31 * 60 * 1000).toISOString()
  },
  {
    label: "CURRENT",
    article: stories[0],
    sentAt: new Date(now).toISOString()
  }
];

for(const testCase of cases){
  const results = [];
  for(const deviceToken of subscriptions){
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: {
            token: deviceToken,
            data: {
              articleId: String(testCase.article.id),
              sourceName: "Inquirer test",
              title: `[${testCase.label} TEST] ${testCase.article.title}`.slice(0, 220),
              sentAt: testCase.sentAt
            },
            webpush: { headers: { TTL: "1800", Urgency: "normal" } }
          }
        })
      }
    );
    const body = await response.json().catch(() => ({}));
    results.push({ status: response.status, accepted: response.ok, name: body.name || "" });
  }
  console.log(JSON.stringify({
    test: testCase.label,
    articleId: testCase.article.id,
    headline: testCase.article.title,
    sentAt: testCase.sentAt,
    devices: results
  }));
  if(results.some(result => !result.accepted)) process.exitCode = 1;
}
