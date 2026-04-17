# Snapcase Outreach Engine

This workflow is for low-volume, personalized outreach around Snapcase gift-buyer acquisition. It keeps marketing outreach separate from customer/order tables and prevents sending to suppressed contacts.

## Launch Gate

Do not send public launch outreach until:

- The remaining P0 in `Docs/BACKLOG.md` is complete.
- `Docs/QA_SMOKE_TEST_CHECKLIST.md` passes.
- Sender identity, postal address, opt-out language, and suppression handling are configured.

## Files

- `templates.md`: reusable email copy for gift guides, micro-influencers, phone accessory blogs, local gift shops, and custom gift newsletters.
- `examples/prospects.example.csv`: suggested prospect list format.
- `examples/campaign-ledger.example.csv`: suggested send ledger format.
- `examples/suppression-list.example.csv`: suggested opt-out/suppression format.
- `local/`: untracked working CSVs for real prospects, suppression entries, and campaign status.

## Local Workflow

1. Create local working files from the examples:
   - `marketing/outreach/local/prospects.csv`
   - `marketing/outreach/local/campaign-ledger.csv`
   - `marketing/outreach/local/suppression-list.csv`
2. Add only public business contacts or opted-in contacts. Do not use customer order emails for marketing outreach.
3. Run `npm run outreach:check`.
4. Draft in Gmail only when the row is not suppressed and the template includes a clear opt-out line.
5. Update the ledger after every draft, send, reply, bounce, follow-up, or opt-out.

## Compliance Defaults

- Use accurate sender and reply-to details.
- Use honest subject lines.
- Include an opt-out line in every commercial outreach email.
- Include a valid physical postal address before sending launch or newsletter campaigns.
- Honor opt-outs immediately by adding the address to `local/suppression-list.csv`.
- Bulk/newsletter sending must wait for a marketing sender that supports authentication and one-click unsubscribe.

