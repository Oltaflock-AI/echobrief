import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Upload, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Upload a recording that no bot attended — a phone call, an in-person
 * conversation, a file someone sent you.
 *
 * The file goes STRAIGHT from this browser to blob storage and never through
 * our API: a serverless function's request body is capped at a few megabytes,
 * so a long recording could not be posted to one, and Supabase Storage refuses
 * anything over 50 MiB — which is roughly 55 minutes of audio, so the
 * recordings most worth transcribing are exactly the ones it rejects.
 * `/api/upload` only authorises the transfer and hears when it finished.
 */

// Mirrors ALLOWED_CONTENT_TYPES in prepare-upload / api/upload.ts, which
// upload_parity_test.ts keeps equal. This is the file-picker filter only —
// the server is the authority and re-checks.
const ACCEPT = [
  'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
  'audio/wav', 'audio/x-wav', 'audio/webm', 'audio/ogg', 'audio/flac',
  'video/mp4', 'video/webm', 'video/quicktime',
].join(',');

interface UploadButtonProps {
  onUploaded?: (meetingId: string) => void;
  /**
   * Draw a different trigger and keep this component's picker and upload logic.
   * The shell passes the Console icon button; omitting it falls back to this
   * component's own button.
   */
  renderTrigger?: (open: () => void, busy: boolean) => React.ReactNode;
}

export function UploadButton({ onUploaded, renderTrigger }: UploadButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFile = async (file: File) => {
    setError(null);
    setBusy(true);
    setProgress(0);
    setFileName(file.name);

    try {
      // The upload is authorised as the signed-in user. /api/upload forwards
      // this token to Supabase rather than trusting anything in the payload.
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Your session expired. Sign in again to upload.');

      await upload(file.name, file, {
        access: 'private',
        handleUploadUrl: '/api/upload',
        // Large recordings are the normal case here, so parts are uploaded in
        // parallel and a failed part is retried rather than the whole file.
        multipart: true,
        contentType: file.type,
        clientPayload: JSON.stringify({
          access_token: accessToken,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
        }),
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });

      toast({
        title: 'Upload complete',
        description: 'Transcription has started. The meeting will appear when it is ready.',
      });
      onUploaded?.('');
    } catch (err: any) {
      // A refusal is usually actionable — a plan limit, or a file type we do
      // not accept — so show what the server said rather than a generic error.
      const message = err?.message || 'Upload failed';
      setError(message);
      toast({ title: 'Upload failed', description: message, variant: 'destructive' });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {renderTrigger ? (
        renderTrigger(() => inputRef.current?.click(), busy)
      ) : (
        <Button
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          Upload
        </Button>
      )}

      <Dialog open={busy} onOpenChange={() => { /* not dismissable mid-transfer */ }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Uploading {fileName}</DialogTitle>
            <DialogDescription>
              Keep this tab open until the upload finishes. Transcription starts on its own
              afterwards, and you can close the tab then.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground">{progress}%</p>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
