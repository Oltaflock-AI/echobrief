import { useEffect, useState } from 'react';
import { Check, Copy, ExternalLink, Terminal } from 'lucide-react';
import { Button, ChipGroup, Dialog, Section } from '@/ui';
import { useToast } from '@/hooks/use-toast';
import { CODEX_ADD_COMMAND, CODEX_LOGIN_COMMAND, MCP_URL } from '@/lib/mcp';

type SetupMethod = 'app' | 'terminal';

export function ConnectCodexCard() {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<SetupMethod>('app');

  return (
    <>
      <Section title="Codex" description="Bring your meeting summaries, decisions and action items into Codex.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-sm text-[13px] leading-relaxed text-eb-secondary">
            Connect with your EchoBrief account. You’ll approve access in your browser.
          </p>
          <Button variant="primary" icon={<Terminal size={15} strokeWidth={1.75} />} onClick={() => setOpen(true)}>
            Connect Codex
          </Button>
        </div>
      </Section>

      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Connect Codex"
        description="Choose where you use Codex, then sign in to EchoBrief to approve access."
        icon={<Terminal size={20} strokeWidth={1.75} />}
        width={620}
        mobileSheet
        footer={
          <>
            <a href="https://learn.chatgpt.com/docs/extend/mcp?surface=cli" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] text-eb-accent-text hover:underline">
              Codex setup guide <ExternalLink size={13} />
            </a>
            <Button onClick={() => setOpen(false)}>Close setup</Button>
          </>
        }
      >
        <ChipGroup<SetupMethod> ariaLabel="Codex setup method" options={[{ value: 'app', label: 'App / IDE' }, { value: 'terminal', label: 'Terminal' }]} value={method} onChange={setMethod} />
        <ol className="mt-5 list-decimal space-y-4 pl-5 text-[13px] leading-relaxed text-eb-secondary">
          {method === 'app' ? (
            <>
              <li>Open your Codex client’s MCP server settings and choose <strong className="text-eb-text">Add server</strong>.</li>
              <li>
                Name it <strong className="text-eb-text">echobrief</strong>, select <strong className="text-eb-text">Streamable HTTP</strong>, and paste this URL:
                <CopyCode value={MCP_URL} label="Copy server URL" />
              </li>
              <li>Save and restart the client when prompted. Select <strong className="text-eb-text">Authenticate</strong>, then sign in to EchoBrief and approve access.</li>
            </>
          ) : (
            <>
              <li>
                With the Codex CLI installed, run this in your terminal:
                <CopyCode value={CODEX_ADD_COMMAND} label="Copy add command" />
              </li>
              <li>
                Follow the browser sign-in prompt and approve access. If sign-in doesn’t open automatically, run:
                <CopyCode value={CODEX_LOGIN_COMMAND} label="Copy login command" />
              </li>
              <li>Start a new Codex session. Use <strong className="text-eb-text">/mcp</strong> to check that echobrief is available.</li>
            </>
          )}
        </ol>
        <div className="mt-5 rounded-input border border-eb-border bg-eb-card-alt p-3.5 text-[13px] leading-relaxed">
          <p className="font-medium text-eb-text">Try it in Codex</p>
          <p className="mt-1 text-eb-secondary">“Use EchoBrief to list the action items from my latest meeting.”</p>
          <p className="mt-2 text-eb-secondary">Access follows your EchoBrief permissions, including marking action items complete. Manage the connection under Access tokens below.</p>
        </div>
      </Dialog>
    </>
  );
}

function CopyCode({ value, label }: { value: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
      toast({ title: 'Could not copy', description: 'Select the text and copy it manually.', variant: 'destructive' });
    }
  };

  return (
    <div className="mt-2 rounded-code bg-eb-sidebar p-3">
      <code className="block whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed text-eb-code-fg">{value}</code>
      <button type="button" onClick={() => void copy()} aria-label={label} className="tap-44 mt-2 inline-flex h-8 items-center gap-1.5 rounded-pill bg-white/10 px-3 text-xs text-eb-code-fg hover:bg-white/20">
        {copied ? <Check size={13} /> : <Copy size={13} />}
        <span role="status">{copied ? 'Copied' : label}</span>
      </button>
    </div>
  );
}
