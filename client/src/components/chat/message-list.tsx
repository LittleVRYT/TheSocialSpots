import { useRef, useEffect, useState, useCallback } from "react";
import { format } from "date-fns";
import { ChatMessage } from "@shared/schema";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Smile, Play, Pause } from "lucide-react";

interface MessageListProps {
  messages: ChatMessage[];
  currentUsername: string;
  users?: { 
    username: string; 
    avatarColor?: string; 
    avatarShape?: 'circle' | 'square' | 'rounded'; 
    avatarInitials?: string; 
  }[];
  onAddReaction?: (messageId: string, emoji: string) => void;
  onRemoveReaction?: (messageId: string, emoji: string) => void;
  friends?: { username: string; color?: string }[];
}

export function MessageList({ 
  messages, 
  currentUsername, 
  users = [], 
  onAddReaction, 
  onRemoveReaction,
  friends = []
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);
  const [playingAudio, setPlayingAudio] = useState<string | null>(null);
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  
  // Common emoji reactions
  const commonEmojis = ['👍', '❤️', '😂', '🔥', '👏', '🎉', '🤔', '😢', '😮', '👎'];

  // Handle playing/pausing voice messages
  const toggleAudioPlayback = useCallback((messageId: string, voiceData: string) => {
    // Create or get audio element for this message
    let audioElement = audioRefs.current.get(messageId);
    
    if (!audioElement) {
      audioElement = new Audio(voiceData);
      audioRefs.current.set(messageId, audioElement);
      
      // Add event listener for when audio finishes playing
      audioElement.addEventListener('ended', () => {
        setPlayingAudio(null);
      });
    }
    
    // If this message's audio is already playing, pause it
    if (playingAudio === messageId) {
      audioElement.pause();
      setPlayingAudio(null);
    } else {
      // If another audio is playing, pause it first
      if (playingAudio && audioRefs.current.has(playingAudio)) {
        const currentPlaying = audioRefs.current.get(playingAudio);
        if (currentPlaying) {
          currentPlaying.pause();
        }
      }
      
      // Play this message's audio
      audioElement.play().catch(err => {
        console.error("Error playing audio:", err);
      });
      setPlayingAudio(messageId);
    }
  }, [playingAudio]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    scrollToBottom();
  }, [messages.length]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };
  
  // Handle adding a reaction
  const handleAddReaction = (messageId: string, emoji: string) => {
    if (onAddReaction) {
      onAddReaction(messageId, emoji);
    }
  };
  
  // Handle removing a reaction
  const handleRemoveReaction = (messageId: string, emoji: string) => {
    if (onRemoveReaction) {
      onRemoveReaction(messageId, emoji);
    }
  };
  
  // Check if current user has reacted with a specific emoji
  const hasUserReacted = (reactions: Record<string, string[]> | undefined, emoji: string): boolean => {
    if (!reactions || !reactions[emoji]) return false;
    return reactions[emoji].includes(currentUsername);
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
  
  // Get friend color if user is a friend
  const getFriendColor = (username: string): string | undefined => {
    const friend = friends.find(f => f.username === username);
    return friend?.color;
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
                          {getFriendColor(message.username) ? (
                            <span 
                              className="font-medium mr-2" 
                              style={{ color: getFriendColor(message.username) }}
                            >
                              {message.username}
                            </span>
                          ) : (
                            <span className="font-medium text-gray-900 mr-2">{message.username}</span>
                          )}
                          <span className="text-xs text-gray-500">{formatTime(message.timestamp)}</span>
                        </>
                      )}
                    </div>
                    <div 
                      className={`relative group ${
                        message.username === currentUsername 
                          ? "bg-primary bg-opacity-10 p-3 rounded-lg shadow-sm border border-primary border-opacity-20" 
                          : "bg-white p-3 rounded-lg shadow-sm border border-gray-200"
                      }`}
                    >
                      {message.isVoiceMessage && message.voiceData ? (
                        <div className="voice-message-container">
                          <div className="flex items-center gap-2 mb-2">
                            <button 
                              className="play-button bg-primary text-white rounded-full w-8 h-8 flex items-center justify-center"
                              onClick={() => toggleAudioPlayback(message.id, message.voiceData!)}
                            >
                              {playingAudio === message.id ? (
                                <Pause className="h-4 w-4" />
                              ) : (
                                <Play className="h-4 w-4" />
                              )}
                            </button>
                            <div className="voice-waveform bg-gray-200 h-6 flex-grow rounded-md">
                              <div 
                                className={`bg-primary h-full rounded-md transition-all duration-200`} 
                                style={{ 
                                  width: playingAudio === message.id ? '100%' : '0%',
                                  transition: playingAudio === message.id ? 'width linear' : 'none',
                                  transitionDuration: playingAudio === message.id && message.voiceDuration ? `${message.voiceDuration}s` : '0s' 
                                }}
                              />
                            </div>
                            <span className="voice-duration text-xs text-gray-500">
                              {message.voiceDuration ? `${Math.round(message.voiceDuration)}s` : '0:00'}
                            </span>
                          </div>
                          <p className="text-gray-600 text-sm">{message.text}</p>
                        </div>
                      ) : (
                        <p className="text-gray-800">{message.text}</p>
                      )}
                      
                      {/* Emoji Reaction Button */}
                      <div className="absolute right-0 -top-3 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 w-7 rounded-full p-0"
                              onClick={() => setActiveMessageId(message.id)}
                            >
                              <Smile className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-2 bg-white" align="end">
                            <div className="flex gap-1 flex-wrap max-w-[200px]">
                              {commonEmojis.map(emoji => (
                                <button
                                  key={emoji}
                                  className="hover:bg-gray-100 p-1 rounded-md transition-colors"
                                  onClick={() => {
                                    if (hasUserReacted(message.reactions, emoji)) {
                                      handleRemoveReaction(message.id, emoji);
                                    } else {
                                      handleAddReaction(message.id, emoji);
                                    }
                                  }}
                                >
                                  <span className="text-lg">{emoji}</span>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                      
                      {/* Display existing reactions */}
                      {message.reactions && Object.keys(message.reactions).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {Object.entries(message.reactions).map(([emoji, users]) => (
                            users.length > 0 && (
                              <button
                                key={emoji}
                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${
                                  hasUserReacted(message.reactions, emoji)
                                    ? 'bg-primary bg-opacity-20 text-primary'
                                    : 'bg-gray-100 text-gray-800'
                                }`}
                                onClick={() => {
                                  if (hasUserReacted(message.reactions, emoji)) {
                                    handleRemoveReaction(message.id, emoji);
                                  } else {
                                    handleAddReaction(message.id, emoji);
                                  }
                                }}
                                title={users.join(', ')}
                              >
                                <span>{emoji}</span>
                                <span>{users.length}</span>
                              </button>
                            )
                          ))}
                        </div>
                      )}
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
