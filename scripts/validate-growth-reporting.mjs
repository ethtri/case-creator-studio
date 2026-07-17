import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");

export const DEFAULT_CONTRACT_PATH = path.join(
  root,
  "config",
  "growth-reporting-contract.json",
);
export const DEFAULT_EXPORT_PATH = path.join(
  root,
  "scripts",
  "fixtures",
  "growth-reporting-valid.json",
);

const REQUIRED_METRICS = new Set([
  "sessions",
  "new_users",
  "homepage_cta_rate",
  "catalog_model_selection_rate",
  "editor_first_action_rate",
  "preview_success_rate",
  "preview_failure_rate",
  "add_to_cart_rate",
  "checkout_start_rate",
  "purchase_rate",
  "checkout_completion_rate",
  "revenue",
  "revenue_per_session",
  "experience_error_rate",
  "core_web_vitals_good_rate",
  "purchase_reconciliation_rate",
]);

const REQUIRED_FILTER_IDS = [
  "date",
  "source",
  "medium",
  "campaign",
  "device",
  "browser",
  "phone_family",
  "phone_model",
];

const REQUIRED_DIMENSION_SOURCES = {
  date: [{ sourceType: "ga4_builtin", apiName: "date", scope: "event" }],
  source: [{ sourceType: "ga4_builtin", apiName: "sessionSource", scope: "session" }],
  medium: [{ sourceType: "ga4_builtin", apiName: "sessionMedium", scope: "session" }],
  campaign: [{ sourceType: "ga4_builtin", apiName: "sessionCampaignName", scope: "session" }],
  device: [{ sourceType: "ga4_builtin", apiName: "deviceCategory", scope: "user" }],
  browser: [{ sourceType: "ga4_builtin", apiName: "browser", scope: "user" }],
  phone_family: [
    {
      sourceType: "ga4_custom_event",
      apiName: "customEvent:brand",
      scope: "event",
      parameter: "brand",
      registeredDisplayName: "Phone family",
    },
    {
      sourceType: "ga4_builtin",
      apiName: "itemBrand",
      scope: "item",
      parameter: "item_brand",
    },
  ],
  phone_model: [
    {
      sourceType: "ga4_custom_event",
      apiName: "customEvent:model",
      scope: "event",
      parameter: "model",
      registeredDisplayName: "Phone model",
    },
    {
      sourceType: "ga4_builtin",
      apiName: "itemVariant",
      scope: "item",
      parameter: "item_variant",
    },
  ],
  cta_placement: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:placement",
    scope: "event",
    parameter: "placement",
    registeredDisplayName: "CTA placement",
  }],
  phone_variant: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:variant_id",
    scope: "event",
    parameter: "variant_id",
    registeredDisplayName: "Phone variant",
  }],
  error_code: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:error_code",
    scope: "event",
    parameter: "error_code",
    registeredDisplayName: "Error code",
  }],
  error_stage: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:stage",
    scope: "event",
    parameter: "stage",
    registeredDisplayName: "Error stage",
  }],
  analytics_contract_version: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:analytics_contract_version",
    scope: "event",
    parameter: "analytics_contract_version",
    registeredDisplayName: "Analytics contract version",
  }],
};

const RATE_METRICS_WITH_CONSENTED_POPULATION = new Set([
  "homepage_cta_rate",
  "catalog_model_selection_rate",
  "editor_first_action_rate",
  "preview_success_rate",
  "preview_failure_rate",
  "add_to_cart_rate",
  "checkout_start_rate",
  "purchase_rate",
  "checkout_completion_rate",
  "experience_error_rate",
  "purchase_reconciliation_rate",
]);

const PLACEHOLDER_PATTERN =
  /\b(?:example|fake|placeholder|synthetic|tbd|todo|unverified)\b/i;

const MANDATORY_EXPORT_PROHIBITED_FIELDS = new Set([
  "address",
  "artwork",
  "artwork_id",
  "client_id",
  "contact",
  "contact_email",
  "contact_name",
  "customer_email",
  "customer_id",
  "customer_name",
  "design_id",
  "design_preview",
  "edm_template_id",
  "email",
  "first_name",
  "free_text",
  "full_name",
  "last_name",
  "name",
  "phone",
  "phone_number",
  "preview_url",
  "shipping_address",
  "street_address",
  "user_id",
]);

const PROHIBITED_CUSTOM_DIMENSION_PARAMETERS = new Set([
  ...MANDATORY_EXPORT_PROHIBITED_FIELDS,
  "order_id",
  "session_id",
  "transaction_id",
]);

const ALLOWED_BUILTIN_DIMENSION_SOURCES = new Map([
  ["date", { scope: "event" }],
  ["sessionSource", { scope: "session" }],
  ["sessionMedium", { scope: "session" }],
  ["sessionCampaignName", { scope: "session" }],
  ["deviceCategory", { scope: "user" }],
  ["browser", { scope: "user" }],
  ["itemBrand", { scope: "item", parameter: "item_brand" }],
  ["itemVariant", { scope: "item", parameter: "item_variant" }],
]);

const ALLOWED_CUSTOM_EVENT_DIMENSION_SOURCES = new Map([
  ["brand", "Phone family"],
  ["model", "Phone model"],
  ["placement", "CTA placement"],
  ["variant_id", "Phone variant"],
  ["error_code", "Error code"],
  ["stage", "Error stage"],
  ["analytics_contract_version", "Analytics contract version"],
]);

const METRIC_PHONE_DIMENSION_BINDINGS = {
  catalog_model_selection_rate: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  editor_first_action_rate: {
    phone_family: "customEvent:brand",
    phone_model: "customEvent:model",
  },
  preview_success_rate: {
    phone_family: "customEvent:brand",
    phone_model: "customEvent:model",
  },
  preview_failure_rate: {
    phone_family: "customEvent:brand",
    phone_model: "customEvent:model",
  },
  add_to_cart_rate: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  checkout_start_rate: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  purchase_rate: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  checkout_completion_rate: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  revenue: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  revenue_per_session: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
  experience_error_rate: {
    phone_family: "customEvent:brand",
    phone_model: "customEvent:model",
  },
  purchase_reconciliation_rate: {
    phone_family: "itemBrand",
    phone_model: "itemVariant",
  },
};

const CANONICAL_DATA_QUALITY = {
  revenueTolerance: {
    absoluteUsd: 0.01,
    relative: 0.001,
  },
  cardinalityCeilings: {
    minimumObservations: 50,
    eventNameMaximumUniqueValues: 25,
    normalizedPathMaximumUniqueRatio: 0.25,
    normalizedPathMaximumUniqueValues: 100,
  },
  requiredSessionDimensions: ["source", "medium", "device", "browser"],
  requiredItemDimensions: [
    "item_id",
    "item_name",
    "item_brand",
    "item_category",
    "item_variant",
  ],
  ecommerceEventsRequiringItems: [
    "view_item_list",
    "select_item",
    "view_item",
    "add_to_cart",
    "begin_checkout",
    "purchase",
    "refund",
  ],
  allowedEventNames: [
    "page_view",
    "view_item_list",
    "select_item",
    "view_item",
    "design_start",
    "editor_first_action",
    "preview_success",
    "preview_failure",
    "design_save",
    "add_to_cart",
    "begin_checkout",
    "purchase",
    "refund",
    "checkout_abandoned",
    "primary_cta_click",
    "editor_error",
    "checkout_error",
    "promo_applied",
  ],
};

const EXPORT_SCHEMA = {
  reportKeys: new Set([
    "exportVersion",
    "generatedAt",
    "sourceSystem",
    "evidenceId",
    "evidenceUrl",
    "window",
    "synthetic",
    "sessions",
    "events",
    "orders",
  ]),
  windowKeys: new Set(["start", "end", "timezone", "dataStatus"]),
  sessionKeys: new Set([
    "session_id",
    "source",
    "medium",
    "campaign",
    "device",
    "browser",
  ]),
  eventKeys: new Set([
    "event_id",
    "event_name",
    "session_id",
    "normalized_path",
    "occurred_at",
    "analytics_contract_version",
    "placement",
    "label",
    "destination",
    "brand",
    "model",
    "variant_id",
    "error_code",
    "stage",
    "code",
    "discount_amount",
    "has_angled_view",
    "item_list_id",
    "item_list_name",
    "transaction_id",
    "currency",
    "value",
    "shipping",
    "coupon",
    "tax",
    "items",
  ]),
  orderKeys: new Set([
    "transaction_id",
    "status",
    "created_at",
    "currency",
    "product_revenue",
    "shipping",
    "tax",
    "total",
    "items",
  ]),
  itemKeys: new Set([
    "item_id",
    "item_name",
    "item_brand",
    "item_category",
    "item_variant",
    "price",
    "quantity",
    "discount",
  ]),
};

const ALLOWED_ORDER_STATUSES = new Set(["paid"]);

const EVENT_REQUIRED_PARAMETERS = new Map([
  ["primary_cta_click", ["placement"]],
  ["design_start", ["brand", "model", "variant_id"]],
  ["editor_first_action", ["brand", "model", "variant_id"]],
  ["preview_success", ["brand", "model", "variant_id"]],
  [
    "preview_failure",
    ["brand", "model", "variant_id", "error_code"],
  ],
  ["design_save", ["brand", "model", "variant_id"]],
  ["editor_error", ["variant_id", "error_code"]],
  ["checkout_error", ["error_code", "stage"]],
]);

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const DEFAULT_FUTURE_SKEW_MS = 5 * 60 * 1000;

const hasExactKeys = (value, keys) =>
  isObject(value) &&
  Object.keys(value).sort().join(",") === [...keys].sort().join(",");

const arraysHaveSameValues = (actual, expected) =>
  Array.isArray(actual) &&
  actual.length === expected.length &&
  [...actual].sort().join("\n") === [...expected].sort().join("\n");

const isBoundedString = (value, maximumLength, pattern) =>
  isNonEmptyString(value) &&
  value.length <= maximumLength &&
  pattern.test(value);

const SAFE_DIMENSION_VALUE_PATTERN = /^[\p{L}\p{N} .,_:/+&'()#-]+$/u;
const SAFE_IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/i;

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const isIsoTimestamp = (value) =>
  isNonEmptyString(value) &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
  Number.isFinite(Date.parse(value));

const isNamedOwner = (value) =>
  isNonEmptyString(value) &&
  value.trim().length >= 2 &&
  !PLACEHOLDER_PATTERN.test(value) &&
  !/\b(?:human assignment|owner role|pending|unassigned)\b/i.test(value);

const isEvidenceText = (value) =>
  isNonEmptyString(value) &&
  value.trim().length >= 10 &&
  !PLACEHOLDER_PATTERN.test(value);

const isEvidenceReference = (value) => {
  if (!isNonEmptyString(value) || PLACEHOLDER_PATTERN.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      !/(?:^|\.)example\.(?:com|org|net|invalid)$/i.test(url.hostname);
  } catch {
    return false;
  }
};

const isEvidenceId = (value) =>
  isNonEmptyString(value) &&
  value.length >= 8 &&
  value.length <= 128 &&
  /^[a-z0-9][a-z0-9._:-]+$/i.test(value) &&
  !PLACEHOLDER_PATTERN.test(value);

const finding = (code, message, location, severity = "error") => ({
  code,
  message,
  location,
  severity,
});

const validateAllowedKeys = (
  value,
  allowedKeys,
  requiredKeys,
  location,
  entityName,
  findings,
) => {
  if (!isObject(value)) {
    findings.push(finding(
      "export_schema_invalid",
      `${entityName} must be a JSON object.`,
      location,
    ));
    return false;
  }
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      findings.push(finding(
        "export_unknown_field",
        `${entityName} contains unsupported field '${key}'.`,
        `${location}.${key}`,
      ));
    }
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) {
      findings.push(finding(
        "export_schema_invalid",
        `${entityName} is missing required field '${key}'.`,
        `${location}.${key}`,
      ));
    }
  }
  return true;
};

const relativeDifference = (actual, expected) => {
  if (expected === 0) return actual === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(actual - expected) / Math.abs(expected);
};

const exceedsTolerance = (actual, expected, tolerance) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return true;
  return Math.abs(actual - expected) > tolerance.absoluteUsd &&
    relativeDifference(actual, expected) > tolerance.relative;
};

const normalizeFieldName = (field) =>
  String(field)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();

const resolveValidationClock = (options = {}) => {
  const nowMs = options.validationTime === undefined
    ? Date.now()
    : Date.parse(options.validationTime);
  const futureSkewMs = options.futureSkewMs ?? DEFAULT_FUTURE_SKEW_MS;
  return {
    nowMs: Number.isFinite(nowMs) ? nowMs : Date.now(),
    futureSkewMs:
      Number.isFinite(futureSkewMs) && futureSkewMs >= 0
        ? futureSkewMs
        : DEFAULT_FUTURE_SKEW_MS,
  };
};

const isFutureTimestamp = (value, clock) =>
  isIsoTimestamp(value) &&
  Date.parse(value) > clock.nowMs + clock.futureSkewMs;

const isTimestampInsideWindow = (value, window) =>
  isIsoTimestamp(value) &&
  isIsoTimestamp(window?.start) &&
  isIsoTimestamp(window?.end) &&
  Date.parse(value) >= Date.parse(window.start) &&
  Date.parse(value) < Date.parse(window.end);

const itemRevenue = (item) => {
  if (
    !isObject(item) ||
    typeof item.price !== "number" ||
    !Number.isFinite(item.price) ||
    item.price < 0 ||
    !Number.isInteger(item.quantity) ||
    item.quantity <= 0 ||
    typeof item.discount !== "number" ||
    !Number.isFinite(item.discount) ||
    item.discount < 0 ||
    item.discount > item.price
  ) {
    return null;
  }
  return (item.price - item.discount) * item.quantity;
};

const itemsRevenue = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;
  let total = 0;
  for (const item of items) {
    const revenue = itemRevenue(item);
    if (revenue === null) return null;
    total += revenue;
  }
  return total;
};

const normalCdf = (value) => {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * x);
  const erf = sign * (
    1 -
    (
      (
        (
          (
            1.061405429 * t -
            1.453152027
          ) * t +
          1.421413741
        ) * t -
        0.284496736
      ) * t +
      0.254829592
    ) * t * Math.exp(-x * x)
  );
  return 0.5 * (1 + erf);
};

const inverseNormalCdf = (probability) => {
  if (!(probability > 0 && probability < 1)) return Number.NaN;
  const a = [
    -39.69683028665376,
    220.9460984245205,
    -275.9285104469687,
    138.357751867269,
    -30.66479806614716,
    2.506628277459239,
  ];
  const b = [
    -54.47609879822406,
    161.5858368580409,
    -155.6989798598866,
    66.80131188771972,
    -13.28068155288572,
  ];
  const c = [
    -0.007784894002430293,
    -0.3223964580411365,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ];
  const d = [
    0.007784695709041462,
    0.3224671290700398,
    2.445134137142996,
    3.754408661907416,
  ];
  const lower = 0.02425;
  const upper = 1 - lower;
  if (probability < lower) {
    const q = Math.sqrt(-2 * Math.log(probability));
    return (
      ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
      c[5]
    ) / (
      (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q +
      1
    );
  }
  if (probability > upper) {
    const q = Math.sqrt(-2 * Math.log(1 - probability));
    return -(
      ((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q +
      c[5]
    ) / (
      (((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q +
      1
    );
  }
  const q = probability - 0.5;
  const r = q * q;
  return (
    (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r +
      a[5]) * q
  ) / (
    ((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r +
    1
  );
};

const requiredTwoProportionSamplePerArm = ({
  baselineRate,
  minimumDetectableEffect,
  alpha,
  power,
}) => {
  if (
    !Number.isFinite(baselineRate) ||
    baselineRate < 0 ||
    baselineRate > 1 ||
    !Number.isFinite(minimumDetectableEffect) ||
    minimumDetectableEffect <= 0 ||
    minimumDetectableEffect >= 1 ||
    !Number.isFinite(alpha) ||
    alpha <= 0 ||
    alpha >= 1 ||
    !Number.isFinite(power) ||
    power <= 0.5 ||
    power >= 1
  ) {
    return Number.NaN;
  }
  const alternativeRate = baselineRate + minimumDetectableEffect <= 1
    ? baselineRate + minimumDetectableEffect
    : baselineRate - minimumDetectableEffect;
  if (alternativeRate < 0 || alternativeRate > 1) return Number.NaN;
  const averageRate = (baselineRate + alternativeRate) / 2;
  const alphaCritical = inverseNormalCdf(1 - alpha / 2);
  const powerCritical = inverseNormalCdf(power);
  const numerator =
    alphaCritical * Math.sqrt(2 * averageRate * (1 - averageRate)) +
    powerCritical *
      Math.sqrt(
        baselineRate * (1 - baselineRate) +
        alternativeRate * (1 - alternativeRate),
      );
  return Math.ceil((numerator * numerator) / (minimumDetectableEffect ** 2));
};

const computeTwoProportionStats = ({
  controlSessions,
  controlConversions,
  variantSessions,
  variantConversions,
  alpha,
}) => {
  const controlRate = controlConversions / controlSessions;
  const variantRate = variantConversions / variantSessions;
  const difference = variantRate - controlRate;
  const pooledRate =
    (controlConversions + variantConversions) /
    (controlSessions + variantSessions);
  const pooledStandardError = Math.sqrt(
    pooledRate *
      (1 - pooledRate) *
      (1 / controlSessions + 1 / variantSessions),
  );
  const intervalStandardError = Math.sqrt(
    controlRate * (1 - controlRate) / controlSessions +
      variantRate * (1 - variantRate) / variantSessions,
  );
  const pValue = pooledStandardError === 0
    ? (difference === 0 ? 1 : 0)
    : 2 * (1 - normalCdf(Math.abs(difference / pooledStandardError)));
  const intervalCritical = inverseNormalCdf(1 - alpha / 2);
  return {
    controlRate,
    variantRate,
    pValue,
    confidenceIntervalLow:
      difference - intervalCritical * intervalStandardError,
    confidenceIntervalHigh:
      difference + intervalCritical * intervalStandardError,
  };
};

const itemKey = (item) =>
  JSON.stringify({
    item_id: item.item_id,
    item_name: item.item_name,
    item_brand: item.item_brand,
    item_category: item.item_category,
    item_variant: item.item_variant,
    price: Number(item.price).toFixed(2),
    quantity: Number(item.quantity),
    discount: Number(item.discount ?? 0).toFixed(2),
  });

const itemsMatch = (eventItems, orderItems) => {
  if (
    !Array.isArray(eventItems) ||
    !Array.isArray(orderItems) ||
    eventItems.some((item) => !isObject(item)) ||
    orderItems.some((item) => !isObject(item))
  ) {
    return false;
  }
  return [...eventItems].map(itemKey).sort().join("\n") ===
    [...orderItems].map(itemKey).sort().join("\n");
};

const collectForbiddenFields = (value, prohibited, location = "$", found = []) => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectForbiddenFields(entry, prohibited, `${location}[${index}]`, found)
    );
    return found;
  }
  if (!isObject(value)) return found;

  Object.entries(value).forEach(([key, nested]) => {
    const nestedLocation = `${location}.${key}`;
    if (prohibited.has(normalizeFieldName(key))) {
      found.push(nestedLocation);
    }
    collectForbiddenFields(nested, prohibited, nestedLocation, found);
  });
  return found;
};

const EMAIL_VALUE_PATTERN =
  /\b[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i;
const PHONE_VALUE_PATTERN = /\+?\d[\d\s().-]{5,}\d/g;
const PHONE_SCREEN_EXEMPT_FIELDS = new Set([
  "analytics_contract_version",
  "created_at",
  "end",
  "event_id",
  "evidenceId",
  "exportVersion",
  "generatedAt",
  "item_id",
  "item_list_id",
  "occurred_at",
  "session_id",
  "start",
  "transaction_id",
  "variant_id",
]);

const containsPhoneLikeValue = (value) => {
  if (isIsoTimestamp(value)) return false;
  for (const match of value.matchAll(PHONE_VALUE_PATTERN)) {
    const candidate = match[0].trim();
    const digits = candidate.replace(/\D/g, "");
    if (
      digits.length >= 7 &&
      digits.length <= 15 &&
      !/^\d{4}-\d{2}-\d{2}$/.test(candidate)
    ) {
      return true;
    }
  }
  return false;
};

const collectUnsafeStringValues = (
  value,
  location = "$",
  found = [],
  fieldName = null,
) => {
  if (typeof value === "string") {
    if (EMAIL_VALUE_PATTERN.test(value)) {
      found.push({ location, kind: "email" });
    } else if (
      !PHONE_SCREEN_EXEMPT_FIELDS.has(fieldName) &&
      containsPhoneLikeValue(value)
    ) {
      found.push({ location, kind: "phone" });
    } else if (value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) {
      found.push({ location, kind: "unsafe_or_oversized" });
    }
    return found;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectUnsafeStringValues(
        entry,
        `${location}[${index}]`,
        found,
        fieldName,
      )
    );
    return found;
  }
  if (!isObject(value)) return found;
  Object.entries(value).forEach(([key, nested]) =>
    collectUnsafeStringValues(nested, `${location}.${key}`, found, key)
  );
  return found;
};

const dimensionSourceMatches = (source, expected) =>
  Object.entries(expected).every(([key, value]) => source?.[key] === value);

const validateDataWindow = (
  window,
  reportingTimezone,
  location,
  findings,
  clock,
) => {
  if (
    !isObject(window) ||
    !isIsoTimestamp(window.start) ||
    !isIsoTimestamp(window.end) ||
    Date.parse(window.start) >= Date.parse(window.end) ||
    window.timezone !== reportingTimezone ||
    window.dataStatus !== "complete_t_plus_1"
  ) {
    findings.push(finding(
      "lifecycle_window_invalid",
      "Evidence-backed lifecycle windows require valid ascending ISO timestamps, the reporting timezone, and complete_t_plus_1 data status.",
      location,
    ));
    return false;
  }
  if (
    isFutureTimestamp(window.start, clock) ||
    isFutureTimestamp(window.end, clock)
  ) {
    findings.push(finding(
      "lifecycle_window_in_future",
      "Evidence-backed lifecycle windows cannot extend beyond the validation time plus the allowed clock skew.",
      location,
    ));
    return false;
  }
  return true;
};

const validateEvidenceRecord = ({
  record,
  status,
  completedStatus,
  timestampField,
  location,
  reportingTimezone,
  maximumLagHours,
  findings,
  requireWindow = false,
  clock,
}) => {
  if (status !== completedStatus) return false;

  if (!isIsoTimestamp(record?.[timestampField])) {
    findings.push(finding(
      "lifecycle_timestamp_missing",
      `Status '${completedStatus}' requires a valid ${timestampField} ISO timestamp.`,
      `${location}.${timestampField}`,
    ));
  } else if (isFutureTimestamp(record[timestampField], clock)) {
    findings.push(finding(
      "lifecycle_timestamp_in_future",
      `Status '${completedStatus}' cannot use a future ${timestampField} timestamp.`,
      `${location}.${timestampField}`,
    ));
  }
  if (!isNamedOwner(record?.ownerName)) {
    findings.push(finding(
      "lifecycle_owner_missing",
      `Status '${completedStatus}' requires a named human owner.`,
      `${location}.ownerName`,
    ));
  }
  if (!isEvidenceReference(record?.evidenceUrl)) {
    findings.push(finding(
      "lifecycle_evidence_missing",
      `Status '${completedStatus}' requires a non-placeholder HTTPS evidence reference.`,
      `${location}.evidenceUrl`,
    ));
  }
  if (!isEvidenceText(record?.notes)) {
    findings.push(finding(
      "lifecycle_notes_missing",
      `Status '${completedStatus}' requires evidence notes without placeholder or synthetic claims.`,
      `${location}.notes`,
    ));
  }

  if (requireWindow) {
    const validWindow = validateDataWindow(
      record?.window,
      reportingTimezone,
      `${location}.window`,
      findings,
      clock,
    );
    if (validWindow && isIsoTimestamp(record?.[timestampField])) {
      const lagHours =
        (Date.parse(record[timestampField]) - Date.parse(record.window.end)) /
        3_600_000;
      if (lagHours < 0 || lagHours > maximumLagHours) {
        findings.push(finding(
          "lifecycle_freshness_invalid",
          `Evidence must be recorded after the complete data window and within ${maximumLagHours} hours.`,
          `${location}.${timestampField}`,
        ));
      }
    }
  }

  return true;
};

const hasUnexpectedPendingEvidence = (record, fields) =>
  fields.some((field) => record?.[field] !== null && record?.[field] !== undefined);

export const loadJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf8"));

export const validateReportingContract = (contract, options = {}) => {
  const findings = [];
  const clock = resolveValidationClock(options);
  if (!isNonEmptyString(contract?.contractVersion)) {
    findings.push(finding("contract_version_missing", "Contract version is required.", "$.contractVersion"));
  }
  if (!isNonEmptyString(contract?.reportingTimezone)) {
    findings.push(finding("timezone_missing", "Reporting timezone is required.", "$.reportingTimezone"));
  }

  const filters = Array.isArray(contract?.dashboard?.requiredFilters)
    ? contract.dashboard.requiredFilters
    : [];
  const filterIds = new Set(filters.map((filter) => filter.id));
  for (const requiredFilter of REQUIRED_FILTER_IDS) {
    if (!filterIds.has(requiredFilter)) {
      findings.push(finding(
        "required_filter_missing",
        `Required dashboard filter '${requiredFilter}' is missing.`,
        "$.dashboard.requiredFilters",
      ));
    }
  }

  const configuredProhibitedFields = new Set(
    Array.isArray(contract?.privacy?.prohibitedFields)
      ? contract.privacy.prohibitedFields.map(normalizeFieldName)
      : [],
  );
  for (const mandatoryField of MANDATORY_EXPORT_PROHIBITED_FIELDS) {
    if (!configuredProhibitedFields.has(mandatoryField)) {
      findings.push(finding(
        "mandatory_prohibited_field_missing",
        `Privacy configuration must prohibit '${mandatoryField}'.`,
        "$.privacy.prohibitedFields",
      ));
    }
  }
  if (
    !isNonEmptyString(contract?.privacy?.consentedRateLabel) ||
    !/\bconsented\b/i.test(contract.privacy.consentedRateLabel)
  ) {
    findings.push(finding(
      "consented_rate_label_missing",
      "The contract must provide an explicit consented-only rate label.",
      "$.privacy.consentedRateLabel",
    ));
  }
  if (
    !Number.isInteger(contract?.privacy?.minimumCellSize) ||
    contract.privacy.minimumCellSize < 10
  ) {
    findings.push(finding(
      "minimum_cell_size_invalid",
      "Segmented reports must suppress cells with fewer than 10 sessions.",
      "$.privacy.minimumCellSize",
    ));
  }

  const dataQuality = contract?.dataQuality;
  const tolerance = dataQuality?.revenueTolerance;
  if (
    typeof tolerance?.absoluteUsd !== "number" ||
    !Number.isFinite(tolerance.absoluteUsd) ||
    tolerance.absoluteUsd < 0 ||
    tolerance.absoluteUsd > CANONICAL_DATA_QUALITY.revenueTolerance.absoluteUsd ||
    typeof tolerance?.relative !== "number" ||
    !Number.isFinite(tolerance.relative) ||
    tolerance.relative < 0 ||
    tolerance.relative > CANONICAL_DATA_QUALITY.revenueTolerance.relative
  ) {
    findings.push(finding(
      "data_quality_policy_invalid",
      "Revenue tolerance cannot exceed $0.01 absolute or 0.001 relative.",
      "$.dataQuality.revenueTolerance",
    ));
  }
  for (const [field, maximum] of Object.entries(
    CANONICAL_DATA_QUALITY.cardinalityCeilings,
  )) {
    const value = dataQuality?.cardinality?.[field];
    const validValue = field === "normalizedPathMaximumUniqueRatio"
      ? typeof value === "number" && Number.isFinite(value) && value > 0
      : Number.isInteger(value) && value > 0;
    if (!validValue || value > maximum) {
      findings.push(finding(
        "data_quality_policy_invalid",
        `Cardinality policy '${field}' must be positive and cannot exceed ${maximum}.`,
        `$.dataQuality.cardinality.${field}`,
      ));
    }
  }
  for (const field of [
    "requiredSessionDimensions",
    "requiredItemDimensions",
    "ecommerceEventsRequiringItems",
    "allowedEventNames",
  ]) {
    if (!arraysHaveSameValues(dataQuality?.[field], CANONICAL_DATA_QUALITY[field])) {
      findings.push(finding(
        "data_quality_policy_invalid",
        `Data-quality policy '${field}' must match the canonical reporting contract.`,
        `$.dataQuality.${field}`,
      ));
    }
  }

  const freshness = contract?.dashboard?.decisionFreshness;
  if (
    freshness?.dataStatus !== "complete_t_plus_1" ||
    freshness?.timezone !== contract?.reportingTimezone ||
    !Number.isFinite(freshness?.maximumLagHours) ||
    freshness.maximumLagHours <= 0 ||
    freshness.maximumLagHours > 48
  ) {
    findings.push(finding(
      "decision_freshness_invalid",
      "Decision reporting must require complete T+1 data in the reporting timezone with a maximum lag of 48 hours.",
      "$.dashboard.decisionFreshness",
    ));
  }
  const maximumLagHours = Number(freshness?.maximumLagHours || 0);

  const reportingDimensions = Array.isArray(contract?.dashboard?.reportingDimensions)
    ? contract.dashboard.reportingDimensions
    : [];
  const dimensionIds = new Set();
  reportingDimensions.forEach((dimension, index) => {
    const location = `$.dashboard.reportingDimensions[${index}]`;
    const sources = Array.isArray(dimension?.sources) ? dimension.sources : [];
    if (!isNonEmptyString(dimension?.id) || dimensionIds.has(dimension.id)) {
      findings.push(finding(
        "reporting_dimension_id_invalid",
        "Reporting dimension IDs must be present and unique.",
        `${location}.id`,
      ));
    }
    dimensionIds.add(dimension?.id);
    if (!Object.hasOwn(REQUIRED_DIMENSION_SOURCES, dimension?.id)) {
      findings.push(finding(
        "reporting_dimension_unexpected",
        `Reporting dimension '${dimension?.id ?? index}' is not part of the authoritative dimension map.`,
        `${location}.id`,
      ));
    }
    if (
      !isNonEmptyString(dimension?.label) ||
      !Array.isArray(dimension?.usage) ||
      dimension.usage.length === 0 ||
      sources.length === 0
    ) {
      findings.push(finding(
        "reporting_dimension_definition_incomplete",
        `Reporting dimension '${dimension?.id ?? index}' requires a label, usage, and source mapping.`,
        location,
      ));
    }
    for (const [sourceIndex, source] of sources.entries()) {
      const sourceLocation = `${location}.sources[${sourceIndex}]`;
      let validSource = false;
      if (isObject(source) && source.sourceType === "ga4_builtin") {
        const allowed = ALLOWED_BUILTIN_DIMENSION_SOURCES.get(source.apiName);
        const expectedKeys = allowed?.parameter === undefined
          ? ["sourceType", "apiName", "scope"]
          : ["sourceType", "apiName", "scope", "parameter"];
        validSource = hasExactKeys(source, expectedKeys) &&
          Boolean(allowed) &&
          source.scope === allowed.scope &&
          (
            allowed.parameter === undefined
              ? source.parameter === undefined
              : source.parameter === allowed.parameter
          );
      } else if (isObject(source) && source.sourceType === "ga4_custom_event") {
        const expectedDisplayName =
          ALLOWED_CUSTOM_EVENT_DIMENSION_SOURCES.get(source.parameter);
        validSource = hasExactKeys(source, [
          "sourceType",
          "apiName",
          "scope",
          "parameter",
          "registeredDisplayName",
        ]) &&
          Boolean(expectedDisplayName) &&
          source.scope === "event" &&
          source.apiName === `customEvent:${source.parameter}` &&
          source.registeredDisplayName === expectedDisplayName &&
          !configuredProhibitedFields.has(normalizeFieldName(source.parameter)) &&
          !PROHIBITED_CUSTOM_DIMENSION_PARAMETERS.has(
            normalizeFieldName(source.parameter),
          );
      }
      if (!validSource) {
        findings.push(finding(
          "reporting_dimension_source_invalid",
          "Reporting sources must be an allowlisted GA4 built-in mapping or one of the seven registered event-scoped custom dimensions.",
          sourceLocation,
        ));
      }
    }
  });

  filters.forEach((filter, index) => {
    const mappedDimension = reportingDimensions.find(
      (dimension) =>
        dimension?.id === filter?.id &&
        Array.isArray(dimension.usage) &&
        dimension.usage.includes("filter"),
    );
    if (!mappedDimension) {
      findings.push(finding(
        "required_filter_mapping_missing",
        `Dashboard filter '${filter?.id ?? index}' must map to a reporting dimension with filter usage.`,
        `$.dashboard.requiredFilters[${index}]`,
      ));
    }
  });

  for (const [dimensionId, expectedSources] of Object.entries(REQUIRED_DIMENSION_SOURCES)) {
    const dimension = reportingDimensions.find((entry) => entry?.id === dimensionId);
    if (!dimension) {
      findings.push(finding(
        "required_dimension_mapping_missing",
        `Required reporting dimension '${dimensionId}' is missing.`,
        "$.dashboard.reportingDimensions",
      ));
      continue;
    }
    const sources = Array.isArray(dimension.sources) ? dimension.sources : [];
    if (
      sources.length !== expectedSources.length ||
      sources.some(
        (source) =>
          !expectedSources.some((expected) =>
            dimensionSourceMatches(source, expected)
          ),
      )
    ) {
      findings.push(finding(
        "reporting_dimension_source_invalid",
        `Reporting dimension '${dimensionId}' may contain only its authoritative source mapping(s).`,
        `$.dashboard.reportingDimensions[${reportingDimensions.indexOf(dimension)}].sources`,
      ));
    }
    for (const expected of expectedSources) {
      if (!sources.some((source) => dimensionSourceMatches(source, expected))) {
        findings.push(finding(
          "required_dimension_source_missing",
          `Reporting dimension '${dimensionId}' is missing its ${expected.scope}-scoped ${expected.apiName} source.`,
          `$.dashboard.reportingDimensions[${reportingDimensions.indexOf(dimension)}].sources`,
        ));
      }
    }
    if (
      REQUIRED_FILTER_IDS.includes(dimensionId) &&
      !(dimension.usage ?? []).includes("filter")
    ) {
      findings.push(finding(
        "required_filter_mapping_invalid",
        `Reporting dimension '${dimensionId}' must be available as a dashboard filter.`,
        `$.dashboard.reportingDimensions[${reportingDimensions.indexOf(dimension)}].usage`,
      ));
    }
    if (!(dimension.usage ?? []).includes("breakdown")) {
      findings.push(finding(
        "required_breakdown_mapping_invalid",
        `Reporting dimension '${dimensionId}' must be available as a dashboard breakdown.`,
        `$.dashboard.reportingDimensions[${reportingDimensions.indexOf(dimension)}].usage`,
      ));
    }
  }

  const metrics = Array.isArray(contract?.metrics) ? contract.metrics : [];
  const metricIds = new Set();
  metrics.forEach((metric, index) => {
    const location = `$.metrics[${index}]`;
    if (!isNonEmptyString(metric.id)) {
      findings.push(finding("metric_id_missing", "Metric ID is required.", `${location}.id`));
      return;
    }
    if (metricIds.has(metric.id)) {
      findings.push(finding("metric_id_duplicate", `Metric ID '${metric.id}' is duplicated.`, `${location}.id`));
    }
    metricIds.add(metric.id);
    for (const field of ["name", "numerator", "denominator", "freshness", "timezone", "ownerRole"]) {
      if (!isNonEmptyString(metric[field])) {
        findings.push(finding("metric_definition_incomplete", `Metric '${metric.id}' is missing ${field}.`, `${location}.${field}`));
      }
    }
    if (!Array.isArray(metric.sources) || metric.sources.length === 0) {
      findings.push(finding("metric_source_missing", `Metric '${metric.id}' requires a source.`, `${location}.sources`));
    }
    if (!Array.isArray(metric.filters) || metric.filters.some((id) => !filterIds.has(id))) {
      findings.push(finding("metric_filter_invalid", `Metric '${metric.id}' references an undefined filter.`, `${location}.filters`));
    }
    const expectedPhoneBindings = METRIC_PHONE_DIMENSION_BINDINGS[metric.id];
    if (expectedPhoneBindings) {
      for (const [filterId, expectedApiName] of Object.entries(expectedPhoneBindings)) {
        const mappedDimension = reportingDimensions.find(
          (dimension) => dimension?.id === filterId,
        );
        const sourceExists =
          Array.isArray(mappedDimension?.sources) &&
          mappedDimension.sources.some(
            (source) => source?.apiName === expectedApiName,
          );
        if (
          metric.dimensionBindings?.[filterId] !== expectedApiName ||
          !sourceExists
        ) {
          findings.push(finding(
            "metric_dimension_binding_invalid",
            `Metric '${metric.id}' must bind '${filterId}' to '${expectedApiName}'.`,
            `${location}.dimensionBindings.${filterId}`,
          ));
        }
      }
    }
    if (
      RATE_METRICS_WITH_CONSENTED_POPULATION.has(metric.id) &&
      !["consented_ga4_sessions", "consented_paid_orders"].includes(metric.populationScope)
    ) {
      findings.push(finding(
        "metric_consent_scope_missing",
        `Rate metric '${metric.id}' must declare its consented population scope.`,
        `${location}.populationScope`,
      ));
    }
  });

  for (const requiredMetric of REQUIRED_METRICS) {
    if (!metricIds.has(requiredMetric)) {
      findings.push(finding(
        "required_metric_missing",
        `Required metric '${requiredMetric}' is missing.`,
        "$.metrics",
      ));
    }
  }

  const experiments = Array.isArray(contract?.experiments) ? contract.experiments : [];
  if (experiments.length !== 5) {
    findings.push(finding("experiment_count_invalid", "Exactly five ranked launch experiments are required.", "$.experiments"));
  }
  const ranks = experiments.map((experiment) => experiment.rank).sort((a, b) => a - b);
  if (ranks.join(",") !== "1,2,3,4,5") {
    findings.push(finding("experiment_ranks_invalid", "Experiment ranks must be unique and sequential from 1 to 5.", "$.experiments"));
  }
  experiments.forEach((experiment, index) => {
    const location = `$.experiments[${index}]`;
    for (const field of ["id", "name", "hypothesis", "audience", "primaryMetric", "effort", "minimumRunRule", "stopCriteria"]) {
      if (!isNonEmptyString(experiment[field])) {
        findings.push(finding("experiment_definition_incomplete", `Experiment rank ${experiment.rank ?? index + 1} is missing ${field}.`, `${location}.${field}`));
      }
    }
    if (!metricIds.has(experiment.primaryMetric)) {
      findings.push(finding("experiment_metric_invalid", `Experiment '${experiment.id}' has an undefined primary metric.`, `${location}.primaryMetric`));
    }
    if (
      !Array.isArray(experiment.guardrailMetrics) ||
      experiment.guardrailMetrics.length === 0 ||
      experiment.guardrailMetrics.some((id) => !metricIds.has(id))
    ) {
      findings.push(finding("experiment_guardrails_invalid", `Experiment '${experiment.id}' needs valid guardrail metrics.`, `${location}.guardrailMetrics`));
    }
    if (
      !isObject(experiment.scores) ||
      !["impact", "confidence", "effort"].every((score) =>
        Number.isInteger(experiment.scores[score]) &&
        experiment.scores[score] >= 1 &&
        experiment.scores[score] <= 5
      )
    ) {
      findings.push(finding(
        "experiment_scores_invalid",
        `Experiment '${experiment.id}' needs 1-5 impact, confidence, and effort scores.`,
        `${location}.scores`,
      ));
    }
    const baseline = experiment.baseline;
    if (!["pending", "captured"].includes(baseline?.status)) {
      findings.push(finding(
        "experiment_baseline_status_invalid",
        `Experiment '${experiment.id}' baseline status must be pending or captured.`,
        `${location}.baseline.status`,
      ));
    } else if (baseline.status === "pending") {
      if (
        baseline.value !== null ||
        hasUnexpectedPendingEvidence(baseline, [
          "capturedAt",
          "ownerName",
          "evidenceUrl",
          "window",
          "notes",
        ])
      ) {
        findings.push(finding(
          "experiment_baseline_pending_has_evidence",
          `Experiment '${experiment.id}' cannot carry baseline evidence while pending.`,
          `${location}.baseline`,
        ));
      }
    } else {
      validateEvidenceRecord({
        record: baseline,
        status: baseline.status,
        completedStatus: "captured",
        timestampField: "capturedAt",
        location: `${location}.baseline`,
        reportingTimezone: contract.reportingTimezone,
        maximumLagHours,
        findings,
        requireWindow: true,
        clock,
      });
      if (
        !Number.isFinite(baseline.value) ||
        baseline.value < 0 ||
        baseline.value > 1
      ) {
        findings.push(finding(
          "experiment_baseline_value_invalid",
          `Experiment '${experiment.id}' requires a finite 0-1 baseline rate.`,
          `${location}.baseline.value`,
        ));
      }
      if (contract?.dashboard?.baseline?.status !== "captured") {
        findings.push(finding(
          "experiment_baseline_without_dashboard_baseline",
          `Experiment '${experiment.id}' cannot capture a baseline before the dashboard baseline is captured.`,
          `${location}.baseline`,
        ));
      }
    }

    const result = experiment.result;
    if (!["pending", "recorded"].includes(result?.status)) {
      findings.push(finding(
        "experiment_result_status_invalid",
        `Experiment '${experiment.id}' result status must be pending or recorded.`,
        `${location}.result.status`,
      ));
    } else if (result.status === "pending") {
      if (
        result.winner !== null ||
        hasUnexpectedPendingEvidence(result, [
          "recordedAt",
          "ownerName",
          "evidenceUrl",
          "window",
          "controlValue",
          "variantValue",
          "decision",
          "analysisType",
          "minimumRunStatus",
          "guardrailStatus",
          "eligibleSessions",
          "requiredSessions",
          "minimumDays",
          "minimumCycles",
          "completedCycles",
          "statisticalMethod",
          "controlSessions",
          "controlConversions",
          "variantSessions",
          "variantConversions",
          "minimumDetectableEffect",
          "alpha",
          "power",
          "requiredSamplePerArm",
          "pValue",
          "confidenceIntervalLow",
          "confidenceIntervalHigh",
          "directionalSignificance",
          "notes",
        ])
      ) {
        findings.push(finding(
          "experiment_result_pending_has_evidence",
          `Experiment '${experiment.id}' cannot carry result evidence while pending.`,
          `${location}.result`,
        ));
      }
    } else {
      validateEvidenceRecord({
        record: result,
        status: result.status,
        completedStatus: "recorded",
        timestampField: "recordedAt",
        location: `${location}.result`,
        reportingTimezone: contract.reportingTimezone,
        maximumLagHours,
        findings,
        requireWindow: true,
        clock,
      });
      if (baseline?.status !== "captured") {
        findings.push(finding(
          "experiment_result_without_baseline",
          `Experiment '${experiment.id}' cannot record a result before its baseline is captured.`,
          `${location}.result`,
        ));
      }
      if (contract?.dashboard?.reconciliation?.status !== "completed") {
        findings.push(finding(
          "experiment_result_without_reconciliation",
          `Experiment '${experiment.id}' cannot record a result before purchase/order reconciliation is completed.`,
          `${location}.result`,
        ));
      }
      if (
        !Number.isFinite(result.controlValue) ||
        result.controlValue < 0 ||
        result.controlValue > 1 ||
        !Number.isFinite(result.variantValue) ||
        result.variantValue < 0 ||
        result.variantValue > 1
      ) {
        findings.push(finding(
          "experiment_result_values_invalid",
          `Experiment '${experiment.id}' requires finite 0-1 control and variant rates.`,
          `${location}.result`,
        ));
      }
      const decisionWinnerPairs = {
        roll_out_variant: "variant",
        keep_control: "control",
        inconclusive: null,
      };
      if (
        !Object.hasOwn(decisionWinnerPairs, result.decision) ||
        result.winner !== decisionWinnerPairs[result.decision]
      ) {
        findings.push(finding(
          "experiment_result_decision_invalid",
          `Experiment '${experiment.id}' requires a supported decision with a matching winner.`,
          `${location}.result`,
        ));
      }
      if (
        (
          result.decision === "roll_out_variant" &&
          Number.isFinite(result.controlValue) &&
          Number.isFinite(result.variantValue) &&
          result.variantValue <= result.controlValue
        ) ||
        (
          result.decision === "keep_control" &&
          Number.isFinite(result.controlValue) &&
          Number.isFinite(result.variantValue) &&
          result.controlValue < result.variantValue
        )
      ) {
        findings.push(finding(
          "experiment_result_value_decision_mismatch",
          `Experiment '${experiment.id}' decision contradicts its control and variant values.`,
          `${location}.result`,
        ));
      }

      const countFieldsAreValid =
        Number.isInteger(result.controlSessions) &&
        result.controlSessions > 0 &&
        Number.isInteger(result.controlConversions) &&
        result.controlConversions >= 0 &&
        result.controlConversions <= result.controlSessions &&
        Number.isInteger(result.variantSessions) &&
        result.variantSessions > 0 &&
        Number.isInteger(result.variantConversions) &&
        result.variantConversions >= 0 &&
        result.variantConversions <= result.variantSessions;
      const preregistrationFieldsAreValid =
        result.statisticalMethod === "two_proportion_z_test" &&
        typeof result.minimumDetectableEffect === "number" &&
        Number.isFinite(result.minimumDetectableEffect) &&
        result.minimumDetectableEffect > 0 &&
        result.minimumDetectableEffect < 1 &&
        typeof result.alpha === "number" &&
        Number.isFinite(result.alpha) &&
        result.alpha > 0 &&
        result.alpha <= 0.05 &&
        typeof result.power === "number" &&
        Number.isFinite(result.power) &&
        result.power >= 0.8 &&
        result.power < 1 &&
        Number.isInteger(result.requiredSamplePerArm) &&
        result.requiredSamplePerArm >= 100;
      const derivedRequiredSample = preregistrationFieldsAreValid &&
          baseline?.status === "captured"
        ? requiredTwoProportionSamplePerArm({
          baselineRate: baseline.value,
          minimumDetectableEffect: result.minimumDetectableEffect,
          alpha: result.alpha,
          power: result.power,
        })
        : Number.NaN;
      const computedStats = countFieldsAreValid
        ? computeTwoProportionStats(result)
        : null;
      const computedDirection = computedStats &&
          typeof result.alpha === "number" &&
          computedStats.pValue < result.alpha &&
          computedStats.confidenceIntervalLow > 0
        ? "variant"
        : computedStats &&
            typeof result.alpha === "number" &&
            computedStats.pValue < result.alpha &&
            computedStats.confidenceIntervalHigh < 0
          ? "control"
          : "none";
      const declaredStatisticsMatch =
        computedStats !== null &&
        typeof result.pValue === "number" &&
        Number.isFinite(result.pValue) &&
        result.pValue >= 0 &&
        result.pValue <= 1 &&
        Math.abs(result.pValue - computedStats.pValue) <= 0.0001 &&
        typeof result.confidenceIntervalLow === "number" &&
        Number.isFinite(result.confidenceIntervalLow) &&
        Math.abs(
          result.confidenceIntervalLow -
            computedStats.confidenceIntervalLow,
        ) <= 0.0001 &&
        typeof result.confidenceIntervalHigh === "number" &&
        Number.isFinite(result.confidenceIntervalHigh) &&
        result.confidenceIntervalLow < result.confidenceIntervalHigh &&
        Math.abs(
          result.confidenceIntervalHigh -
            computedStats.confidenceIntervalHigh,
        ) <= 0.0001 &&
        result.directionalSignificance === computedDirection &&
        Math.abs(result.controlValue - computedStats.controlRate) <= 0.000001 &&
        Math.abs(result.variantValue - computedStats.variantRate) <= 0.000001;
      const statisticalEvidenceIsValid =
        countFieldsAreValid &&
        preregistrationFieldsAreValid &&
        Number.isFinite(derivedRequiredSample) &&
        result.requiredSamplePerArm >= derivedRequiredSample &&
        result.requiredSessions === result.requiredSamplePerArm * 2 &&
        result.eligibleSessions ===
          result.controlSessions + result.variantSessions &&
        declaredStatisticsMatch;
      if (!statisticalEvidenceIsValid) {
        findings.push(finding(
          "experiment_statistical_evidence_invalid",
          `Experiment '${experiment.id}' requires count-derived rates, p-value, confidence interval, and a required sample derived from baseline, MDE, alpha, and power.`,
          `${location}.result`,
        ));
      }
      const winnerStatisticallySupported =
        statisticalEvidenceIsValid &&
        result.winner !== null &&
        result.controlSessions >= result.requiredSamplePerArm &&
        result.variantSessions >= result.requiredSamplePerArm &&
        result.pValue < result.alpha &&
        result.directionalSignificance === result.winner;
      if (result.winner !== null && !winnerStatisticallySupported) {
        findings.push(finding(
          "experiment_winner_not_significant",
          `Experiment '${experiment.id}' cannot declare a winner without the derived per-arm sample and directional statistical significance.`,
          `${location}.result`,
        ));
      }

      const integerMinimumRunFields = [
        "eligibleSessions",
        "requiredSessions",
        "minimumDays",
        "minimumCycles",
        "completedCycles",
      ];
      const structuredMinimumRunValuesAreValid =
        integerMinimumRunFields.every(
          (field) =>
            Number.isInteger(result[field]) &&
            result[field] >= (field === "eligibleSessions" ? 0 : 1),
        );
      const resultWindowDurationDays =
        isIsoTimestamp(result.window?.start) &&
          isIsoTimestamp(result.window?.end)
          ? (
            Date.parse(result.window.end) - Date.parse(result.window.start)
          ) / 86_400_000
          : 0;
      const preRegisteredMinimumRunPassed =
        result.analysisType === "pre_registered_experiment" &&
        result.minimumRunStatus === "met" &&
        result.guardrailStatus === "passed" &&
        structuredMinimumRunValuesAreValid &&
        result.requiredSessions > 0 &&
        result.eligibleSessions >= result.requiredSessions &&
        statisticalEvidenceIsValid &&
        result.controlSessions >= result.requiredSamplePerArm &&
        result.variantSessions >= result.requiredSamplePerArm &&
        result.minimumDays >= 14 &&
        result.minimumCycles >= 2 &&
        result.completedCycles >= result.minimumCycles &&
        resultWindowDurationDays >= result.minimumDays;
      const observationalReleaseIsValid =
        result.analysisType === "observational_release" &&
        result.minimumRunStatus === "not_met" &&
        result.guardrailStatus === "passed" &&
        structuredMinimumRunValuesAreValid &&
        result.decision === "inconclusive" &&
        result.winner === null;
      if (
        !preRegisteredMinimumRunPassed &&
        !observationalReleaseIsValid
      ) {
        findings.push(finding(
          "experiment_minimum_run_invalid",
          `Experiment '${experiment.id}' requires structured sample, duration, cycle, and guardrail evidence; winners require a passing pre-registered run.`,
          `${location}.result`,
        ));
      }
      if (
        baseline?.status === "captured" &&
        isObject(baseline.window) &&
        isObject(result.window) &&
        isIsoTimestamp(baseline.window.end) &&
        isIsoTimestamp(result.window.start) &&
        Date.parse(result.window.start) < Date.parse(baseline.window.end)
      ) {
        findings.push(finding(
          "experiment_result_window_overlaps_baseline",
          `Experiment '${experiment.id}' result window cannot start before its baseline window ends.`,
          `${location}.result.window`,
        ));
      }
    }
  });

  const first = experiments.find((experiment) => experiment.rank === 1);
  if (
    !Array.isArray(first?.implementationPlan) ||
    first.implementationPlan.length < 3 ||
    !Array.isArray(first?.analysisPlan) ||
    first.analysisPlan.length < 3 ||
    !isNonEmptyString(first?.accessibilityGuardrail) ||
    !isNonEmptyString(first?.performanceGuardrail)
  ) {
    findings.push(finding(
      "first_experiment_plan_incomplete",
      "The rank-one experiment needs implementation, analysis, accessibility, and performance plans.",
      "$.experiments",
    ));
  }

  const dashboard = contract?.dashboard;
  if (!["pending_external_ga4_access", "created"].includes(dashboard?.status)) {
    findings.push(finding(
      "dashboard_status_invalid",
      "Dashboard status must be pending_external_ga4_access or created.",
      "$.dashboard.status",
    ));
  } else if (dashboard.status === "pending_external_ga4_access") {
    if (
      hasUnexpectedPendingEvidence(dashboard, [
        "createdAt",
        "ownerName",
        "evidenceUrl",
        "notes",
      ])
    ) {
      findings.push(finding(
        "dashboard_pending_has_evidence",
        "A pending dashboard cannot carry creation evidence.",
        "$.dashboard",
      ));
    }
  } else {
    validateEvidenceRecord({
      record: dashboard,
      status: dashboard.status,
      completedStatus: "created",
      timestampField: "createdAt",
      location: "$.dashboard",
      reportingTimezone: contract.reportingTimezone,
      maximumLagHours,
      findings,
      clock,
    });
  }

  const dashboardBaseline = dashboard?.baseline;
  if (!["pending", "captured"].includes(dashboardBaseline?.status)) {
    findings.push(finding(
      "dashboard_baseline_status_invalid",
      "Dashboard baseline status must be pending or captured.",
      "$.dashboard.baseline.status",
    ));
  } else if (dashboardBaseline.status === "pending") {
    if (
      hasUnexpectedPendingEvidence(dashboardBaseline, [
        "capturedAt",
        "ownerName",
        "evidenceUrl",
        "window",
        "notes",
      ])
    ) {
      findings.push(finding(
        "dashboard_baseline_pending_has_evidence",
        "A pending dashboard baseline cannot carry evidence.",
        "$.dashboard.baseline",
      ));
    }
  } else {
    validateEvidenceRecord({
      record: dashboardBaseline,
      status: dashboardBaseline.status,
      completedStatus: "captured",
      timestampField: "capturedAt",
      location: "$.dashboard.baseline",
      reportingTimezone: contract.reportingTimezone,
      maximumLagHours,
      findings,
      requireWindow: true,
      clock,
    });
    if (dashboard?.status !== "created") {
      findings.push(finding(
        "dashboard_baseline_without_dashboard",
        "A dashboard baseline cannot be captured before the report is created.",
        "$.dashboard.baseline",
      ));
    }
  }

  const reconciliation = dashboard?.reconciliation;
  if (!["pending", "completed"].includes(reconciliation?.status)) {
    findings.push(finding(
      "reconciliation_status_invalid",
      "Reconciliation status must be pending or completed.",
      "$.dashboard.reconciliation.status",
    ));
  } else if (reconciliation.status === "pending") {
    if (
      hasUnexpectedPendingEvidence(reconciliation, [
        "completedAt",
        "ownerName",
        "evidenceUrl",
        "window",
        "purchaseCount",
        "paidOrderCount",
        "purchaseRevenue",
        "paidOrderProductRevenue",
        "decision",
        "exportEvidenceId",
        "exportGeneratedAt",
        "exportSource",
        "notes",
      ])
    ) {
      findings.push(finding(
        "reconciliation_pending_has_evidence",
        "A pending reconciliation cannot carry completion evidence.",
        "$.dashboard.reconciliation",
      ));
    }
  } else {
    validateEvidenceRecord({
      record: reconciliation,
      status: reconciliation.status,
      completedStatus: "completed",
      timestampField: "completedAt",
      location: "$.dashboard.reconciliation",
      reportingTimezone: contract.reportingTimezone,
      maximumLagHours,
      findings,
      requireWindow: true,
      clock,
    });
    if (
      !Number.isInteger(reconciliation.purchaseCount) ||
      reconciliation.purchaseCount <= 0 ||
      !Number.isInteger(reconciliation.paidOrderCount) ||
      reconciliation.paidOrderCount <= 0 ||
      reconciliation.purchaseCount !== reconciliation.paidOrderCount
    ) {
      findings.push(finding(
        "reconciliation_counts_invalid",
        "Completed reconciliation requires equal positive purchase and paid-order counts.",
        "$.dashboard.reconciliation",
      ));
    }
    const reconciliationRevenueIsValid = [
      reconciliation.purchaseRevenue,
      reconciliation.paidOrderProductRevenue,
    ].every((value) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= 0
    );
    if (!reconciliationRevenueIsValid) {
      findings.push(finding(
        "reconciliation_revenue_invalid",
        "Completed reconciliation requires finite non-negative numeric purchase and paid-order revenue.",
        "$.dashboard.reconciliation",
      ));
    }
    if (
      !isEvidenceId(reconciliation.exportEvidenceId) ||
      !isIsoTimestamp(reconciliation.exportGeneratedAt) ||
      !isEvidenceText(reconciliation.exportSource)
    ) {
      findings.push(finding(
        "reconciliation_export_identity_invalid",
        "Completed reconciliation requires a non-placeholder export evidence ID, generated timestamp, and source.",
        "$.dashboard.reconciliation",
      ));
    } else if (isFutureTimestamp(reconciliation.exportGeneratedAt, clock)) {
      findings.push(finding(
        "lifecycle_timestamp_in_future",
        "Completed reconciliation cannot identify an export generated in the future.",
        "$.dashboard.reconciliation.exportGeneratedAt",
      ));
    }
    if (
      reconciliation.decision !== "within_tolerance" ||
      (
        reconciliationRevenueIsValid &&
        exceedsTolerance(
        Number(reconciliation.purchaseRevenue),
        Number(reconciliation.paidOrderProductRevenue),
        contract.dataQuality.revenueTolerance,
        )
      )
    ) {
      findings.push(finding(
        "reconciliation_tolerance_failed",
        "Completed reconciliation must document matching revenue within the configured tolerance.",
        "$.dashboard.reconciliation",
      ));
    }
    if (dashboard?.status !== "created") {
      findings.push(finding(
        "reconciliation_without_dashboard",
        "Reconciliation cannot complete before the report is created.",
        "$.dashboard.reconciliation",
      ));
    }
  }

  const cadence = contract?.cadence;
  if (!["pending_human_assignment", "assigned"].includes(cadence?.ownerStatus)) {
    findings.push(finding(
      "cadence_owner_status_invalid",
      "Cadence owner status must be pending_human_assignment or assigned.",
      "$.cadence.ownerStatus",
    ));
  } else if (cadence.ownerStatus === "pending_human_assignment") {
    if (
      cadence.ownerName !== null ||
      hasUnexpectedPendingEvidence(cadence, ["assignedAt", "evidenceUrl", "notes"])
    ) {
      findings.push(finding(
        "cadence_pending_has_evidence",
        "An unassigned cadence cannot carry owner evidence.",
        "$.cadence",
      ));
    }
  } else {
    validateEvidenceRecord({
      record: cadence,
      status: cadence.ownerStatus,
      completedStatus: "assigned",
      timestampField: "assignedAt",
      location: "$.cadence",
      reportingTimezone: contract.reportingTimezone,
      maximumLagHours,
      findings,
      clock,
    });
    if (
      !isEvidenceText(cadence.schedule) ||
      !isEvidenceReference(cadence.decisionLog)
    ) {
      findings.push(finding(
        "cadence_details_invalid",
        "An assigned cadence requires a concrete schedule and HTTPS decision-log location.",
        "$.cadence",
      ));
    }
  }

  const reportingFoundationStates = [
    dashboard?.status === "created",
    dashboardBaseline?.status === "captured",
    reconciliation?.status === "completed",
    cadence?.ownerStatus === "assigned",
  ];
  const experimentEvidenceStates = [
    ...experiments.flatMap((experiment) => [
      experiment.baseline?.status === "captured",
      experiment.result?.status === "recorded",
    ]),
  ];
  const hasEvidence = [
    ...reportingFoundationStates,
    ...experimentEvidenceStates,
  ].some(Boolean);
  const reportingFoundationComplete = reportingFoundationStates.every(Boolean);
  const expectedContractStatus = reportingFoundationComplete
    ? "evidence_backed_completed"
    : hasEvidence
      ? "partially_evidenced"
      : "repository_ready_external_evidence_pending";
  if (contract?.status !== expectedContractStatus) {
    findings.push(finding(
      "contract_lifecycle_status_mismatch",
      `Contract status must be '${expectedContractStatus}' for its current evidence states.`,
      "$.status",
    ));
  }

  return findings;
};

export const analyzeReportingExport = (report, contract, options = {}) => {
  const findings = [];
  const clock = resolveValidationClock(options);
  const sessions = Array.isArray(report?.sessions) ? report.sessions : [];
  const events = Array.isArray(report?.events) ? report.events : [];
  const orders = Array.isArray(report?.orders) ? report.orders : [];
  const configuredTolerance = contract?.dataQuality?.revenueTolerance;
  const tolerance = {
    absoluteUsd:
      typeof configuredTolerance?.absoluteUsd === "number" &&
        Number.isFinite(configuredTolerance.absoluteUsd) &&
        configuredTolerance.absoluteUsd >= 0
        ? Math.min(
          configuredTolerance.absoluteUsd,
          CANONICAL_DATA_QUALITY.revenueTolerance.absoluteUsd,
        )
        : CANONICAL_DATA_QUALITY.revenueTolerance.absoluteUsd,
    relative:
      typeof configuredTolerance?.relative === "number" &&
        Number.isFinite(configuredTolerance.relative) &&
        configuredTolerance.relative >= 0
        ? Math.min(
          configuredTolerance.relative,
          CANONICAL_DATA_QUALITY.revenueTolerance.relative,
        )
        : CANONICAL_DATA_QUALITY.revenueTolerance.relative,
  };
  const configuredCardinality = contract?.dataQuality?.cardinality;
  const cardinality = Object.fromEntries(
    Object.entries(CANONICAL_DATA_QUALITY.cardinalityCeilings).map(
      ([field, maximum]) => {
        const configured = configuredCardinality?.[field];
        return [
          field,
          typeof configured === "number" &&
              Number.isFinite(configured) &&
              configured > 0
            ? Math.min(configured, maximum)
            : maximum,
        ];
      },
    ),
  );

  validateAllowedKeys(
    report,
    EXPORT_SCHEMA.reportKeys,
    EXPORT_SCHEMA.reportKeys,
    "$",
    "Reporting export",
    findings,
  );
  validateAllowedKeys(
    report?.window,
    EXPORT_SCHEMA.windowKeys,
    EXPORT_SCHEMA.windowKeys,
    "$.window",
    "Export window",
    findings,
  );
  if (
    !isNonEmptyString(report?.exportVersion) ||
    !isNonEmptyString(report?.sourceSystem) ||
    !isEvidenceId(report?.evidenceId) ||
    !isEvidenceReference(report?.evidenceUrl) ||
    typeof report?.synthetic !== "boolean" ||
    !Array.isArray(report?.sessions) ||
    !Array.isArray(report?.events) ||
    !Array.isArray(report?.orders)
  ) {
    findings.push(finding(
      "export_schema_invalid",
      "Reporting export metadata and session/event/order collections must match the positive export schema.",
      "$",
    ));
  }
  if (report?.exportVersion !== "1.0.0") {
    findings.push(finding(
      "export_version_invalid",
      "Reporting exportVersion must be exactly '1.0.0'.",
      "$.exportVersion",
    ));
  }

  if (
    !sessions.some(isObject) ||
    !events.some(isObject)
  ) {
    findings.push(finding(
      "export_empty",
      "A reporting export requires at least one consented session and one event.",
      "$",
    ));
  }
  if (report?.window?.timezone !== contract.reportingTimezone) {
    findings.push(finding(
      "export_timezone_mismatch",
      `Export timezone must be ${contract.reportingTimezone}.`,
      "$.window.timezone",
    ));
  }
  if (
    !isIsoTimestamp(report?.window?.start) ||
    !isIsoTimestamp(report?.window?.end) ||
    Date.parse(report.window.start) >= Date.parse(report.window.end) ||
    report?.window?.dataStatus !== "complete_t_plus_1"
  ) {
    findings.push(finding(
      "export_window_invalid",
      "Export window requires valid ascending ISO start and end timestamps and complete_t_plus_1 data status.",
      "$.window",
    ));
  }
  const maximumLagHours =
    Number.isFinite(contract?.dashboard?.decisionFreshness?.maximumLagHours) &&
      contract.dashboard.decisionFreshness.maximumLagHours > 0
      ? Math.min(contract.dashboard.decisionFreshness.maximumLagHours, 48)
      : 48;
  if (
    isIsoTimestamp(report?.generatedAt) &&
    isIsoTimestamp(report?.window?.end)
  ) {
    const generationLagHours =
      (Date.parse(report.generatedAt) - Date.parse(report.window.end)) /
      3_600_000;
    if (generationLagHours < 0 || generationLagHours > maximumLagHours) {
      findings.push(finding(
        "export_freshness_invalid",
        `Export generation must occur after the window and within ${maximumLagHours} hours.`,
        "$.generatedAt",
      ));
    }
  }
  if (
    isFutureTimestamp(report?.window?.start, clock) ||
    isFutureTimestamp(report?.window?.end, clock) ||
    !isIsoTimestamp(report?.generatedAt) ||
    isFutureTimestamp(report?.generatedAt, clock)
  ) {
    findings.push(finding(
      "export_timestamp_in_future",
      "Export windows and generation timestamps must be valid and cannot be in the future.",
      "$",
    ));
  }

  const prohibited = new Set([
    ...MANDATORY_EXPORT_PROHIBITED_FIELDS,
    ...(
      Array.isArray(contract?.privacy?.prohibitedFields)
        ? contract.privacy.prohibitedFields.map(normalizeFieldName)
        : []
    ),
  ]);
  for (const location of collectForbiddenFields(report, prohibited)) {
    findings.push(finding("prohibited_field", "Reporting export contains a prohibited field.", location));
  }
  for (const unsafeValue of collectUnsafeStringValues(report)) {
    findings.push(finding(
      unsafeValue.kind === "email" || unsafeValue.kind === "phone"
        ? "pii_value_detected"
        : "unsafe_string_value",
      unsafeValue.kind === "email" || unsafeValue.kind === "phone"
        ? `Reporting export contains a ${unsafeValue.kind}-like string value.`
        : "Reporting export contains an oversized or control-character string.",
      unsafeValue.location,
    ));
  }

  const sessionIdCounts = new Map();
  sessions.forEach((session, index) => {
    const location = `$.sessions[${index}]`;
    if (!validateAllowedKeys(
      session,
      EXPORT_SCHEMA.sessionKeys,
      EXPORT_SCHEMA.sessionKeys,
      location,
      "Session",
      findings,
    )) {
      return;
    }
    if (!isNonEmptyString(session.session_id)) {
      findings.push(finding(
        "export_schema_invalid",
        "Session requires a non-empty session_id.",
        `${location}.session_id`,
      ));
    } else {
      sessionIdCounts.set(
        session.session_id,
        (sessionIdCounts.get(session.session_id) ?? 0) + 1,
      );
      if (
        !isBoundedString(session.session_id, 128, SAFE_IDENTIFIER_PATTERN)
      ) {
        findings.push(finding(
          "export_string_format_invalid",
          "Session ID exceeds its bound or contains unsupported characters.",
          `${location}.session_id`,
        ));
      }
    }
    for (const dimension of CANONICAL_DATA_QUALITY.requiredSessionDimensions) {
      const value = session[dimension];
      if (!isNonEmptyString(value) || value.trim().toLowerCase() === "(not set)") {
        findings.push(finding(
          "unexpected_not_set",
          `Required session dimension '${dimension}' is missing or '(not set)'.`,
          `${location}.${dimension}`,
          "warning",
        ));
      }
    }
    if (!isNonEmptyString(session.campaign)) {
      findings.push(finding(
        "export_schema_invalid",
        "Session campaign must be a non-empty string.",
        `${location}.campaign`,
      ));
    }
    for (const field of ["source", "medium", "campaign", "device", "browser"]) {
      if (
        !isBoundedString(
          session[field],
          field === "campaign" ? 160 : 100,
          SAFE_DIMENSION_VALUE_PATTERN,
        )
      ) {
        findings.push(finding(
          "export_string_format_invalid",
          `Session field '${field}' exceeds its bound or contains unsupported characters.`,
          `${location}.${field}`,
        ));
      }
    }
  });
  for (const [sessionId, count] of sessionIdCounts) {
    if (count > 1) {
      findings.push(finding(
        "duplicate_session_id",
        `Session ID '${sessionId}' appears ${count} times in the export.`,
        "$.sessions",
      ));
    }
  }

  const allowedEvents = new Set(CANONICAL_DATA_QUALITY.allowedEventNames);
  const ecommerceEvents = new Set(
    CANONICAL_DATA_QUALITY.ecommerceEventsRequiringItems,
  );
  const eventIds = new Set();
  const validateItems = (items, location) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    let total = 0;
    let allValid = true;
    items.forEach((item, itemIndex) => {
      const itemLocation = `${location}[${itemIndex}]`;
      if (!validateAllowedKeys(
        item,
        EXPORT_SCHEMA.itemKeys,
        EXPORT_SCHEMA.itemKeys,
        itemLocation,
        "Ecommerce item",
        findings,
      )) {
        allValid = false;
        return;
      }
      for (const dimension of CANONICAL_DATA_QUALITY.requiredItemDimensions) {
        const value = item[dimension];
        if (!isNonEmptyString(value) || value.trim().toLowerCase() === "(not set)") {
          findings.push(finding(
            dimension === "item_id" ? "missing_item_id" : "unexpected_not_set",
            `Required item dimension '${dimension}' is missing or '(not set)'.`,
            `${itemLocation}.${dimension}`,
            dimension === "item_id" ? "error" : "warning",
          ));
          allValid = false;
        }
      }
      if (
        !isBoundedString(
          item.item_id,
          120,
          SAFE_IDENTIFIER_PATTERN,
        )
      ) {
        findings.push(finding(
          "export_string_format_invalid",
          "Item ID exceeds its bound or contains unsupported characters.",
          `${itemLocation}.item_id`,
        ));
        allValid = false;
      }
      for (const field of [
        "item_name",
        "item_brand",
        "item_category",
        "item_variant",
      ]) {
        if (
          !isBoundedString(
            item[field],
            field === "item_name" ? 200 : 120,
            SAFE_DIMENSION_VALUE_PATTERN,
          )
        ) {
          findings.push(finding(
            "export_string_format_invalid",
            `Item field '${field}' exceeds its bound or contains unsupported characters.`,
            `${itemLocation}.${field}`,
          ));
          allValid = false;
        }
      }
      const revenue = itemRevenue(item);
      if (revenue === null) {
        findings.push(finding(
          "invalid_item_value",
          "Ecommerce items require numeric non-negative price/discount values, discount no greater than price, and a positive integer quantity.",
          itemLocation,
        ));
        allValid = false;
      } else {
        total += revenue;
      }
    });
    return allValid ? total : null;
  };

  events.forEach((event, eventIndex) => {
    const location = `$.events[${eventIndex}]`;
    if (!validateAllowedKeys(
      event,
      EXPORT_SCHEMA.eventKeys,
      [
        "event_id",
        "event_name",
        "session_id",
        "normalized_path",
        "occurred_at",
        "analytics_contract_version",
      ],
      location,
      "Event",
      findings,
    )) {
      return;
    }
    if (!allowedEvents.has(event.event_name)) {
      findings.push(finding("unexpected_event_name", `Unexpected event name '${event.event_name}'.`, `${location}.event_name`, "warning"));
    }
    if (!isNonEmptyString(event.event_id)) {
      findings.push(finding(
        "export_schema_invalid",
        "Event requires a non-empty event_id.",
        `${location}.event_id`,
      ));
    } else {
      if (eventIds.has(event.event_id)) {
        findings.push(finding("duplicate_event_id", `Duplicate event ID '${event.event_id}'.`, `${location}.event_id`));
      }
      eventIds.add(event.event_id);
    }
    if (
      !isNonEmptyString(event.event_name) ||
      !isNonEmptyString(event.session_id) ||
      !isNonEmptyString(event.normalized_path) ||
      event.analytics_contract_version !== contract.analyticsContractVersion
    ) {
      findings.push(finding(
        "export_schema_invalid",
        "Event name, session, normalized path, and analytics contract version are required.",
        location,
      ));
    }
    if (
      !isBoundedString(event.event_id, 128, SAFE_IDENTIFIER_PATTERN) ||
      !isBoundedString(event.session_id, 128, SAFE_IDENTIFIER_PATTERN) ||
      !isBoundedString(
        event.normalized_path,
        256,
        /^\/[a-z0-9/_-]*$/i,
      )
    ) {
      findings.push(finding(
        "export_string_format_invalid",
        "Event ID, session ID, and normalized path must use bounded reporting-safe formats.",
        location,
      ));
    }
    if (sessionIdCounts.get(event.session_id) !== 1) {
      findings.push(finding(
        "event_session_not_found",
        "Every event must reference exactly one exported session.",
        `${location}.session_id`,
      ));
    }
    for (const parameter of EVENT_REQUIRED_PARAMETERS.get(event.event_name) ?? []) {
      if (!isNonEmptyString(event[parameter])) {
        findings.push(finding(
          "event_required_parameter_missing",
          `Event '${event.event_name}' requires reporting parameter '${parameter}'.`,
          `${location}.${parameter}`,
        ));
      }
    }
    for (const field of [
      "placement",
      "label",
      "destination",
      "brand",
      "model",
      "variant_id",
      "error_code",
      "stage",
      "code",
      "item_list_id",
      "transaction_id",
      "item_list_name",
      "transaction_id",
      "currency",
      "coupon",
    ]) {
      if (Object.hasOwn(event, field) && !isNonEmptyString(event[field])) {
        findings.push(finding(
          "export_schema_invalid",
          `Event field '${field}' must be a non-empty string when present.`,
          `${location}.${field}`,
        ));
      }
    }
    for (const field of ["discount_amount", "value", "shipping", "tax"]) {
      if (
        Object.hasOwn(event, field) &&
        (
          typeof event[field] !== "number" ||
          !Number.isFinite(event[field]) ||
          event[field] < 0
        )
      ) {
        findings.push(finding(
          "export_schema_invalid",
          `Event field '${field}' must be a finite non-negative number when present.`,
          `${location}.${field}`,
        ));
      }
    }
    if (
      Object.hasOwn(event, "has_angled_view") &&
      typeof event.has_angled_view !== "boolean"
    ) {
      findings.push(finding(
        "export_schema_invalid",
        "Event field 'has_angled_view' must be boolean when present.",
        `${location}.has_angled_view`,
      ));
    }
    for (const field of [
      "placement",
      "variant_id",
      "error_code",
      "stage",
      "code",
      "item_list_id",
    ]) {
      if (
        Object.hasOwn(event, field) &&
        !isBoundedString(event[field], 100, SAFE_IDENTIFIER_PATTERN)
      ) {
        findings.push(finding(
          "export_string_format_invalid",
          `Event field '${field}' exceeds its bound or contains unsupported characters.`,
          `${location}.${field}`,
        ));
      }
    }
    for (const field of ["brand", "model", "label", "item_list_name"]) {
      if (
        Object.hasOwn(event, field) &&
        !isBoundedString(
          event[field],
          field === "label" ? 160 : 120,
          SAFE_DIMENSION_VALUE_PATTERN,
        )
      ) {
        findings.push(finding(
          "export_string_format_invalid",
          `Event field '${field}' exceeds its bound or contains unsupported characters.`,
          `${location}.${field}`,
        ));
      }
    }
    if (
      Object.hasOwn(event, "destination") &&
      (
        !isNonEmptyString(event.destination) ||
        event.destination.length > 300 ||
        !(
          event.destination.startsWith("/") ||
          /^https:\/\//i.test(event.destination)
        )
      )
    ) {
      findings.push(finding(
        "export_string_format_invalid",
        "CTA destination must be a bounded relative path or HTTPS URL.",
        `${location}.destination`,
      ));
    }
    if (!isTimestampInsideWindow(event.occurred_at, report?.window)) {
      findings.push(finding(
        "export_record_outside_window",
        "Event occurred_at must be a valid timestamp inside the half-open export window.",
        `${location}.occurred_at`,
      ));
    }
    if (
      isNonEmptyString(event.normalized_path) &&
      (event.normalized_path.includes("?") ||
        /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(event.normalized_path))
    ) {
      findings.push(finding(
        "non_normalized_path",
        "Normalized paths must not contain query strings or UUIDs.",
        `${location}.normalized_path`,
        "warning",
      ));
    }
    if (ecommerceEvents.has(event.event_name)) {
      if (!Array.isArray(event.items) || event.items.length === 0) {
        findings.push(finding("missing_items", `Event '${event.event_name}' requires items.`, `${location}.items`));
      } else {
        validateItems(event.items, `${location}.items`);
      }
    } else if (Object.hasOwn(event, "items")) {
      validateItems(event.items, `${location}.items`);
    }
  });

  const purchases = events.filter(
    (event) => isObject(event) && event.event_name === "purchase",
  );
  const purchaseIds = new Map();
  purchases.forEach((event, index) => {
    const location = `$.events[purchase:${index}]`;
    if (event.currency !== contract.currency) {
      findings.push(finding(
        "export_currency_mismatch",
        `Purchase currency must match contract currency ${contract.currency}.`,
        `${location}.currency`,
      ));
    }
    if (!isNonEmptyString(event.transaction_id)) {
      findings.push(finding("missing_transaction_id", "Purchase requires a transaction ID.", `${location}.transaction_id`));
      return;
    }
    purchaseIds.set(event.transaction_id, (purchaseIds.get(event.transaction_id) ?? 0) + 1);
    for (const field of ["shipping", "tax"]) {
      if (
        !Object.hasOwn(event, field) ||
        typeof event[field] !== "number" ||
        !Number.isFinite(event[field]) ||
        event[field] < 0
      ) {
        findings.push(finding(
          "invalid_purchase_monetary_value",
          `Purchase ${field} must be a present finite non-negative number.`,
          `${location}.${field}`,
        ));
      }
    }
    if (
      typeof event.value !== "number" ||
      !Number.isFinite(event.value) ||
      event.value < 0
    ) {
      findings.push(finding(
        "invalid_purchase_value",
        "Purchase value must be a present finite non-negative number.",
        `${location}.value`,
      ));
    } else {
      const itemTotal = itemsRevenue(event.items);
      if (itemTotal === null || exceedsTolerance(event.value, itemTotal, tolerance)) {
        findings.push(finding(
          "purchase_item_revenue_mismatch",
          "Purchase value must reconcile to its strict item revenue total.",
          location,
        ));
      }
    }
  });
  for (const [transactionId, count] of purchaseIds) {
    if (count > 1) {
      findings.push(finding(
        "duplicate_purchase_transaction",
        `Transaction '${transactionId}' appears in ${count} purchase events.`,
        "$.events",
      ));
    }
  }

  const orderIds = new Map();
  orders.forEach((order, index) => {
    const location = `$.orders[${index}]`;
    if (!validateAllowedKeys(
      order,
      EXPORT_SCHEMA.orderKeys,
      EXPORT_SCHEMA.orderKeys,
      location,
      "Order",
      findings,
    )) {
      return;
    }
    for (const field of ["transaction_id", "status", "currency"]) {
      if (!isNonEmptyString(order[field])) {
        findings.push(finding(
          "export_schema_invalid",
          `Order requires a non-empty ${field}.`,
          `${location}.${field}`,
        ));
      }
    }
    if (isNonEmptyString(order.transaction_id)) {
      orderIds.set(
        order.transaction_id,
        (orderIds.get(order.transaction_id) ?? 0) + 1,
      );
    }
    if (!ALLOWED_ORDER_STATUSES.has(order.status)) {
      findings.push(finding(
        "order_status_invalid",
        `Order status must be one of: ${[...ALLOWED_ORDER_STATUSES].join(", ")}.`,
        `${location}.status`,
      ));
    }
    if (!isTimestampInsideWindow(order.created_at, report?.window)) {
      findings.push(finding(
        "export_record_outside_window",
        "Order created_at must be a valid timestamp inside the half-open export window.",
        `${location}.created_at`,
      ));
    }
    if (
      !isBoundedString(order.transaction_id, 128, SAFE_IDENTIFIER_PATTERN)
    ) {
      findings.push(finding(
        "export_string_format_invalid",
        "Order transaction_id exceeds its bound or contains unsupported characters.",
        `${location}.transaction_id`,
      ));
    }
    if (order.currency !== contract.currency) {
      findings.push(finding(
        "export_currency_mismatch",
        `Order currency must match contract currency ${contract.currency}.`,
        `${location}.currency`,
      ));
    }
    for (const field of ["product_revenue", "shipping", "tax", "total"]) {
      if (
        typeof order[field] !== "number" ||
        !Number.isFinite(order[field]) ||
        order[field] < 0
      ) {
        findings.push(finding(
          "export_schema_invalid",
          `Order ${field} must be a finite non-negative number.`,
          `${location}.${field}`,
        ));
      }
    }
    if (
      ["product_revenue", "shipping", "tax", "total"].every(
        (field) =>
          typeof order[field] === "number" &&
          Number.isFinite(order[field]) &&
          order[field] >= 0,
      ) &&
      exceedsTolerance(
        order.total,
        order.product_revenue + order.shipping + order.tax,
        tolerance,
      )
    ) {
      findings.push(finding(
        "order_total_mismatch",
        "Order total must equal product_revenue plus shipping and tax.",
        location,
      ));
    }
    if (!Array.isArray(order.items) || order.items.length === 0) {
      findings.push(finding(
        "missing_items",
        "Order requires at least one item.",
        `${location}.items`,
      ));
    } else {
      validateItems(order.items, `${location}.items`);
      if (
        typeof order.product_revenue === "number" &&
        Number.isFinite(order.product_revenue)
      ) {
        const itemTotal = itemsRevenue(order.items);
        if (
          itemTotal === null ||
          exceedsTolerance(order.product_revenue, itemTotal, tolerance)
        ) {
          findings.push(finding(
            "order_item_revenue_mismatch",
            "Order product_revenue must reconcile to its strict item revenue total.",
            location,
          ));
        }
      }
    }
  });
  for (const [transactionId, count] of orderIds) {
    if (count > 1) {
      findings.push(finding(
        "duplicate_order_transaction",
        `Transaction '${transactionId}' appears in ${count} exported orders.`,
        "$.orders",
      ));
    }
  }
  for (const transactionId of new Set([
    ...purchaseIds.keys(),
    ...orderIds.keys(),
  ])) {
    if (
      purchaseIds.get(transactionId) !== 1 ||
      orderIds.get(transactionId) !== 1
    ) {
      findings.push(finding(
        "transaction_integrity_invalid",
        `Transaction '${transactionId}' must have exactly one purchase and one exported paid order.`,
        "$",
      ));
    }
  }
  const paidOrders = orders.filter(
    (order) => isObject(order) && order.status === "paid",
  );
  paidOrders.forEach((order, index) => {
    const location = `$.orders[paid:${index}]`;
    if (order.currency !== contract.currency) {
      findings.push(finding(
        "export_currency_mismatch",
        `Paid-order currency must match contract currency ${contract.currency}.`,
        `${location}.currency`,
      ));
    }
    if (
      typeof order.product_revenue !== "number" ||
      !Number.isFinite(order.product_revenue) ||
      order.product_revenue < 0
    ) {
      findings.push(finding(
        "invalid_paid_order_revenue",
        "Paid-order product_revenue must be a present finite non-negative number.",
        `${location}.product_revenue`,
      ));
    } else {
      const itemTotal = itemsRevenue(order.items);
      if (
        itemTotal === null ||
        exceedsTolerance(order.product_revenue, itemTotal, tolerance)
      ) {
        findings.push(finding(
          "paid_order_item_revenue_mismatch",
          "Paid-order product_revenue must reconcile to its strict item revenue total.",
          location,
        ));
      }
    }
  });
  const ordersById = new Map(paidOrders.map((order) => [order.transaction_id, order]));
  const purchaseById = new Map(purchases.map((event) => [event.transaction_id, event]));
  for (const order of paidOrders) {
    const event = purchaseById.get(order.transaction_id);
    if (!event) {
      findings.push(finding("missing_purchase_for_order", `Paid order '${order.transaction_id}' has no purchase event.`, "$.orders"));
      continue;
    }
    if (event.currency !== order.currency) {
      findings.push(finding("purchase_currency_mismatch", `Transaction '${order.transaction_id}' has mismatched currency.`, "$.events"));
    }
    if (
      !["shipping", "tax"].every(
        (field) =>
          typeof event[field] === "number" &&
          Number.isFinite(event[field]) &&
          typeof order[field] === "number" &&
          Number.isFinite(order[field]) &&
          !exceedsTolerance(event[field], order[field], tolerance),
      )
    ) {
      findings.push(finding(
        "purchase_order_monetary_mismatch",
        `Transaction '${order.transaction_id}' purchase shipping/tax must match its paid order.`,
        "$.events",
      ));
    }
    if (
      typeof event.value === "number" &&
      Number.isFinite(event.value) &&
      typeof order.product_revenue === "number" &&
      Number.isFinite(order.product_revenue) &&
      exceedsTolerance(event.value, order.product_revenue, tolerance)
    ) {
      findings.push(finding("purchase_revenue_mismatch", `Transaction '${order.transaction_id}' product revenue does not match its paid order.`, "$.events"));
    }
    if (!itemsMatch(event.items, order.items)) {
      findings.push(finding("purchase_items_mismatch", `Transaction '${order.transaction_id}' items do not match its paid order.`, "$.events"));
    }
  }
  for (const purchase of purchases) {
    if (isNonEmptyString(purchase.transaction_id) && !ordersById.has(purchase.transaction_id)) {
      findings.push(finding("purchase_without_paid_order", `Purchase '${purchase.transaction_id}' has no matching paid order.`, "$.events"));
    }
  }

  const purchaseRevenue = purchases.reduce(
    (sum, event) =>
      sum + (
        typeof event.value === "number" &&
          Number.isFinite(event.value) &&
          event.value >= 0
          ? event.value
          : 0
      ),
    0,
  );
  const orderRevenue = paidOrders.reduce(
    (sum, order) =>
      sum + (
        typeof order.product_revenue === "number" &&
          Number.isFinite(order.product_revenue) &&
          order.product_revenue >= 0
          ? order.product_revenue
          : 0
      ),
    0,
  );
  if (purchases.length !== paidOrders.length) {
    findings.push(finding(
      "purchase_order_count_mismatch",
      `Purchase count ${purchases.length} does not match paid-order count ${paidOrders.length}.`,
      "$",
    ));
  }
  if (exceedsTolerance(purchaseRevenue, orderRevenue, tolerance)) {
    findings.push(finding(
      "dashboard_order_revenue_mismatch",
      `Purchase revenue ${purchaseRevenue.toFixed(2)} does not match paid-order product revenue ${orderRevenue.toFixed(2)}.`,
      "$",
    ));
  }

  const pageViews = events.filter(
    (event) =>
      isObject(event) &&
      event.event_name === "page_view" &&
      isNonEmptyString(event.normalized_path),
  );
  const uniquePaths = new Set(pageViews.map((event) => event.normalized_path));
  const uniqueEventNames = new Set(
    events
      .filter(isObject)
      .map((event) => event.event_name)
      .filter(isNonEmptyString),
  );
  if (
    pageViews.length >= cardinality.minimumObservations &&
    (uniquePaths.size > cardinality.normalizedPathMaximumUniqueValues ||
      uniquePaths.size / pageViews.length > cardinality.normalizedPathMaximumUniqueRatio)
  ) {
    findings.push(finding(
      "normalized_path_cardinality_spike",
      `${uniquePaths.size} unique paths across ${pageViews.length} page views exceed the contract threshold.`,
      "$.events",
      "warning",
    ));
  }
  if (uniqueEventNames.size > cardinality.eventNameMaximumUniqueValues) {
    findings.push(finding(
      "event_name_cardinality_spike",
      `${uniqueEventNames.size} unique event names exceed the contract threshold.`,
      "$.events",
      "warning",
    ));
  }

  return {
    ok: findings.length === 0,
    findings,
    summary: {
      sessions: sessions.length,
      events: events.length,
      purchases: purchases.length,
      paidOrders: paidOrders.length,
      purchaseRevenue: Number(purchaseRevenue.toFixed(2)),
      paidOrderProductRevenue: Number(orderRevenue.toFixed(2)),
      uniqueNormalizedPaths: uniquePaths.size,
      uniqueEventNames: uniqueEventNames.size,
    },
  };
};

export const validateCompletedReconciliationAgainstExport = (
  contract,
  report,
  reportResult,
) => {
  const reconciliation = contract?.dashboard?.reconciliation;
  if (reconciliation?.status !== "completed") return [];

  const findings = [];
  const summary = reportResult.summary;
  if (report?.synthetic !== false) {
    findings.push(finding(
      "completed_reconciliation_uses_synthetic_export",
      "Completed production reconciliation cannot be validated by a synthetic or unlabeled export.",
      "$.synthetic",
    ));
  }
  if (
    reconciliation.purchaseCount !== summary.purchases ||
    reconciliation.paidOrderCount !== summary.paidOrders
  ) {
    findings.push(finding(
      "reconciliation_export_counts_mismatch",
      "Completed reconciliation counts must equal the analyzed export purchase and paid-order counts.",
      "$.dashboard.reconciliation",
    ));
  }
  const reportWindowDurationHours =
    isIsoTimestamp(report?.window?.start) && isIsoTimestamp(report?.window?.end)
      ? (
        Date.parse(report.window.end) - Date.parse(report.window.start)
      ) / 3_600_000
      : 0;
  if (
    summary.sessions <= 0 ||
    summary.events <= 0 ||
    summary.purchases <= 0 ||
    summary.paidOrders <= 0
  ) {
    findings.push(finding(
      "reconciliation_export_empty",
      "Completed reconciliation requires a non-empty export with sessions, events, purchases, and paid orders.",
      "$",
    ));
  }
  if (
    report?.window?.dataStatus !== "complete_t_plus_1" ||
    reportWindowDurationHours < 24
  ) {
    findings.push(finding(
      "reconciliation_export_window_incomplete",
      "Completed reconciliation requires at least one full 24-hour complete_t_plus_1 export window.",
      "$.window",
    ));
  }
  if (
    exceedsTolerance(
      reconciliation.purchaseRevenue,
      summary.purchaseRevenue,
      contract.dataQuality.revenueTolerance,
    ) ||
    exceedsTolerance(
      reconciliation.paidOrderProductRevenue,
      summary.paidOrderProductRevenue,
      contract.dataQuality.revenueTolerance,
    )
  ) {
    findings.push(finding(
      "reconciliation_export_revenue_mismatch",
      "Completed reconciliation revenue must equal the analyzed export revenue within the configured tolerance.",
      "$.dashboard.reconciliation",
    ));
  }
  if (
    reconciliation.window?.start !== report?.window?.start ||
    reconciliation.window?.end !== report?.window?.end ||
    reconciliation.window?.timezone !== report?.window?.timezone ||
    reconciliation.window?.dataStatus !== report?.window?.dataStatus
  ) {
    findings.push(finding(
      "reconciliation_export_window_mismatch",
      "Completed reconciliation must use the exact analyzed export start, end, timezone, and data status.",
      "$.dashboard.reconciliation.window",
    ));
  }
  if (
    reconciliation.exportEvidenceId !== report?.evidenceId ||
    reconciliation.exportGeneratedAt !== report?.generatedAt ||
    reconciliation.exportSource !== report?.sourceSystem ||
    reconciliation.evidenceUrl !== report?.evidenceUrl
  ) {
    findings.push(finding(
      "reconciliation_export_identity_mismatch",
      "Completed reconciliation evidence ID, generated timestamp, source, and URL must identify the analyzed export.",
      "$.dashboard.reconciliation",
    ));
  }

  return findings;
};

export const validateGrowthReportingData = (contract, report, options = {}) => {
  const contractFindings = validateReportingContract(contract, options);
  const reportResult = analyzeReportingExport(report, contract, options);
  const lifecycleExportFindings =
    validateCompletedReconciliationAgainstExport(contract, report, reportResult);
  return {
    ok:
      contractFindings.length === 0 &&
      reportResult.ok &&
      lifecycleExportFindings.length === 0,
    contract,
    contractFindings,
    reportResult,
    lifecycleExportFindings,
  };
};

export const validateGrowthReporting = async ({
  contractPath = DEFAULT_CONTRACT_PATH,
  exportPath = DEFAULT_EXPORT_PATH,
  validationTime,
  futureSkewMs,
} = {}) => {
  const [contract, report] = await Promise.all([
    loadJson(contractPath),
    loadJson(exportPath),
  ]);
  return validateGrowthReportingData(contract, report, {
    validationTime,
    futureSkewMs,
  });
};

const runCli = async () => {
  const exportPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_EXPORT_PATH;
  const result = await validateGrowthReporting({ exportPath });

  if (!result.ok) {
    for (const item of [
      ...result.contractFindings,
      ...result.reportResult.findings,
      ...result.lifecycleExportFindings,
    ]) {
      console.error(`[${item.severity}] ${item.code} at ${item.location}: ${item.message}`);
    }
    process.exitCode = 1;
    return;
  }

  const summary = result.reportResult.summary;
  console.log(
    `Growth reporting contract ${result.contract.contractVersion} passed: ` +
      `${result.contract.metrics.length} metrics, ${result.contract.experiments.length} ranked experiments, ` +
      `${summary.purchases} synthetic purchase reconciled to ${summary.paidOrders} paid order.`,
  );
};

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  await runCli();
}
