import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

function extractMeetingUrl(event: Record<string, unknown>): string | null {
  const conferenceData = event.conferenceData as
    | { entryPoints?: { entryPointType?: string; uri?: string }[] }
    | undefined;
  if (conferenceData?.entryPoints) {
    const videoEntry = conferenceData.entryPoints.find(
      (e) => e.entryPointType === "video",
    );
    if (videoEntry?.uri) return videoEntry.uri;
  }
  if (typeof event.hangoutLink === "string") return event.hangoutLink;
  if (typeof event.location === "string") {
    const m = event.location.match(
      /https?:\/\/(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com)[^\s]*/i,
    );
    if (m) return m[0];
  }
  if (typeof event.description === "string") {
    const m = event.description.match(
      /https?:\/\/(meet\.google\.com|zoom\.us|teams\.microsoft\.com|webex\.com)[^\s<"]*/i,
    );
    if (m) return m[0];
  }
  return null;
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
    let { data: tokenData, error: tokenError } = await supabase
      .from("user_oauth_tokens")
      .select("google_access_token, google_refresh_token, google_token_expiry")
      .eq("user_id", user.id)
      .maybeSingle();

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
    const needsRefresh =
      expiry && expiry.getTime() < Date.now() + 60_000 &&
      !!tokenData.google_refresh_token;
    if (needsRefresh) {
      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
      if (googleClientId && googleClientSecret) {
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
            {
              user_id: user.id,
              google_access_token: accessToken,
              google_token_expiry: newExpiry.toISOString(),
            },
            { onConflict: "user_id" },
          );
        }
      }
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

    // Fetch events for all calendars (also build `upcomingEvents` for the web app — client cannot read OAuth tokens when RLS blocks `user_oauth_tokens`)
    let totalEvents = 0;
    const upcomingEvents: Record<string, unknown>[] = [];
    const now = new Date();
    const maxDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const timeMin = encodeURIComponent(now.toISOString());
    const timeMax = encodeURIComponent(maxDate.toISOString());

    for (const cal of calendars) {
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
              start_time: event.start?.dateTime || event.start?.date,
              end_time: event.end?.dateTime || event.end?.date,
              location: event.location,
              meeting_link: event.hangoutLink || event.conferenceData?.entryPoints?.[0]?.uri,
              organizer_name: event.organizer?.displayName,
              organizer_email: event.organizer?.email,
              attendees: event.attendees || [],
              is_recurring: false,
              raw_data: event,
            }));

            const { error: eventError } = await supabase
              .from("calendar_events")
              .upsert(eventInserts, { onConflict: "user_id,event_id" });

            if (!eventError) {
              totalEvents += eventInserts.length;
              console.log(`[sync-google-calendar] Synced ${eventInserts.length} events from ${cal.summary}`);
            } else {
              console.warn(`[sync-google-calendar] calendar_events upsert skipped: ${eventError.message}`);
            }
          }
        }
      } catch (err) {
        console.error(`[sync-google-calendar] Error syncing calendar ${cal.id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        calendars: calendarInserts.length,
        events: totalEvents,
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
