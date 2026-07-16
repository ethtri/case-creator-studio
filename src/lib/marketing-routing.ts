const INTERNAL_PAGE_VIEW_PARAMS = new Set(["designId"]);

export const getMarketingPagePath = (pathname: string, search: string) => {
  const params = new URLSearchParams(search);

  INTERNAL_PAGE_VIEW_PARAMS.forEach((param) => params.delete(param));

  const normalizedSearch = params.toString();
  return normalizedSearch ? `${pathname}?${normalizedSearch}` : pathname;
};
