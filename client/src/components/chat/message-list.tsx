import { useRef, useEffect } from "react";
import { format } from "date-fns";
import { ChatMessage } from "@shared/schema";
import { UserAvatar } from "@/components/ui/user-avatar";

interface MessageListProps {
  messages: ChatMessage[];
  currentUsername: string;
  users?: { 
    username: string; 
    avatarColor?: string; 
    avatarShape?: 'circle' | 'square' | 'rounded'; 
    avatarInitials?: string; 
  }[];
}

export function MessageList({ messages, currentUsername, users = [] }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Group messages by date for date separators
  const messagesByDate: Record<string, ChatMessage[]> = {};
  
  messages.forEach(message => {
    const dateKey = format(new Date(message.timestamp), 'yyyy-MM-dd');
    if (!messagesByDate[dateKey]) {
      messagesByDate[dateKey] = [];
    }
    messagesByDate[dateKey].push(message);
  });

  // Format message timestamp
  const formatTime = (timestamp: Date | string): string => {
    return format(new Date(timestamp), 'h:mm a');
  };

  const getDateDisplay = (dateKey: string): string => {
    const date = new Date(dateKey);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) {
      return 'Today';
    } else if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) {
      return 'Yesterday';
    } else {
      return format(date, 'MMMM d, yyyy');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 message-area chat-container">
      {Object.keys(messagesByDate).map(dateKey => (
        <div key={dateKey}>
          <div className="flex justify-center my-3">
            <div className="bg-gray-100 px-3 py-1 rounded-full text-sm text-gray-500">
              <span>{getDateDisplay(dateKey)}</span>
            </div>
          </div>
          
          {messagesByDate[dateKey].map(message => (
            <div key={message.id}>
              {message.type === 'system' ? (
                <div className="flex justify-center my-2">
                  <div className="bg-gray-100 px-3 py-1 rounded-full text-xs text-gray-600">
                    <span>{message.text}</span>
                  </div>
                </div>
              ) : (
                <div className={`flex items-start mb-4 ${message.username === currentUsername ? 'justify-end' : ''}`}>
                  <div className="flex-1 max-w-3xl">
                    <div className={`flex items-baseline mb-1 ${message.username === currentUsername ? 'justify-end' : ''}`}>
                      {message.username === currentUsername ? (
                        <>
                          <span className="text-xs text-gray-500 mr-2">{formatTime(message.timestamp)}</span>
                          <span className="font-medium text-primary">{message.username}</span>
                        </>
                      ) : (
                        <>
                          <span className="font-medium text-gray-900 mr-2">{message.username}</span>
                          <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>
                        </>
                      )}
                    </div>
                    <div className={
                      message.username === currentUsername 
                        ? "bg-primary bg-opacity-10 p-3 rounded-lg shadow-sm border border-primary border-opacity-20" 
                        : "bg-white p-3 rounded-lg shadow-sm border border-gray-200"
                    }>
                      <p className="text-gray-800">{message.text}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
