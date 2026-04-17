import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const localDir = path.join(root, "marketing", "outreach", "local");
const paths = {
  prospects: path.join(localDir, "prospects.csv"),
  ledger: path.join(localDir, "campaign-ledger.csv"),
  suppression: path.join(localDir, "suppression-list.csv"),
};

const requiredConfig = [
  "SNAPCASE_OUTREACH_FROM_NAME",
  "SNAPCASE_OUTREACH_REPLY_TO",
  "SNAPCASE_OUTREACH_POSTAL_ADDRESS",
  "SNAPCASE_OUTREACH_OPT_OUT_TEXT",
];

const requiredColumns = {
  prospects: ["email", "first_name", "organization", "segment", "source_url", "status"],
  ledger: ["email", "campaign", "template", "status", "last_action_at"],
  suppression: ["email", "reason", "source", "added_at"],
};

const normalizeEmail = (value) => value.trim().toLowerCase();

const parseCsv = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return { headers: [], rows: [], missing: true };
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return { headers: [], rows: [], missing: false };
  }

  const lines = raw.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(",").map((header) => header.trim());
  const rows = lines.slice(1).map((line) => {
    const cells = line.split(",");
    return Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
  });

  return { headers, rows, missing: false };
};

const validateColumns = (name, parsed, errors, warnings) => {
  if (parsed.missing) {
    warnings.push(`Missing optional local file: ${path.relative(root, paths[name])}`);
    return;
  }

  const missingColumns = requiredColumns[name].filter((column) => !parsed.headers.includes(column));
  if (missingColumns.length > 0) {
    errors.push(`${name} is missing required column(s): ${missingColumns.join(", ")}`);
  }
};

const prospects = parseCsv(paths.prospects);
const ledger = parseCsv(paths.ledger);
const suppression = parseCsv(paths.suppression);

const errors = [];
const warnings = [];

validateColumns("prospects", prospects, errors, warnings);
validateColumns("ledger", ledger, errors, warnings);
validateColumns("suppression", suppression, errors, warnings);

const suppressed = new Set(
  suppression.rows
    .map((row) => row.email ?? "")
    .filter(Boolean)
    .map(normalizeEmail)
);

for (const row of prospects.rows) {
  const email = normalizeEmail(row.email ?? "");
  if (email && suppressed.has(email)) {
    errors.push(`Suppressed prospect found in prospects.csv: ${email}`);
  }
}

for (const row of ledger.rows) {
  const email = normalizeEmail(row.email ?? "");
  if (email && suppressed.has(email) && !["opted_out", "do_not_contact"].includes(row.status)) {
    errors.push(`Suppressed contact has active ledger status: ${email}`);
  }
}

const hasSendReadyRows = [...prospects.rows, ...ledger.rows].some((row) =>
  ["ready_to_send", "send_ready", "scheduled"].includes((row.status ?? "").toLowerCase())
);

const missingConfig = requiredConfig.filter((key) => !process.env[key]?.trim());
if (hasSendReadyRows && missingConfig.length > 0) {
  errors.push(
    `Send-ready rows require outreach config: ${missingConfig.join(", ")}`
  );
} else if (missingConfig.length > 0) {
  warnings.push(`Outreach config not set yet: ${missingConfig.join(", ")}`);
}

if (strict && warnings.length > 0) {
  errors.push(...warnings);
}

warnings.forEach((warning) => console.warn(`WARN: ${warning}`));

if (errors.length > 0) {
  errors.forEach((error) => console.error(`ERROR: ${error}`));
  process.exit(1);
}

console.log("Outreach checks passed.");

