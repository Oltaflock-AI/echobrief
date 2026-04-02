import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";

serve(async (req) => {
  // Rate limiting for OAuth redirect (stricter - this is the callback)
  const clientId = getClientIdentifier(req);
  const rateLimitResult = checkRateLimit(`oauth-redirect:${clientId}`, RATE_LIMITS.AUTH);
  if (!rateLimitResult.allowed) {
    return new Response(
      `Too many requests. Please wait ${rateLimitResult.resetIn} seconds and try again.`,
      { status: 429, headers: { "Content-Type": "text/plain", "Retry-After": rateLimitResult.resetIn.toString() } }
    );
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let frontendUrl: string | null = null;
    let returnTo = "/settings";

    // Look up the state to get user_id and return_to
    if (state) {
      const { data: stateData, error: stateError } = await supabase
        .from("google_oauth_states")
        .select("*")
        .eq("state", state)
        .single();

      if (stateError || !stateData) {
        console.error("Invalid or expired state:", stateError);
        return new Response("Invalid or expired session. Please return to the app and try again.", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      frontendUrl = stateData.origin || null;
      returnTo = stateData.return_to || "/settings";

      if (!frontendUrl) {
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response("Missing origin. Please start the connection from the app again.", {
          status: 400,
          headers: { "Content-Type": "text/plain" },
        });
      }

      // Check if state is expired (older than 30 minutes)
      const createdAt = new Date(stateData.created_at);
      const now = new Date();
      if (now.getTime() - createdAt.getTime() > 30 * 60 * 1000) {
        // Clean up expired state
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=expired_state` },
        });
      }

      // Handle error from Google
      if (error) {
        console.error("Google OAuth error:", error);
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=${error}` },
        });
      }

      if (!code) {
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=no_code` },
        });
      }

      // Exchange code for tokens
      const googleClientId = Deno.env.get("GOOGLE_CLIENT_ID");
      const googleClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");

      if (!googleClientId || !googleClientSecret) {
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=server_config` },
        });
      }

      const redirectUri = `${supabaseUrl}/functions/v1/google-oauth-redirect`;
      
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        console.error("Google token error:", tokenData);
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=${tokenData.error}` },
        });
      }

      // Calculate token expiry
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + (tokenData.expires_in || 3600));

      // Store tokens in secure user_oauth_tokens table (service role only)
      const { error: tokenError } = await supabase
        .from("user_oauth_tokens")
        .upsert({
          user_id: stateData.user_id,
          google_access_token: tokenData.access_token,
          google_refresh_token: tokenData.refresh_token || null,
          google_token_expiry: expiryDate.toISOString(),
        }, { onConflict: 'user_id' });

      if (tokenError) {
        console.error("Token storage error:", tokenError);
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=save_failed` },
        });
      }

      // Fetch calendars from Google and save them
      try {
        console.log(`[google-oauth-redirect] Fetching calendars for user ${stateData.user_id}`);
        
        const calendarResponse = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
          headers: {
            "Authorization": `Bearer ${tokenData.access_token}`,
            "Content-Type": "application/json",
          },
        });

        console.log(`[google-oauth-redirect] Calendar API response: ${calendarResponse.status}`);

        if (!calendarResponse.ok) {
          const errorText = await calendarResponse.text();
          console.error(`[google-oauth-redirect] Calendar API error: ${errorText}`);
          throw new Error(`Google Calendar API failed: ${calendarResponse.status}`);
        }

        const { items: calendars } = await calendarResponse.json();
        console.log(`[google-oauth-redirect] Got ${calendars?.length || 0} calendars`);

        if (!calendars || calendars.length === 0) {
          console.warn("[google-oauth-redirect] No calendars found for user");
        } else {
          const calendarInserts = calendars.map((cal: any) => ({
            user_id: stateData.user_id,
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
            console.error(`[google-oauth-redirect] Upsert error: ${upsertError.message}`);
            throw upsertError;
          }
          
          console.log(`[google-oauth-redirect] Successfully saved ${calendarInserts.length} calendars`);
        }
      } catch (err) {
        console.error("[google-oauth-redirect] Calendar sync failed:", err);
        // Continue anyway, redirect back so user can see the error in UI
      }

      // Update profile to mark calendar as connected
      const { error: profileError } = await supabase
        .from("profiles")
        .update({ google_calendar_connected: true })
        .eq("user_id", stateData.user_id);

      if (profileError) {
        console.error("Profile update error:", profileError);
      }

      // Clean up used state
      await supabase.from("google_oauth_states").delete().eq("state", state);

      // Redirect back to frontend with success
      return new Response(null, {
        status: 302,
        headers: { Location: `${frontendUrl}${returnTo}?google_connected=true` },
      });
    }

    return new Response("Missing state. Please return to the app and try again.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  } catch (error) {
    console.error("Google OAuth redirect error:", error);
    return new Response("Server error. Please return to the app and try again.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
});
