# Partner (Sales) Dashboard v1, revised architecture for review

This is an invited freelance sales partner area inside Ringster, not a separate portal. The screens stay simple, and the money and attribution rules are strict and enforced on the server. Per your review, nothing is built until you approve this design.

## 1. Access and roles
- Add `partner` to the existing role list. A user can hold several roles. The partner role gives no customer-admin or Ringster-admin access.
- An admin invites a partner by email. This creates a `partners` row with status `invited`. The partner signs in with a normal Ringster account, accepts the current partner agreement (we store the version, time, IP and browser), and then the account becomes `active`.
- Access to `/partner` needs an active partner and an accepted current agreement. When a new agreement version is published, the partner must accept it again.
- The agreement includes outreach standards (CASL and TCPA compliant outreach, no misrepresenting pricing).

## 2. Data model (new tables, all with RLS, grants and an `updated_at` trigger)

```text
partners                  user_id, referral_code (unique), status invited|active|suspended,
                          default_assisted_rate (10), default_closed_rate (20),
                          commission_months (12), holding_days (30)
partner_agreements        version, body_url, published_at
partner_agreement_accept  partner_id, version, accepted_at, ip, user_agent
partner_prospects         partner_id, business_name, contact_name, email, phone, website,
                          industry (+ industry_other), lead_source, status,
                          norm_email, norm_phone, norm_business,
                          protected_until (90d), activity_deadline (14d),
                          last_contact_at, next_follow_up_at, converted_user_id
partner_activities        prospect_id, partner_id, type call|email|sms|meeting|note|demo,
                          summary, occurred_at, next_action          (append-only)
partner_demos             prospect_id, partner_id, google_event_id, starts_at, ends_at,
                          timezone, status booked|completed|no_show|cancelled|rescheduled
partner_attributions      customer_user_id (unique while active), partner_id, prospect_id,
                          method prospect_match|code|link|manual, commission_type
                          assisted|closed|custom, rate_snapshot, months_snapshot,
                          holding_days_snapshot, agreement_version, starts_at, ends_at,
                          status active|ended|revoked, approved_by
referral_touches          visitor/user id, partner_id, code, landing_url, created_at  (evidence only)
partner_commissions       partner_id, attribution_id, entry_type earning|reversal|adjustment,
                          stripe_event_id (unique), stripe_invoice_id, stripe_charge_id,
                          eligible_revenue_cents, rate, amount_cents (signed), currency,
                          status pending|earned|approved|paid|reversed,
                          earn_after, approved_by, payout_id          (immutable financial fields)
partner_payouts           partner_id, total_cents, method, reference, paid_at, recorded_by
partner_materials         title, kind deck|one_pager|video|pricing, file_path|url, sort
partner_demo_settings     calendar_id, duration_min, buffer_min, min_notice_hours,
                          window_days, working_hours, timezone
partner_audit_log         actor_id, entity, entity_id, action, before, after, reason, at
```

- **Isolation:** partners can read and write only their own prospects, activities and demos. They can read only their own attributions, commissions and payouts. The customer status they see is limited to these values: signed up, paying, churned. They never see billing details, recordings or agent data.
- **Financial tables** (`partner_attributions`, `partner_commissions`, `partner_payouts`): partners can only read them, and only the service role writes them. Rows are never deleted. Corrections are added as new reversal or adjustment rows.
- **Audit:** triggers write to `partner_audit_log` whenever attribution, rates, a prospect's owner or a payout status changes.

## 3. Prospect ownership and duplicate rules
- **Normalization:** emails are lowercased. Phones are converted to E.164 format. Business names are lowercased with punctuation and endings like inc/ltd/llc removed. Matching uses any of email, phone, or (business name plus city or website domain).
- **Registering** goes through a secure server function, `register_prospect`. It blocks the prospect if any of these is true:
  - another partner holds active protection on a match;
  - the match is an existing Ringster customer (matched in profiles by email or phone);
  - the match is on a Ringster house list.
- The partner only sees "This prospect is unavailable." No other partner's details are shown.
- **Protection** lasts 90 days. The 14-day activity deadline resets whenever a partner logs a call, email, SMS or meeting activity. Notes don't count.
- A daily job marks prospects with no outreach by the deadline as `review_needed`. Protection is only released after an admin reviews it, never automatically.
- Admins can reassign a prospect, extend protection or resolve a dispute. Each action needs a reason, and every action is recorded in the audit log.

## 4. Pipeline
Registered → Contacted → Qualified/Interested → Demo booked → Demo completed (or no-show) → Signed up → Paying customer. You can mark Lost/Disqualified from any stage. If someone signs up directly, the stages jump straight to Signed up.

- Partners set: Contacted, Qualified, and Lost.
- The scheduler sets Demo booked. The partner or admin records the meeting outcome, which sets Demo completed.
- Signed up and Paying customer are set only by the system, from account creation and a verified Stripe payment. A server check rejects these statuses if they come from the browser.

## 5. Attribution flow

```text
Signup ──> claim-attribution (server, runs once per new user)
  1. Admin manual association (pre-approved)        highest
  2. Registered prospect match (email / phone)
  3. Referral code entered at signup
  4. Referral link touch (cookie/localStorage, 90d)   lowest
```

- The first method that matches creates the single active attribution. Later link clicks or codes are logged in `referral_touches` as evidence, but they never override an existing owner.
- **Self-referral is blocked:** a partner can't be credited for their own account, or for one that shares their email domain, phone or Stripe customer ID. Admins can override this with a reason.
- **Commission type** is set by Ringster, not chosen by the partner. The default is `assisted` (10%). An admin promotes it to `closed` (20%) or a custom rate after reviewing the partner's documented activities and demos.
- The rate, duration, holding period and agreement version are snapshotted on the attribution, so later changes to a partner's rates don't change existing deals.
- Admins can create a manual association for a customer who came from an in-person or phone sale with no link. It is audited.

## 6. Commission calculation (in the existing `stripe-webhook`, which already verifies Stripe signatures)
- **`invoice.payment_succeeded`:** if the customer has an active attribution and the invoice date is inside the commission window:
  - Eligible revenue is the amount paid, minus tax, minus pass-through items such as number rental, credit add-ons if you exclude them, and usage passthrough. Discounts are already reflected in the amount paid.
  - Commission = eligible revenue × the snapshot rate.
  - A row is inserted with `earn_after = paid_at + holding_days`.
  - Each Stripe event ID is processed only once.
- **Annual plans:** commission is calculated on the portion of the payment that falls inside the commission window. For example, a 12-month window covers a full annual payment.
- **Upgrades, downgrades and proration** need no special handling, because commission follows each actual paid invoice.
- **Failed payments** create no commission.
- **New Stripe events handled:**
  - `charge.refunded` (full or partial) adds a proportional negative reversal row.
  - `charge.dispute.created` adds a reversal row.
  - `charge.dispute.closed` with a win adds a re-earning adjustment row.
- **Daily job:** moves pending rows to earned once `earn_after` has passed and no reversal cancels them out.
- **Admin:** approves earned rows for payout, with exceptions flagged. Then the admin records a payout (method and reference), and the included rows become `paid`.
- **Clawback:** a refund after payout creates a negative row. It is netted against the next payout and never deletes history.

## 7. Demo scheduler
- Runs only through Ringster's own Google Calendar connection (the admin's existing Google integration). Partners never connect their own calendars.
- **`partner-demo-slots`:** reads busy times and returns open slots. Slots follow the configured meeting length, buffer, minimum notice, working hours and booking window. Times are shown in the prospect's time zone and the partner's time zone.
- **`partner-book-demo`:**
  - checks the partner's sign-in and that they own the prospect;
  - rechecks the calendar is free just before booking;
  - creates the event with Google invites to the prospect, the partner and Ringster;
  - saves the demo, logs it in the prospect's activity history and moves the prospect to Demo booked.
- **`partner-update-demo`:** handles cancel and reschedule (updates the Google event and sends updates to everyone invited), and records the outcome: completed or no-show.

## 8. Screens
- **Partner area** (`/partner`):
  - Overview: referral link and code, follow-ups due, a funnel with counts at each stage, and commission totals (pending, earned, paid).
  - Prospects: a list with filters, a detail page with activity history, a log-activity button, next follow-up date, and a book-demo button.
  - Demos.
  - Commissions: the full ledger and payouts.
  - Materials and approved pricing (read live from current plans).
  - Agreement.
- **Admin area** (`/admin/partners`):
  - Partners: invite, set rates, suspend.
  - All prospects: disputes, review-needed list, reassign.
  - Attributions: manual associations and commission-type changes.
  - Commission approvals and payouts, with CSV export.
  - Reports: demo show rate, conversions by partner and by industry, outstanding commissions.
  - Materials, demo settings, agreement versions.

## 9. Staged delivery (each stage reviewable and tested)
1. **Foundation:** role, tables, RLS, audit triggers, agreement flow, admin invite. *Tests:* a partner can't read another partner's rows; a partner can't write the financial tables; an unaccepted agreement blocks access.
2. **Prospects and pipeline:** registration, duplicate check, activities, follow-ups, daily protection job. *Tests:* duplicate blocked by email, phone or business name; no information leaks in the error; existing customer blocked; the 14-day deadline sets review_needed; a partner can't set Paying.
3. **Attribution:** referral capture, the claim function, precedence rules, self-referral block, manual association. *Tests:* each method, in precedence order; a later click doesn't override; self-referral rejected; snapshot fixed after a rate change.
4. **Commissions:** Stripe webhook additions, the daily earn job, approvals and payouts. *Tests:* a repeated webhook creates only one row; tax and pass-through excluded; partial refund gives a proportional reversal; dispute lost then won; payment outside the window gives no commission; clawback after payout.
5. **Demo scheduler:** slots, booking, cancel and reschedule, outcomes. *Tests:* buffer and notice respected; a double-booking race is caught by the recheck; time zone conversion correct.
6. **Dashboards and reports,** then a pilot with one partner onboarded manually.

## Decisions to confirm before stage 1
- Which charges are pass-through and excluded from commission: number rental, credit add-ons, usage overage?
- Should the default holding period stay at 30 days for every plan, or be longer for annual plans?
- How should partners be paid at first (e-transfer, PayPal, wire) and on what schedule (for example, monthly on the 15th for the previous month's approved rows)?

## Out of scope for v1
Automated payouts (Stripe Connect), CSV prospect import, partner self-signup, multi-tier or team overrides.
