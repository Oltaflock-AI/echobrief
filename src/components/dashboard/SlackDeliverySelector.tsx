import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Send, User, Hash, Loader2, MessageSquare } from 'lucide-react';

interface SlackDeliverySelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetingTitle: string;
  defaultChannel?: string;
  defaultChannelName?: string;
  onSend: (destination: { type: 'dm' | 'channel'; channelId: string; channelName?: string }) => Promise<void>;
}

export function SlackDeliverySelector({
  open,
  onOpenChange,
  meetingTitle,
  defaultChannel,
  defaultChannelName,
  onSend,
}: SlackDeliverySelectorProps) {
  const [deliveryType, setDeliveryType] = useState<'dm' | 'channel'>('channel');
  const [channelId, setChannelId] = useState(defaultChannel || '');
  const [channelName, setChannelName] = useState(defaultChannelName || '');
  const [sending, setSending] = useState(false);

  // Load last used channel from localStorage
  useEffect(() => {
    const lastChannel = localStorage.getItem('echobrief-last-slack-channel');
    const lastChannelName = localStorage.getItem('echobrief-last-slack-channel-name');
    if (lastChannel && !defaultChannel) {
      setChannelId(lastChannel);
      setChannelName(lastChannelName || '');
    }
  }, [defaultChannel]);

  const handleSend = async () => {
    if (deliveryType === 'channel' && !channelId.trim()) return;
    
    setSending(true);
    try {
      // Save last used channel
      if (deliveryType === 'channel' && channelId) {
        localStorage.setItem('echobrief-last-slack-channel', channelId);
        localStorage.setItem('echobrief-last-slack-channel-name', channelName);
      }
      
      await onSend({
        type: deliveryType,
        channelId: deliveryType === 'dm' ? 'me' : channelId.trim(),
        channelName: deliveryType === 'dm' ? 'Direct Message' : channelName,
      });
      
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to send to Slack:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-accent" />
            Send to Slack
          </DialogTitle>
          <DialogDescription>
            Choose where to send the summary for "{meetingTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={deliveryType}
            onValueChange={(val) => setDeliveryType(val as 'dm' | 'channel')}
            className="space-y-3"
          >
            <motion.div
              whileTap={{ scale: 0.98 }}
              className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                deliveryType === 'dm' 
                  ? 'border-accent bg-accent/5' 
                  : 'border-border hover:bg-secondary/50'
              }`}
              onClick={() => setDeliveryType('dm')}
            >
              <RadioGroupItem value="dm" id="dm" />
              <Label htmlFor="dm" className="flex items-center gap-2 cursor-pointer flex-1">
                <User className="w-4 h-4 text-muted-foreground" />
                <span>Send to me (DM)</span>
              </Label>
            </motion.div>

            <motion.div
              whileTap={{ scale: 0.98 }}
              className={`flex items-start space-x-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                deliveryType === 'channel' 
                  ? 'border-accent bg-accent/5' 
                  : 'border-border hover:bg-secondary/50'
              }`}
              onClick={() => setDeliveryType('channel')}
            >
              <RadioGroupItem value="channel" id="channel" className="mt-1" />
              <div className="flex-1 space-y-2">
                <Label htmlFor="channel" className="flex items-center gap-2 cursor-pointer">
                  <Hash className="w-4 h-4 text-muted-foreground" />
                  <span>Send to channel</span>
                </Label>
                
                <AnimatePresence>
                  {deliveryType === 'channel' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.15 }}
                      className="space-y-2 pt-2"
                    >
                      <Input
                        placeholder="Channel ID (e.g., C01234567)"
                        value={channelId}
                        onChange={(e) => setChannelId(e.target.value)}
                        className="bg-card"
                      />
                      <Input
                        placeholder="Channel name (optional)"
                        value={channelName}
                        onChange={(e) => setChannelName(e.target.value)}
                        className="bg-card"
                      />
                      <p className="text-xs text-muted-foreground">
                        Find channel ID in Slack channel settings
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </RadioGroup>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend} 
            disabled={sending || (deliveryType === 'channel' && !channelId.trim())}
            className="gap-2"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Send Summary
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
