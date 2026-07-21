import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MARKETING_REPOSITORY = "ethtri/Snapcase_Autonomous_MarketingAgency";

const REQUIRED_SECTIONS = [
  "Issue traceability",
  "Summary",
  "Files changed",
  "Verification",
  "How to test",
  "Docs/status updates",
  "Risk/overlap",
  "Workflow confirmation",
];

const REQUIRED_COMMANDS = [
  "npm ci",
  "npm run lint --if-present",
  "npm run type-check",
  "npm run build",
  "npm test --if-present",
];

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function sectionBody(body, heading) {
  const pattern = new RegExp(
    `^##[ \\t]+${escapeRegex(heading)}[ \\t]*\\r?\\n([\\s\\S]*?)(?=^##[ \\t]+|(?![\\s\\S]))`,
    "im",
  );
  const match = body.match(pattern);
  return match?.[1]?.replace(/<!--[\s\S]*?-->/g, "").trim() || "";
}

function fieldValue(section, label) {
  const pattern = new RegExp(`^- ${escapeRegex(label)}:[ \\t]*(.+)$`, "im");
  const value = section.match(pattern)?.[1]?.trim() || "";
  return value.replace(/^`([\s\S]*)`$/, "$1").trim();
}

function isMissing(value) {
  return !value || /^(?:n\/?a|none|todo|tbd)(?:\b|\s|-)/i.test(value);
}

export function validatePullRequestBody({
  body = "",
  labels = [],
  headRef = "",
  governanceException = false,
} = {}) {
  if (governanceException || labels.includes("governance-exception")) return [];

  const errors = [];
  for (const heading of REQUIRED_SECTIONS) {
    if (!sectionBody(body, heading))
      errors.push(`Missing or empty section: ## ${heading}`);
  }

  if (!/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#\d+\b/i.test(body)) {
    errors.push(
      'Issue traceability must include a GitHub closing keyword such as "Closes #65".',
    );
  }

  if (/\b(?:TODO|TBD)\b/i.test(body)) {
    errors.push(
      "Replace every TODO/TBD placeholder with evidence or an explicit N/A reason.",
    );
  }

  const unchecked = body.match(/^- \[ \] /gm) || [];
  if (unchecked.length > 0) {
    errors.push(
      `Complete every checklist item before merge (${unchecked.length} unchecked).`,
    );
  }

  for (const command of REQUIRED_COMMANDS) {
    const pattern = new RegExp(`^- \\[x\\] \`${escapeRegex(command)}\``, "im");
    if (!pattern.test(body))
      errors.push(`Verification must check off: ${command}`);
  }

  const provenance = sectionBody(body, "Cross-repo provenance");
  const agencyOrigin =
    labels.includes("origin:marketing-agency") ||
    /^agent\/agency-[a-z0-9][a-z0-9-]*$/i.test(headRef) ||
    provenance.includes(MARKETING_REPOSITORY);

  if (!agencyOrigin) return errors;

  if (!provenance)
    errors.push("Agency-originated PRs require: ## Cross-repo provenance");
  if (!labels.includes("origin:marketing-agency")) {
    errors.push(
      "Agency-originated PRs require the origin:marketing-agency label.",
    );
  }
  if (!/^agent\/agency-[a-z0-9][a-z0-9-]*$/i.test(headRef)) {
    errors.push(
      "Agency-originated PRs require an agent/agency-<short-task-slug> branch.",
    );
  }

  const fields = Object.fromEntries(
    [
      "Change origin",
      "Originating repository",
      "Source issue",
      "Source artifact",
      "Source ID",
      "Authority or approval ID",
      "Marketing execution audit",
      "Post-merge reconciliation owner",
    ].map((label) => [label, fieldValue(provenance, label)]),
  );

  if (fields["Change origin"] !== "marketing-agency") {
    errors.push(
      "Agency provenance must set Change origin to marketing-agency.",
    );
  }
  if (fields["Originating repository"] !== MARKETING_REPOSITORY) {
    errors.push(
      `Agency provenance must name ${MARKETING_REPOSITORY} as Originating repository.`,
    );
  }
  if (
    !new RegExp(`^${escapeRegex(MARKETING_REPOSITORY)}#\\d+$`).test(
      fields["Source issue"],
    )
  ) {
    errors.push(
      `Source issue must use the full ${MARKETING_REPOSITORY}#<number> reference.`,
    );
  }
  if (
    isMissing(fields["Source artifact"]) ||
    !new RegExp(
      `^https://github\\.com/${escapeRegex(MARKETING_REPOSITORY)}/blob/[a-f0-9]{40}/.+$`,
    ).test(fields["Source artifact"])
  ) {
    errors.push(
      "Source artifact must be an immutable marketing-repo blob URL with a 40-character commit SHA.",
    );
  }
  if (isMissing(fields["Source ID"]))
    errors.push(
      "Source ID must be a stable marketing brief, queue, or asset ID.",
    );
  if (
    !/^(?:authority|appr)_\d{8}_[a-z0-9_]+$/.test(
      fields["Authority or approval ID"],
    )
  ) {
    errors.push(
      "Authority or approval ID must be an exact authority_... or appr_... identifier.",
    );
  }
  const audit = fields["Marketing execution audit"];
  if (
    audit !== "pending" &&
    !audit.startsWith(`https://github.com/${MARKETING_REPOSITORY}/blob/`)
  ) {
    errors.push(
      "Marketing execution audit must be pending before merge or an immutable marketing-repo blob URL.",
    );
  }
  if (fields["Post-merge reconciliation owner"] !== MARKETING_REPOSITORY) {
    errors.push(
      `Post-merge reconciliation owner must be ${MARKETING_REPOSITORY}.`,
    );
  }

  return errors;
}

function parseLabels(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed))
      return parsed.filter((value) => typeof value === "string");
  } catch {
    // Fall through to comma-separated input for local checks.
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = validatePullRequestBody({
    body: process.env.PR_BODY || "",
    labels: parseLabels(process.env.PR_LABELS),
    headRef: process.env.PR_HEAD_REF || "",
    governanceException: process.env.GOVERNANCE_EXCEPTION === "true",
  });

  if (errors.length > 0) {
    console.error("Pull request description is incomplete:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }

  console.log(
    "Pull request description contains the required traceability and evidence.",
  );
}
