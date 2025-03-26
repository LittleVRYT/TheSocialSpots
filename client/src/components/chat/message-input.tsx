import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export function MessageInput({ onSendMessage, disabled }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Focus the input when the component mounts
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedMessage = message.trim();
    if (!trimmedMessage || disabled) {
      return;
    }
    
    onSendMessage(trimmedMessage);
    setMessage("");
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      handleSubmit(e);
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 p-3">
      <form onSubmit={handleSubmit} className="flex items-center space-x-2">
        <Input
          ref={inputRef}
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Type your message..."
          disabled={disabled}
          className="flex-1"
          autoComplete="off"
        />
        <Button 
          type="submit" 
          disabled={!message.trim() || disabled}
          className="bg-primary hover:bg-indigo-600 text-white px-4 py-2 rounded-md transition duration-200 flex items-center justify-center"
        >
          <Send className="h-4 w-4 mr-1" />
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
      <div className="text-xs text-gray-400 mt-1 pl-1">
        Press Enter to send
      </div>
    </div>
  );
}
