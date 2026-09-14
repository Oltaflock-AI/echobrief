/**
 * ClickUp's redirect back after the user authorises the app.
 *
 * `verify_jwt = false`: this arrives as a browser navigation from ClickUp
 * with no Authorization header, exactly like the Slack and Zoho redirects.
 * The single-use `google_oauth_states` row created by `clickup-oauth-start`
 * against a real session is what authenticates it, and it is burned the
 * moment it is used.
 *
 * The token lands SEALED in `clickup_connections.access_token`;
 * `sealConnectionTokens` applies unchanged because the table uses the same
 * `access_token` / `refresh_token` column names as `calendar_connections`.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, getClientIdentifier, RATE_LIMITS } from "../_shared/rate-limit.ts";
import { sealConnectionTokens } from "../_shared/oauth-tokens.ts";
import { ClickUpError, exchangeCode, getAuthorizedUser, listWorkspaces } from "../_shared/clickup.ts";

serve(async (req) => {
  const limit = await checkRateLimit(`clickup-oauth-redirect:${getClientIdentifier(req)}`, RATE_LIMITS.AUTH);
  if (!limit.allowed) {
    return new Response(
      `Too many requests. Please wait ${limit.resetIn} seconds and try again.`,
      { status: 429, headers: { "Content-Type": "text/plain", "Retry-After": String(limit.resetIn) } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (!state) {
    return new Response("Missing session. Start the connection from the app again.", {
      status: 400, headers: { "Content-Type": "text/plain" },
    });
  }

  const { data: stateRow } = await supabase
    .from("google_oauth_states").select("*").eq("state", state).single();
  if (!stateRow) {
    return new Response("Invalid or expired session. Please return to the app and try again.", {
      status: 400, headers: { "Content-Type": "text/plain" },
    });
  }

  const frontendUrl: string | null = stateRow.origin || null;
  const returnTo: string = stateRow.return_to || "/settings";
  const burn = () => supabase.from("google_oauth_states").delete().eq("state", state);
  const back = (params: string) =>
    new Response(null, { status: 302, headers: { Location: `${frontendUrl}${returnTo}?${params}` } });

  if (!frontendUrl) {
    await burn();
    return new Response("Missing origin. Please start the connection from the app again.", {
      status: 400, headers: { "Content-Type": "text/plain" },
    });
  }

  if (Date.now() - new Date(stateRow.created_at).getTime() > 30 * 60 * 1000) {
    await burn();
    return back("error=expired_state");
  }
  if (oauthError) {
    await burn();
    return back(`error=${encodeURIComponent(oauthError)}`);
  }
  if (!code) {
    await burn();
    return back("error=no_code");
  }

  const clientId = Deno.env.get("CLICKUP_CLIENT_ID");
  const clientSecret = Deno.env.get("CLICKUP_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    await burn();
    return back("error=server_config");
  }

  try {
    const { access_token } = await exchangeCode(clientId, clientSecret, code);
    if (!access_token) {
      await burn();
      return back("error=token_exchange_failed");
    }

    const workspaces = await listWorkspaces(access_token);
    if (!workspaces.length) {
      await burn();
      return back("error=no_workspaces");
    }
    const who = await getAuthorizedUser(access_token).catch(() => ({ id: "", email: null }));

    // A saved channel survives a reconnect only while its workspace is still
    // in the grant. An id from a workspace that was unticked would still look
    // configured while pointing somewhere this token cannot reach, and the
    // failure would only surface on the next completed meeting.
    const { data: existing } = await supabase
      .from("clickup_connections")
      .select("id, workspace_id")
      .eq("user_id", stateRow.user_id)
      .maybeSingle();
    const keepChannel = !!existing?.workspace_id &&
      workspaces.some((w) => w.id === existing.workspace_id);

    const payload: Record<string, unknown> = {
      user_id: stateRow.user_id,
      access_token,
      refresh_token: null,
      token_expiry: null,
      scopes: null,
      authed_user_id: who.id || null,
      authed_email: who.email,
      workspaces,
      needs_reconnect: false,
      updated_at: new Date().toISOString(),
    };
    if (!keepChannel) {
      payload.workspace_id = null;
      payload.workspace_name = null;
      payload.channel_id = null;
      payload.channel_name = null;
    }

    const { error: upsertError } = await supabase
      .from("clickup_connections")
      .upsert(await sealConnectionTokens(payload), { onConflict: "user_id" });

    if (upsertError) {
      console.error("[clickup-oauth-redirect] could not store the grant:", upsertError);
      await burn();
      return back("error=store_failed");
    }

    await burn();
    // `clickup_connected=1` lands Settings on the channel picker: connecting is
    // only half the job, and a connection with no channel posts nothing.
    return back("clickup_connected=1");
  } catch (err) {
    const code = err instanceof ClickUpError ? (err.ecode || `http_${err.status}`) : "unexpected";
    console.error("[clickup-oauth-redirect]", code, err);
    await burn();
    return back(`error=${encodeURIComponent(code)}`);
  }
});
