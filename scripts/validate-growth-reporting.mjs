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
  }],
  phone_variant: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:variant_id",
    scope: "event",
    parameter: "variant_id",
  }],
  error_code: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:error_code",
    scope: "event",
    parameter: "error_code",
  }],
  error_stage: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:stage",
    scope: "event",
    parameter: "stage",
  }],
  analytics_contract_version: [{
    sourceType: "ga4_custom_event",
    apiName: "customEvent:analytics_contract_version",
    scope: "event",
    parameter: "analytics_contract_version",
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

const PROHIBITED_CUSTOM_DIMENSION_PARAMETERS = new Set([
  "address",
  "artwork",
  "artwork_id",
  "client_id",
  "contact",
  "customer_email",
  "customer_id",
  "customer_name",
  "design_id",
  "edm_template_id",
  "email",
  "free_text",
  "name",
  "order_id",
  "preview_url",
  "session_id",
  "shipping_address",
  "transaction_id",
  "user_id",
]);

const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

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

const dimensionSourceMatches = (source, expected) =>
  Object.entries(expected).every(([key, value]) => source?.[key] === value);

const validateDataWindow = (
  window,
  reportingTimezone,
  location,
  findings,
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
}) => {
  if (status !== completedStatus) return false;

  if (!isIsoTimestamp(record?.[timestampField])) {
    findings.push(finding(
      "lifecycle_timestamp_missing",
      `Status '${completedStatus}' requires a valid ${timestampField} ISO timestamp.`,
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
  for (const requiredFilter of REQUIRED_FILTER_IDS) {
    if (!filterIds.has(requiredFilter)) {
      findings.push(finding(
        "required_filter_missing",
        `Required dashboard filter '${requiredFilter}' is missing.`,
        "$.dashboard.requiredFilters",
      ));
    }
  }

  const prohibitedFields = new Set(
    Array.isArray(contract?.privacy?.prohibitedFields)
      ? contract.privacy.prohibitedFields.map((field) => field.toLowerCase())
      : [],
  );
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
    if (!isNonEmptyString(dimension?.id) || dimensionIds.has(dimension.id)) {
      findings.push(finding(
        "reporting_dimension_id_invalid",
        "Reporting dimension IDs must be present and unique.",
        `${location}.id`,
      ));
    }
    dimensionIds.add(dimension?.id);
    if (
      !isNonEmptyString(dimension?.label) ||
      !Array.isArray(dimension?.usage) ||
      dimension.usage.length === 0 ||
      !Array.isArray(dimension?.sources) ||
      dimension.sources.length === 0
    ) {
      findings.push(finding(
        "reporting_dimension_definition_incomplete",
        `Reporting dimension '${dimension?.id ?? index}' requires a label, usage, and source mapping.`,
        location,
      ));
    }
    for (const [sourceIndex, source] of (dimension?.sources ?? []).entries()) {
      if (
        source?.sourceType === "ga4_custom_event" &&
        (
          source.scope !== "event" ||
          !isNonEmptyString(source.parameter) ||
          source.apiName !== `customEvent:${source.parameter}` ||
          prohibitedFields.has(source.parameter.toLowerCase()) ||
          PROHIBITED_CUSTOM_DIMENSION_PARAMETERS.has(
            source.parameter.toLowerCase(),
          )
        )
      ) {
        findings.push(finding(
          "custom_dimension_invalid",
          "Custom GA4 reporting dimensions must be event-scoped, use customEvent:<parameter>, and exclude prohibited fields.",
          `${location}.sources[${sourceIndex}]`,
        ));
      }
    }
  });

  for (const [dimensionId, expectedSources] of Object.entries(REQUIRED_DIMENSION_SOURCES)) {
    const dimension = reportingDimensions.find((entry) => entry.id === dimensionId);
    if (!dimension) {
      findings.push(finding(
        "required_dimension_mapping_missing",
        `Required reporting dimension '${dimensionId}' is missing.`,
        "$.dashboard.reportingDimensions",
      ));
      continue;
    }
    for (const expected of expectedSources) {
      if (!(dimension.sources ?? []).some((source) => dimensionSourceMatches(source, expected))) {
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
      });
      if (baseline?.status !== "captured") {
        findings.push(finding(
          "experiment_result_without_baseline",
          `Experiment '${experiment.id}' cannot record a result before its baseline is captured.`,
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
    });
    if (
      !Number.isInteger(reconciliation.purchaseCount) ||
      reconciliation.purchaseCount < 0 ||
      !Number.isInteger(reconciliation.paidOrderCount) ||
      reconciliation.paidOrderCount < 0 ||
      reconciliation.purchaseCount !== reconciliation.paidOrderCount
    ) {
      findings.push(finding(
        "reconciliation_counts_invalid",
        "Completed reconciliation requires equal non-negative purchase and paid-order counts.",
        "$.dashboard.reconciliation",
      ));
    }
    if (
      reconciliation.decision !== "within_tolerance" ||
      exceedsTolerance(
        Number(reconciliation.purchaseRevenue),
        Number(reconciliation.paidOrderProductRevenue),
        contract.dataQuality.revenueTolerance,
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

  const evidenceStates = [
    dashboard?.status === "created",
    dashboardBaseline?.status === "captured",
    reconciliation?.status === "completed",
    cadence?.ownerStatus === "assigned",
    ...experiments.flatMap((experiment) => [
      experiment.baseline?.status === "captured",
      experiment.result?.status === "recorded",
    ]),
  ];
  const hasEvidence = evidenceStates.some(Boolean);
  const allEvidenceComplete = evidenceStates.every(Boolean);
  const expectedContractStatus = allEvidenceComplete
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
