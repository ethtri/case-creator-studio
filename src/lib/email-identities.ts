export const SNAPCASE_EMAILS = {
  hello: "hello@snapcase.ai",
  partnerships: "partnerships@snapcase.ai",
  support: "support@snapcase.ai",
  social: "social@snapcase.ai",
} as const;

export type SnapcaseEmail = (typeof SNAPCASE_EMAILS)[keyof typeof SNAPCASE_EMAILS];
