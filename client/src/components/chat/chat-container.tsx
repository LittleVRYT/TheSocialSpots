import { useState, useEffect } from "react";
import { UsernameModal } from "./username-modal";
import { Header } from "./header";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { OnlineUsers } from "./online-users";
import { useChat } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";

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
    error
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
