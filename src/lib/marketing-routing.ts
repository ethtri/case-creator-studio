const INTERNAL_PAGE_VIEW_PARAMS = new Set([
  "designId",
  "session_id",
  "gclid",
  "fbclid",
  "ttclid",
  "utm_campaign",
  "utm_content",
  "utm_medium",
  "utm_source",
  "utm_term",
]);

export const getMarketingPagePath = (pathname: string, search: string) => {
  const params = new URLSearchParams(search);
  INTERNAL_PAGE_VIEW_PARAMS.forEach((param) => params.delete(param));
  params.sort();

  const normalizedSearch = params.toString();
  return normalizedSearch ? `${pathname}?${normalizedSearch}` : pathname;
};
