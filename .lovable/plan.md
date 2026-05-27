## Goal
Build a dedicated admin area where users with a new `super_admin` role can view, edit, toggle, delete, and re-sync any agent across all users (including its Vapi/Twilio resources).

## 1. Database

Add a new role and supporting access function (the existing `app_role` is a `text` column on `user_roles`, and `has_role(uuid, text)` already exists, so this is additive).

- Migration: insert `super_admin` as a valid role value and add a convenience function `is_super_admin(uuid)` (SECURITY DEFINER, `search_path = public`) that wraps `has_role(uid, 'super_admin')`.
- Add RLS policies on `agent_configs` granting `super_admin` full SELECT / UPDATE / DELETE across all rows (in addition to existing owner policies).
- Add matching admin-override RLS policies on related tables the admin tool reads/edits: `call_logs` (SELECT), `call_recordings` (SELECT), `calendar_tools` (ALL), `profiles` (SELECT, to show owner name/email).
- Manual role grants happen via SQL — no self-promotion UI.

## 2. Routing & access control

- New route tree under `/admin` with its own layout (`src/pages/Admin/AdminLayout.tsx`) — separate from `/dashboard`. Minimal sidebar with one entry today ("Agents") so we can grow the section later.
- New `useSuperAdmin()` hook calling `is_super_admin(auth.uid())`; redirect non-admins to `/dashboard`.
- Top-right link to `/admin` appears in the existing dashboard `UserProfile` menu only when `useSuperAdmin()` returns true.

## 3. Admin Agents list — `/admin/agents`

- Server-side query: all `agent_configs` joined with `profiles` (owner email/full_name) and aggregated usage from `call_logs` (count + total minutes last 30d).
- Table columns: Name, Owner (email), Type (inbound/outbound), Status, Phone, Vapi assistant ID, Twilio SID, Minutes used, Last call, Actions.
- Filters: search (name/owner/phone), status, agent_type, "has Vapi", "has Twilio".
- Row actions: View, Edit, Toggle status, Delete, Re-sync Vapi.
- Bulk actions: toggle status, delete.

## 4. Admin Agent detail — `/admin/agents/:id`

Reuses the existing `AgentForm` (`src/components/agents/AgentForm.tsx`) so admins edit the same fields owners do — name, greeting/goodbye, voice, transfer directory, advanced config, calendar booking. Saves go through the standard supabase update (allowed by the new admin RLS policy).

Side panel: Vapi/Twilio resource management

- **Vapi assistant**: show `vapi_assistant_id`, last sync time. Buttons: "Re-sync with Vapi" (calls existing `VapiAssistantUpdateService.syncAgentWithVapi`), "View on Vapi" (deep link).
- **Twilio number**: show `phone_number`, `twilio_sid`. Buttons: "Re-provision number" (calls existing `manage-twilio-number` Netlify function), "Release number".
- **Transfer tool**: show current `transfer_directory` JSON and the resulting Vapi tool destinations (read-only preview rendered via the existing transfer-tool builder logic).
- **Calendar tool**: show linked `calendar_tools` row, allow enable/disable.
- **Recent calls**: last 20 `call_logs` for this agent with status, duration, timestamps.
- **Audit footer**: created_at, updated_at, owner profile link.

## 5. Netlify function hardening

For any Netlify function reachable from the admin tool (`manage-twilio-number`, `manage-vapi-assistant`), add a check: if the caller's JWT user is `super_admin`, allow operating on agents owned by a different user; otherwise keep current owner-only check. No new function is required — they already exist.

## 6. UX details

- Reuse shadcn `Table`, `DropdownMenu`, `Dialog`, `Tabs`. Match the calm premium dashboard look — no new design tokens.
- Confirm dialogs for destructive actions (delete agent, release number).
- Toasts via existing `useToast`.
- Empty state, loading skeletons, error states consistent with the rest of the app.

## Technical notes (developer reference)

```text
src/
  pages/Admin/
    AdminLayout.tsx
    Agents/
      index.tsx              # list
      [id].tsx               # detail
  hooks/useSuperAdmin.ts
  components/admin/
    AdminSidebar.tsx
    AgentsTable.tsx
    AgentResourcesPanel.tsx
    AgentRecentCalls.tsx
```

- Add `/admin/*` routes in `src/App.tsx` behind `useSuperAdmin` guard.
- All admin queries pass through Supabase client (RLS enforces access). No service-role usage in the browser.
- Re-sync / re-provision actions call existing Netlify functions via `getNetlifyFunctionsUrl` (per the cross-environment routing rule).

## Out of scope (for this iteration)

- Promoting/demoting roles from the UI (done manually in SQL).
- Editing owner of an agent.
- Cross-user usage analytics dashboards (just per-agent recent calls).
- A general "all users" admin view (only agents this round).
