export const SNAPCASE_EMAILS = {
  hello: "hello@snapcase.ai",
  partnerships: "partnerships@snapcase.ai",
  support: "support@snapcase.ai",
  social: "social@snapcase.ai",
} as const;

export const SNAPCASE_COMMERCIAL_ADDRESS = {
  street: "1401 21st Street",
  cityRegionPostal: "Sacramento, CA 95811",
} as const;

export type SnapcaseEmail = (typeof SNAPCASE_EMAILS)[keyof typeof SNAPCASE_EMAILS];
