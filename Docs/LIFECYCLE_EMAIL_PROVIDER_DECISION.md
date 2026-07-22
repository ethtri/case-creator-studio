# Lifecycle Email Provider Decision Gate

Status: **open, non-blocking for infrastructure; blocking for live lifecycle
send**

No marketing ESP is selected or activated by `case-creator-studio#206`. The
existing Resend workspace is verified for transactional messages only and must
not be treated as automatic approval for promotional lifecycle traffic.

## Exact decision required before activation

Choose one of these outcomes in a separate issue:

1. Approve a zero-cost provider/configuration that meets every gate below, with
   no financial commitment.
2. Approve an exact paid plan and maximum commitment through the CEO approval
   process before accepting terms or enabling billing.
3. Keep provider mode disabled and continue collecting no new subscribers until
   a compliant provider is available.

The decision record must name provider, account/workspace, sending domain,
monthly and per-message cost, maximum spend, data region if relevant, retention,
subprocessor/privacy review owner, API and webhook capabilities, suppression
precedence, export/deletion path, and rollback owner.

## Activation evidence required

- Verified sender identity and destination workspace.
- Provider credentials stored only in deployment secrets.
- Authenticated replay-safe unsubscribe, complaint, bounce, and suppression
  webhook evidence.
- RFC 8058 one-click headers on applicable promotional messages.
- Canonical suppression reconciliation test, including provider-side
  suppression followed by a website signup attempt.
- Definite failure retry and ambiguous mutation reconciliation evidence.
- Redacted welcome-flow dry-run with approved claims, consent provenance,
  unsubscribe URL, commercial address, privacy, and audit checks.
- A separate, provenance-backed zero-recipient or controlled-recipient send run;
  no fabricated recipient and no live audience import.

Until that evidence is linked, keep:

```text
LIFECYCLE_EMAIL_PROVIDER=disabled
LIFECYCLE_EMAIL_ENABLED=false
```
