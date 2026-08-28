/* ============================================================
   config.js — the only file you edit to make this yours.
   ============================================================ */

/* Shown at the bottom of the app, so you can always tell what is
   running on a given phone. Bump both when you cut a new version. */
export const VERSION    = "0.9.2";
export const BUILD_DATE = "2026-08-27";

/* Where the fetcher writes its output. Relative, so it works
   whether the site sits at the domain root or in a subfolder. */
export const FEED_URL = "articles.json";

/* Your Firebase project. Copy these from the Firebase console:
   Project settings -> Your apps -> Web app -> SDK setup.

   Leave it as null and the app still works — settings and sources
   are then kept on the device only, with no sync between devices. */
export const FIREBASE = null;
/* Example once you fill it in:
export const FIREBASE = {
  apiKey:            "...",
  authDomain:        "balita-xxxx.firebaseapp.com",
  projectId:         "balita-xxxx",
  storageBucket:     "balita-xxxx.appspot.com",
  messagingSenderId: "...",
  appId:             "..."
};
*/

/* Text size, in pixels, one entry per step of the A+ button.
   Each step is about a fifth larger than the one before, which is
   roughly the smallest jump the eye reliably notices.

   The top of this scale matches the largest iOS accessibility
   setting. At that size a phone fits only a few words to a line,
   so the layout sheds its margins and thumbnails to compensate —
   see the data-step rules in tokens.css. */
export const SCALE = [17, 20, 24, 29, 35, 42, 50];

export const MIN_STEP = 0;
export const MAX_STEP = SCALE.length - 1;

/* Sources the app starts with. After first run this list lives in
   storage and is edited from the Sources screen, not here. */
export const DEFAULT_SOURCES = [
  { id:"inq",  tag:"INQ",  name:"Inquirer",        url:"https://www.inquirer.net/fullfeed",                 color:"#C2382F", on:true },
  { id:"inqn", tag:"INQN", name:"Inquirer News",   url:"https://newsinfo.inquirer.net/feed",     color:"#C2382F", on:true },
  { id:"inqg", tag:"INQG", name:"Inquirer Global", url:"https://globalnation.inquirer.net/feed", color:"#A8443C", on:true },
  { id:"star", tag:"STAR", name:"Philstar",        url:"https://www.philstar.com/rss/headlines",            color:"#1F5FA9", on:true },
  { id:"abs",  tag:"ABS",  name:"ABS-CBN",         url:"https://www.abs-cbn.com/news",                      color:"#D48310", on:true },
  { id:"rap",  tag:"RAP",  name:"Rappler",         url:"https://www.rappler.com/feed/",                     color:"#7B4BA8", on:true },
  { id:"gma",  tag:"GMA",  name:"GMA News",        url:"https://data.gmanetwork.com/gno/rss/news/nation/feed.xml", color:"#1B7A5A", on:true },
  { id:"mb",   tag:"MB",   name:"Manila Bulletin", url:"https://mb.com.ph/feed",                            color:"#4A5560", on:true },
  { id:"bbc",  tag:"BBC",  name:"BBC World",       url:"https://feeds.bbci.co.uk/news/world/rss.xml",       color:"#8C1D2F", on:true },
  { id:"cbc",  tag:"CBC",  name:"CBC Top Stories", url:"https://rss.cbc.ca/lineup/topstories.xml",     color:"#B03A2E", on:true },
  { id:"grd",  tag:"GRD",  name:"The Guardian",    url:"https://www.theguardian.com/world/rss",        color:"#1D5C96", on:true }
];

/* Offered on the Sources screen as one-tap additions. */
export const PRESETS = [
  { tag:"AJE",  name:"Al Jazeera",     url:"https://www.aljazeera.com/xml/rss/all.xml",      color:"#B8891F" },
  { tag:"NPR",  name:"NPR News",       url:"https://feeds.npr.org/1001/rss.xml",             color:"#3B6EA5" },
  { tag:"SCMP", name:"South China MP", url:"https://www.scmp.com/rss/91/feed",               color:"#9C6B2E" },
  { tag:"NHK",  name:"NHK World",      url:"https://www3.nhk.or.jp/nhkworld/en/news/feeds/", color:"#2E7D7D" },
  { tag:"STT",  name:"Straits Times",  url:"https://www.straitstimes.com/news/world/rss.xml", color:"#2F6B4F" }
];

/* Colours handed out to sources you add yourself. */
export const PALETTE = [
  "#C2382F","#1F5FA9","#D48310","#7B4BA8",
  "#1B7A5A","#8C1D2F","#4A5560","#2E7D7D"
];
