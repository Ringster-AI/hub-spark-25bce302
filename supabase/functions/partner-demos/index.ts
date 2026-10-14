// Partner demo scheduler: list open slots, book (held row -> Google event -> booked), cancel.
// Concurrency: the partner_demos EXCLUDE constraint rejects overlapping held/booked rows,
// so two partners can never take the same slot even if Google free/busy looks open to both.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { decryptToken, isEncrypted } from "../_shared/crypto.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY");
const G = "https://www.googleapis.com/calendar/v3";

async function token(db: any, integ: any): Promise<string> {
  if (new Date(integ.expires_at) > new Date(Date.now() + 60_000)) {
    return KEY && isEncrypted(integ.access_token) ? await decryptToken(integ.access_token, KEY) : integ.access_token;
  }
  let rt = integ.refresh_token;
  if (KEY && isEncrypted(rt)) rt = await decryptToken(rt, KEY);
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
      refresh_token: rt, grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error("calendar_auth_failed");
  const d = await r.json();
  await db.from("google_integrations").update({
    access_token: d.access_token, expires_at: new Date(Date.now() + d.expires_in * 1000).toISOString(),
  }).eq("id", integ.id);
  return d.access_token;
}

// UTC instant for a wall-clock time in a timezone.
function zoned(date: string, hm: string, tz: string): Date {
  const guess = new Date(`${date}T${hm}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(guess).map((p) => [p.type, p.value]));
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return new Date(guess.getTime() - (asLocal - guess.getTime()));
}
function localDate(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(d);
}
function isoDow(dateStr: string) { const d = new Date(`${dateStr}T12:00:00Z`).getUTCDay(); return d === 0 ? 7 : d; }

async function context(db: any) {
  const { data: s } = await db.from("partner_demo_settings").select("*").eq("id", true).single();
  if (!s?.google_integration_id) throw new Error("calendar_not_configured");
  const { data: integ } = await db.from("google_integrations").select("*").eq("id", s.google_integration_id).single();
  if (!integ) throw new Error("calendar_not_configured");
  return { s, integ, calendarId: s.calendar_id || "primary" };
}

async function openSlots(db: any) {
  const { s, integ, calendarId } = await context(db);
  const tz = s.timezone;
  const earliest = new Date(Date.now() + s.min_notice_hours * 3600_000);
  const end = new Date(Date.now() + s.window_days * 86400_000);
  const access = await token(db, integ);
  const fb = await fetch(`${G}/freeBusy`, {
    method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    body: JSON.stringify({ timeMin: earliest.toISOString(), timeMax: end.toISOString(), items: [{ id: calendarId }] }),
  });
  if (!fb.ok) throw new Error("calendar_unavailable");
  const busy: { start: number; end: number }[] = ((await fb.json()).calendars?.[calendarId]?.busy ?? [])
    .map((b: any) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const { data: taken } = await db.from("partner_demos").select("slot_start,slot_end")
    .eq("calendar_id", calendarId).in("status", ["held", "booked"]).gte("slot_end", earliest.toISOString());
  for (const t of taken ?? []) busy.push({ start: Date.parse(t.slot_start), end: Date.parse(t.slot_end) });
  const buf = s.buffer_min * 60_000, dur = s.duration_min * 60_000;
  const slots: string[] = [];
  for (let d = new Date(earliest); d <= end; d = new Date(d.getTime() + 86400_000)) {
    const day = localDate(d, tz);
    if (!s.working_days.includes(isoDow(day))) continue;
    const dayEnd = zoned(day, s.working_end, tz).getTime();
    for (let t = zoned(day, s.working_start, tz).getTime(); t + dur <= dayEnd; t += 30 * 60_000) {
      if (t < earliest.getTime()) continue;
      if (busy.some((b) => t < b.end + buf && t + dur > b.start - buf)) continue;
      slots.push(new Date(t).toISOString());
    }
  }
  return { slots: [...new Set(slots)].slice(0, 200), timezone: tz, duration_min: s.duration_min };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
  const { data: { user } } = await db.auth.getUser(jwt ?? "");
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const { data: partner } = await db.from("partners").select("id,status,display_name,invite_email")
    .eq("user_id", user.id).maybeSingle();
  const { data: isAdmin } = await db.rpc("is_partner_admin", { _user_id: user.id }).then(
    (r: any) => r, () => ({ data: false }));

  try {
    // Admin: point the scheduler at the admin's own connected Google Calendar.
    if (body.action === "use_my_calendar") {
      if (!isAdmin) return json({ error: "forbidden" }, 403);
      const { data: integ } = await db.from("google_integrations").select("id,calendar_id,email")
        .eq("user_id", user.id).maybeSingle();
      if (!integ) return json({ error: "Connect Google Calendar in Settings → Integrations first." }, 400);
      await db.from("partner_demo_settings").update({
        google_integration_id: integ.id, calendar_id: integ.calendar_id || "primary", updated_at: new Date().toISOString(),
      }).eq("id", true);
      return json({ ok: true, email: integ.email });
    }

    if (!partner || partner.status !== "active") return json({ error: "forbidden" }, 403);

    if (body.action === "slots") return json(await openSlots(db));

    if (body.action === "book") {
      const { data: p } = await db.from("partner_prospects").select("*").eq("id", body.prospect_id).maybeSingle();
      if (!p || p.partner_id !== partner.id || p.protection_status !== "protected") return json({ error: "This prospect can't be booked." }, 400);
      if (["signed_up", "paying", "lost"].includes(p.status)) return json({ error: "This prospect can't be booked." }, 400);
      const { s, integ, calendarId } = await context(db);
      const start = new Date(body.slot_start);
      const { slots } = await openSlots(db);
      if (!slots.includes(start.toISOString())) return json({ error: "That time is no longer available." }, 409);
      const end = new Date(start.getTime() + s.duration_min * 60_000);
      await db.from("partner_demos").update({ status: "cancelled" }).eq("status", "held").lt("hold_expires_at", new Date().toISOString());
      const { data: hold, error: holdErr } = await db.from("partner_demos").insert({
        prospect_id: p.id, partner_id: partner.id, calendar_id: calendarId,
        slot_start: start.toISOString(), slot_end: end.toISOString(), timezone: s.timezone,
        status: "held", hold_expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
      }).select().single();
      if (holdErr) return json({ error: "That time was just taken. Please pick another." }, 409);
      try {
        const access = await token(db, integ);
        const attendees = [p.email, partner.invite_email].filter(Boolean).map((email: string) => ({ email }));
        const ev = await fetch(`${G}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all&conferenceDataVersion=1`, {
          method: "POST", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            summary: `Ringster demo: ${p.business_name}`,
            description: [`Booked by partner ${partner.display_name}`, p.contact_name && `Contact: ${p.contact_name}`,
              p.phone && `Phone: ${p.phone}`, p.email && `Email: ${p.email}`, body.notes && `Notes: ${String(body.notes).slice(0, 1000)}`]
              .filter(Boolean).join("\n"),
            start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, attendees,
            conferenceData: { createRequest: { requestId: hold.id } },
          }),
        });
        if (!ev.ok) throw new Error(await ev.text());
        const event = await ev.json();
        await db.from("partner_demos").update({ status: "booked", google_event_id: event.id, hold_expires_at: null }).eq("id", hold.id);
        await db.from("partner_prospects").update({ status: "demo_booked" }).eq("id", p.id);
        await db.from("partner_activities").insert({
          prospect_id: p.id, partner_id: partner.id, type: "demo", created_by: user.id,
          summary: `Demo booked for ${start.toISOString()}`,
        });
        return json({ ok: true, demo_id: hold.id });
      } catch (e) {
        console.error("demo event failed", e);
        await db.from("partner_demos").update({ status: "cancelled" }).eq("id", hold.id);
        return json({ error: "Couldn't add the demo to the calendar. Please try again." }, 502);
      }
    }

    if (body.action === "cancel") {
      const { data: d } = await db.from("partner_demos").select("*").eq("id", body.demo_id).maybeSingle();
      if (!d || d.partner_id !== partner.id || d.status !== "booked") return json({ error: "Not found" }, 404);
      const { integ } = await context(db);
      if (d.google_event_id) {
        const access = await token(db, integ);
        await fetch(`${G}/calendars/${encodeURIComponent(d.calendar_id)}/events/${d.google_event_id}?sendUpdates=all`,
          { method: "DELETE", headers: { Authorization: `Bearer ${access}` } });
      }
      await db.from("partner_demos").update({ status: "cancelled" }).eq("id", d.id);
      const { data: p } = await db.from("partner_prospects").select("status").eq("id", d.prospect_id).single();
      if (p?.status === "demo_booked") await db.from("partner_prospects").update({ status: "qualified" }).eq("id", d.prospect_id);
      return json({ ok: true });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    const m = (e as Error).message;
    if (m === "calendar_not_configured") return json({ error: "Demo booking isn't set up yet. Ask Ringster to connect the calendar." }, 503);
    console.error(e);
    return json({ error: "Something went wrong. Please try again." }, 500);
  }
});
