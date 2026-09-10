import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { pickChangedEvents } from "../_shared/calendar-diff.ts";
import { openGoogleTokens, sealGoogleTokens } from "../_shared/oauth-tokens.ts";
import { extractMeetingLink } from "../_shared/calendar-connections.ts";

// An all-day event arrives as a bare date ("2026-09-11"). calendar_events.start_time
// is timestamptz, so a bare date reads as UTC midnight — 5:30 am to an IST reader.
// Pin it to IST midnight; timed events already carry their own offset.
function dayToIst(raw?: string | null): string | null {
  if (!raw) return raw ?? null;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00+05:30` : raw;
}

function extractMeetingUrl(event: Record<string, unknown>): string | null {
  const conferenceData = event.conferenceData as
    | { entryPoints?: { entryPointType?: string; uri?: string }[] }
    | undefined;
  const videoEntry = conferenceData?.entryPoints?.find(
    (e) => e.entryPointType === "video",
  );
  // One shared matcher: it accepts tenant subdomains (us05web.zoom.us) and
  // refuses lookalike hosts, which the local regex this replaced did neither of.
  return extractMeetingLink([
    videoEntry?.uri,
    event.hangoutLink as string | undefined,
    event.location as string | undefined,
    event.description as string | undefined,
  ]);
}

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's Google tokens (service role — not readable from browser when RLS locks the table)
    let { data: storedTokens, error: tokenError } = await supabase
      .from("user_oauth_tokens")
      .select("google_access_token, google_refresh_token, google_token_expiry")
      .eq("user_id", user.id)
      .maybeSingle();
    let tokenData = await openGoogleTokens(storedTokens);

    if (tokenError || !tokenData?.google_access_token) {
      return new Response(
        JSON.stringify({
          error: "Google calendar not connected",
          code: "NOT_CONNECTED",
          hint: "Use Settings → Integrations → Add Calendar to complete Google OAuth for this account.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = tokenData.google_access_token;
    const expiry = tokenData.google_token_expiry
      ? new Date(tokenData.google_token_expiry)
      : null;
    const isExpired = !expiry || expiry.getTime() < Date.now() + 60_000;

    // Always try to refresh if we have a refresh token and the token is expired or about to expire
    if (isExpired && tokenData.google_refresh_token) {
      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (googleClientId && googleClientSecret) {
        console.log(`[sync-google-calendar] Token expired, attempting refresh for user ${user.id}`);
        const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: tokenData.google_refresh_token!,
            client_id: googleClientId,
            client_secret: googleClientSecret,
          }),
        });
        const refreshed = await refreshRes.json();
        if (refreshed.access_token) {
          accessToken = refreshed.access_token;
          const newExpiry = new Date();
          newExpiry.setSeconds(
            newExpiry.getSeconds() + (refreshed.expires_in || 3600),
          );
          await supabase.from("user_oauth_tokens").upsert(
            await sealGoogleTokens({
              user_id: user.id,
              google_access_token: accessToken,
              google_token_expiry: newExpiry.toISOString(),
            }),
            { onConflict: "user_id" },
          );
          console.log(`[sync-google-calendar] Token refreshed successfully`);
        } else {
          console.error(`[sync-google-calendar] Token refresh failed:`, refreshed);
          return new Response(
            JSON.stringify({
              error: "Google token expired and refresh failed",
              code: "TOKEN_REFRESH_FAILED",
              hint: "Please reconnect your Google Calendar in Settings → Integrations.",
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        console.error(`[sync-google-calendar] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET`);
        return new Response(
          JSON.stringify({
            error: "Server configuration error",
            hint: "Google OAuth credentials are not configured.",
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    } else if (isExpired && !tokenData.google_refresh_token) {
      console.error(`[sync-google-calendar] Token expired and no refresh token available`);
      return new Response(
        JSON.stringify({
          error: "Google token expired",
          code: "TOKEN_EXPIRED",
          hint: "Please reconnect your Google Calendar in Settings → Integrations.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-google-calendar] Fetching calendars for user ${user.id}`);

    // Fetch calendars from Google Calendar API
    const calendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log(`[sync-google-calendar] Google API response: ${calendarResponse.status}`);

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error(`[sync-google-calendar] Google API error: ${errorText}`);
      return new Response(
        JSON.stringify({ error: `Google API error: ${calendarResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { items: calendars } = await calendarResponse.json();
    console.log(`[sync-google-calendar] Got ${calendars?.length || 0} calendars`);

    if (!calendars || calendars.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          calendars: 0,
          events: 0,
          upcomingEvents: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Save calendars to DB
    const calendarInserts = calendars.map((cal: any) => ({
      user_id: user.id,
      provider: "google",
      calendar_id: cal.id,
      calendar_name: cal.summary,
      email: cal.id,
      is_primary: cal.primary || false,
      is_active: true,
    }));

    const { error: upsertError } = await supabase
      .from("calendars")
      .upsert(calendarInserts, { onConflict: "user_id,calendar_id" });

    if (upsertError) {
      console.error(`[sync-google-calendar] Upsert error: ${upsertError.message}`);
      return new Response(
        JSON.stringify({ error: "Failed to save calendars" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[sync-google-calendar] Successfully saved ${calendarInserts.length} calendars`);

    // Fetch events only from user-owned calendars (skip holiday, birthdays, and other read-only auto-added calendars)
    const ownedCalendars = calendars.filter((cal: any) => {
      const id: string = cal.id || "";
      if (id.includes("#holiday@group.v.calendar.google.com")) return false;
      if (id.includes("#contacts@group.v.calendar.google.com")) return false;
      if (id.includes("#other@group.v.calendar.google.com")) return false;
      return true;
    });
    console.log(`[sync-google-calendar] Fetching events from ${ownedCalendars.length}/${calendars.length} calendars (skipped holiday/contacts)`);

    let totalEvents = 0;
    const upcomingEvents: Record<string, unknown>[] = [];
    const now = new Date();
    const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const timeMin = encodeURIComponent(now.toISOString());
    const timeMax = encodeURIComponent(maxDate.toISOString());

    for (const cal of ownedCalendars) {
      try {
        const eventsResponse = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events?maxResults=100&orderBy=startTime&singleEvents=true&timeMin=${timeMin}&timeMax=${timeMax}`,
          {
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (!eventsResponse.ok) {
          const errText = await eventsResponse.text();
          console.error(`[sync-google-calendar] Events API error for calendar ${cal.id}: ${eventsResponse.status} ${errText}`);
          continue;
        }

        if (eventsResponse.ok) {
          const { items: events } = await eventsResponse.json();

          if (events && events.length > 0) {
            for (const event of events as Record<string, unknown>[]) {
              const startObj = event.start as { dateTime?: string; date?: string } | undefined;
              const endObj = event.end as { dateTime?: string; date?: string } | undefined;
              const startRaw = startObj?.dateTime || startObj?.date;
              const endRaw = endObj?.dateTime || endObj?.date;
              if (!startRaw) continue;
              const meetingUrl = extractMeetingUrl(event);
              const attendees = Array.isArray(event.attendees) ? event.attendees : [];
              upcomingEvents.push({
                id: event.id,
                title: (typeof event.summary === "string" ? event.summary : null) || "No title",
                start_time: startRaw,
                end_time: endRaw || startRaw,
                is_all_day: !startObj?.dateTime,
                meetingUrl,
                hasMeetingLink: !!meetingUrl,
                attendees,
                start: startRaw,
                end: endRaw || startRaw,
                meetingLink: meetingUrl,
              });
            }

            const eventInserts = events.map((event: any) => ({
              user_id: user.id,
              calendar_id: cal.id,
              event_id: event.id,
              title: event.summary,
              description: event.description,
              start_time: dayToIst(event.start?.dateTime || event.start?.date),
              end_time: dayToIst(event.end?.dateTime || event.end?.date),
              location: event.location,
              meeting_link: extractMeetingUrl(event),
              organizer_name: event.organizer?.displayName,
              organizer_email: event.organizer?.email,
              attendees: event.attendees || [],
              is_recurring: false,
              raw_data: event,
            }));

            // Only write what actually changed. Upserting the whole calendar
            // on every sync rewrote every row regardless, which was the second
            // largest write source in the database — see _shared/calendar-diff.ts.
            const { data: storedVersions } = await supabase
              .from("calendar_events")
              .select("event_id, raw_data->>updated")
              .eq("user_id", user.id)
              .eq("calendar_id", cal.id);

            const changed = pickChangedEvents(storedVersions as any, events as any[]);
            const changedIds = new Set(changed.map((e: any) => e.id));
            const toWrite = eventInserts.filter((row: any) => changedIds.has(row.event_id));

            if (toWrite.length === 0) {
              console.log(
                `[sync-google-calendar] ${cal.summary}: ${eventInserts.length} events, none changed — no write`,
              );
            } else {
              const { error: eventError } = await supabase
                .from("calendar_events")
                .upsert(toWrite, { onConflict: "user_id,event_id" });

              if (!eventError) {
                totalEvents += toWrite.length;
                console.log(
                  `[sync-google-calendar] Synced ${toWrite.length} changed of ${eventInserts.length} events from ${cal.summary}`,
                );
              } else {
                console.warn(`[sync-google-calendar] calendar_events upsert skipped: ${eventError.message}`);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[sync-google-calendar] Error syncing calendar ${cal.id}:`, err);
      }
    }

    console.log(`[sync-google-calendar] Done. ${calendarInserts.length} calendars, ${upcomingEvents.length} upcoming events (${totalEvents} saved to DB)`);

    return new Response(
      JSON.stringify({
        success: true,
        calendars: calendarInserts.length,
        events: upcomingEvents.length,
        upcomingEvents,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[sync-google-calendar] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
