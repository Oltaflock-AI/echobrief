import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshGoogleToken(refreshToken: string, clientId: string, clientSecret: string) {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });

  return response.json();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
    const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

    if (!googleClientId || !googleClientSecret) {
      return new Response(
        JSON.stringify({ error: "Google credentials not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    // Get user's Google tokens
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("google_calendar_connected, google_access_token, google_refresh_token, google_token_expiry")
      .eq("user_id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ error: "Profile not found", events: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profile.google_calendar_connected || !profile.google_access_token) {
      return new Response(
        JSON.stringify({ error: "Google Calendar not connected", events: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let accessToken = profile.google_access_token;

    // Check if token is expired and refresh if needed
    if (profile.google_token_expiry && profile.google_refresh_token) {
      const expiry = new Date(profile.google_token_expiry);
      const now = new Date();
      
      if (now >= expiry) {
        console.log("Token expired, refreshing...");
        const refreshResult = await refreshGoogleToken(
          profile.google_refresh_token,
          googleClientId,
          googleClientSecret
        );

        if (refreshResult.error) {
          console.error("Token refresh failed:", refreshResult);
          // Clear the connection since tokens are invalid
          await supabase
            .from("profiles")
            .update({
              google_calendar_connected: false,
              google_access_token: null,
              google_refresh_token: null,
              google_token_expiry: null,
            })
            .eq("user_id", user.id);

          return new Response(
            JSON.stringify({ error: "Google authorization expired. Please reconnect.", events: [] }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        accessToken = refreshResult.access_token;

        // Update stored tokens
        const newExpiry = new Date();
        newExpiry.setSeconds(newExpiry.getSeconds() + (refreshResult.expires_in || 3600));

        await supabase
          .from("profiles")
          .update({
            google_access_token: accessToken,
            google_token_expiry: newExpiry.toISOString(),
          })
          .eq("user_id", user.id);
      }
    }

    // Fetch calendar events
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    const calendarUrl = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    calendarUrl.searchParams.set("timeMin", today.toISOString());
    calendarUrl.searchParams.set("timeMax", endOfWeek.toISOString());
    calendarUrl.searchParams.set("singleEvents", "true");
    calendarUrl.searchParams.set("orderBy", "startTime");
    calendarUrl.searchParams.set("maxResults", "50");

    const calendarResponse = await fetch(calendarUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!calendarResponse.ok) {
      const errorText = await calendarResponse.text();
      console.error("Calendar API error:", calendarResponse.status, errorText);
      
      if (calendarResponse.status === 401) {
        // Token invalid, clear connection
        await supabase
          .from("profiles")
          .update({
            google_calendar_connected: false,
            google_access_token: null,
            google_refresh_token: null,
            google_token_expiry: null,
          })
          .eq("user_id", user.id);

        return new Response(
          JSON.stringify({ error: "Google authorization invalid. Please reconnect.", events: [] }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ error: "Failed to fetch calendar events", events: [] }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const calendarData = await calendarResponse.json();

    // Transform Google Calendar events to our format
    const events = (calendarData.items || []).map((item: any) => ({
      id: item.id,
      title: item.summary || "Untitled Event",
      start: item.start?.dateTime || item.start?.date,
      end: item.end?.dateTime || item.end?.date,
      meetingLink: item.hangoutLink || item.conferenceData?.entryPoints?.[0]?.uri || null,
      source: "google_calendar",
      status: "scheduled",
      description: item.description || null,
      location: item.location || null,
    }));

    return new Response(
      JSON.stringify({ events, isSample: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Sync calendar error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error", events: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
