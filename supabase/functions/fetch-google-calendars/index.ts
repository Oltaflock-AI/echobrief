import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;

  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  try {
    // Get user from authorization header
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

    // Get user's Google access token
    const { data: tokenData, error: tokenError } = await supabase
      .from("user_oauth_tokens")
      .select("google_access_token")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenData?.google_access_token) {
      return new Response(
        JSON.stringify({ error: "Google calendar not connected" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch calendars from Google Calendar API
    const calendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: {
          "Authorization": `Bearer ${tokenData.google_access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!calendarResponse.ok) {
      const error = await calendarResponse.text();
      console.error("Google API error:", error);
      return new Response(
        JSON.stringify({ error: `Failed to fetch calendars: ${calendarResponse.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { items: calendars } = await calendarResponse.json();

    if (!calendars || calendars.length === 0) {
      return new Response(
        JSON.stringify({ success: true, calendars: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert or update calendars in database
    const calendarInserts = calendars.map((cal: any) => ({
      user_id: user.id,
      provider: "google",
      calendar_id: cal.id,
      calendar_name: cal.summary,
      email: cal.id, // Google uses email as ID for primary calendar
      is_primary: cal.primary || false,
      is_active: true,
    }));

    const { data: savedCals, error: insertError } = await supabase
      .from("calendars")
      .upsert(calendarInserts, { onConflict: "user_id,calendar_id" })
      .select();

    if (insertError) {
      console.error("Calendar insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to save calendars" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, calendars: savedCals }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Fetch calendars error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
