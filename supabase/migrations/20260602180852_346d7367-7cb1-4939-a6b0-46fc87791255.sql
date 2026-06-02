-- Lock down realtime.messages so authenticated users can only subscribe to
-- broadcast/presence channels scoped to their own user id.
-- postgres_changes subscriptions remain protected by RLS on the underlying tables.

ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior versions of our policies (idempotent re-run)
DROP POLICY IF EXISTS "Authenticated can read own-topic messages" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can write own-topic messages" ON realtime.messages;
DROP POLICY IF EXISTS "Service role full access to realtime messages" ON realtime.messages;

-- Allow authenticated users to subscribe/read only messages on topics
-- that are explicitly scoped to their auth.uid(), e.g. "user:<uid>" or "user:<uid>:..."
CREATE POLICY "Authenticated can read own-topic messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
);

-- Allow authenticated users to broadcast only on their own-scoped topics
CREATE POLICY "Authenticated can write own-topic messages"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() = ('user:' || auth.uid()::text)
  OR realtime.topic() LIKE ('user:' || auth.uid()::text || ':%')
);

-- Service role retains full access for server-side broadcasting
CREATE POLICY "Service role full access to realtime messages"
ON realtime.messages
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);