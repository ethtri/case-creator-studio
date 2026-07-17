import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_CONTRACT_PATH,
  DEFAULT_EXPORT_PATH,
  analyzeReportingExport,
  loadJson,
  validateGrowthReportingData,
  validateReportingContract,
} from "./validate-growth-reporting.mjs";

const LIFECYCLE_FIXTURE_PATH = path.join(
  import.meta.dirname,
  "fixtures",
  "growth-reporting-lifecycle-states.json",
);

const loadFixture = async () => {
  const [contract, report] = await Promise.all([
    loadJson(DEFAULT_CONTRACT_PATH),
    loadJson(DEFAULT_EXPORT_PATH),
  ]);
  return { contract, report };
};

const applyLifecycleState = (contract, state) => {
  contract.status = state.status;
  if (state.dashboard) {
    contract.dashboard = {
      ...contract.dashboard,
      ...state.dashboard,
      baseline: {
        ...contract.dashboard.baseline,
        ...(state.dashboard.baseline ?? {}),
      },
      reconciliation: {
        ...contract.dashboard.reconciliation,
        ...(state.dashboard.reconciliation ?? {}),
      },
    };
  }
  if (state.cadence) {
    contract.cadence = {
      ...contract.cadence,
      ...state.cadence,
    };
  }
  for (const experimentState of state.experiments ?? []) {
    const experiment = contract.experiments.find(
      (candidate) => candidate.id === experimentState.id,
    );
    assert.ok(experiment, `Lifecycle fixture references ${experimentState.id}`);
    experiment.baseline = {
      ...experiment.baseline,
      ...(experimentState.baseline ?? {}),
    };
    experiment.result = {
      ...experiment.result,
      ...(experimentState.result ?? {}),
    };
  }
  return contract;
};

const loadLifecycleContract = async (stateName) => {
  const [contract, states] = await Promise.all([
    loadJson(DEFAULT_CONTRACT_PATH),
    loadJson(LIFECYCLE_FIXTURE_PATH),
  ]);
  assert.equal(states.fixtureOnly, true);
  return applyLifecycleState(contract, states[stateName]);
};

const bindCompletedReconciliationToReport = (contract, report) => {
  report.synthetic = false;
  report.sourceSystem = "privacy reviewed GA4 and paid-order export";
  report.evidenceId = "production-growth-export-2026-07-17";
  report.evidenceUrl =
    "https://github.com/ethtri/case-creator-studio/issues/99";

  const reportResult = analyzeReportingExport(report, contract);
  const reconciliation = contract.dashboard.reconciliation;
  reconciliation.completedAt = report.generatedAt;
  reconciliation.window = structuredClone(report.window);
  reconciliation.purchaseCount = reportResult.summary.purchases;
  reconciliation.paidOrderCount = reportResult.summary.paidOrders;
  reconciliation.purchaseRevenue = reportResult.summary.purchaseRevenue;
  reconciliation.paidOrderProductRevenue =
    reportResult.summary.paidOrderProductRevenue;
  reconciliation.exportEvidenceId = report.evidenceId;
  reconciliation.exportGeneratedAt = report.generatedAt;
  reconciliation.exportSource = report.sourceSystem;
  reconciliation.evidenceUrl = report.evidenceUrl;
  return { contract, report };
};

test("defines a complete contract without invented baselines, owners, or winners", async () => {
  const { contract } = await loadFixture();
  assert.deepEqual(validateReportingContract(contract), []);
  assert.equal(contract.metrics.length, 16);
  assert.equal(contract.experiments.length, 5);
  assert.deepEqual(contract.experiments.map((experiment) => experiment.rank), [1, 2, 3, 4, 5]);
  assert.ok(contract.experiments.every((experiment) => experiment.baseline.status === "pending"));
  assert.ok(contract.experiments.every((experiment) => experiment.result.status === "pending"));
  assert.ok(contract.experiments.every((experiment) => experiment.result.winner === null));
  assert.equal(contract.cadence.ownerStatus, "pending_human_assignment");
  assert.equal(contract.dashboard.baseline.status, "pending");
});

test("maps every filter and registered custom dimension to the correct GA4 scope", async () => {
  const { contract } = await loadFixture();
  const dimensions = new Map(
    contract.dashboard.reportingDimensions.map((dimension) => [
      dimension.id,
      dimension,
    ]),
  );

  for (const filter of contract.dashboard.requiredFilters) {
    assert.ok(dimensions.get(filter.id)?.usage.includes("filter"), filter.id);
  }
  for (const dimension of dimensions.values()) {
    assert.ok(dimension.usage.includes("breakdown"), dimension.id);
  }
  assert.ok(dimensions.get("device").sources.some((source) =>
    source.apiName === "deviceCategory" && source.scope === "user"
  ));
  assert.ok(dimensions.get("browser").sources.some((source) =>
    source.apiName === "browser" && source.scope === "user"
  ));
  assert.ok(dimensions.get("phone_family").sources.some((source) =>
    source.apiName === "customEvent:brand" &&
    source.scope === "event" &&
    source.parameter === "brand"
  ));
  assert.ok(dimensions.get("phone_family").sources.some((source) =>
    source.apiName === "itemBrand" &&
    source.scope === "item" &&
    source.parameter === "item_brand"
  ));
  assert.ok(dimensions.get("phone_model").sources.some((source) =>
    source.apiName === "customEvent:model" &&
    source.scope === "event" &&
    source.parameter === "model"
  ));
  assert.ok(dimensions.get("phone_model").sources.some((source) =>
    source.apiName === "itemVariant" &&
    source.scope === "item" &&
    source.parameter === "item_variant"
  ));

  const customParameters = Array.from(dimensions.values())
    .flatMap((dimension) => dimension.sources)
    .filter((source) => source.sourceType === "ga4_custom_event")
    .map((source) => source.parameter)
    .sort();
  assert.deepEqual(customParameters, [
    "analytics_contract_version",
    "brand",
    "error_code",
    "model",
    "placement",
    "stage",
    "variant_id",
  ]);

  const expectedBindings = {
    catalog_model_selection_rate: ["itemBrand", "itemVariant"],
    editor_first_action_rate: ["customEvent:brand", "customEvent:model"],
    preview_success_rate: ["customEvent:brand", "customEvent:model"],
    preview_failure_rate: ["customEvent:brand", "customEvent:model"],
    add_to_cart_rate: ["itemBrand", "itemVariant"],
    checkout_start_rate: ["itemBrand", "itemVariant"],
    purchase_rate: ["itemBrand", "itemVariant"],
    checkout_completion_rate: ["itemBrand", "itemVariant"],
    revenue: ["itemBrand", "itemVariant"],
    revenue_per_session: ["itemBrand", "itemVariant"],
    experience_error_rate: ["customEvent:brand", "customEvent:model"],
    purchase_reconciliation_rate: ["itemBrand", "itemVariant"],
  };
  for (const [metricId, [family, model]] of Object.entries(expectedBindings)) {
    const metric = contract.metrics.find((candidate) => candidate.id === metricId);
    assert.equal(metric.dimensionBindings.phone_family, family, metricId);
    assert.equal(metric.dimensionBindings.phone_model, model, metricId);
  }
});

test("rejects malformed, unsupported, and invented reporting sources", async (t) => {
  const cases = [
    {
      name: "null source",
      source: null,
    },
    {
      name: "unsupported source type",
      source: {
        sourceType: "warehouse_column",
        apiName: "date",
        scope: "event",
      },
    },
    {
      name: "unknown built-in API",
      source: {
        sourceType: "ga4_builtin",
        apiName: "inventedDimension",
        scope: "event",
      },
    },
    {
      name: "wrong built-in scope",
      source: {
        sourceType: "ga4_builtin",
        apiName: "date",
        scope: "session",
      },
    },
    {
      name: "allowlisted source on the wrong dimension",
      source: {
        sourceType: "ga4_builtin",
        apiName: "itemBrand",
        scope: "item",
        parameter: "item_brand",
      },
    },
    {
      name: "custom item source",
      source: {
        sourceType: "ga4_custom_item",
        apiName: "customItem:brand",
        scope: "item",
        parameter: "brand",
        registeredDisplayName: "Phone family",
      },
    },
  ];

  for (const sourceCase of cases) {
    await t.test(sourceCase.name, async () => {
      const { contract } = await loadFixture();
      contract.dashboard.reportingDimensions[0].sources.push(sourceCase.source);
      const codes = validateReportingContract(contract).map((item) => item.code);
      assert.ok(codes.includes("reporting_dimension_source_invalid"));
    });
  }
});

test("rejects unregistered phone identifiers as custom dimensions", async () => {
  const { contract } = await loadFixture();
  contract.dashboard.reportingDimensions.push({
    id: "phone_identifier",
    label: "Phone identifier",
    usage: ["breakdown"],
    sources: [{
      sourceType: "ga4_custom_event",
      apiName: "customEvent:phone_number",
      scope: "event",
      parameter: "phone_number",
      registeredDisplayName: "Phone number",
    }],
  });

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("reporting_dimension_source_invalid"));
});

test("requires every configured dashboard filter to map to a reporting dimension", async () => {
  const { contract } = await loadFixture();
  contract.dashboard.requiredFilters.push({
    id: "unmapped_filter",
    label: "Unmapped",
    sourceFields: ["invented"],
    required: true,
  });
  contract.metrics[0].filters.push("unmapped_filter");

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("required_filter_mapping_missing"));
});

test("rejects metric phone filters bound to the wrong GA4 scope", async () => {
  const { contract } = await loadFixture();
  const metric = contract.metrics.find(
    (candidate) => candidate.id === "editor_first_action_rate",
  );
  metric.dimensionBindings.phone_family = "itemBrand";
  metric.dimensionBindings.phone_model = "itemVariant";

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("metric_dimension_binding_invalid"));
});

test("accepts an evidence-backed partial lifecycle", async () => {
  const contract = await loadLifecycleContract("partial");

  assert.deepEqual(validateReportingContract(contract), []);
  assert.equal(contract.status, "partially_evidenced");
  assert.equal(contract.dashboard.status, "created");
  assert.equal(contract.dashboard.baseline.status, "captured");
  assert.equal(contract.dashboard.reconciliation.status, "pending");
  assert.equal(contract.experiments[0].baseline.status, "captured");
  assert.equal(contract.experiments[0].result.status, "pending");
});

test("accepts an evidence-backed completed lifecycle", async () => {
  const contract = await loadLifecycleContract("completed");

  assert.deepEqual(validateReportingContract(contract), []);
  assert.equal(contract.status, "evidence_backed_completed");
  assert.equal(contract.dashboard.reconciliation.decision, "within_tolerance");
  assert.ok(contract.experiments.every((experiment) =>
    experiment.baseline.status === "captured" &&
    experiment.result.status === "recorded"
  ));
});

test("accepts a completed reporting foundation while future experiments remain pending", async () => {
  const [completed, { contract: pending }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  completed.experiments.forEach((experiment, index) => {
    experiment.baseline = structuredClone(pending.experiments[index].baseline);
    experiment.result = structuredClone(pending.experiments[index].result);
  });

  assert.deepEqual(validateReportingContract(completed), []);
  assert.equal(completed.status, "evidence_backed_completed");
  assert.ok(completed.experiments.every((experiment) =>
    experiment.baseline.status === "pending" &&
    experiment.result.status === "pending"
  ));
});

test("rejects a completed dashboard without evidence", async () => {
  const contract = await loadLifecycleContract("partial");
  contract.dashboard.evidenceUrl = null;

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("lifecycle_evidence_missing"));
});

test("validates baseline and result transitions independently", async () => {
  const partial = await loadLifecycleContract("partial");
  partial.experiments[0].baseline.ownerName = null;
  const baselineFindings = validateReportingContract(partial);
  assert.ok(baselineFindings.some((item) =>
    item.code === "lifecycle_owner_missing" &&
    item.location === "$.experiments[0].baseline.ownerName"
  ));

  const completed = await loadLifecycleContract("completed");
  completed.experiments[0].result.decision = null;
  const resultFindings = validateReportingContract(completed);
  assert.ok(resultFindings.some((item) =>
    item.code === "experiment_result_decision_invalid" &&
    item.location === "$.experiments[0].result"
  ));
});

test("rejects experiment decisions that contradict their observed values", async () => {
  const variantContract = await loadLifecycleContract("completed");
  variantContract.experiments[0].result.controlValue = 0.5;
  variantContract.experiments[0].result.variantValue = 0.4;
  assert.ok(validateReportingContract(variantContract).some(
    (item) => item.code === "experiment_result_value_decision_mismatch",
  ));

  const controlContract = await loadLifecycleContract("completed");
  controlContract.experiments[1].result.controlValue = 0.4;
  controlContract.experiments[1].result.variantValue = 0.5;
  assert.ok(validateReportingContract(controlContract).some(
    (item) => item.code === "experiment_result_value_decision_mismatch",
  ));
});

test("rejects a winner declared from a one-minute experiment window", async () => {
  const contract = await loadLifecycleContract("completed");
  const result = contract.experiments[0].result;
  result.window.end = "2026-06-02T07:01:00.000Z";
  result.recordedAt = "2026-06-03T07:00:00.000Z";

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("experiment_minimum_run_invalid"));
});

test("rejects tiny winner samples and rates not derived from arm counts", async () => {
  const contract = await loadLifecycleContract("completed");
  const result = contract.experiments[0].result;
  result.eligibleSessions = 1;
  result.requiredSessions = 1;
  result.requiredSamplePerArm = 1;
  result.controlSessions = 1;
  result.controlConversions = 0;
  result.variantSessions = 1;
  result.variantConversions = 1;

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("experiment_statistical_evidence_invalid"));
  assert.ok(codes.includes("experiment_winner_not_significant"));
});

test("rejects an understated sample requirement for the declared MDE and power", async () => {
  const contract = await loadLifecycleContract("completed");
  const result = contract.experiments[0].result;
  result.minimumDetectableEffect = 0.001;
  result.power = 0.99;
  result.requiredSamplePerArm = 100;
  result.requiredSessions = 200;

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("experiment_statistical_evidence_invalid"));
});

test("rejects placeholder evidence and invalid evidence windows", async () => {
  const contract = await loadLifecycleContract("partial");
  contract.dashboard.baseline.evidenceUrl =
    "https://example.invalid/synthetic-baseline";
  contract.dashboard.baseline.window.end = "not-a-date";

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("lifecycle_evidence_missing"));
  assert.ok(codes.includes("lifecycle_window_invalid"));
});

test("rejects results without a baseline and stale T+1 evidence", async () => {
  const contract = await loadLifecycleContract("completed");
  const experiment = contract.experiments[0];
  experiment.baseline = {
    status: "pending",
    value: null,
    window: null,
    capturedAt: null,
    ownerName: null,
    evidenceUrl: null,
    notes: null,
  };
  experiment.result.recordedAt = "2026-07-20T08:00:00.000Z";

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("experiment_result_without_baseline"));
  assert.ok(codes.includes("lifecycle_freshness_invalid"));
});

test("rejects experiment results before commerce reconciliation", async () => {
  const contract = await loadLifecycleContract("completed");
  contract.status = "partially_evidenced";
  contract.dashboard.reconciliation = {
    status: "pending",
    completedAt: null,
    ownerName: null,
    evidenceUrl: null,
    window: null,
    purchaseCount: null,
    paidOrderCount: null,
    purchaseRevenue: null,
    paidOrderProductRevenue: null,
    decision: null,
    notes: null,
  };

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("experiment_result_without_reconciliation"));
});

test("rejects completed reconciliation with null revenue", async () => {
  const contract = await loadLifecycleContract("completed");
  contract.dashboard.reconciliation.purchaseRevenue = null;
  contract.dashboard.reconciliation.paidOrderProductRevenue = null;

  const findings = validateReportingContract(contract);
  assert.ok(findings.some((item) =>
    item.code === "reconciliation_revenue_invalid" &&
    item.location === "$.dashboard.reconciliation"
  ));
});

test("accepts completed reconciliation bound to the analyzed production export", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  bindCompletedReconciliationToReport(contract, report);

  const result = validateGrowthReportingData(contract, report);
  assert.equal(result.ok, true);
  assert.deepEqual(result.contractFindings, []);
  assert.deepEqual(result.reportResult.findings, []);
  assert.deepEqual(result.lifecycleExportFindings, []);
});

test("rejects completed reconciliation against the synthetic fixture export", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);

  const result = validateGrowthReportingData(contract, report);
  const codes = result.lifecycleExportFindings.map((item) => item.code);
  assert.equal(result.ok, false);
  assert.ok(codes.includes("completed_reconciliation_uses_synthetic_export"));
  assert.ok(codes.includes("reconciliation_export_counts_mismatch"));
  assert.ok(codes.includes("reconciliation_export_revenue_mismatch"));
  assert.ok(codes.includes("reconciliation_export_window_mismatch"));
  assert.ok(codes.includes("reconciliation_export_identity_mismatch"));
});

test("rejects completed reconciliation for a different export window and totals", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  bindCompletedReconciliationToReport(contract, report);
  contract.dashboard.reconciliation.purchaseCount = 2;
  contract.dashboard.reconciliation.paidOrderCount = 2;
  contract.dashboard.reconciliation.purchaseRevenue = 59.98;
  contract.dashboard.reconciliation.paidOrderProductRevenue = 59.98;
  contract.dashboard.reconciliation.window.start =
    "2026-07-15T07:00:00.000Z";

  const codes = validateGrowthReportingData(
    contract,
    report,
  ).lifecycleExportFindings.map((item) => item.code);
  assert.ok(codes.includes("reconciliation_export_counts_mismatch"));
  assert.ok(codes.includes("reconciliation_export_revenue_mismatch"));
  assert.ok(codes.includes("reconciliation_export_window_mismatch"));
});

test("rejects completed reconciliation bound to a different evidence export", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  bindCompletedReconciliationToReport(contract, report);
  report.evidenceId = "production-growth-export-other";

  const codes = validateGrowthReportingData(
    contract,
    report,
  ).lifecycleExportFindings.map((item) => item.code);
  assert.ok(codes.includes("reconciliation_export_identity_mismatch"));
});

test("rejects a completed reconciliation backed by an empty export", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  report.sessions = [];
  report.events = [];
  report.orders = [];
  bindCompletedReconciliationToReport(contract, report);

  const result = validateGrowthReportingData(contract, report);
  assert.ok(result.reportResult.findings.some(
    (item) => item.code === "export_empty",
  ));
  assert.ok(result.lifecycleExportFindings.some(
    (item) => item.code === "reconciliation_export_empty",
  ));
});

test("rejects a completed reconciliation from a partial-day export window", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  report.window.end = "2026-07-16T08:00:00.000Z";
  report.generatedAt = "2026-07-17T07:00:00.000Z";
  bindCompletedReconciliationToReport(contract, report);

  const codes = validateGrowthReportingData(
    contract,
    report,
  ).lifecycleExportFindings.map((item) => item.code);
  assert.ok(codes.includes("reconciliation_export_window_incomplete"));
});

test("rejects future lifecycle evidence and export timestamps deterministically", async () => {
  const [contract, { report }] = await Promise.all([
    loadLifecycleContract("completed"),
    loadFixture(),
  ]);
  contract.dashboard.createdAt = "2026-07-18T07:00:00.000Z";
  contract.dashboard.baseline.window.start = "2026-07-18T07:00:00.000Z";
  contract.dashboard.baseline.window.end = "2026-07-19T07:00:00.000Z";
  contract.dashboard.baseline.capturedAt = "2026-07-20T07:00:00.000Z";
  report.generatedAt = "2026-07-18T07:00:00.000Z";

  const options = {
    validationTime: "2026-07-17T20:00:00.000Z",
    futureSkewMs: 0,
  };
  const contractCodes = validateReportingContract(contract, options)
    .map((item) => item.code);
  const exportCodes = analyzeReportingExport(report, contract, options)
    .findings.map((item) => item.code);
  assert.ok(contractCodes.includes("lifecycle_timestamp_in_future"));
  assert.ok(contractCodes.includes("lifecycle_window_in_future"));
  assert.ok(exportCodes.includes("export_timestamp_in_future"));
});

test("keeps consent, suppression, T+1, tolerance, and no-PII guardrails enforceable", async () => {
  const contract = await loadLifecycleContract("completed");
  contract.privacy.consentedRateLabel = "All traffic";
  contract.privacy.minimumCellSize = 5;
  contract.dashboard.decisionFreshness.maximumLagHours = 72;
  contract.dashboard.reconciliation.purchaseRevenue = 340;
  contract.dashboard.reconciliation.purchaseCount = 0;
  contract.dashboard.reconciliation.paidOrderCount = 0;
  contract.dashboard.reportingDimensions.push({
    id: "session_identifier",
    label: "Session identifier",
    usage: ["breakdown"],
    sources: [{
      sourceType: "ga4_custom_event",
      apiName: "customEvent:session_id",
      scope: "event",
      parameter: "session_id",
    }],
  });

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("consented_rate_label_missing"));
  assert.ok(codes.includes("minimum_cell_size_invalid"));
  assert.ok(codes.includes("decision_freshness_invalid"));
  assert.ok(codes.includes("reconciliation_counts_invalid"));
  assert.ok(codes.includes("reconciliation_tolerance_failed"));
  assert.ok(codes.includes("reporting_dimension_source_invalid"));
});

test("rejects weakened data-quality policy values", async () => {
  const { contract } = await loadFixture();
  contract.dataQuality.revenueTolerance.absoluteUsd = 50;
  contract.dataQuality.revenueTolerance.relative = 0.5;
  contract.dataQuality.cardinality.minimumObservations = 5000;
  contract.dataQuality.allowedEventNames = ["purchase"];

  const codes = validateReportingContract(contract).map((item) => item.code);
  assert.ok(codes.includes("data_quality_policy_invalid"));
});

test("reconciles one known-good synthetic purchase to one paid order", async () => {
  const { contract, report } = await loadFixture();
  const result = analyzeReportingExport(report, contract);

  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.equal(result.summary.purchases, 1);
  assert.equal(result.summary.paidOrders, 1);
  assert.equal(result.summary.purchaseRevenue, 29.99);
  assert.equal(result.summary.paidOrderProductRevenue, 29.99);
});

test("surfaces duplicate purchase transactions", async () => {
  const { contract, report } = await loadFixture();
  const duplicate = structuredClone(
    report.events.find((event) => event.event_name === "purchase"),
  );
  duplicate.event_id = "synthetic-event-purchase-duplicate";
  report.events.push(duplicate);

  const codes = analyzeReportingExport(report, contract).findings.map((item) => item.code);
  assert.ok(codes.includes("duplicate_purchase_transaction"));
  assert.ok(codes.includes("purchase_order_count_mismatch"));
});

test("surfaces missing ecommerce item IDs", async () => {
  const { contract, report } = await loadFixture();
  report.events.find((event) => event.event_name === "begin_checkout").items[0].item_id = "";

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) => item.code === "missing_item_id"));
});

test("surfaces unexpected not-set dimensions", async () => {
  const { contract, report } = await loadFixture();
  report.sessions[0].device = "(not set)";

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) =>
    item.code === "unexpected_not_set" &&
    item.location === "$.sessions[0].device"
  ));
});

test("surfaces normalized-path cardinality spikes", async () => {
  const { contract, report } = await loadFixture();
  report.events = Array.from({ length: 60 }, (_, index) => ({
    event_id: `page-${index}`,
    event_name: "page_view",
    session_id: "synthetic-session-1",
    normalized_path: `/synthetic-route-${index}`,
    occurred_at: "2026-07-16T18:00:00.000Z",
  }));
  report.orders = [];

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) => item.code === "normalized_path_cardinality_spike"));
});

test("surfaces event-name cardinality spikes", async () => {
  const { contract, report } = await loadFixture();
  report.events = Array.from({ length: 30 }, (_, index) => ({
    event_id: `event-name-${index}`,
    event_name: `generated_event_${index}`,
    session_id: "synthetic-session-1",
    occurred_at: "2026-07-16T18:00:00.000Z",
  }));
  report.orders = [];

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) => item.code === "event_name_cardinality_spike"));
});

test("surfaces dashboard-to-order revenue mismatches", async () => {
  const { contract, report } = await loadFixture();
  report.orders[0].product_revenue = 25;

  const codes = analyzeReportingExport(report, contract).findings.map((item) => item.code);
  assert.ok(codes.includes("purchase_revenue_mismatch"));
  assert.ok(codes.includes("dashboard_order_revenue_mismatch"));
});

test("requires strict purchase and paid-order revenue numbers", async (t) => {
  for (const invalidValue of [null, "", -1]) {
    await t.test(`purchase value ${JSON.stringify(invalidValue)}`, async () => {
      const { contract, report } = await loadFixture();
      report.events.find((event) => event.event_name === "purchase").value =
        invalidValue;
      const codes = analyzeReportingExport(report, contract).findings
        .map((item) => item.code);
      assert.ok(codes.includes("invalid_purchase_value"));
    });
    await t.test(`paid-order revenue ${JSON.stringify(invalidValue)}`, async () => {
      const { contract, report } = await loadFixture();
      report.orders[0].product_revenue = invalidValue;
      const codes = analyzeReportingExport(report, contract).findings
        .map((item) => item.code);
      assert.ok(codes.includes("invalid_paid_order_revenue"));
    });
  }
});

test("reconciles purchase and paid-order revenue to strict item totals", async () => {
  const { contract, report } = await loadFixture();
  report.events.find((event) => event.event_name === "purchase").value = 25;
  report.orders[0].product_revenue = 25;

  const codes = analyzeReportingExport(report, contract).findings
    .map((item) => item.code);
  assert.ok(codes.includes("purchase_item_revenue_mismatch"));
  assert.ok(codes.includes("paid_order_item_revenue_mismatch"));
});

test("rejects an export whose purchases and orders use a non-contract currency", async () => {
  const { contract, report } = await loadFixture();
  report.events.find((event) => event.event_name === "purchase").currency = "EUR";
  report.orders[0].currency = "EUR";

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) =>
    item.code === "export_currency_mismatch" &&
    item.location.includes("$.events")
  ));
  assert.ok(findings.some((item) =>
    item.code === "export_currency_mismatch" &&
    item.location.includes("$.orders")
  ));
});

test("requires export generation after the window and within the T+1 lag", async () => {
  const before = await loadFixture();
  before.report.generatedAt = "2026-07-17T06:59:59.000Z";
  assert.ok(analyzeReportingExport(before.report, before.contract).findings.some(
    (item) => item.code === "export_freshness_invalid",
  ));

  const late = await loadFixture();
  late.report.generatedAt = "2026-07-19T08:00:00.000Z";
  assert.ok(analyzeReportingExport(
    late.report,
    late.contract,
    { validationTime: "2026-07-20T00:00:00.000Z" },
  ).findings.some((item) => item.code === "export_freshness_invalid"));
});

test("requires event and paid-order timestamps inside the export window", async (t) => {
  for (const timestamp of [
    undefined,
    "not-a-date",
    "2026-07-17T07:00:00.000Z",
  ]) {
    await t.test(`event ${String(timestamp)}`, async () => {
      const { contract, report } = await loadFixture();
      const event = report.events[0];
      if (timestamp === undefined) {
        delete event.occurred_at;
      } else {
        event.occurred_at = timestamp;
      }
      const codes = analyzeReportingExport(report, contract).findings
        .map((item) => item.code);
      assert.ok(codes.includes("export_record_outside_window"));
    });
    await t.test(`order ${String(timestamp)}`, async () => {
      const { contract, report } = await loadFixture();
      if (timestamp === undefined) {
        delete report.orders[0].created_at;
      } else {
        report.orders[0].created_at = timestamp;
      }
      const codes = analyzeReportingExport(report, contract).findings
        .map((item) => item.code);
      assert.ok(codes.includes("export_record_outside_window"));
    });
  }
});

test("rejects prohibited reporting fields", async () => {
  const { contract, report } = await loadFixture();
  report.sessions[0].email = "synthetic@example.invalid";

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) =>
    item.code === "prohibited_field" &&
    item.location === "$.sessions[0].email"
  ));
});

test("rejects unknown export fields and privacy aliases", async () => {
  const { contract, report } = await loadFixture();
  report.events[0].mobile_number = "555-0100";
  report.sessions[0].phoneNumber = "555-0101";

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) =>
    item.code === "export_unknown_field" &&
    item.location === "$.events[0].mobile_number"
  ));
  assert.ok(findings.some((item) =>
    item.code === "export_unknown_field" &&
    item.location === "$.sessions[0].phoneNumber"
  ));
  assert.ok(findings.some((item) =>
    item.code === "prohibited_field" &&
    item.location === "$.sessions[0].phoneNumber"
  ));
});

test("keeps the mandatory privacy floor when configuration is emptied", async () => {
  const { contract, report } = await loadFixture();
  contract.privacy.prohibitedFields = [];
  report.sessions[0].email = "privacy-floor@example.invalid";

  const contractCodes = validateReportingContract(contract)
    .map((item) => item.code);
  const reportFindings = analyzeReportingExport(report, contract).findings;
  assert.ok(contractCodes.includes("mandatory_prohibited_field_missing"));
  assert.ok(reportFindings.some((item) =>
    item.code === "prohibited_field" &&
    item.location === "$.sessions[0].email"
  ));
});

test("reconciles the complete ecommerce item identity", async () => {
  const { contract, report } = await loadFixture();
  report.orders[0].items[0].item_variant = "iPhone 16 Pro";

  const codes = analyzeReportingExport(report, contract).findings
    .map((item) => item.code);
  assert.ok(codes.includes("purchase_items_mismatch"));
});

test("reports null collection entries without throwing", async () => {
  const { contract, report } = await loadFixture();
  report.sessions.push(null);
  report.events.push(null);
  report.orders.push(null);
  report.events.find((event) => event?.event_name === "purchase").items[0] = null;

  let result;
  assert.doesNotThrow(() => {
    result = analyzeReportingExport(report, contract);
  });
  assert.ok(result.findings.some(
    (item) => item.code === "export_schema_invalid",
  ));
  assert.ok(result.findings.some(
    (item) => item.code === "purchase_items_mismatch",
  ));
});
