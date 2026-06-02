
# Email communications + secure email change

## Goal
Standardize every email Ringster sends from one branded sender (`notify.ringster.ai`), through Lovable's queued email infrastructure, and add a secure double-confirm email-change flow.

## Phase 1 — Sender domain + infrastructure (one-time)
1. Set up Lovable Emails on `ringster.ai` (subdomain `notify.ringster.ai`).
2. Provision the shared email queue (pgmq queues, `enqueue_email` RPC, `process-email-queue` cron, `email_send_log`, `suppressed_emails`, `email_unsubscribe_tokens`).
3. Scaffold branded auth-email-hook + the 6 auth templates (signup, magic link, recovery, invite, email-change, reauthentication). Apply Ringster brand (indigo gradient, white body, Ringster wordmark/logo).

Outcome: every auth email — including the new email-change confirmations on both old and new address — is branded and queued.

## Phase 2 — Secure email-change flow
**Supabase config**
- Enable "Secure email change" (double confirm on old + new address) in Auth settings.
- Confirm `email-change.tsx` template renders the action link clearly and warns "If you didn't request this, ignore — your email won't change."

**Frontend changes**
- `ProfileForm.tsx`: remove the editable email input. Replace with a read-only display + "Change email" button.
- New `ChangeEmailDialog` component:
  1. Show current email (read-only).
  2. Re-auth gate: require current password OR a fresh OTP (`signInWithOtp` to current email) before showing the new-email field. This blocks session-hijack abuse.
  3. New email input (zod-validated, lowercase, max 255).
  4. Call `supabase.auth.updateUser({ email })` → triggers confirmation links to BOTH addresses.
  5. Show a "Check both inboxes" confirmation screen with resend button (60s cooldown).
- New public route `/auth/email-change/callback` to handle the verification redirect (parses `type=email_change` from URL hash, calls `setSession`, shows success).

**Database sync**
- Trigger on `auth.users` (AFTER UPDATE OF email) → updates `public.profiles.email`. Single source of truth = `auth.users.email`; the profile column becomes a denormalized mirror.
- Remove `email` from the profile UPDATE statement in `Profile.tsx`.

## Phase 3 — Email catalog & implementation
Three send paths, all going through the Lovable queue.

### A. Auth emails (auth-email-hook, automatic)
Signup confirmation, magic link, OTP, password reset, **email-change (×2)**, invite (team), reauthentication.

### B. Lifecycle emails (`send-transactional-email` + triggers)
| Template | Trigger | Where |
|---|---|---|
| `welcome` | `handle_new_user` trigger fires → edge function invoke | post-signup |
| `onboarding-nudge-day-2` | pg_cron daily scan of `onboarding_progress` where steps incomplete | server-side |
| `first-call-celebration` | existing `useFirstCallCelebration` hook → invoke on first completed call | client |
| `trial-ending-3-days` | pg_cron daily scan of `user_subscriptions` where `trial_ends_at` between now+2d and now+3d | server-side |

### C. Transactional emails (`send-transactional-email`, event-driven)
| Template | Trigger |
|---|---|
| `booking-confirmation` | After insert on `calendar_bookings` (existing Vapi/calendar flow) |
| `missed-call-summary` | `vapi-webhook` end-of-call when status=no-answer/voicemail |
| `call-recording-ready` | `vapi-webhook` when `recording_url` is finalized |
| `low-credit-warning` | `deduct_credits` post-deduction check: remaining < 20% of plan |
| `plan-changed` | Stripe webhook `customer.subscription.updated` |
| `payment-failed` | Stripe webhook `invoice.payment_failed` |

Stripe receipts are left to Stripe's own emails (no duplication).

All sends use `idempotencyKey` derived from event id + template name; all check `suppressed_emails` automatically; system appends unsubscribe footer to non-auth emails.

### D. Decommission
- Remove ad-hoc `Resend`/SendGrid usage from existing functions (booking, Vapi calendar) and route through `send-transactional-email`.
- Audit `MailerLite` and `SENDGRID_LIST_ID` flows — keep only if used for marketing/lead capture (out of scope for this transactional system).

## Phase 4 — Templates & QA
- Build 11 React Email templates in `_shared/transactional-email-templates/` with shared header (Ringster logo, indigo accent), white body, footer with company info.
- Register each in `registry.ts` with `previewData`.
- Build `/unsubscribe` page matching dashboard theme.
- Deploy and preview each template via Cloud → Emails.

## Phase 5 — Mobile-app touchpoints (configuration only on this end)
- Add `ringster://auth-callback` and `ringster://email-change-callback` to Supabase Redirect URLs.
- In auth + email-change templates, switch the action link to use the project's configured site URL (Supabase auto-substitutes per-request `RedirectTo`, so the same template works for web and mobile when the mobile client passes `emailRedirectTo: 'ringster://...'`).

## Technical notes
- Re-auth before email change: `supabase.auth.reauthenticate()` is the cleanest path; falls back to password prompt if no recent session.
- The `auth.users` → `profiles` sync trigger needs `SECURITY DEFINER` + explicit `search_path = public` (per project memory rule).
- All edge functions use JWT-derived `userId` (no trusting body params), per existing security hardening memory.
- Idempotency keys ensure Stripe webhook retries and Vapi webhook redeliveries never produce duplicate emails.

## Out of scope (flag for later)
- Marketing/newsletter sends (use MailerLite, already configured).
- Per-user email preferences UI (granular opt-out per category) — Phase 2 candidate.
- SMS notification parity.
