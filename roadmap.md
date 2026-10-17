# Roadmap: Partner Dashboard v1 (approved design rev 3)

- [x] Stage 1 Foundation: schema, RLS, audit, agreement, invites, rate versions (full schema for all stages created)
- [x] Stage 2 Prospects & pipeline: register-prospect, matching, activities, flags
- [x] Stage 3 Attribution: resolver, precedence, first-paid claim, relationship checks
- [x] Stage 4 Commissions: webhook dedupe, ledger, refunds/disputes, payouts
- [x] Stage 5 Demo scheduler: holds, overlap constraint, Google events
- [x] Stage 6 Dashboards & reporting (partner_report + partner_report_monthly, admin Reporting panel, partner performance card) — pilot with one real partner still open

## Pull-request checks
- [ ] Add full app typechecking and lint, edge-function tests, production dependency auditing, and secret-leak scanning without deployment secrets.
- [ ] Verify the workflow and available tests; report any existing failures without unrelated fixes.
