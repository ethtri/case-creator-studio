import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_CONTRACT_PATH,
  DEFAULT_EXPORT_PATH,
  analyzeReportingExport,
  loadJson,
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
  assert.ok(codes.includes("custom_dimension_invalid"));
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

test("rejects prohibited reporting fields", async () => {
  const { contract, report } = await loadFixture();
  report.sessions[0].email = "synthetic@example.invalid";

  const findings = analyzeReportingExport(report, contract).findings;
  assert.ok(findings.some((item) =>
    item.code === "prohibited_field" &&
    item.location === "$.sessions[0].email"
  ));
});
