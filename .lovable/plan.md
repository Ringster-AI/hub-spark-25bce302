# Ringster Mobile — MVP Plan & Backend Prep

Mobile client itself ships outside Lovable (Expo / React Native). Inside this project we prepare the backend the app will consume **and** expand the existing dashboard Team section so owners can manage members, devices, and permissions — all gated by their subscription plan.

---

## A. Mobile App (build outside Lovable)

### Stack
- **Expo (React Native)** — single codebase, OTA updates, Expo Push
- **Supabase JS** — reuse project `owzerqaududhfwngyqbp`, same Auth + RLS
- **Supabase Realtime** — subscribe to `active_calls` + `call_events`
- **Vapi listen-live** — relayed through a backend function, API key never on device
- **Push** — Expo tokens stored in `push_devices`, fan-out from `vapi-webhook`

### Build order
1. Auth + device registration (`push_devices`)
2. Push on call start
3. Active call screen (Realtime on `active_calls`)
4. Live transcript (Realtime on `call_events`)
5. Transfer from directory (new edge function reusing `transfer_directory`)
6. Listen live (audio relay — last)
7. Call history (existing `call_logs` + `call_recordings`)
8. Team roles enforced via RLS + edge-function checks

---

## B. Backend prep (this Lovable project)

### B1. New tables (one migration)
- **`active_calls`** — live, in-progress calls. Created on Vapi `call-start`, marked ended on `end-of-call-report`.
  Cols: `id`, `user_id` (owner), `agent_id`, `vapi_call_id`, `caller_number`, `caller_name`, `status`, `stream_url`, `started_at`, `updated_at`.
- **`call_events`** — append-only event stream (transcript chunks, status, transfer requests). Powers live transcript via Realtime.
  Cols: `id`, `active_call_id`, `call_log_id` nullable, `event_type`, `payload jsonb`, `created_at`.
- **`push_devices`** — Expo/APNs/FCM tokens per user.
  Cols: `id`, `user_id`, `device_token`, `platform`, `app_version`, `last_seen_at`.
- **`team_members`** — actual table (today only a TS type exists).
  Cols: `id`, `owner_user_id`, `member_user_id`, `email` (for pending invites), `role` (`admin|listener|transfer_only|viewer`), `can_listen`, `can_transfer`, `receives_notifications`, `status` (`pending|active|revoked`), `invited_at`, `accepted_at`.
- **`team_invites`** — single-use invite tokens for email-based onboarding.
  Cols: `id`, `owner_user_id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at`.

All five get the standard GRANT block + RLS:
- Owner sees/edits their own members & devices.
- Members see active calls / events for the owner that invited them, scoped through `team_members`.
- A `SECURITY DEFINER` helper `team_member_has_access(_owner uuid, _member uuid, _cap text)` keeps policies non-recursive.

### B2. Extend `vapi-webhook`
Today handles only `end-of-call-report`. Add:
- `call-start` / `status-update` → upsert `active_calls`, insert `call_events`, call `send-push-notification`
- `transcript` → insert `call_events` row (Realtime pushes to app)
- `end-of-call-report` → unchanged finalize + flip `active_calls.status='ended'`

### B3. New edge functions
- `send-push-notification` — internal, fans out to owner + every `team_members` row with `receives_notifications=true`. Needs `EXPO_ACCESS_TOKEN` secret.
- `register-push-device` — auth-required upsert into `push_devices`.
- `mobile-transfer-call` — auth-required; verifies caller is owner OR active team member with `can_transfer`; then calls existing Vapi transfer logic. Reuses `agent_configs.transfer_directory`.
- `get-live-stream-url` — auth-required; verifies `can_listen`; returns short-lived signed URL for the Vapi listen-live websocket.
- `invite-team-member` — auth-required; creates `team_invites` row, emails invite via existing Resend setup.
- `accept-team-invite` — public-with-token; validates `token_hash`, links `member_user_id` to the row, flips status to `active`.

### B4. Realtime
Enable Supabase Realtime publication on `active_calls` and `call_events`.

---

## C. Dashboard Team section — full build-out with plan gating

Today `src/pages/Dashboard/Team.tsx` is a stub ("coming soon"). Replace it with a real management UI, and gate everything by subscription plan.

### C1. Plan gating rules (read from existing `useSubscriptionFeatures` / `plan_features`)
| Plan | Team seats | Mobile devices per user | Notes |
|---|---|---|---|
| Free | 0 (owner only) | 1 | Team tab visible but locked with upgrade CTA |
| Receptionist | 1 extra seat | 2 | Matches the "1 team member US/Canada" spec for the new plan |
| Starter | 3 | 3 | |
| Growth / Pro | 10 | unlimited | |
| Enterprise | unlimited | unlimited | |

Add a `team_seats_limit` + `mobile_devices_limit` column to `plan_features` in the same migration as B1, defaulted per plan above. Enforce limits in `invite-team-member` and `register-push-device`.

### C2. New `/dashboard/team` page
- **Members table** — name/email, role, capabilities (listen/transfer/notify toggles), status (pending/active), last seen, actions (resend invite, edit, revoke).
- **Invite drawer** — email + role + per-capability switches; shows seat usage `2 / 3 used`; disabled with upgrade CTA at limit.
- **Pending invites** — list with resend / revoke.
- **Mobile devices panel** — per member: registered Expo devices, platform, last seen, "Sign out device" action.
- **Empty state** for Free plan: explainer + "Upgrade to invite teammates" CTA → `/dashboard/subscription`.

### C3. Sidebar gating
- Keep "Team" in `ManagementMenu.tsx` for everyone (discoverability) but add a `Lock` icon (same pattern already used for Live Call Assist) when `team_seats_limit === 0`.
- When locked, clicking still routes to `/dashboard/team` which renders the upgrade empty state — no silent redirect.

### C4. Reusable hook
`useTeamAccess()` returns `{ seatsLimit, seatsUsed, devicesLimit, canInvite, isLocked }`. Used by both the sidebar lock icon and the Team page UI states.

---

## D. Secrets to add later
- `EXPO_ACCESS_TOKEN` — Expo push
- (optional) `VAPI_STREAM_RELAY_SECRET` — when wiring listen-live

---

## Out of scope
- Mobile code in this repo (lives in a separate Expo project)
- "Join call / barge in" softphone
- Internal app-to-app calling
- Promoting users to `super_admin` from UI (manual SQL stays)

---

## Suggested next step
Approve and I'll start with **one migration covering B1 + the two `plan_features` columns**, then the **Team page rebuild + sidebar gating** (pure UI, immediately visible), then extend `vapi-webhook` and add the four new edge functions. Listen-live audio relay lands last so the data + UX layers are solid first.
