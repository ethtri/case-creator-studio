import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_CONTRACT_PATH,
  DEFAULT_EXPORT_PATH,
  analyzeReportingExport,
  loadJson,
  validateReportingContract,
} from "./validate-growth-reporting.mjs";

const loadFixture = async () => {
  const [contract, report] = await Promise.all([
    loadJson(DEFAULT_CONTRACT_PATH),
    loadJson(DEFAULT_EXPORT_PATH),
  ]);
  return { contract, report };
};

test("defines a complete contract without invented baselines, owners, or winners", async () => {
  const { contract } = await loadFixture();
  assert.deepEqual(validateReportingContract(contract), []);
  assert.equal(contract.metrics.length, 16);
  assert.equal(contract.experiments.length, 5);
  assert.deepEqual(contract.experiments.map((experiment) => experiment.rank), [1, 2, 3, 4, 5]);
  assert.ok(contract.experiments.every((experiment) => experiment.baseline.status === "pending"));
  assert.ok(contract.experiments.every((experiment) => experiment.result.winner === null));
  assert.equal(contract.cadence.ownerStatus, "pending_human_assignment");
  assert.equal(contract.dashboard.baseline.status, "pending");
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
