
## Problem

1. **Transfer tool created but not attached** — `createTransferTool` is succeeding (we get an ID back), but Vapi is silently dropping it from `model.toolIds` on PATCH. The reattach guard runs but uses the same payload, so it fails the same way.
2. **Orphan tools** — every save deletes the old transfer tool then creates a new one. If any step in between fails (PATCH error, network blip, function timeout), the new tool is created but never recorded in `agent_configs.config.transfer_tool_id`, so the next save can't find it to delete. Calendar tools have the same hole when `versionMismatch` triggers a recreate. Deleting an agent never cleans up any of its Vapi tools.

## Root cause of the silent drop

`VapiToolsService.createTransferTool` builds a `transferCall` tool but wraps it in a custom `function: { name, description, parameters: { destination: enum, reason } }` block. Vapi's `transferCall` tool type does not accept an arbitrary `function.parameters` schema — when you then attach the tool ID to an assistant, Vapi validates the tool against the assistant and silently strips it from `model.toolIds` (200 OK, but the ID is gone from the returned `toolIds`). That matches the symptom: tool exists in Vapi dashboard, but not on the assistant, and a reattach with the same payload fails the same way.

## Fix

### 1. Correct the transfer tool schema (`netlify/functions/services/vapi/tools-service.ts`)

Replace the hand-rolled `function` block with Vapi's documented `transferCall` shape:

```ts
{
  type: "transferCall",
  destinations: [
    { type: "number", number: "+1...", message: "Transferring you to ...", description: "Sales team" },
    ...
  ],
  // no custom `function` block, no `messages` array
}
```

The `description` on each destination is what the LLM uses to pick the right one (keywords from `transferDirectory[name].keywords` get joined into the description). Keep E.164 normalization via `normalizeE164`.

### 2. Verify attach succeeded, not just that PATCH returned 200

In `manage-vapi-assistant.ts` after the PATCH:
- Already reads `updatedAssistant.model.toolIds`. Keep that.
- If `transferToolId` is missing from the returned list, do a GET `https://api.vapi.ai/tool/{transferToolId}` and log the tool's stored shape so we can see exactly what Vapi has — this gives us a real diagnostic instead of a silent drop next time.
- Surface `transferToolError: "Vapi accepted the assistant update but dropped the transfer tool — check tool schema"` in the response so the UI toast tells the user something actionable.

### 3. Orphan cleanup

Add a small reconciler that runs at the top of every `action: 'update'` (before creating any new tools):

1. List all Vapi tools: `GET https://api.vapi.ai/tool?metadata[agent_id]={agentId}` — we already set `metadata.agent_id` on the assistant; we'll also start setting it on every tool we create (transfer + calendar) so we can find them.
2. Build the "expected" set from `agent_configs.config` (`transfer_tool_id`, `calendar_tool_ids.{check_availability_id, book_appointment_id, get_current_datetime_id}`).
3. DELETE any Vapi tool whose `metadata.agent_id` matches this agent but whose ID is not in the expected set.

For tools created before this change (no metadata), add a one-time admin-only button on `/admin/tools` ("Sweep orphan Vapi tools") that lists every Vapi tool, cross-references against every row in `agent_configs.config`, and deletes anything unreferenced. The existing `AdminTools` page is the right home for it.

### 4. Clean up on agent delete

In the `delete` branch of `manage-vapi-assistant.ts` (or wherever agent deletion happens), before deleting the assistant, read `config.transfer_tool_id` and `config.calendar_tool_ids` and DELETE each from Vapi. This stops new orphans from being created going forward.

## Files changed

- `netlify/functions/services/vapi/tools-service.ts` — transfer tool schema fix
- `netlify/functions/manage-vapi-assistant.ts` — verification + reconciler + delete cleanup; stamp `metadata.agent_id` on every tool we create (including in `ensureAssistantCalendarTools` / `upsertVapiTool`)
- `src/pages/Admin/Tools/AdminTools.tsx` — "Sweep orphan Vapi tools" admin action
- new Netlify function `netlify/functions/sweep-vapi-orphans.ts` — admin-gated orphan sweep

## What you'll need to do after deploy

1. Re-save the "flow test" agent — the new transfer tool schema will be created and should land on `model.toolIds`.
2. From `/admin/tools`, run "Sweep orphan Vapi tools" once to clear the backlog of orphans already in Vapi.
