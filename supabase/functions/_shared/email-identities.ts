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

export const OFFICIAL_SNAPCASE_EMAILS = Object.values(SNAPCASE_EMAILS) as SnapcaseEmail[];

export function resolveOfficialSnapcaseEmail(
  candidate: string | null | undefined,
  fallback: SnapcaseEmail,
  settingName: string,
): SnapcaseEmail {
  const normalized = (candidate ?? fallback).trim().toLowerCase();

  if (!OFFICIAL_SNAPCASE_EMAILS.includes(normalized as SnapcaseEmail)) {
    throw new Error(
      `${settingName} must use an official Snapcase address: ${OFFICIAL_SNAPCASE_EMAILS.join(", ")}`,
    );
  }

  return normalized as SnapcaseEmail;
}

export function resolveSnapcaseRoleEmail(
  candidate: string | null | undefined,
  expected: SnapcaseEmail,
  settingName: string,
): SnapcaseEmail {
  const resolved = resolveOfficialSnapcaseEmail(candidate, expected, settingName);

  if (resolved !== expected) {
    throw new Error(`${settingName} must be ${expected}`);
  }

  return resolved;
}
