import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/ui/user-avatar";

interface PrivateMessageDialogProps {
  isOpen: boolean;
  recipient: string;
  recipientColor?: string; // Potential friend color
  onSend: (message: string) => void;
  onClose: () => void;
}

export function PrivateMessageDialog({
  isOpen,
  recipient,
  recipientColor,
  onSend,
  onClose
}: PrivateMessageDialogProps) {
  const [message, setMessage] = useState("");
  
  const handleSend = () => {
    if (message.trim()) {
      onSend(message.trim());
      setMessage("");
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserAvatar 
              username={recipient} 
              size="sm" 
              avatarColor={recipientColor}
            />
            <span>Message to {recipient}</span>
          </DialogTitle>
        </DialogHeader>
        
        <div className="py-4">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`Type your private message to ${recipient}...`}
            className="min-h-[100px]"
            autoFocus
          />
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSend}
            disabled={!message.trim()}
          >
            Send Private Message
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}