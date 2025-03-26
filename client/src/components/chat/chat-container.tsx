import { useState, useEffect } from "react";
import { UsernameModal } from "./username-modal";
import { Header } from "./header";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { OnlineUsers } from "./online-users";
import { useChat } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";
import { Toggle } from "@/components/ui/toggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Wifi } from "lucide-react";
import { ChatRegion } from "@shared/schema";

export function ChatContainer() {
  const [username, setUsername] = useState<string | null>(null);
  const [isUsersVisible, setIsUsersVisible] = useState(false);
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
              <Toggle 
                pressed={chatMode === 'local'} 
                onPressedChange={() => setChatMode('local')}
                className={`gap-1 p-2 ${chatMode === 'local' ? 'bg-primary/10 text-primary' : ''}`}
                aria-label="Local chat"
              >
                <Wifi className="h-4 w-4" />
                <span className="text-xs">Local</span>
              </Toggle>
              <Toggle 
                pressed={chatMode === 'global'} 
                onPressedChange={() => setChatMode('global')}
                className={`gap-1 p-2 ${chatMode === 'global' ? 'bg-primary/10 text-primary' : ''}`}
                aria-label="Global chat"
              >
                <Globe className="h-4 w-4" />
                <span className="text-xs">Global</span>
              </Toggle>
            </div>
          </div>
          
          {/* Region Selection */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Region:</span>
            <Select 
              value={region} 
              onValueChange={(val) => setRegion(val as ChatRegion)}
              disabled={chatMode === 'local'}
            >
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Select Region" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ChatRegion.GLOBAL}>🌎 Global</SelectItem>
                <SelectItem value={ChatRegion.NORTH_AMERICA}>🇺🇸 North America</SelectItem>
                <SelectItem value={ChatRegion.EUROPE}>🇪🇺 Europe</SelectItem>
                <SelectItem value={ChatRegion.ASIA}>🇯🇵 Asia</SelectItem>
                <SelectItem value={ChatRegion.SOUTH_AMERICA}>🇧🇷 South America</SelectItem>
                <SelectItem value={ChatRegion.AFRICA}>🇿🇦 Africa</SelectItem>
                <SelectItem value={ChatRegion.OCEANIA}>🇦🇺 Oceania</SelectItem>
              </SelectContent>
            </Select>
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
      </main>
    </div>
  );
}
