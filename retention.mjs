/* Shared article-retention rule for the fetcher and its tests. */
export const ARTICLE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const HEADLINE_ONLY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function isWithinArticleRetention(value, now = Date.now()){
  const published = Date.parse(value || "");
  /* Keep undated items. readArticle() stamps them with the current time, and
     dropping an item merely because its publisher omitted a date is worse
     than retaining it for one normal feed cycle. */
  if(!Number.isFinite(published)) return true;
  return published >= now - ARTICLE_MAX_AGE_MS;
}

export function isWithinHeadlineOnlyRetention(article, now = Date.now()){
  if(!article || article.source_of_text !== "summary") return true;
  const firstSeen = Date.parse(article.firstSeen || article.published || "");
  if(!Number.isFinite(firstSeen)) return true;
  return firstSeen >= now - HEADLINE_ONLY_MAX_AGE_MS;
}
