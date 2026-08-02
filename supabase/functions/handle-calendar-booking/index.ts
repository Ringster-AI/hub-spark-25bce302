import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { decryptToken, encryptToken, isEncrypted } from "../_shared/crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TOKEN_ENCRYPTION_KEY = Deno.env.get("TOKEN_ENCRYPTION_KEY") ?? "";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID") ?? "";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET") ?? "";
const MS_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID") ?? "";
const MS_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET") ?? "";

interface BookingRequest {
  campaign_id: string;
  contact_id: string;
  call_log_id?: string;
  attendee_name: string;
  attendee_email?: string;
  appointment_datetime: string;
  duration_minutes?: number;
  appointment_type?: string;
  notes?: string;
}

async function maybeDecrypt(token: string | null | undefined): Promise<string | null> {
  if (!token) return null;
  if (!TOKEN_ENCRYPTION_KEY || !isEncrypted(token)) return token;
  try {
    return await decryptToken(token, TOKEN_ENCRYPTION_KEY);
  } catch (e) {
    console.error("Token decrypt failed", e);
    return null;
  }
}

async function refreshGoogleToken(refreshToken: string) {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!resp.ok) throw new Error(`Google refresh failed: ${await resp.text()}`);
  return resp.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function refreshMicrosoftToken(refreshToken: string) {
  const resp = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: MS_CLIENT_ID,
      client_secret: MS_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: "openid profile email offline_access User.Read Calendars.ReadWrite",
    }),
  });
  if (!resp.ok) throw new Error(`MS refresh failed: ${await resp.text()}`);
  return resp.json() as Promise<{ access_token: string; refresh_token?: string; expires_in: number }>;
}

async function getValidGoogleToken(supabase: any, userId: string): Promise<{ accessToken: string; integrationId: string } | null> {
  const { data: integ } = await supabase
    .from("google_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!integ) return null;

  let access = await maybeDecrypt(integ.access_token);
  const refresh = await maybeDecrypt(integ.refresh_token);

  if (new Date() > new Date(integ.expires_at) && refresh) {
    const refreshed = await refreshGoogleToken(refresh);
    access = refreshed.access_token;
    const newExpiry = new Date(Date.now() + (refreshed.expires_in - 300) * 1000);
    const storeAccess = TOKEN_ENCRYPTION_KEY
      ? await encryptToken(refreshed.access_token, TOKEN_ENCRYPTION_KEY)
      : refreshed.access_token;
    await supabase
      .from("google_integrations")
      .update({ access_token: storeAccess, expires_at: newExpiry.toISOString(), updated_at: new Date().toISOString() })
      .eq("id", integ.id);
  }

  return access ? { accessToken: access, integrationId: integ.id } : null;
}

async function getValidMicrosoftToken(supabase: any, userId: string): Promise<{ accessToken: string; integrationId: string } | null> {
  const { data: integ } = await supabase
    .from("microsoft_integrations")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (!integ) return null;

  let access = await maybeDecrypt(integ.access_token);
  const refresh = await maybeDecrypt(integ.refresh_token);

  if (new Date() > new Date(integ.expires_at) && refresh) {
    const refreshed = await refreshMicrosoftToken(refresh);
    access = refreshed.access_token;
    const newExpiry = new Date(Date.now() + (refreshed.expires_in - 300) * 1000);
    const storeAccess = TOKEN_ENCRYPTION_KEY
      ? await encryptToken(refreshed.access_token, TOKEN_ENCRYPTION_KEY)
      : refreshed.access_token;
    const storeRefresh = refreshed.refresh_token && TOKEN_ENCRYPTION_KEY
      ? await encryptToken(refreshed.refresh_token, TOKEN_ENCRYPTION_KEY)
      : (refreshed.refresh_token ?? integ.refresh_token);
    await supabase
      .from("microsoft_integrations")
      .update({
        access_token: storeAccess,
        refresh_token: storeRefresh,
        expires_at: newExpiry.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", integ.id);
  }

  return access ? { accessToken: access, integrationId: integ.id } : null;
}

async function createGoogleEvent(accessToken: string, calendarId: string, booking: BookingRequest) {
  const start = new Date(booking.appointment_datetime);
  const end = new Date(start.getTime() + (booking.duration_minutes || 30) * 60_000);
  const body = {
    summary: `${booking.appointment_type || "Appointment"} — ${booking.attendee_name}`,
    description: booking.notes || "",
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    attendees: booking.attendee_email ? [{ email: booking.attendee_email, displayName: booking.attendee_name }] : [],
  };
  const resp = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!resp.ok) throw new Error(`Google event create failed: ${await resp.text()}`);
  return resp.json() as Promise<{ id: string; htmlLink?: string }>;
}

async function createMicrosoftEvent(accessToken: string, calendarId: string, booking: BookingRequest) {
  const start = new Date(booking.appointment_datetime);
  const end = new Date(start.getTime() + (booking.duration_minutes || 30) * 60_000);
  const body = {
    subject: `${booking.appointment_type || "Appointment"} — ${booking.attendee_name}`,
    body: { contentType: "text", content: booking.notes || "" },
    start: { dateTime: start.toISOString(), timeZone: "UTC" },
    end: { dateTime: end.toISOString(), timeZone: "UTC" },
    attendees: booking.attendee_email
      ? [{ emailAddress: { address: booking.attendee_email, name: booking.attendee_name }, type: "required" }]
      : [],
  };
  const url = calendarId
    ? `https://graph.microsoft.com/v1.0/me/calendars/${calendarId}/events`
    : `https://graph.microsoft.com/v1.0/me/events`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!resp.ok) throw new Error(`MS event create failed: ${await resp.text()}`);
  return resp.json() as Promise<{ id: string; webLink?: string }>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // --- Authentication: require a valid signed-in user ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const authClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "");
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const booking: BookingRequest = await req.json();

    if (!booking.campaign_id || !booking.contact_id || !booking.attendee_name || !booking.appointment_datetime) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve campaign → user + agent → per-agent calendar selection
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("id, user_id, agent_id")
      .eq("id", booking.campaign_id)
      .single();

    // --- Authorization: caller must own the referenced campaign ---
    if (!campaign) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (campaign.user_id !== callerId) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Contact must belong to the same campaign
    const { data: contact } = await supabase
      .from("campaign_contacts")
      .select("id, campaign_id")
      .eq("id", booking.contact_id)
      .maybeSingle();
    if (!contact || contact.campaign_id !== booking.campaign_id) {
      return new Response(JSON.stringify({ error: "Invalid contact for this campaign" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    let calendarId: string | null = null;
    let calendarProvider: string | null = null;

    if (campaign?.agent_id) {
      const { data: tool } = await supabase
        .from("calendar_tools")
        .select("configuration")
        .eq("agent_id", campaign.agent_id)
        .eq("tool_name", "calendar_booking")
        .maybeSingle();
      const cfg: any = tool?.configuration ?? {};
      calendarId = cfg.calendar_id || null;
      calendarProvider = cfg.calendar_provider || null;
    }

    // Fall back to the user's integration default
    if (!calendarProvider && campaign?.user_id) {
      const { data: g } = await supabase
        .from("google_integrations")
        .select("calendar_id")
        .eq("user_id", campaign.user_id)
        .maybeSingle();
      if (g) {
        calendarProvider = "google";
        calendarId = calendarId || g.calendar_id || "primary";
      } else {
        const { data: m } = await supabase
          .from("microsoft_integrations")
          .select("calendar_id")
          .eq("user_id", campaign.user_id)
          .maybeSingle();
        if (m) {
          calendarProvider = "microsoft";
          calendarId = calendarId || m.calendar_id || "";
        }
      }
    }
    if (calendarProvider === "google" && !calendarId) calendarId = "primary";

    // Push to provider calendar (best-effort — booking row is still recorded on failure)
    let externalEventId: string | null = null;
    let providerError: string | null = null;
    let integrationId: string | null = null;

    try {
      if (calendarProvider === "google" && campaign?.user_id) {
        const tok = await getValidGoogleToken(supabase, campaign.user_id);
        if (tok) {
          const ev = await createGoogleEvent(tok.accessToken, calendarId!, booking);
          externalEventId = ev.id;
          integrationId = tok.integrationId;
        }
      } else if (calendarProvider === "microsoft" && campaign?.user_id) {
        const tok = await getValidMicrosoftToken(supabase, campaign.user_id);
        if (tok) {
          const ev = await createMicrosoftEvent(tok.accessToken, calendarId || "", booking);
          externalEventId = ev.id;
          integrationId = tok.integrationId;
        }
      }
    } catch (e) {
      providerError = e instanceof Error ? e.message : String(e);
      console.error("Provider event push failed:", providerError);
    }

    // Persist booking
    const { data: calendarBooking, error: bookingError } = await supabase
      .from("calendar_bookings")
      .insert({
        campaign_id: booking.campaign_id,
        contact_id: booking.contact_id,
        call_log_id: booking.call_log_id,
        attendee_name: booking.attendee_name,
        attendee_email: booking.attendee_email,
        appointment_datetime: booking.appointment_datetime,
        duration_minutes: booking.duration_minutes || 30,
        appointment_type: booking.appointment_type || "consultation",
        notes: booking.notes,
        booking_status: externalEventId ? "confirmed" : providerError ? "pending" : "pending",
        provider: calendarProvider || "internal",
        google_event_id: calendarProvider === "google" ? externalEventId : null,
        external_booking_id: externalEventId,
        google_integration_id: calendarProvider === "google" ? integrationId : null,
        integration_id: integrationId,
        metadata: { calendar_id: calendarId, provider_error: providerError },
      })
      .select()
      .single();

    if (bookingError) {
      console.error("Error creating calendar booking:", bookingError);
      return new Response(JSON.stringify({ error: "Failed to create booking" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("campaign_contacts").update({ status: "scheduled" }).eq("id", booking.contact_id);

    await supabase.from("follow_up_sequences").insert({
      campaign_id: booking.campaign_id,
      contact_id: booking.contact_id,
      sequence_type: "email",
      trigger_event: "appointment_booked",
      delay_hours: 1,
      content: `Thank you for scheduling your appointment. We look forward to speaking with you on ${new Date(booking.appointment_datetime).toLocaleDateString()} at ${new Date(booking.appointment_datetime).toLocaleTimeString()}.`,
      status: "pending",
      scheduled_for: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    });

    return new Response(
      JSON.stringify({ success: true, booking: calendarBooking, provider_error: providerError }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error in handle-calendar-booking function:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
};

serve(handler);
