/**
 * Developer — Console (UI v2). Access tokens and MCP client setup.
 *
 * Same manage-api-tokens actions as the V1 card: list, create (the plaintext is
 * returned once and never again), revoke. What is new is the shape from
 * DESIGN_SPEC §7 — token rows with a device icon, a chip picker over dark code
 * blocks, and the MCP tool cards.
 *
 * The mockup's 10-token counter is real: MAX_TOKENS_PER_USER in the edge
 * function is 10, and it refuses the eleventh.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Check, Copy, Key, Laptop, Loader2, Plus, Sparkles, Terminal, Trash2, type LucideIcon,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge, Button, ChipGroup, Input, Section } from "@/ui";
import { CODEX_TOKEN_COMMAND, MCP_URL } from "@/lib/mcp";

interface ApiToken {
  id: string;
  name: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Mirrors MAX_TOKENS_PER_USER in supabase/functions/manage-api-tokens. */
const MAX_TOKENS = 10;

const CLIENTS = ["Codex", "Claude Code", "Claude Desktop", "Cursor", "cURL"] as const;
type ClientKey = (typeof CLIENTS)[number];

const SNIPPETS: Record<ClientKey, { intro: string; code: string }> = {
  Codex: {
    intro: "For token-based setup, create a token above and set ECHOBRIEF_API_TOKEN in the environment where Codex runs. Then run this command. For browser sign-in, use Connect Codex above.",
    code: CODEX_TOKEN_COMMAND,
  },
  "Claude Code": {
    intro: "Run this in your terminal, with your token in place of YOUR_TOKEN:",
    code: `claude mcp add --transport http echobrief ${MCP_URL} \\\n  --header "Authorization: Bearer YOUR_TOKEN"`,
  },
  "Claude Desktop": {
    intro: "Add this to your MCP config file:",
    code: `{\n  "mcpServers": {\n    "echobrief": {\n      "type": "http",\n      "url": "${MCP_URL}",\n      "headers": { "Authorization": "Bearer YOUR_TOKEN" }\n    }\n  }\n}`,
  },
  Cursor: {
    intro: "Add this to .cursor/mcp.json:",
    code: `{\n  "mcpServers": {\n    "echobrief": {\n      "url": "${MCP_URL}",\n      "headers": { "Authorization": "Bearer YOUR_TOKEN" }\n    }\n  }\n}`,
  },
  cURL: {
    intro: "Check the endpoint answers with your token:",
    code: `curl -s ${MCP_URL} \\\n  -H "Authorization: Bearer YOUR_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`,
  },
};

/** The eight MCP tools, named as the server names them. */
const TOOLS: Array<{ name: string; blurb: string }> = [
  { name: "list_meetings", blurb: "Recent meetings, newest first" },
  { name: "search_meetings", blurb: "Find meetings by text, person or date" },
  { name: "get_meeting", blurb: "One meeting's metadata" },
  { name: "get_meeting_insights", blurb: "Summary, decisions and action items" },
  { name: "get_meeting_facts", blurb: "The quoted facts and coaching report" },
  { name: "get_transcript", blurb: "Speaker-attributed transcript, meeting zone only" },
  { name: "get_action_items", blurb: "Open items across every meeting" },
  { name: "complete_action_item", blurb: "Tick one off — the only write" },
];

/** A token's name hints at where it runs; the icon is cosmetic, never trusted. */
function iconFor(name: string): LucideIcon {
  const n = name.toLowerCase();
  if (n.includes("terminal") || n.includes("code") || n.includes("cli")) return Terminal;
  if (n.includes("oauth") || n.includes("claude") || n.includes("cursor")) return Sparkles;
  if (n.includes("laptop") || n.includes("desktop") || n.includes("mac")) return Laptop;
  return Key;
}

export function ApiTokensCard() {
  const { toast } = useToast();
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [client, setClient] = useState<ClientKey>("Claude Code");
  const [copied, setCopied] = useState<string | null>(null);

  const call = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("manage-api-tokens", { body });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await call({ action: "list" });
      setTokens(data.tokens ?? []);
    } catch (err) {
      toast({ title: "Could not load tokens", description: (err as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [call, toast]);

  useEffect(() => {
    void refresh();
    // OAuth finishes in another tab/window; show its token when the user returns.
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data = await call({ action: "create", name: newName.trim() });
      setPlaintext(data.token);
      setNewName("");
      await refresh();
    } catch (err) {
      toast({ title: "Could not create token", description: (err as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    try {
      await call({ action: "revoke", id });
      await refresh();
      toast({ title: "Token revoked" });
    } catch (err) {
      toast({ title: "Could not revoke token", description: (err as Error).message, variant: "destructive" });
    }
  };

  const copy = async (value: string, key: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600);
    toast({ title: "Copied to clipboard" });
  };

  const active = tokens.filter((t) => !t.revoked_at);
  const day = (v: string) => new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  return (
    <>
      <Section
        title="Access tokens"
        description="Manage access for Codex, Claude, Cursor or any MCP client. Manually created tokens are shown once and can be revoked at any time."
      >
        {loading ? (
          <div className="flex items-center gap-2 font-dmsans text-[13px] text-eb-secondary">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : active.length === 0 ? (
          <p className="font-dmsans text-[12.5px] text-eb-secondary">
            No active tokens. Connect Codex above, or create a token for another client.
          </p>
        ) : (
          <div className="-mx-5 -mt-2">
            {active.map((token) => {
              const Icon = iconFor(token.name);
              return (
                <div
                  key={token.id}
                  className="flex items-center gap-3 border-b border-eb-divider px-5 py-3 last:border-0"
                >
                  <span className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-tile border border-eb-border bg-white text-eb-secondary shadow-eb-card">
                    <Icon size={16} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-dmsans text-sm font-medium">{token.name}</div>
                    <div className="flex flex-wrap items-center gap-2 font-dmsans text-[12.5px] text-eb-secondary">
                      <code className="rounded bg-eb-chip px-1.5 py-0.5 font-mono text-[11.5px]">
                        {token.token_prefix}…
                      </code>
                      <span>created {day(token.created_at)}</span>
                      <span>
                        ·{" "}
                        {token.last_used_at ? `last used ${day(token.last_used_at)}` : "never used"}
                      </span>
                    </div>
                  </div>
                  <Badge tone="green" dot>Active</Badge>
                  <button
                    type="button"
                    onClick={() => void handleRevoke(token.id)}
                    className="flex-none text-eb-muted hover:text-eb-red"
                    aria-label={`Revoke ${token.name}`}
                  >
                    <Trash2 size={16} strokeWidth={1.75} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="font-dmsans text-[12.5px] text-eb-secondary">
            {active.length} of {MAX_TOKENS} tokens
          </span>
          <Button
            variant="dark"
            disabled={active.length >= MAX_TOKENS}
            onClick={() => {
              setPlaintext(null);
              setDialogOpen(true);
            }}
            icon={<Plus size={15} strokeWidth={2} />}
          >
            New token
          </Button>
        </div>
      </Section>

      <Section title="Connect a client">
        <ChipGroup<ClientKey>
          ariaLabel="MCP client"
          value={client}
          onChange={setClient}
          options={CLIENTS}
        />

        <p className="mt-4 font-dmsans text-[13px] text-eb-secondary">{SNIPPETS[client].intro}</p>

        <div className="relative mt-2">
          <pre className="overflow-x-auto rounded-code bg-eb-sidebar p-3.5 pr-20 font-mono text-[12.5px] leading-[1.6] text-eb-code-fg">
            {SNIPPETS[client].code}
          </pre>
          <button
            type="button"
            onClick={() => void copy(SNIPPETS[client].code, client)}
            className="absolute right-2.5 top-2.5 inline-flex h-7 items-center gap-1.5 rounded-pill bg-white/10 px-2.5 font-dmsans text-[12px] text-eb-code-fg hover:bg-white/[.16]"
          >
            {copied === client ? <Check size={13} strokeWidth={2} /> : <Copy size={13} strokeWidth={1.75} />}
            {copied === client ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <div key={tool.name} className="rounded-input border border-eb-border p-3">
              <div className="font-mono text-[12.5px] text-eb-accent">{tool.name}</div>
              <div className="mt-0.5 font-dmsans text-[12.5px] text-eb-secondary">{tool.blurb}</div>
            </div>
          ))}
        </div>
      </Section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{plaintext ? "Copy your token" : "New access token"}</DialogTitle>
            <DialogDescription>
              {plaintext
                ? "This is the only time this token will be shown. Copy it now — if you lose it, revoke it and create another."
                : "Give the token a name so you can recognise it later."}
            </DialogDescription>
          </DialogHeader>

          {plaintext ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto rounded-code bg-eb-sidebar p-3 font-mono text-[12.5px] text-eb-code-fg">
                {plaintext}
              </code>
              <Button size="sm" onClick={() => void copy(plaintext, "plaintext")}>
                <Copy size={14} strokeWidth={1.75} />
                <span className="sr-only">Copy token</span>
              </Button>
            </div>
          ) : (
            <Input
              value={newName}
              maxLength={60}
              placeholder="Claude Code on my laptop"
              onChange={(e) => setNewName(e.target.value)}
            />
          )}

          <DialogFooter>
            {plaintext ? (
              <Button
                variant="primary"
                onClick={() => {
                  setPlaintext(null);
                  setDialogOpen(false);
                }}
              >
                Done
              </Button>
            ) : (
              <Button variant="primary" disabled={creating || !newName.trim()} onClick={() => void handleCreate()}>
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                Create token
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
