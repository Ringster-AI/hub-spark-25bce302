# Partner (Sales) Dashboard — v1

A simple CRM and referral tracker for invited sales partners. It covers attribution, prospect registration, demo booking, lead status, commissions and sales materials. It is not a full partner portal.

## Decisions (from your answers)
- **Access:** you invite partners from the Admin area. They sign in with a normal Ringster account and get a "Partner" section.
- **Commission:** a recurring percentage of each customer payment for a set number of months. You set the rate and duration per partner (default 20% for 12 months; you can change this).
- **Demos:** a built-in scheduler that shows open times from your connected Google Calendar and books straight into it.
- **Conflicts:** the first partner to register a prospect owns them for 90 days.

## What partners get (at /partner)
1. **Referral link and code**: a personal link (getringster.com/?ref=CODE) and a code they can copy. Visitors who come through the link are tagged to that partner when they sign up, using a 90-day browser cookie plus a code field on signup.
2. **Register a prospect**: name, business, email, phone, industry and notes. If another partner already owns that prospect (matched by email, phone or business name), the form says so and blocks it.
3. **Book a demo**: pick a prospect, see your free time slots for the next 14 days, and book. This creates a Google Calendar event that invites the prospect and the partner, and moves the lead to "Demo booked".
4. **Pipeline**: a table and board of prospects with these statuses: Registered → Contacted → Interested → Demo booked → Subscribed (or Lost). Partners update the early stages themselves. "Subscribed" is set automatically when the prospect signs up and pays.
5. **Commissions**: Pending, Earned and Paid totals plus a line-by-line list. A payment from a referred customer creates a Pending line, which becomes Earned once the refund window passes (30 days). You mark lines Paid.
6. **Sales materials**: approved pricing (read live from current plans), plus decks, one-pagers and demo videos that you upload.

## What you get (Admin → Partners)
- Invite or deactivate partners and set each partner's commission rate and duration.
- See every prospect across partners and reassign one when needed.
- Commission ledger: mark lines paid (one at a time or in bulk) and export to CSV.
- Upload and manage sales materials.
- Pick which calendar the demo scheduler uses and set demo length and hours.

## Technical details
- **New tables** (with RLS and grants; partners see only their own rows, admins see everything, using `has_role`/`is_super_admin`):
  - `partners`: user_id, referral_code (unique), commission_rate, commission_months, status.
  - `partner_prospects`: partner_id, business_name, contact_name, email, phone, normalized_email/phone, status, notes, lock_expires_at, converted_user_id.
  - `partner_referrals`: partner_id, referred_user_id, source (link/code/prospect match), attributed_at, commission_ends_at.
  - `partner_commissions`: partner_id, referral_id, stripe_invoice_id (unique), amount_cents, status pending/earned/paid/void, earned_at, paid_at.
  - `partner_materials`: title, type, file_url/link, sort.
  - `partner_demo_settings`: a single row of calendar settings.
- A storage bucket for materials, readable only by partners and admins.
- **Duplicate lock:** a database function checks for active prospects with the same normalized email, phone or business name and refuses the insert if one exists. A unique partial index enforces this.
- **Attribution:** capture `?ref=` into a cookie or localStorage, send it with signup, and a `claim-referral` edge function writes `partner_referrals`, also matching on registered prospect email/phone.
- **Commissions:** add a step to the existing Stripe webhook. On `invoice.paid` for a referred user within the commission window, insert a pending line. On refund, mark it void. A daily cron moves pending lines to earned after 30 days.
- **Demo scheduler:** `partner-demo-slots` and `partner-book-demo` edge functions use the admin's existing Google integration (free/busy, then insert an event). The partner's JWT is verified, and they must own the prospect.
- **Admin invites:** an `invite-partner` edge function (admin-only) creates or links an account and sends an invite email.
- **Routes:** `/partner` (partner-only guard) and `/admin/partners`, plus a nav item that appears only for partners.

## Out of scope for v1
Automatic payouts (Stripe Connect), tiered commissions, partner self-signup, and an email nurturing sequence.
