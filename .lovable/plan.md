# Partner Dashboard v1, technical design (revision 3, for review)

This revision applies the 10 adjustments. Nothing gets built until this schema and these integration points are approved. The six-stage plan and the UI scope stay the same as in revision 2.

## 0. What already exists (inspected) and how we reuse it

| Area | Current Ringster structure | Partner design reuse |
|---|---|---|
| Billable account | `user_subscriptions.user_id` points to `profiles.id`. One subscription per account owner. Team members link to the owner through `team_members.owner_user_id`. `organizations` is optional, with one per user (only 1 row today). | **Billable account = the owner's user id** (`account_id`). Team members always resolve to their owner and never count as separate customers. No new customer table. |
| Stripe customer | `create-checkout` finds or creates the Stripe customer by email and sets `metadata.supabaseUid`. The subscription metadata also carries `supabaseUid`. `user_subscriptions.stripe_customer_id` is filled in for 1 of 7 rows. | A shared resolver, `resolveAccount(stripeCustomer)`, tries in order: `metadata.supabaseUid` → `user_subscriptions.stripe_customer_id` → email lookup in profiles. It also backfills `stripe_customer_id`. The existing webhook branches switch to the same resolver. |
| Plans | `subscription_plans` with `billing_interval` month/year/one_time, `stripe_price_id`, `number_rental_fee`, `is_pay_as_you_go`. | We classify each Stripe price as commissionable or not using this table plus a small exclusions list (see section 5). |
| Webhook | `stripe-webhook` checks the signature. It handles subscription created/updated/deleted, `invoice.payment_succeeded` (credit reset), `invoice.payment_failed` and `checkout.session.completed` (credit add-on). | We add one call, `processPartnerCommission(event)`, after the existing switch, plus new event types. Existing behaviour stays unchanged. |
| Auth and roles | Supabase Auth, the `user_roles` table with the `app_role` enum, `has_role()` and `is_super_admin()`. | Add `partner` to the `app_role` enum. Partner pages use `has_role(uid,'partner')` and an active `partners` row. |
| Calendar | The admin's `google_integrations` row (encrypted tokens, availability settings). | The scheduler reads the admin's integration selected in `partner_demo_settings`. |

## 1. Schema changes since revision 2 (new or changed only)

```text
partner_attributions      account_id (owner user id)           -- was customer_user_id
                          UNIQUE (account_id) WHERE status IN ('pending_approval','active')
                          status pending_approval|active|ended|revoked|rejected
                          conversion_kind new_signup|existing_free_account
                          eligibility_starts_at  NULL until first eligible payment
                          eligibility_ends_at    = starts + months_snapshot
                          match_evidence jsonb, approved_by, approved_at

partner_rate_versions     partner_id, commission_type, rate, months, holding_monthly_days,
                          holding_annual_days, effective_from, created_by, reason
                          -- append-only; replaces the rate columns on partners

stripe_webhook_events     stripe_event_id PK, type, received_at, processed_at, status,
                          error            -- event dedupe, kept separate from the ledger

partner_commissions       ledger_key UNIQUE   -- deterministic, see section 4
                          source_type invoice_line|credit_note_line|refund|dispute|
                                      rate_adjustment|manual
                          stripe_object_id, invoice_id, invoice_line_id, account_id,
                          gross_line_cents, excluded_cents, eligible_cents,
                          rate_version_id, rate, amount_cents (signed),
                          billing_interval, earn_after, status, payout_id

partner_payouts           period (YYYY-MM), scheduled_for (15th), total_cents,
                          carried_forward_cents, status draft|approved|paid

partner_prospects         + location_label, street, city, postal_code,
                            purchasing_entity independent|parent_controlled|unknown
                          match_key_business = norm_business + norm_city + norm_street

partner_review_flags      partner_id, kind high_volume_low_progress|stale_claims|
                          self_referral_suspect|dispute, details, status, resolved_by

partner_demos             + slot_start, slot_end, tstzrange column with an
                            EXCLUDE USING gist (calendar_id WITH =, slot WITH &&)
                            WHERE status IN ('held','booked')
                          status held|booked|completed|no_show|cancelled|rescheduled,
                          hold_expires_at
```

Everything else from revision 2 stays the same: partners, agreements and acceptances, prospects, activities, referral touches, materials, demo settings, the audit log, the RLS model, and the rule that financial tables are read-only for partners.

## 2. Attribution at the billable-account level

1. **Claim time:** a claim is checked when an account first produces an eligible paid invoice. Signup alone only records `referral_touches` and leaves the prospect link pending. When a team member signs up, the claim resolves to the owner's `account_id`.
2. **Who gets credit** is decided in this order, and the first match wins:
   - an admin's manual association;
   - a registered prospect match on the owner's email or phone, or the business plus its location key;
   - a referral code entered at signup or checkout;
   - a referral link touch within 90 days.
   - An active attribution is never replaced by a later click or code.
3. **Free accounts that were already on Ringster:** if an account existed before the partner registered it and was on a free plan with no payments, and the partner's activity shows they drove the first paid conversion, an attribution is created with status `pending_approval` and `conversion_kind = existing_free_account`. Its commission lines are kept but held back until an admin approves the attribution. If the admin rejects it, those lines are reversed. Accounts that have ever paid can't be claimed.
4. **Conflicts:** if two partners have evidence for the same account, both rows go to `pending_approval` with a `dispute` review flag. No commission is released until an admin resolves the dispute.
5. **The 12-month eligibility window** starts at the first successful eligible subscription payment (`eligibility_starts_at` = the invoice's paid_at). It does not start at signup or lead registration.

## 3. Self-referral and relationship checks (domain matching removed)

An attribution is blocked, or flagged for an admin, when the partner's own `user_id`, Stripe customer, payment card fingerprint, phone number, or team membership (owner or member of the account) matches the customer's.

- An exact match on any of these blocks the attribution.
- A match on the same signup IP and browser fingerprint within 30 days, or on the same billing address, only raises a `self_referral_suspect` flag for an admin to review.
- A shared email domain is no longer used as a check.

## 4. Webhook processing, deduplication and the ledger

```text
stripe-webhook (signature verified)
  1. INSERT stripe_webhook_events(stripe_event_id) ON CONFLICT DO NOTHING
     -> already processed? return 200 immediately
  2. existing switch (unchanged behaviour)
  3. processPartnerCommission(event)   -- failures are logged on the event row and
                                         retried by Stripe; ledger writes are idempotent
  4. mark the event processed
```

The ledger key is unique per financial fact, not per event, so one fact can't be recorded twice even if Stripe sends it again under a different event:
- invoice line: `inv:{invoice_id}:{line_id}`
- credit note line: `cn:{credit_note_id}:{line_id}`
- refund: `rf:{refund_id}`
- dispute: `dp:{dispute_id}:{phase}`
- rate adjustment: `adj:{rate_version_id}:{source_ledger_key}`

| Stripe source | Treatment |
|---|---|
| `invoice.paid` | For each line: skip excluded lines (section 5). Eligible amount = line amount minus its share of discounts, excluding tax. Proration lines count at their signed amount, so a downgrade credit line produces a negative entry. If the invoice was partly paid with customer balance, only the cash actually paid counts, split in proportion. |
| `credit_note.created` | A negative entry for each credit note line, with the amount split the same way. |
| `charge.refunded` | A negative entry for refund amounts not already covered by a credit note. The two are matched by refund id, so the same refund is never reversed twice. |
| `charge.dispute.created` / `closed` | Created: a negative entry for the disputed amount. Closed and won: a positive re-earning entry. |
| `invoice.payment_failed` / voided invoice | No commission entry. |
| Customer balance adjustments that aren't tied to an invoice | No commission entry. |

## 5. Initial commission policy (stored as configuration, not hard-coded)
- **Commissionable:** recurring subscription plan prices only. That means `subscription_plans` rows with `billing_interval` month or year that aren't pay-as-you-go.
- **Excluded:**
  - taxes;
  - number rental (the `number_rental_fee` price or its line);
  - usage overages (metered or usage lines);
  - credit top-ups (one-time and `credit_addon` checkouts).
- **Holding period:** 30 days for monthly plans and 45 days for annual plans, counted from the invoice paid date. This is snapshotted on each entry.
- **Annual plans:** the full annual payment counts if it's paid inside the eligibility window. A renewal after the window ends earns nothing.

## 6. Commission rate changes
- Rates live in the append-only `partner_rate_versions` table. Every new attribution snapshots the version that is currently in effect.
- **By default, a change applies only to future payments:** payments with a paid_at on or after `effective_from` use the new version. Earlier entries are never changed.
- **A retroactive change** needs an admin to choose a date range and give a reason. The system then adds `rate_adjustment` entries (the difference between new and old commission for each affected entry) and records them in the audit log. Original entries are never edited.

## 7. Payouts
- A monthly job creates a draft payout per partner on the 1st. It includes entries that are earned (past their holding period and not cancelled out by reversals) and approved.
- An admin approves the payout and marks it paid on the 15th, recording the payment method and reference.
- **Minimum payout is $50 equivalent:** a smaller net balance stays unpaid and is added to the next month (stored in `carried_forward_cents`). A negative net balance, from clawbacks, also rolls forward.

## 8. Prospect matching for multi-location businesses
- **Business identity** = normalized name + city + street, or the website domain plus a location label.
- A location that buys on its own (`purchasing_entity = independent`) is a separate prospect and can belong to a different partner.
- A location controlled by a parent company conflicts with any active claim on the same parent name or domain. That case goes to an admin as a dispute, not an automatic block.
- An exact email or phone match is always a conflict.
- The duplicate check still only says "unavailable" and never reveals the other partner's details.
- **Volume review flag:** a daily job flags a partner when either:
  - they registered more than 50 prospects in 14 days, or have more than 150 active claims, and fewer than 20% of them have reached Contacted; or
  - more than 40% of their claims hit the 14-day no-outreach deadline.
- These thresholds are configurable. A flag doesn't remove claims; it puts them on the admin's review list.

## 9. Demo booking concurrency
1. **Hold:** inside a database transaction, insert a `partner_demos` row with status `held` and `hold_expires_at = now() + 2 min`. The calendar overlap rule (the EXCLUDE constraint) rejects any overlapping hold or booking, so two partners can never book the same slot.
2. **Check:** recheck Google busy times. If the slot is now busy, release the hold and return "slot taken".
3. **Create:** create the Google event using a deterministic event id (derived from the demo id), so a retry can't create a second event.
4. **Confirm:** set the status to `booked`. A cleanup job releases expired holds and removes any Google event left behind by a failed confirm.
5. **Changes:** rescheduling takes a hold on the new slot first and only then releases the old slot.

## 10. Reporting (added to the existing overview pages, no new pages)
- **For each partner** (shown to the partner and to admins):
  - **Collected revenue:** cash actually received from attributed accounts, after excluded items and reversals.
  - **Retention:** for each month's group of new customers, the share still paying 3, 6 and 12 months later, based on `user_subscriptions.status` plus invoice history.
  - **Commission-to-revenue ratio:** net commission divided by collected revenue.
- Admin reports also show these by industry and for the whole program.

## 11. Staged delivery (same six stages, with new tests added)
1. **Foundation:** the partner role, tables, RLS, audit log, agreement acceptance, invites, rate versions. *Tests:* partner data isolation; partners can't write financial tables; rate versions can't be edited.
2. **Prospects and pipeline:** the multi-location matching key, the volume flags, the 14-day rule. *Tests:* an independently purchasing location with the same name is allowed; a parent-controlled location becomes a dispute; the volume flag triggers.
3. **Attribution:** the account resolver, the precedence order, the claim on first paid invoice, existing free accounts, relationship checks. *Tests:* a team member's signup resolves to the owner; a free account goes to pending_approval; a previously paid account is refused; the eligibility window starts at first payment; a shared email domain alone is not blocked; a matching card fingerprint is blocked.
4. **Commissions:** event dedupe, ledger keys, line-level exclusions, proration, credit notes, refunds, disputes, holding periods, payouts with carry-forward. *Tests:* a replayed event does nothing; the same refund sent through two events is recorded once; tax, number rental, overage and top-up lines are excluded; a downgrade proration gives a negative entry; 30-day vs 45-day holding; $50 carry-forward; a retroactive rate change creates adjustment entries.
5. **Demo scheduler:** the hold, overlap constraint and deterministic event id. *Tests:* two simultaneous bookings, one succeeds; an expired hold is cleaned up; a retry doesn't create a duplicate Google event.
6. **Dashboards and reporting,** then a pilot with one partner.

## Integration points to review
- `stripe-webhook`: adds the event dedupe table, the shared account resolver (also used by the existing branches) and the call to `processPartnerCommission`. New Stripe events to enable on the endpoint: `invoice.paid`, `credit_note.created`, `charge.refunded`, `charge.dispute.created`, `charge.dispute.closed`.
- `create-checkout`: passes any referral code into the Stripe checkout `metadata.ref_code`. No pricing changes.
- Signup flow: captures `?ref=` and the code field into `referral_touches`.
- New edge functions: `invite-partner`, `register-prospect`, `partner-demo-slots`, `partner-book-demo`, `partner-update-demo`, and `partner-daily` (earn, flags, holds, payouts).
- No changes to existing customer subscription, credit or agent behaviour.
