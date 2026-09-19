/* Shared article-retention rule for the fetcher and its tests. */
export const ARTICLE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export function isWithinArticleRetention(value, now = Date.now()){
  const published = Date.parse(value || "");
  /* Keep undated items. readArticle() stamps them with the current time, and
     dropping an item merely because its publisher omitted a date is worse
     than retaining it for one normal feed cycle. */
  if(!Number.isFinite(published)) return true;
  return published >= now - ARTICLE_MAX_AGE_MS;
}
