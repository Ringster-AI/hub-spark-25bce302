
# Premium Onboarding for Ringster

Goal: every new user reaches one outcome — **a live AI agent answering their phone** — through a calm, confident, Midnight Indigo experience that feels like a high-end product, not a form.

The journey has 4 acts. Each builds on the previous and shares a single visual language.

---

## Act 1 — Signup (pre-account)

Replace the current 2-step form with a refined, conversational flow.

- Split-screen layout: left = form, right = live "preview panel" showing what they're building (agent avatar, sample greeting, ringing phone illustration). Updates as they type.
- Step 1: email + password — with inline strength meter and passwordless option ("email me a magic link").
- Step 2: company name, industry (dropdown with icons: plumbing, HVAC, electrician, clinic, agency, other), team size, primary use case (inbound / outbound / both).
- Subtle Midnight Indigo gradient background, glassmorphism card, soft motion on step transitions.
- Trust strip: "SOC2-ready · GDPR · 60 free credits · No credit card".

Industry + use case answers feed personalization downstream.

---

## Act 2 — Post-signup Launch Wizard

Full-screen 5-step wizard at `/onboarding` (gated until complete, dismissable to dashboard with progress saved).

```text
[1] Meet your agent  → [2] Voice & tone  → [3] Phone number  → [4] Calendar  → [5] First test call
```

1. **Meet your agent** — Pre-named agent based on industry ("Sarah for HVAC"), editable. Shows generated greeting script. One-click "Looks good".
2. **Voice & tone** — 3 curated voice cards (Warm / Professional / Friendly) with play buttons. Tone slider (Formal ↔ Casual).
3. **Phone number** — One-click provision via existing `manage-twilio-number`. Shows the number animating in. Option to forward an existing line later.
4. **Calendar** — Google / Microsoft / Cal.com / Skip. Uses existing connectors. Skipping is fine — surfaced again later.
5. **First test call** — "Call your agent now" with their new number displayed large + "Call me instead" button (uses existing demo-call webhook to ring the user's phone immediately).

Design: left rail with vertical stepper, large breathing room, micro-animations between steps, gold-tinted "Step complete" checks against Midnight Indigo.

Persisted in a new `onboarding_progress` table (user_id, step, completed_at, choices jsonb) so users can resume across devices.

---

## Act 3 — First-time Dashboard Experience

The Overview page detects `!hasCompletedOnboarding` and switches to "first-run mode":

- **Hero checklist card** at top: 5 items with progress ring (e.g. "3 of 5 — keep going"). Each item links back into the wizard step.
- **Empty-state KPI cards** show illustrated placeholders ("Your first call will appear here") instead of zeros.
- **Activity timeline** shows a friendly "Waiting for your first call…" pulse, with a "Make a test call" CTA.
- **Spotlight tour** (one-time, dismissable) using a lightweight custom tooltip system — 4 stops max: Agents, Recordings, Calendar, Subscription. No third-party tour lib.

Once all checklist items are done, the card collapses into a small "Setup complete ✓" banner that fades away after 24h.

---

## Act 4 — First Call Activation Moment

When the very first inbound or test call lands:

- Real-time toast + full-screen celebration modal: "Your agent just took its first call." Confetti is subtle (Midnight Indigo + a single gold burst).
- Shows the recording, transcript snippet, and a "Share this moment" button (copies a sharable summary).
- Prompts the next best action based on missing pieces: connect calendar, invite a teammate, or upgrade for more minutes.

Tracked via a new `first_call_acknowledged_at` on profiles to fire only once.

---

## Personalization (level 4)

Industry + use case captured at signup drive:
- Agent name + greeting template
- Suggested voice
- Tone defaults
- Sample script and FAQ pre-fills
- Industry-specific tips card on dashboard during onboarding
- Email follow-ups (via existing MailerLite integration) segmented by industry

No fully bespoke per-user copywriting — curated templates per industry vertical.

---

## Visual System (Midnight Indigo)

- Background `#0a0a1a` → `#141432` gradients
- Surface `#1e1e5a` glass cards with 1px `#4f46e5/20` border
- Accent `#4f46e5`, success in soft mint, single gold highlight reserved for "step complete" and celebration moment
- Typography: keep current stack, increase tracking on H1s for editorial feel
- Motion: 250ms ease-out transitions, no bounce; respect `prefers-reduced-motion`

---

## Technical Section

### New routes / files
- `src/pages/Onboarding/index.tsx` — wizard shell
- `src/pages/Onboarding/steps/{MeetAgent,Voice,Phone,Calendar,FirstCall}.tsx`
- `src/components/onboarding/{StepRail,StepCard,OnboardingChecklist,FirstCallCelebration}.tsx`
- `src/hooks/useOnboardingProgress.ts`
- Update `App.tsx` to add `/onboarding` route inside `PrivateRoute` and redirect new users there after signup
- Update `Signup.tsx` to a 2-column layout and add industry/use-case fields
- Update `Overview.tsx` to render `OnboardingChecklist` when incomplete

### Data model (Supabase migration)
```sql
create table public.onboarding_progress (
  user_id uuid primary key references auth.users on delete cascade,
  current_step int not null default 1,
  completed_at timestamptz,
  choices jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
-- RLS: users select/update own row; insert via SECURITY DEFINER trigger on auth.users
```
Add `industry text`, `use_case text`, `first_call_acknowledged_at timestamptz` to `profiles`.

### Reused services
- `manage-twilio-number` (Netlify) for phone provisioning
- `manage-vapi-assistant` for agent creation with pre-filled greeting
- `connect-google` / `connect-microsoft` / Cal.com flows
- `forward-demo-request` for "Call me instead"
- Existing `useCookieConsent` and analytics events for funnel tracking

### Analytics
Fire Meta Pixel + GTM events (consent-gated): `Onboarding_Started`, `Onboarding_Step_N_Completed`, `Onboarding_Completed`, `First_Call_Received`.

### Out of scope for v1
- A/B testing framework
- Live chat / Intercom handoff
- Video walkthroughs

---

## Build order

1. Migration + `useOnboardingProgress` hook
2. Wizard shell + 5 steps wired to existing services
3. Signup refresh (split-screen + industry/use-case)
4. Dashboard first-run checklist + empty states
5. First-call celebration moment
6. Personalization templates per industry
7. Analytics events + polish pass
