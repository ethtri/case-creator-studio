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

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim().length > 0;

const finding = (code, message, location, severity = "error") => ({
  code,
  message,
  location,
  severity,
});

const relativeDifference = (actual, expected) => {
  if (expected === 0) return actual === 0 ? 0 : Number.POSITIVE_INFINITY;
  return Math.abs(actual - expected) / Math.abs(expected);
};

const exceedsTolerance = (actual, expected, tolerance) => {
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return true;
  return Math.abs(actual - expected) > tolerance.absoluteUsd &&
    relativeDifference(actual, expected) > tolerance.relative;
};

const itemKey = (item) =>
  [
    item.item_id,
    Number(item.price).toFixed(2),
    Number(item.quantity),
    Number(item.discount ?? 0).toFixed(2),
  ].join("|");

const itemsMatch = (eventItems, orderItems) => {
  if (!Array.isArray(eventItems) || !Array.isArray(orderItems)) return false;
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
    if (prohibited.has(key.toLowerCase())) {
      found.push(nestedLocation);
    }
    collectForbiddenFields(nested, prohibited, nestedLocation, found);
  });
  return found;
};

export const loadJson = async (filePath) =>
  JSON.parse(await readFile(filePath, "utf8"));

export const validateReportingContract = (contract) => {
  const findings = [];
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
  for (const requiredFilter of [
    "date",
    "source",
    "medium",
    "campaign",
    "device",
    "browser",
    "phone_family",
    "phone_model",
  ]) {
    if (!filterIds.has(requiredFilter)) {
      findings.push(finding(
        "required_filter_missing",
        `Required dashboard filter '${requiredFilter}' is missing.`,
        "$.dashboard.requiredFilters",
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
    if (experiment.baseline?.status !== "pending" || experiment.baseline?.value !== null) {
      findings.push(finding("experiment_baseline_unproven", `Experiment '${experiment.id}' must not claim a baseline before production evidence exists.`, `${location}.baseline`));
    }
    if (experiment.result?.status !== "not_started" || experiment.result?.winner !== null) {
      findings.push(finding("experiment_result_unproven", `Experiment '${experiment.id}' must not claim a result or winner.`, `${location}.result`));
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

  if (
    contract?.dashboard?.baseline?.status !== "pending" ||
    contract?.dashboard?.baseline?.capturedAt !== null ||
    contract?.dashboard?.baseline?.evidenceUrl !== null
  ) {
    findings.push(finding(
      "dashboard_baseline_unproven",
      "The dashboard baseline must remain pending until production evidence is attached.",
      "$.dashboard.baseline",
    ));
  }
  if (
    contract?.cadence?.ownerStatus !== "pending_human_assignment" ||
    contract?.cadence?.ownerName !== null
  ) {
    findings.push(finding(
      "cadence_owner_unverified",
      "The cadence owner must remain explicitly unassigned until a human accepts it.",
      "$.cadence",
    ));
  }

  return findings;
};

export const analyzeReportingExport = (report, contract) => {
  const findings = [];
  const sessions = Array.isArray(report?.sessions) ? report.sessions : [];
  const events = Array.isArray(report?.events) ? report.events : [];
  const orders = Array.isArray(report?.orders) ? report.orders : [];
  const quality = contract.dataQuality;

  if (report?.window?.timezone !== contract.reportingTimezone) {
    findings.push(finding(
      "export_timezone_mismatch",
      `Export timezone must be ${contract.reportingTimezone}.`,
      "$.window.timezone",
    ));
  }

  const prohibited = new Set(contract.privacy.prohibitedFields.map((field) => field.toLowerCase()));
  for (const location of collectForbiddenFields(report, prohibited)) {
    findings.push(finding("prohibited_field", "Reporting export contains a prohibited field.", location));
  }

  sessions.forEach((session, index) => {
    for (const dimension of quality.requiredSessionDimensions) {
      const value = session[dimension];
      if (!isNonEmptyString(value) || value.trim().toLowerCase() === "(not set)") {
        findings.push(finding(
          "unexpected_not_set",
          `Required session dimension '${dimension}' is missing or '(not set)'.`,
          `$.sessions[${index}].${dimension}`,
          "warning",
        ));
      }
    }
  });

  const allowedEvents = new Set(quality.allowedEventNames);
  const ecommerceEvents = new Set(quality.ecommerceEventsRequiringItems);
  const eventIds = new Set();
  events.forEach((event, eventIndex) => {
    const location = `$.events[${eventIndex}]`;
    if (!allowedEvents.has(event.event_name)) {
      findings.push(finding("unexpected_event_name", `Unexpected event name '${event.event_name}'.`, `${location}.event_name`, "warning"));
    }
    if (isNonEmptyString(event.event_id)) {
      if (eventIds.has(event.event_id)) {
        findings.push(finding("duplicate_event_id", `Duplicate event ID '${event.event_id}'.`, `${location}.event_id`));
      }
      eventIds.add(event.event_id);
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
        event.items.forEach((item, itemIndex) => {
          for (const dimension of quality.requiredItemDimensions) {
            const value = item[dimension];
            if (!isNonEmptyString(value) || value.trim().toLowerCase() === "(not set)") {
              findings.push(finding(
                dimension === "item_id" ? "missing_item_id" : "unexpected_not_set",
                `Required item dimension '${dimension}' is missing or '(not set)'.`,
                `${location}.items[${itemIndex}].${dimension}`,
                dimension === "item_id" ? "error" : "warning",
              ));
            }
          }
          if (
            !Number.isFinite(Number(item.price)) ||
            !Number.isFinite(Number(item.quantity)) ||
            Number(item.quantity) <= 0 ||
            !Number.isFinite(Number(item.discount ?? 0))
          ) {
            findings.push(finding(
              "invalid_item_value",
              "Ecommerce items require finite price/discount values and a positive quantity.",
              `${location}.items[${itemIndex}]`,
            ));
          }
        });
      }
    }
  });

  const purchases = events.filter((event) => event.event_name === "purchase");
  const purchaseIds = new Map();
  purchases.forEach((event, index) => {
    if (!isNonEmptyString(event.transaction_id)) {
      findings.push(finding("missing_transaction_id", "Purchase requires a transaction ID.", `$.events[purchase:${index}].transaction_id`));
      return;
    }
    purchaseIds.set(event.transaction_id, (purchaseIds.get(event.transaction_id) ?? 0) + 1);
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

  const paidOrders = orders.filter((order) => order.status === "paid");
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
    if (exceedsTolerance(Number(event.value), Number(order.product_revenue), quality.revenueTolerance)) {
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

  const purchaseRevenue = purchases.reduce((sum, event) => sum + Number(event.value || 0), 0);
  const orderRevenue = paidOrders.reduce((sum, order) => sum + Number(order.product_revenue || 0), 0);
  if (purchases.length !== paidOrders.length) {
    findings.push(finding(
      "purchase_order_count_mismatch",
      `Purchase count ${purchases.length} does not match paid-order count ${paidOrders.length}.`,
      "$",
    ));
  }
  if (exceedsTolerance(purchaseRevenue, orderRevenue, quality.revenueTolerance)) {
    findings.push(finding(
      "dashboard_order_revenue_mismatch",
      `Purchase revenue ${purchaseRevenue.toFixed(2)} does not match paid-order product revenue ${orderRevenue.toFixed(2)}.`,
      "$",
    ));
  }

  const pageViews = events.filter((event) => event.event_name === "page_view" && isNonEmptyString(event.normalized_path));
  const uniquePaths = new Set(pageViews.map((event) => event.normalized_path));
  const uniqueEventNames = new Set(
    events
      .map((event) => event.event_name)
      .filter(isNonEmptyString),
  );
  const cardinality = quality.cardinality;
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

export const validateGrowthReporting = async ({
  contractPath = DEFAULT_CONTRACT_PATH,
  exportPath = DEFAULT_EXPORT_PATH,
} = {}) => {
  const [contract, report] = await Promise.all([
    loadJson(contractPath),
    loadJson(exportPath),
  ]);
  const contractFindings = validateReportingContract(contract);
  const reportResult = analyzeReportingExport(report, contract);
  return {
    ok: contractFindings.length === 0 && reportResult.ok,
    contract,
    contractFindings,
    reportResult,
  };
};

const runCli = async () => {
  const exportPath = process.argv[2]
    ? path.resolve(process.cwd(), process.argv[2])
    : DEFAULT_EXPORT_PATH;
  const result = await validateGrowthReporting({ exportPath });

  if (!result.ok) {
    for (const item of [...result.contractFindings, ...result.reportResult.findings]) {
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
