export const POLL_MS=120000;
export const FRESH_MS=1800000;
export const APPROVED=new Set(["inq","inqn","inqg","cbc","bbc","gma","dw","abs"]);
export const MARKER=/^\s*(?:\[(?:breaking|just\s+in|urgent|live)\]|(?:breaking|just\s+in|urgent|live)\s*[:\u2014\u2013-])\s*/i;
export function qualifies(a){return !!a&&typeof a.id==="string"&&/^[a-z0-9-]{1,100}$/i.test(a.id)&&APPROVED.has(a.source)&&typeof a.title==="string"&&MARKER.test(a.title);}
export function idsOf(articles){return (Array.isArray(articles)?articles:[]).filter(qualifies).map(x=>x.id);}
export function trimIds(ids){return [...new Set(ids)].slice(-1500);}
export function discover(articles,previous,now=Date.now()){
 const seen=new Set(previous),alerts=[];
 const sorted=(Array.isArray(articles)?articles:[]).filter(qualifies).sort((a,b)=>(Date.parse(a.published||"")-Date.parse(b.published||""))||a.id.localeCompare(b.id));
 for(const a of sorted){if(seen.has(a.id))continue;seen.add(a.id);const age=now-Date.parse(a.published||"");if(!Number.isFinite(age)||age<0||age>FRESH_MS)continue;alerts.push({id:a.id,source:a.source,title:a.title});}
 return {seen:trimIds([...seen]),alerts:alerts.slice(-10)};
}
