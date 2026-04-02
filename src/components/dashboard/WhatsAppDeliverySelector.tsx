import { useState } from 'react';
import { MessageCircle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

interface WhatsAppDeliverySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  onSend: (phoneNumber: string) => Promise<void>;
}

export function WhatsAppDeliverySelector({
  open,
  onOpenChange,
  meetingTitle,
  onSend,
}: WhatsAppDeliverySelectorProps) {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!phoneNumber.trim()) {
      toast({ title: 'Error', description: 'Please enter a phone number', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      await onSend(phoneNumber);
      toast({ title: 'Sent', description: 'Meeting report sent to WhatsApp' });
      setPhoneNumber('');
      onOpenChange(false);
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to send', variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <MessageCircle size={20} style={{ color: '#25D366' }} />
            Send to WhatsApp
          </AlertDialogTitle>
          <AlertDialogDescription>
            Send the meeting report "{meetingTitle}" to a WhatsApp number
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="py-4">
          <label className="block text-sm font-medium mb-2" style={{ color: '#FAFAF9' }}>
            Phone Number
          </label>
          <input
            type="tel"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+1 (555) 123-4567"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: '#1C1917',
              border: '1px solid #292524',
              color: '#FAFAF9',
            }}
            disabled={sending}
          />
          <p className="text-xs mt-2" style={{ color: '#78716C' }}>
            Include country code (e.g., +1 for USA, +91 for India)
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSend}
            disabled={sending}
            style={{ background: '#25D366', color: '#fff' }}
          >
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Send Report
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
