export const GA4_BROWSER_CLIENT_ID_PATTERN = /^\d{1,20}\.\d{1,20}$/;

const GA4_SERVER_CLIENT_ID_PATTERN =
  /^server\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const normalizeGa4BrowserClientId = (
  value: unknown,
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return GA4_BROWSER_CLIENT_ID_PATTERN.test(normalized) ? normalized : null;
};

export const buildServerGa4ClientId = (orderId: string) =>
  `server.${orderId}`;

export const resolveGa4ClientId = (
  browserClientId: unknown,
  orderId: string,
) =>
  normalizeGa4BrowserClientId(browserClientId) ??
    buildServerGa4ClientId(orderId);

export const isApprovedGa4ClientId = (value: unknown) =>
  typeof value === "string" &&
  (
    GA4_BROWSER_CLIENT_ID_PATTERN.test(value) ||
    GA4_SERVER_CLIENT_ID_PATTERN.test(value)
  );
