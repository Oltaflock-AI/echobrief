import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Default frontend URL - will be overridden by state lookup
    let frontendUrl = "https://wpczgwxsriezaubncuom.lovableproject.com";
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
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}/settings?error=invalid_state` },
        });
      }

      returnTo = stateData.return_to || "/settings";

      // Check if state is expired (older than 10 minutes)
      const createdAt = new Date(stateData.created_at);
      const now = new Date();
      if (now.getTime() - createdAt.getTime() > 10 * 60 * 1000) {
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

      // Store tokens in profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          google_calendar_connected: true,
          google_access_token: tokenData.access_token,
          google_refresh_token: tokenData.refresh_token || null,
          google_token_expiry: expiryDate.toISOString(),
        })
        .eq("user_id", stateData.user_id);

      if (updateError) {
        console.error("Profile update error:", updateError);
        await supabase.from("google_oauth_states").delete().eq("state", state);
        return new Response(null, {
          status: 302,
          headers: { Location: `${frontendUrl}${returnTo}?error=save_failed` },
        });
      }

      // Clean up used state
      await supabase.from("google_oauth_states").delete().eq("state", state);

      // Redirect back to frontend with success
      return new Response(null, {
        status: 302,
        headers: { Location: `${frontendUrl}${returnTo}?google_connected=true` },
      });
    }

    // No state provided
    return new Response(null, {
      status: 302,
      headers: { Location: `${frontendUrl}/settings?error=no_state` },
    });
  } catch (error) {
    console.error("Google OAuth redirect error:", error);
    return new Response(null, {
      status: 302,
      headers: { Location: "https://wpczgwxsriezaubncuom.lovableproject.com/settings?error=server_error" },
    });
  }
});
