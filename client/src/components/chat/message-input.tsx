import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send } from "lucide-react";
import { VoiceRecorder } from "./voice-recorder";

interface MessageInputProps {
  onSendMessage: (message: string) => void;
  onSendVoiceMessage?: (text: string, voiceData: string, voiceDuration: number) => void;
  disabled?: boolean;
}

export function MessageInput({ onSendMessage, onSendVoiceMessage, disabled }: MessageInputProps) {
  const [message, setMessage] = useState("");
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
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

  const handleSendVoiceMessage = (voiceData: string, voiceDuration: number) => {
    if (onSendVoiceMessage) {
      onSendVoiceMessage("Voice message", voiceData, voiceDuration);
      setShowVoiceRecorder(false);
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 p-3">
      {showVoiceRecorder && onSendVoiceMessage ? (
        <div className="mb-3">
          <VoiceRecorder onSendVoiceMessage={handleSendVoiceMessage} />
          <div className="flex justify-end mt-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowVoiceRecorder(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
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
          {onSendVoiceMessage && (
            <Button 
              type="button" 
              variant="ghost"
              onClick={() => setShowVoiceRecorder(true)}
              disabled={disabled}
              className="bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-md transition duration-200"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18.5V19"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12v1a4 4 0 0 0 8 0v-1"/>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 12a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Z"/>
              </svg>
            </Button>
          )}
          <Button 
            type="submit" 
            disabled={!message.trim() || disabled}
            className="bg-primary hover:bg-indigo-600 text-white px-4 py-2 rounded-md transition duration-200 flex items-center justify-center"
          >
            <Send className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Send</span>
          </Button>
        </form>
      )}
      <div className="text-xs text-gray-400 mt-1 pl-1">
        {showVoiceRecorder ? 'Record a voice message' : 'Press Enter to send'}
      </div>
    </div>
  );
}
