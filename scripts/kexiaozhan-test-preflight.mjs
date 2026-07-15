import { pathToFileURL } from "node:url";

const REQUIRED_FIELDS = [
  "order_no",
  "out_trade_no",
  "amount",
  "goods_name",
  "currency",
  "machine_sn",
  "timestamp",
  "nonce",
  "sign",
];

const DEFAULTS = {
  maxStartAgeSeconds: 5 * 60,
  localWindowSeconds: 35 * 60,
  delayedPaymentSeconds: 16 * 60,
  completionBufferSeconds: 10 * 60,
  pairSkewSeconds: 3 * 60,
};

function readArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) throw new Error(`Unexpected argument: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${arg}`);
    }
    values[arg.slice(2)] = value;
    index += 1;
  }
  return values;
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

export function parseHandoffUrl(rawUrl, expectedKind) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`${expectedKind} URL is invalid`);
  }

  if (url.protocol !== "https:") {
    throw new Error(`${expectedKind} URL must use HTTPS`);
  }

  const params = {};
  for (const field of REQUIRED_FIELDS) {
    const values = url.searchParams.getAll(field);
    if (values.length !== 1 || values[0].trim() === "") {
      throw new Error(`${expectedKind} URL must contain exactly one ${field}`);
    }
    params[field] = values[0];
  }

  if (!/^\d+$/.test(params.timestamp)) {
    throw new Error(`${expectedKind} timestamp is invalid`);
  }
  if (!/^[a-f0-9]{64}$/i.test(params.sign)) {
    throw new Error(`${expectedKind} signature format is invalid`);
  }

  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${expectedKind} amount is invalid`);
  }
  if (expectedKind === "paid" && amount <= 0) {
    throw new Error("paid URL must have an amount greater than zero");
  }
  if (expectedKind === "zero" && amount !== 0) {
    throw new Error("zero URL must have an amount of zero");
  }

  const timestampMs = Number(params.timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs) || timestampMs <= 0) {
    throw new Error(`${expectedKind} timestamp is out of range`);
  }

  return { kind: expectedKind, params, timestampMs, url };
}

export function assessTestWindow({
  paidUrl,
  zeroUrl,
  now = new Date(),
  ...overrides
}) {
  const config = { ...DEFAULTS, ...overrides };
  const paid = parseHandoffUrl(paidUrl, "paid");
  const zero = parseHandoffUrl(zeroUrl, "zero");
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) throw new Error("Preflight time is invalid");
  const errors = [];

  if (paid.params.out_trade_no === zero.params.out_trade_no) {
    errors.push("paid and zero orders must have different out_trade_no values");
  }
  if (paid.params.order_no === zero.params.order_no) {
    errors.push("paid and zero orders must have different order_no values");
  }
  if (paid.params.machine_sn !== zero.params.machine_sn) {
    errors.push("paid and zero orders must use the same sandbox machine_sn");
  }

  const pairSkewMs = Math.abs(paid.timestampMs - zero.timestampMs);
  if (pairSkewMs > config.pairSkewSeconds * 1000) {
    errors.push(
      "paid and zero orders were not generated in the same test window",
    );
  }

  for (const handoff of [paid, zero]) {
    const ageMs = nowMs - handoff.timestampMs;
    if (ageMs > config.maxStartAgeSeconds * 1000) {
      errors.push(
        `${handoff.kind} order is ${Math.ceil(ageMs / 60_000)} minutes old; request a fresh order pair`,
      );
    }
    if (ageMs < -5 * 60_000) {
      errors.push(
        `${handoff.kind} timestamp is more than 5 minutes in the future`,
      );
    }
  }

  const paidDelayedAtMs =
    paid.timestampMs + config.delayedPaymentSeconds * 1000;
  const paidDeadlineMs = paid.timestampMs + config.localWindowSeconds * 1000;
  const zeroDeadlineMs = zero.timestampMs + config.localWindowSeconds * 1000;
  const paidPlannedCompletionMs = Math.max(nowMs, paidDelayedAtMs);

  if (
    paidDeadlineMs - paidPlannedCompletionMs <
    config.completionBufferSeconds * 1000
  ) {
    errors.push(
      "paid order does not leave a safe completion buffer after the delayed-payment target",
    );
  }
  if (zeroDeadlineMs - nowMs < config.completionBufferSeconds * 1000) {
    errors.push(
      "zero order does not leave enough time for immediate completion",
    );
  }

  return {
    ready: errors.length === 0,
    errors,
    paid,
    zero,
    nowMs,
    paidDelayedAtMs,
    paidDeadlineMs,
    zeroDeadlineMs,
  };
}

function formatTime(timestampMs, timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(new Date(timestampMs));
}

function printAssessment(result) {
  const line = (label, timestampMs) => {
    console.log(
      `${label}: ${formatTime(timestampMs, "America/Los_Angeles")} / ` +
        formatTime(timestampMs, "Asia/Shanghai"),
    );
  };

  console.log(result.ready ? "READY" : "NOT READY");
  console.log(`Paid outTradeNo: ${result.paid.params.out_trade_no}`);
  console.log(`Zero outTradeNo: ${result.zero.params.out_trade_no}`);
  line("Preflight time", result.nowMs);
  line("Complete zero order by", result.nowMs + 10 * 60_000);
  line("Complete paid order no earlier than", result.paidDelayedAtMs);
  line("Paid local deadline", result.paidDeadlineMs);
  line("Zero local deadline", result.zeroDeadlineMs);

  if (!result.ready) {
    for (const error of result.errors) console.error(`- ${error}`);
    return;
  }

  console.log(
    "Sequence: create both Stripe sessions, arm both exact IDs, complete zero first, then complete paid after the delayed target.",
  );
}

export function runCli(argv = process.argv.slice(2)) {
  const args = readArgs(argv);
  if (!args["paid-url"] || !args["zero-url"]) {
    throw new Error(
      "Usage: npm run kexiaozhan:preflight -- --paid-url <url> --zero-url <url>",
    );
  }

  const result = assessTestWindow({
    paidUrl: args["paid-url"],
    zeroUrl: args["zero-url"],
    now: args.now ? new Date(args.now) : new Date(),
    maxStartAgeSeconds: parsePositiveInteger(
      args["max-start-age-seconds"],
      DEFAULTS.maxStartAgeSeconds,
      "max-start-age-seconds",
    ),
    localWindowSeconds: parsePositiveInteger(
      args["local-window-seconds"],
      DEFAULTS.localWindowSeconds,
      "local-window-seconds",
    ),
  });
  printAssessment(result);
  process.exitCode = result.ready ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(`NOT READY: ${error.message}`);
    process.exitCode = 1;
  }
}
