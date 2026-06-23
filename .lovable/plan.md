I found the likely root cause in the live logs and database:

- The failing `book_appointment` calls are reaching `vapi-calendar-api` without `attendee_phone` at all.
- The agent is still attached to an older calendar tool config (`calendar_tool_ids.version: 2.0`), so the newer schema/version changes are not actually active for that agent.
- The current approach makes `attendee_phone` required in Vapi's tool schema when phone is selected. In practice, Vapi/LLM is still invoking the tool without that field, so schema-level required fields are making the flow brittle instead of reliable.

Plan to repair this robustly:

1. Change `book_appointment` to use a permissive Vapi schema
   - Keep `datetime`, `attendee_name`, and `attendee_email` required.
   - Make phone, address, and custom fields optional at the Vapi schema layer, even when the agent requires them.
   - Keep strong descriptions telling the assistant to collect/pass the fields, but do not depend on Vapi schema enforcement.

2. Move required-field enforcement fully into our backend
   - `vapi-calendar-api` will be the single source of truth for required fields from the agent/calendar config.
   - It will normalize phone/address/custom fields before validation.
   - If a required field is missing, it returns a short, tool-friendly instruction telling the assistant exactly which field to ask for and which argument name to use.

3. Fix config drift between `agent_configs` and `calendar_tools`
   - In `resolveTenant`, merge calendar settings from both places so required fields are honored no matter which UI saved them.
   - Prefer the newest non-empty required/custom field config instead of assuming `agent_configs.config.calendar_booking` is always current.

4. Add backend compatibility for missed argument names
   - Accept `attendee_phone`, `phone`, `phone_number`, `caller_phone`, `customer_phone`, and simple custom-field maps.
   - Accept phone numbers as spoken digits, spaced digits, punctuation, or North American 10-digit numbers.
   - Preserve normalized values in the booking metadata.

5. Force a clean tool refresh
   - Bump the calendar tool version again.
   - Update the signature logic so existing agents with stale `2.0` tools are recreated on the next sync.
   - Add better logging of required fields and whether phone/address were present after normalization, without logging sensitive raw values.

6. Make sync failure visible
   - If the Vapi assistant sync fails after saving calendar config, show a destructive toast instead of silently continuing.
   - This prevents a false “saved” state when the database changed but Vapi is still using stale tools.

After implementation, the flow test agent should only need one save/sync to refresh the Vapi tools. Bookings should no longer fail just because required fields are enabled; missing required info will be handled by backend validation and clear assistant retry instructions instead of brittle Vapi schema requirements.