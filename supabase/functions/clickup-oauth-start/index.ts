/**
 * Begin connecting a ClickUp account.
 *
 * Mirrors `slack-oauth-start`, including the reuse of `google_oauth_states`:
 * the table is named for Google but its shape (state, user_id, return_to,
 * origin) is provider-agnostic, each redirect function only consumes states
 * it created, and the single-use row is what authenticates the browser
 * navigation that comes back.
 *
 * ClickUp has no scopes: a grant is the whole of every workspace the user
 * ticks on the consent screen. That is why the channel picker lists channels
 * per workspace and the delivery path writes to exactly one.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsPrelight } from "../_shared/cors.ts";
import { checkRateLimit, getClientIdentifier, createRateLimitResponse, RATE_LIMITS } from "../_shared/rate-limit.ts";

const AUTHORIZE = "https://app.clickup.com/api";

serve(async (req) => {
  const corsResponse = handleCorsPrelight(req);
  if (corsResponse) return corsResponse;
  const corsHeaders = getCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  const limit = await checkRateLimit(`clickup-oauth-start:${getClientIdentifier(req)}`, RATE_LIMITS.OAUTH);
  if (!limit.allowed) return createRateLimitResponse(limit, corsHeaders);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const returnTo = typeof body?.returnTo === "string" ? body.returnTo : "/settings";
    const origin = (
      typeof body?.origin === "string" ? body.origin : req.headers.get("origin") || ""
    ).trim();
    if (!origin) return json({ error: "Missing origin" }, 400);

    const clientId = Deno.env.get("CLICKUP_CLIENT_ID");
    if (!clientId) return json({ error: "ClickUp is not configured yet." }, 503);

    const authHeader = req.headers.get("authorization");
    if (!authHeader) return json({ error: "Authorization required" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: { user }, error: userError } =
      await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
    if (userError || !user) return json({ error: "Invalid user token" }, 401);

    const state = crypto.randomUUID();
    const { error: insertError } = await supabase
      .from("google_oauth_states")
      .insert({ state, user_id: user.id, return_to: returnTo, origin });
    if (insertError) {
      console.error("[clickup-oauth-start] state insert failed:", insertError);
      return json({ error: "Could not start the connection. Try again." }, 500);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/clickup-oauth-redirect`;
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, state });

    return json({ authUrl: `${AUTHORIZE}?${params.toString()}`, redirectUri });
  } catch (err) {
    console.error("[clickup-oauth-start]", err);
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
