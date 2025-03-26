import { useState, useEffect } from "react";
import { UsernameModal } from "./username-modal";
import { Header } from "./header";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { OnlineUsers } from "./online-users";
import { Leaderboard } from "./leaderboard";
import { useChat } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";
import { Globe, Wifi, Trophy } from "lucide-react";
import { ChatRegion, ChatMessage } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function ChatContainer() {
  const [username, setUsername] = useState<string | null>(null);
  const [isUsersVisible, setIsUsersVisible] = useState(false);
  const [isLeaderboardVisible, setIsLeaderboardVisible] = useState(false);
  const { toast } = useToast();
  
  const { 
    users, 
    messages, 
    connect, 
    disconnect, 
    sendMessage, 
    connectionStatus,
    error,
    chatMode,
    setChatMode,
    region,
    setRegion
  } = useChat();

  // Handle username submit
  const handleUsernameSubmit = (newUsername: string) => {
    setUsername(newUsername);
    connect(newUsername);
  };

  // Handle logout
  const handleLogout = () => {
    disconnect();
    setUsername(null);
  };

  // Toggle users sidebar on mobile
  const toggleUsersSidebar = () => {
    setIsUsersVisible(!isUsersVisible);
    if (isLeaderboardVisible) {
      setIsLeaderboardVisible(false);
    }
  };
  
  // Toggle leaderboard visibility
  const toggleLeaderboard = () => {
    setIsLeaderboardVisible(!isLeaderboardVisible);
    if (isUsersVisible) {
      setIsUsersVisible(false);
    }
  };
  
  // Handle connection errors
  useEffect(() => {
    if (error) {
      toast({
        title: "Error",
        description: error,
        variant: "destructive"
      });
    }
  }, [error, toast]);

  return (
    <div className="flex flex-col h-screen">
      {/* Username Modal */}
      <UsernameModal 
        isVisible={!username} 
        onSubmit={handleUsernameSubmit}
        takenUsernames={users.map(u => u.username)}
      />
      
      {/* Header */}
      <Header 
        username={username || ''} 
        onlineCount={users.length}
        onLogout={handleLogout}
      />
      
      {/* Chat Controls */}
      <div className="bg-gray-50 border-b border-gray-200 py-2 px-4">
        <div className="container mx-auto flex flex-wrap items-center gap-4 justify-between">
          {/* Chat Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Chat Mode:</span>
            <div className="flex items-center border rounded-md bg-white">
              <button 
                type="button"
                onClick={() => setChatMode('local')}
                className={`flex items-center gap-1 p-2 rounded-l-md ${chatMode === 'local' ? 'bg-primary/10 text-primary' : ''}`}
                aria-label="Local chat"
              >
                <Wifi className="h-4 w-4" />
                <span className="text-xs">Local</span>
              </button>
              <button 
                type="button"
                onClick={() => setChatMode('global')}
                className={`flex items-center gap-1 p-2 rounded-r-md ${chatMode === 'global' ? 'bg-primary/10 text-primary' : ''}`}
                aria-label="Global chat"
              >
                <Globe className="h-4 w-4" />
                <span className="text-xs">Global</span>
              </button>
            </div>
          </div>
          
          {/* Region Selection */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Region:</span>
            <select 
              value={region}
              onChange={(e) => setRegion(e.target.value as ChatRegion)}
              disabled={chatMode === 'local'}
              className="w-36 h-9 rounded-md border border-input px-3 py-1 text-sm shadow-sm"
            >
              <option value={ChatRegion.GLOBAL}>🌎 Global</option>
              <option value={ChatRegion.NORTH_AMERICA}>🇺🇸 North America</option>
              <option value={ChatRegion.EUROPE}>🇪🇺 Europe</option>
              <option value={ChatRegion.ASIA}>🇯🇵 Asia</option>
              <option value={ChatRegion.SOUTH_AMERICA}>🇧🇷 South America</option>
              <option value={ChatRegion.AFRICA}>🇿🇦 Africa</option>
              <option value={ChatRegion.OCEANIA}>🇦🇺 Oceania</option>
            </select>
          </div>
          
          {/* Leaderboard Toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={toggleLeaderboard}
              className={`flex items-center gap-1 px-3 py-2 rounded-md border ${
                isLeaderboardVisible ? 'bg-primary/10 text-primary border-primary/30' : 'bg-white'
              }`}
            >
              <Trophy className="h-4 w-4" />
              <span className="text-xs font-medium">Leaderboard</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Messages and Input */}
        <div className="flex-1 flex flex-col">
          <MessageList 
            messages={messages} 
            currentUsername={username || ''}
          />
          <MessageInput 
            onSendMessage={sendMessage} 
            disabled={connectionStatus !== 'connected'}
          />
        </div>
        
        {/* Online Users Sidebar */}
        <OnlineUsers 
          users={users} 
          currentUsername={username || ''} 
          visible={isUsersVisible}
          onToggleVisibility={toggleUsersSidebar}
        />
        
        {/* Leaderboard Sidebar */}
        <div className={`h-full border-l w-80 flex-shrink-0 bg-background overflow-y-auto ${
          isLeaderboardVisible ? 'block' : 'hidden'
        } md:relative absolute right-0 top-0 bottom-0 z-50`}>
          <div className="p-4 h-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Leaderboard</h2>
              <button 
                onClick={toggleLeaderboard}
                className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <Leaderboard visible={isLeaderboardVisible} />
          </div>
        </div>
      </main>
    </div>
  );
}
