// Provider-bound activation evidence is supplied only after independent production review.
// It is never inferred from a transactional API key or a synthetic dry-run.
export type Flow = "welcome" | "abandoned_design" | "abandoned_cart";
export function workerAuthorized(req: Request, secrets: string[]): boolean {
  if (req.headers.get("origin")) return false;
  return secrets.filter(Boolean).some((secret) =>
    req.headers.get("authorization") === `Bearer ${secret}`
  );
}
export type Activation = {
  source: string;
  projectUrl: string;
  from: string;
  replyTo: string;
  authorityId: string;
  contractVersion: string;
  seedAndQaExcluded: boolean;
  keyAccountVerified: boolean;
  webhookSchema: string;
  noOverageVerified: boolean;
  evidenceClass: string;
  observedAt: string;
  accountId: string;
  domainId: string;
  marketingTopicId: string;
  webhookId: string;
  bindingVerified: boolean;
  suppressionVerified: boolean;
  unsubscribeVerified: boolean;
  restorationVerified: boolean;
  freePlanVerified: boolean;
  dailyRemaining: number;
  monthlyRemaining: number;
  flows: Flow[];
};
export type Claim = { id: string; claim_token: string; operation: Flow };
export type Prepared = {
  email: string;
  preferenceToken: string;
  recoveryToken: string | null;
  eventId: string;
  recipientRef: string;
  idempotencyKey: string;
};
export type WorkerDependencies = {
  aggregate: () => Promise<Record<string, number>>;
  verifyDomain: (domainId: string) => Promise<boolean>;
  claim: (activation: Activation) => Promise<Claim | null>;
  prepare: (claim: Claim, activation: Activation) => Promise<Prepared | null>;
  providerEligibility: (
    prepared: Prepared,
    activation: Activation,
  ) => Promise<"eligible" | "suppressed" | "unavailable">;
  recheck: (claim: Claim) => Promise<boolean>;
  deliver: (claim: Claim, prepared: Prepared) => Promise<string>;
  finish: (claim: Claim, status: string, messageId?: string) => Promise<void>;
};
export function activationBlocks(
  value: Activation | null,
  now = Date.now(),
): string[] {
  if (!value) return ["activation_evidence_missing"];
  if (
    typeof value !== "object" || typeof value.observedAt !== "string" ||
    [value.accountId, value.domainId, value.webhookId, value.marketingTopicId]
      .some((id) =>
        typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)
      )
  ) {
    return ["activation_schema_invalid"];
  }
  const age = now - Date.parse(value.observedAt);
  const blocks: string[] = [];
  if (
    value.source !== "production_contract" ||
    value.projectUrl !== "https://mdprdbaykuordozfctud.supabase.co" ||
    value.from !== "hello@snapcase.ai" ||
    value.replyTo !== "hello@snapcase.ai" ||
    value.authorityId !== "authority_20260720_zero_spend_marketing" ||
    value.contractVersion !== "1.0.0" ||
    value.seedAndQaExcluded !== true || value.keyAccountVerified !== true ||
    value.webhookSchema !== "svix_resend_native" ||
    value.noOverageVerified !== true
  ) {
    blocks.push("production_contract_binding_invalid");
  }
  if (!Number.isFinite(age) || age < 0 || age > 900_000) {
    blocks.push("activation_evidence_stale");
  }
  if (
    value.evidenceClass !== "production" || value.bindingVerified !== true ||
    !value.accountId ||
    !value.domainId || !value.webhookId
  ) blocks.push("provider_binding_unverified");
  if (value.suppressionVerified !== true) {
    blocks.push("provider_suppression_unverified");
  }
  if (value.unsubscribeVerified !== true) blocks.push("unsubscribe_unverified");
  if (value.restorationVerified !== true) blocks.push("restoration_unverified");
  if (
    value.freePlanVerified !== true ||
    !Number.isInteger(value.dailyRemaining) ||
    !Number.isInteger(value.monthlyRemaining) || value.dailyRemaining < 1 ||
    value.monthlyRemaining < 1 || value.dailyRemaining > 100 ||
    value.monthlyRemaining > 3000
  ) {
    blocks.push("zero_cost_capacity_unverified");
  }
  if (
    !Array.isArray(value.flows) || !value.flows.length ||
    new Set(value.flows).size !== value.flows.length ||
    value.flows.some((f) =>
      !["welcome", "abandoned_design", "abandoned_cart"].includes(f)
    )
  ) {
    blocks.push("approved_flows_missing");
  }
  return blocks;
}
export async function runLifecycleWorker(
  input: {
    dryRun: boolean;
    enabled: boolean;
    provider: string;
    activation: Activation | null;
  },
  d: WorkerDependencies,
) {
  const blocks = activationBlocks(input.activation);
  if (!input.enabled || input.provider !== "resend") {
    blocks.unshift("provider_disabled");
  }
  if (input.dryRun) {
    return { result: "read_only", eligible: await d.aggregate(), blocks };
  }
  if (blocks.length) return { result: "blocked", blocks };
  const activation = input.activation!;
  if (!(await d.verifyDomain(activation.domainId))) {
    return { result: "blocked", blocks: ["domain_binding_drift"] };
  }
  const claim = await d.claim(activation);
  if (!claim) return { result: "no_eligible_claim" };
  let attempted = false;
  let accepted: string | undefined;
  try {
    if (!activation.flows.includes(claim.operation)) {
      await d.finish(claim, "deferred");
      return { result: "flow_blocked" };
    }
    const prepared = await d.prepare(claim, activation);
    if (!prepared) {
      await d.finish(claim, "suppressed");
      return { result: "eligibility_or_capacity_blocked" };
    }
    const providerEligibility = await d.providerEligibility(
      prepared,
      activation,
    );
    if (providerEligibility !== "eligible") {
      await d.finish(
        claim,
        providerEligibility === "suppressed" ? "suppressed" : "deferred",
      );
      return {
        result: providerEligibility === "suppressed"
          ? "provider_suppressed"
          : "provider_synchronization_unavailable",
      };
    }
    if (!(await d.recheck(claim))) {
      await d.finish(claim, "suppressed");
      return { result: "eligibility_or_capacity_blocked" };
    }
    attempted = true;
    const messageId = await d.deliver(claim, prepared);
    accepted = messageId;
    // A completion failure after acceptance is also ambiguous: never requeue it.
    await d.finish(claim, "completed", messageId);
    return { result: "provider_accepted" };
  } catch {
    await d.finish(claim, attempted ? "uncertain" : "deferred", accepted);
    return {
      result: attempted ? "reconciliation_required" : "preparation_deferred",
    };
  }
}
