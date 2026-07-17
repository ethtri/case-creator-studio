import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const PUBLIC_SOURCE_EXTENSIONS = new Set([".html", ".json", ".ts", ".tsx", ".txt", ".xml"]);

// Keep these rules aligned with the evidence and approval matrix in GitHub issue #69.
// A claim should be removed from this list only after #69 records its evidence owner,
// effective date, represented products/orders, exact approved wording, and review trigger.
export const PROHIBITED_PUBLIC_CLAIMS = Object.freeze([
  {
    id: "unqualified-us-origin",
    pattern:
      /\b(?:made|built|assembled)\s+in\s+(?:the\s+)?(?:u\.?\s*s\.?\s*a?\.?|united\s+states|america)\b/gi,
  },
  {
    id: "american-or-local-origin",
    pattern: /\b(?:american[-\s]made|locally\s+made)\b/gi,
  },
  {
    id: "pending-us-print-process",
    pattern:
      /\bprinted(?:\s+and\s+fulfilled)?\s+in\s+(?:the\s+)?(?:u\.?\s*s\.?\s*a?\.?|united\s+states)\b/gi,
  },
  {
    id: "legacy-us-print-and-ship",
    pattern:
      /\bwe\s+print(?:\s+your\s+case)?\s+and\s+ship(?:\s+to\s+u\.?\s*s\.?\s+addresses|\s+in\s+the\s+u\.?\s*s\.?)\b/gi,
  },
  {
    id: "fixed-production-or-delivery-range",
    pattern:
      /\b(?:production|produce[ds]?|printed|prepared|ships?|shipping|deliver(?:ed|y)?)\b[^.\n]{0,100}\b\d+\s*(?:-|–|to)\s*\d+\s+business\s+days\b/gi,
  },
  {
    id: "unapproved-material-or-finish",
    pattern:
      /\b(?:premium\s+polycarbonate|durable\s+polycarbonate|impact[-\s]resistant\s+polycarbonate|matte\s+or\s+glossy\s+finish\s+options)\b/gi,
  },
  {
    id: "unapproved-print-quality",
    pattern:
      /\b(?:high[-\s]quality\s+uv\s+(?:printing|technology)|vibrant,\s+long[-\s]lasting\s+colors)\b/gi,
  },
  {
    id: "unapproved-speed",
    pattern: /\b(?:fast\s+turnaround|begin\s+production\s+quickly)\b/gi,
  },
  {
    id: "unapproved-production-model",
    pattern: /\b(?:custom\s+products?\s+are\s+)?made\s+to\s+order\b/gi,
  },
  {
    id: "unapproved-remedy-window",
    pattern:
      /\b(?:contact\s+us\s+within\s+30\s+days|30[-\s]day\b[^.\n]{0,100}\b(?:defect|damage|misprint|remedy|replacement|return)|(?:defect|damage|misprint|remedy|replacement|return)\b[^.\n]{0,100}\b30[-\s]day)\b/gi,
  },
  {
    id: "unapproved-remedy-promise",
    pattern: /\bwe\s+will\s+make\s+it\s+right\b/gi,
  },
  {
    id: "unapproved-return-policy",
    pattern:
      /\b(?:(?:do\s+not|don't)\s+accept\s+returns|returns?\s+for\s+buyer\s+remorse)\b/gi,
  },
]);

export const findUnsafeClaims = (content) =>
  PROHIBITED_PUBLIC_CLAIMS.flatMap((rule) => {
    rule.pattern.lastIndex = 0;
    return [...content.matchAll(rule.pattern)].map((match) => ({
      ruleId: rule.id,
      index: match.index ?? 0,
      text: match[0],
    }));
  });

const pathExists = async (target) => {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
};

const collectFiles = async (target) => {
  if (!(await pathExists(target))) return [];

  const stat = await fs.stat(target);
  if (stat.isFile()) return [target];

  const entries = await fs.readdir(target, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => collectFiles(path.join(target, entry.name))),
  );
  return nested.flat();
};

const lineForIndex = (content, index) =>
  content.slice(0, index).split(/\r?\n/).length;

export const validatePublicClaims = async () => {
  const candidateFiles = (
    await Promise.all([
      collectFiles(path.join(ROOT, "index.html")),
      collectFiles(path.join(ROOT, "src")),
      collectFiles(path.join(ROOT, "public")),
      collectFiles(path.join(ROOT, "dist")),
    ])
  )
    .flat()
    .filter((file) => PUBLIC_SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase()));

  const violations = [];
  for (const file of candidateFiles) {
    const content = await fs.readFile(file, "utf8");
    for (const match of findUnsafeClaims(content)) {
      violations.push({
        ...match,
        file: path.relative(ROOT, file).replaceAll("\\", "/"),
        line: lineForIndex(content, match.index),
      });
    }
  }

  if (violations.length > 0) {
    const details = violations
      .map(
        ({ file, line, ruleId, text }) =>
          `- ${file}:${line} [${ruleId}] "${text.replace(/\s+/g, " ")}"`,
      )
      .join("\n");
    throw new Error(
      `Claim-safety contract found ${violations.length} unapproved public claim(s):\n${details}\n` +
        "Update GitHub issue #69 with evidence and written approval before changing this gate.",
    );
  }

  console.log(
    `Claim-safety contract passed across ${candidateFiles.length} public source and built file(s).`,
  );
};

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  await validatePublicClaims();
}
