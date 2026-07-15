import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_PROJECT_REF = "onztuktjcmjukfhcuphh";
const COMMON = {
  KEXIAOZHAN_API_BASE_URL: "https://kxzcnt.kexiaozhan.com",
  KEXIAOZHAN_HANDOFF_MAX_AGE_SECONDS: "2100",
  KEXIAOZHAN_CHECKOUT_EXPIRY_LEEWAY_SECONDS: "60",
  KEXIAOZHAN_PAYMENT_NOTIFY_EXTRA_FIELDS_JSON:
    '{"fulfillmentMethod":"deferredPrint"}',
  KEXIAOZHAN_PAYMENT_NOTIFY_REQUIRE_ALLOWLIST: "true",
  KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_PREFIXES: "__none__",
};
const PAID_PRICING = {
  KEXIAOZHAN_ALLOW_ZERO_TOTAL_CHECKOUTS: "false",
  KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS: "15000",
  KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS: "0",
  KEXIAOZHAN_CHECKOUT_CURRENCY: "usd",
};

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const values = { mode };
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith("--") || !rest[index + 1]) {
      throw new Error(`Invalid argument: ${arg}`);
    }
    values[arg.slice(2)] = rest[index + 1];
    index += 1;
  }
  return values;
}

function setSecrets(projectRef, values) {
  const assignments = Object.entries(values).map(
    ([key, value]) => `${key}=${value}`,
  );
  const result = spawnSync(
    "supabase",
    ["secrets", "set", "--project-ref", projectRef, ...assignments],
    { stdio: "inherit" },
  );
  if (result.status !== 0)
    throw new Error("Supabase staging configuration failed");
}

function exactOrderIds(raw) {
  const ids = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (ids.length !== 2 || ids.some((value) => !/^\d+$/.test(value))) {
    throw new Error(
      "arm requires exactly two comma-separated numeric --orders values",
    );
  }
  if (new Set(ids).size !== 2)
    throw new Error("arm order IDs must be different");
  return ids.join(",");
}

export function configurationFor(mode, orders) {
  if (mode === "baseline" || mode === "cleanup") {
    return {
      ...COMMON,
      ...PAID_PRICING,
      KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED: "false",
      KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS: "__none__",
    };
  }
  if (mode === "paid") return { ...COMMON, ...PAID_PRICING };
  if (mode === "zero") {
    return {
      ...COMMON,
      KEXIAOZHAN_ALLOW_ZERO_TOTAL_CHECKOUTS: "true",
      KEXIAOZHAN_CHECKOUT_UNIT_AMOUNT_CENTS: "0",
      KEXIAOZHAN_CHECKOUT_SHIPPING_CENTS: "0",
      KEXIAOZHAN_CHECKOUT_CURRENCY: "usd",
    };
  }
  if (mode === "arm") {
    return {
      ...COMMON,
      KEXIAOZHAN_PAYMENT_NOTIFY_ENABLED: "true",
      KEXIAOZHAN_PAYMENT_NOTIFY_ALLOWED_OUT_TRADE_NOS: exactOrderIds(orders),
    };
  }
  throw new Error("Mode must be baseline, paid, zero, arm, or cleanup");
}

export function runCli(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const projectRef = args["project-ref"] ?? DEFAULT_PROJECT_REF;
  const values = configurationFor(args.mode, args.orders);
  setSecrets(projectRef, values);
  console.log(`Staging mode '${args.mode}' applied to ${projectRef}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
