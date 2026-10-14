# Partner commission policy: confirm and fill gaps

Most of your policy is already in the approved design and the stage 1 settings. This plan adds only what's missing and leaves the rest as it is.

## Already in place (no change)
- **What earns commission:** recurring subscription fees only. Taxes, number rental, usage overages and credit top-ups are excluded.
- **Upgrades** earn commission on the upgrade charge. A downgrade credit counts as a negative commission entry.
- **Holding period:** 30 days for monthly plans and 45 days for annual plans. Each partner's terms are saved with their record.
- **Payout day:** the 15th of each month.
- **Minimum payout:** $50; smaller balances roll forward to the next month.

## Changes
1. **Payout details for each partner**
   - New fields: country, payout method, and payout contact (the e-transfer email, or a reference to the international account).
   - Canadian partners default to Interac e-transfer.
   - Partners outside Canada must use a method an admin has approved, chosen from a configurable list (for example Wise, PayPal, wire).
   - Admins can set these fields on the Admin → Partners page.
   - Partners see their method on their dashboard but can't change it.
   - Every change goes into the audit log.
2. **Payout recording**
   - An admin can only mark a payout as paid using that partner's approved method, plus a reference number.
   - A payout can't be approved for a partner who has no approved method.
3. **What a monthly payout includes:** all commission that is approved and past its holding period as of the 15th, net of reversals. If the total is under the $50 minimum, it rolls into next month.
4. **Currency:** amounts stay in the currency Stripe charged. The $50 minimum is checked in that currency. Each payout records the currency it was paid in.
5. **The agreement text** gets updated to match: upgrades are commissionable, holding periods are 30/45 days, and payout methods are listed. This is published as version 1.1, so current partners will be asked to accept it again.

## Technical details
- Migration:
  - add `country`, `payout_method`, `payout_contact`, `payout_method_approved_at` and `payout_method_approved_by` to `partners`;
  - add `approved_payout_methods text[]` (default `{interac_etransfer,wise,paypal,wire}`) to `partner_program_config`;
  - add a check that blocks approving or paying a payout unless `partners.payout_method` is approved and matches the method on the payout;
  - insert agreement version 1.1.
- Partners can't change payout fields: the database blocks partner edits to `partners` (admin-only update policy), and admins save changes through an `admin_set_partner_payout` function, which writes the audit entry.
- UI: a payout editor in the Admin → Partners table, and a read-only "Payout method" line on `/partner`.
- Save the confirmed commission policy to project memory.
