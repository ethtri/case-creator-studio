# Lifecycle Email QA Evidence

Date: 2026-07-22

Branch: `agent/agency-lifecycle-consent-206`

Website issue: `case-creator-studio#206`

Marketing source: `Snapcase_Autonomous_MarketingAgency#159`

## Safety boundary

All rendered tests used `qa@example.invalid`, mocked provider responses, or an
unconfigured local endpoint. No real subscriber was created, no provider was
activated, no message was sent, and no spend or production mutation occurred.
The test browser retained no session after QA.

## Automated verification

- `npm ci`: passed; 395 packages audited, zero vulnerabilities.
- Lifecycle contract tests: 8 passed.
- Full repository tests: 259 passed.
- ESLint: passed.
- TypeScript: passed.
- Production build: passed.
- Merchant catalog: 18 product routes passed.
- SEO: 26 canonical routes passed.
- Homepage transfer, responsive-media, route-splitting, and chunk budgets:
  passed.

## Rendered browser matrix

| Scenario | Evidence | Result |
|---|---|---|
| Desktop homepage | Chromium, 1440 x 1000 | Consent card fits the existing design system; label and explanatory copy are readable. |
| Mobile homepage | Chromium, 390 x 844 | Single-column form, 48px controls, readable copy, no horizontal overflow. |
| Default consent | Accessibility snapshot and rendered form | Checkbox is unchecked and submit is disabled. |
| Keyboard | Email field -> `Tab` -> checkbox -> `Space`; `Shift+Tab` -> submit -> `Enter` | Focus order and activation passed. |
| Accessibility tree | Chromium accessibility snapshot | Region heading, named email field, named checkbox, status, and alert roles are present; honeypot is absent. |
| Successful signup | Mocked canonical `subscribed` response | Polite success status appears; form resets; event path is eligible only for this state. |
| Duplicate or suppressed signup | Mocked public `preference_preserved` response | One neutral public status appears; internal subscriber state is not disclosed. |
| Endpoint failure | Unconfigured local provider endpoint | Assertive retry-later alert appears; form remains usable; no success event fires. |
| Missing preference token | `/email-preferences` at 390 x 844 | Password-free page shows bounded guidance without exposing identity. |
| Preference lookup failure | Synthetic token with unconfigured endpoint | Existing suppression is explicitly left unchanged. |
| Subscribed preference | Mocked canonical `subscribed` response | Unsubscribe control appears without login. |
| Unsubscribe | Mocked canonical `unsubscribed` response | Page immediately changes to authoritative-suppression confirmation. |
| Analytics privacy | Unit contract plus runtime inspection | Preference token is absent from analytics page path/location; data layer contained no token. |
| Preference-token referrer safety | Runtime address-bar inspection plus unit contract | The page retains the token only in memory and removes it from the URL before a same-site link can send a referrer. |

## Server contract cases

Automated tests cover consent-version mismatch, unchecked consent, normalized
identity, duplicate request constraints, same-address concurrency locking,
blocked resubscribe after suppression, deterministic flow classification,
provider-disabled and dry-run behavior, definite bounded retry, permanent
failure, ambiguous terminal state, signed webhook freshness, webhook replay
identity, out-of-order provider events, and suppression precedence.

The RFC 8058 endpoint accepts an idempotent form-encoded POST directly; it does
not require account login or page navigation. Provider-specific header and live
send evidence remain blocked by `LIFECYCLE_EMAIL_PROVIDER=disabled` and
`LIFECYCLE_EMAIL_ENABLED=false` until the separate provider decision gate is
completed.

## Deployment evidence still required

After merge, apply the database migration before deploying the three Edge
functions. Keep provider mode disabled, verify the public route and one-click
endpoint in production with non-recipient probes, then link the deployment and
immutable marketing audit. Do not mark a live-send gate complete from this
local browser evidence alone.
