import {
  type Activation,
  runLifecycleWorker,
  workerAuthorized,
} from "./lifecycle-worker.ts";
import { COPY } from "./lifecycle-worker-copy.ts";
import { LIFECYCLE_COMMERCIAL_ADDRESS } from "./lifecycle-marketing.ts";

const PROJECT = "https://mdprdbaykuordozfctud.supabase.co";
const SITE = "https://www.snapcase.ai";
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
type Dependencies = {
  env: (name: string) => string | undefined;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<any>;
  providerFetch: typeof fetch;
};
export const createLifecycleOutboxHandler =
  ({ env, rpc, providerFetch }: Dependencies) => async (req: Request) => {
    if (req.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405);
    }
    if (req.headers.get("origin")) {
      return json({ error: "browser_requests_blocked" }, 403);
    }
    const workerSecret = env("LIFECYCLE_OUTBOX_WORKER_SECRET") ?? "";
    const serviceRole = env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    // Only the existing platform default server key is an additional operator.
    // Publishable keys and arbitrary named keys never confer worker access.
    let defaultSecret = "";
    try {
      const keys = JSON.parse(env("SUPABASE_SECRET_KEYS") ?? "null");
      if (keys && typeof keys === "object" && !Array.isArray(keys) &&
        typeof keys.default === "string" &&
        keys.default.startsWith("sb_secret_") &&
        keys.default.length > "sb_secret_".length) {
        defaultSecret = keys.default;
      }
    } catch { /* malformed platform dictionary fails closed */ }
    const secretAuthorized = Boolean(defaultSecret) &&
      req.headers.get("apikey") === defaultSecret;
    if (!workerAuthorized(req, [workerSecret, serviceRole]) && !secretAuthorized) {
      return json({ error: "unauthorized" }, 401);
    }
    let body: { dryRun: boolean };
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_request" }, 400);
    }
    if (
      !body || typeof body !== "object" || Array.isArray(body) ||
      typeof body.dryRun !== "boolean"
    ) {
      return json({ error: "dry_run_flag_required" }, 400);
    }
    try {
      const url = env("SUPABASE_URL");
      if (url !== PROJECT) {
        return json({ error: "production_project_mismatch" }, 503);
      }
      let activation: Activation | null = null;
      try {
        activation = JSON.parse(env("LIFECYCLE_ACTIVATION_EVIDENCE") ?? "null");
      } catch { /* blocked below */ }
      const providerKey = env("LIFECYCLE_RESEND_API_KEY") ?? "";
      const result = await runLifecycleWorker({
        dryRun: body.dryRun,
        enabled: env("LIFECYCLE_EMAIL_ENABLED") === "true" &&
          Boolean(providerKey),
        provider: env("LIFECYCLE_EMAIL_PROVIDER") ?? "disabled",
        activation,
      }, {
        aggregate: () => rpc("lifecycle_worker_aggregate"),
        verifyDomain: async (id) => {
          const response = await providerFetch(
            `https://api.resend.com/domains/${encodeURIComponent(id)}`,
            {
              headers: { Authorization: `Bearer ${providerKey}` },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!response.ok) return false;
          const domain = await response.json();
          return domain.id === id && domain.name === "snapcase.ai" &&
            domain.status === "verified";
        },
        claim: (evidence) =>
          rpc("lifecycle_worker_claim", {
            p_flows: evidence.flows,
            p_account: evidence.accountId,
            p_daily: evidence.dailyRemaining,
            p_monthly: evidence.monthlyRemaining,
            p_observed_at: evidence.observedAt,
          }),
        prepare: (claim, evidence) =>
          rpc("lifecycle_worker_prepare", {
            p_id: claim.id,
            p_claim: claim.claim_token,
            p_account: evidence.accountId,
            p_daily: evidence.dailyRemaining,
            p_monthly: evidence.monthlyRemaining,
          }),
        providerEligibility: async (prepared, evidence) => {
          const contactResponse = await providerFetch(
            `https://api.resend.com/contacts/${
              encodeURIComponent(prepared.email)
            }`,
            {
              headers: { Authorization: `Bearer ${providerKey}` },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!contactResponse.ok) return "unavailable";
          const contact = await contactResponse.json();
          if (
            contact.email !== prepared.email || typeof contact.id !== "string"
          ) return "unavailable";
          if (contact.unsubscribed === true) return "suppressed";
          if (contact.unsubscribed !== false) return "unavailable";
          const response = await providerFetch(
            `https://api.resend.com/contacts/${
              encodeURIComponent(contact.id)
            }/topics`,
            {
              headers: { Authorization: `Bearer ${providerKey}` },
              signal: AbortSignal.timeout(10_000),
            },
          );
          if (!response.ok) return "unavailable";
          const topics = await response.json();
          if (!Array.isArray(topics.data) || topics.has_more !== false) {
            return "unavailable";
          }
          const topic = topics.data.find((t: { id: string }) =>
            t.id === evidence.marketingTopicId
          );
          if (topic?.subscription === "opt_out") return "suppressed";
          return topic?.subscription === "opt_in" ? "eligible" : "unavailable";
        },
        recheck: (claim) =>
          rpc("lifecycle_worker_recheck", {
            p_id: claim.id,
            p_claim: claim.claim_token,
          }),
        deliver: async (claim, prepared) => {
          const unsubscribe =
            `${SITE}/email-preferences?token=${prepared.preferenceToken}`;
          const oneClick =
            `${PROJECT}/functions/v1/lifecycle-email-preferences?token=${prepared.preferenceToken}`;
          const flow = claim.operation;
          const campaign = flow === "welcome"
            ? "2026q3_welcome"
            : `2026q3_${flow}`;
          const recovery =
            `${SITE}/recover?token=${prepared.recoveryToken}&utm_source=lifecycle&utm_medium=email&utm_campaign=${campaign}&utm_content=${
              flow === "abandoned_design" ? "design" : "cart"
            }_recovery_v1_primary`;
          if (
            !/^[0-9a-f]{64}$/.test(prepared.preferenceToken) ||
            (flow !== "welcome" &&
              !/^[0-9a-f]{64}$/.test(prepared.recoveryToken ?? ""))
          ) {
            throw new Error("private_link_missing");
          }
          const text = COPY[flow].text.replaceAll(
            "{{sender_identity}}",
            "Snapcase Team <hello@snapcase.ai>",
          )
            .replaceAll(
              "{{physical_postal_address}}",
              LIFECYCLE_COMMERCIAL_ADDRESS,
            )
            .replaceAll("{{unsubscribe_url}}", unsubscribe).replaceAll(
              "{{private_recovery_url}}",
              recovery,
            );
          const response = await providerFetch(
            "https://api.resend.com/emails",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${providerKey}`,
                "Content-Type": "application/json",
                "Idempotency-Key": prepared.idempotencyKey,
              },
              signal: AbortSignal.timeout(10_000),
              body: JSON.stringify({
                from: "Snapcase Team <hello@snapcase.ai>",
                reply_to: "hello@snapcase.ai",
                to: [prepared.email],
                subject: COPY[flow].subject,
                text,
                headers: {
                  "List-Unsubscribe": `<${oneClick}>`,
                  "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                },
                tags: [
                  {
                    name: "template_id",
                    value: flow === "welcome"
                      ? "email_20260627_welcome"
                      : `email_20260827_${flow}_recovery`,
                  },
                  { name: "campaign_id", value: campaign },
                  { name: "event_id", value: prepared.eventId },
                  { name: "recipient_ref", value: prepared.recipientRef },
                ],
              }),
            },
          );
          if (!response.ok) {
            throw new Error("provider_result_requires_reconciliation");
          }
          const accepted = await response.json();
          if (
            typeof accepted.id !== "string" ||
            !/^[a-zA-Z0-9_-]{1,128}$/.test(accepted.id)
          ) {
            throw new Error("provider_acceptance_unconfirmed");
          }
          return accepted.id;
        },
        finish: async (claim, status, messageId) => {
          const finished = await rpc("lifecycle_worker_finish", {
            p_id: claim.id,
            p_claim: claim.claim_token,
            p_status: status,
            p_message: messageId ?? null,
          });
          if (!finished) throw new Error("worker_completion_not_recorded");
        },
      });
      return json(result, result.result === "blocked" ? 503 : 200);
    } catch {
      return json({ error: "worker_failed_reconcile_expired_claims" }, 503);
    }
  };
