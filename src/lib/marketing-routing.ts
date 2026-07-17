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
const SENSITIVE_LOCATION_PARAMS = new Set(["designId", "session_id"]);

const withoutParams = (
  pathname: string,
  search: string,
  excluded: Set<string>,
) => {
  const params = new URLSearchParams(search);
  excluded.forEach((param) => params.delete(param));
  params.sort();

  const normalizedSearch = params.toString();
  return normalizedSearch ? `${pathname}?${normalizedSearch}` : pathname;
};

export const getMarketingPagePath = (pathname: string, search: string) =>
  withoutParams(pathname, search, INTERNAL_PAGE_VIEW_PARAMS);

export const getMarketingPageLocation = (
  origin: string,
  pathname: string,
  search: string,
) => `${origin}${withoutParams(pathname, search, SENSITIVE_LOCATION_PARAMS)}`;
