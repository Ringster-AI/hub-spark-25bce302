## Problem

Vapi logs show the LLM calling `book_appointment` with params `{ start_iso, title, attendee_name, attendee_email, duration_minutes, timezone }` — note `start_iso`/`title` and **no `attendee_phone`**. Our current source builds the tool with `datetime` and conditionally requires `attendee_phone` when the agent settings list "phone" as required. The schema the LLM sees is from an **older tool still attached to the assistant** that our reconciler never deletes (it has no `metadata.agent_id` tag, so it's invisible to the orphan sweep). Saving the agent registers the new tool but the old one stays attached and the model keeps calling it.

## Fix (`netlify/functions/manage-vapi-assistant.ts`)

1. **Bump `CALENDAR_TOOL_VERSION` from `'2.0'` → `'2.1'`**
   This triggers the existing version-mismatch branch and force-deletes/recreates `check_availability`, `book_appointment`, `get_current_datetime` for every agent on next save — guarantees the new schema (`datetime`, conditionally-required `attendee_phone`/`attendee_address`) replaces any stale tool we own.

2. **Add `pruneAssistantStaleTools(assistantId, expectedIds)`**
   After the PATCH that sets `model.toolIds`, GET the assistant from Vapi, diff `assistant.model.toolIds` against our `expectedIds`, and DELETE every tool id that is attached but not expected (regardless of whether it has `metadata.agent_id`). This removes the orphan `start_iso`/`title` tool that's currently hijacking the booking flow. Best-effort, errors logged.

3. **Strengthen the `book_appointment` tool description**
   Append: "When the configured required fields include phone or address, you MUST collect them from the caller before calling this tool and pass them as `attendee_phone` / `attendee_address`. Never call book_appointment without these when they are required."
   Backstop in case the schema enforcement is bypassed.

4. **Surface a clear server error to the UI**
   If after pruning + repatch the assistant still lacks our `book_appointment_id`, return a `bookingToolError` string in the response (parallel to the existing `transferToolError`) so the AgentForm save toast shows the actual cause.

No frontend or other backend files change. Calendar booking handler (`vapi-calendar-api`) already returns the "phone required" error correctly — the bug is purely that the agent never had a chance to provide it because the wrong tool was being invoked.

## Action after deploy

Re-save the "flow test" agent once. The version bump deletes the stale tools we track, and the new prune step removes any leftover untracked tool still attached. Verify in Vapi dashboard that the assistant's tools list contains only the three IDs we just created.
