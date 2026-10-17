
- Partner program: billable account = owner user id; partner money tables (attributions, commissions, payouts) are written only by server code, are append-only, and corrections go in as new adjustment entries. Why: financial history must stay auditable.
- PR checks run independent build/tests, full static analysis, permission-free Deno unit tests, production dependency audits for both package lockfiles, and redacted commit-range secret scans without deployment secrets. Why: failures must be visible before merging without exposing live credentials.
