import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { UsernameModal } from "./username-modal";
import { Header } from "./header";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { OnlineUsers } from "./online-users";
import { Leaderboard } from "./leaderboard";
import { FriendPanel } from "./friend-panel";
import { SettingsPanel } from "./settings-panel";
import { ChatroomSelector } from "./chatroom-selector";
import { PrivateMessageDialog } from "./private-message-dialog";
import { useChat } from "@/hooks/use-chat";
import { useToast } from "@/hooks/use-toast";
import { useIdleTimeout } from "@/hooks/use-idle-timeout";
import { Globe, Wifi, Trophy, UserPlus, Settings } from "lucide-react";
import { ChatRegion, ChatRoom, ChatMessage, FriendStatus } from "@shared/schema";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

export function ChatContainer() {
  const [username, setUsername] = useState<string | null>(null);
  const [isUsersVisible, setIsUsersVisible] = useState(false);
  const [isLeaderboardVisible, setIsLeaderboardVisible] = useState(false);
  const [isFriendPanelVisible, setIsFriendPanelVisible] = useState(false);
  const [isSettingsPanelVisible, setIsSettingsPanelVisible] = useState(false);
  const [isPrivateMessageDialogOpen, setIsPrivateMessageDialogOpen] = useState(false);
  const [privateMessageRecipient, setPrivateMessageRecipient] = useState("");
  const [privateMessageRecipientColor, setPrivateMessageRecipientColor] = useState("");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const { 
    users, 
    messages, 
    connect, 
    disconnect, 
    sendMessage, 
    sendPrivateMessage,
    sendVoiceMessage,
    sendPrivateVoiceMessage,
    connectionStatus,
    error,
    chatMode,
    setChatMode,
    region,
    setRegion,
    chatRoom,
    setChatRoom,
    roomCounts,
    addReaction,
    removeReaction,
    // Friend system
    friends,
    friendRequests,
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    updateFriendColor,
    privateMessages,
    // Site status
    siteStatus
  } = useChat();

  // Handle username submit
  const handleUsernameSubmit = (newUsername: string, selectedRoom?: ChatRoom) => {
    setUsername(newUsername);
    connect(newUsername);
    
    // If a room was selected during login, switch to that room
    if (selectedRoom) {
      setChatRoom(selectedRoom);
    }
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
    if (isFriendPanelVisible) {
      setIsFriendPanelVisible(false);
    }
  };
  
  // Toggle leaderboard visibility
  const toggleLeaderboard = (e?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // If event is provided, prevent default behavior and stop propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsLeaderboardVisible(prev => !prev);
    
    // Close other panels if they're open
    if (isUsersVisible) {
      setIsUsersVisible(false);
    }
    if (isFriendPanelVisible) {
      setIsFriendPanelVisible(false);
    }
    if (isSettingsPanelVisible) {
      setIsSettingsPanelVisible(false);
    }
  };
  
  // Toggle friend panel visibility
  const toggleFriendPanel = (e?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // If event is provided, prevent default behavior and stop propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Toggle the panel visibility
    setIsFriendPanelVisible(prev => !prev);
    
    // Close other panels if they're open
    if (isLeaderboardVisible) {
      setIsLeaderboardVisible(false);
    }
    if (isUsersVisible) {
      setIsUsersVisible(false);
    }
    if (isSettingsPanelVisible) {
      setIsSettingsPanelVisible(false);
    }
  };
  
  // Toggle settings panel visibility
  const toggleSettingsPanel = (e?: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    // If event is provided, prevent default behavior and stop propagation
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    setIsSettingsPanelVisible(prev => !prev);
    
    // Close other panels if they're open
    if (isLeaderboardVisible) {
      setIsLeaderboardVisible(false);
    }
    if (isUsersVisible) {
      setIsUsersVisible(false);
    }
    if (isFriendPanelVisible) {
      setIsFriendPanelVisible(false);
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
  
  // Handle idle timeout (10 minutes)
  const handleUserIdle = () => {
    if (username) {
      // Disconnect user
      disconnect();
      setUsername(null);
      
      // Show toast notification
      toast({
        title: "Session expired",
        description: "You have been logged out due to inactivity",
        variant: "default"
      });
      
      // Redirect to login page
      setLocation("/");
    }
  };
  
  // Set up idle timeout
  useIdleTimeout({
    onIdle: handleUserIdle,
    idleTime: 10 // 10 minutes
  });

  return (
    <div className="flex flex-col h-screen">
      {/* Username Modal */}
      <UsernameModal 
        isVisible={!username} 
        onSubmit={handleUsernameSubmit}
        takenUsernames={users.map(u => u.username)}
        siteStatus={siteStatus}
      />
      
      {/* Private Message Dialog */}
      <PrivateMessageDialog
        isOpen={isPrivateMessageDialogOpen}
        recipient={privateMessageRecipient}
        recipientColor={privateMessageRecipientColor}
        onSend={(message) => {
          if (message.trim()) {
            sendPrivateMessage(message.trim(), privateMessageRecipient);
            toast({
              title: "Private Message Sent",
              description: `Message sent to ${privateMessageRecipient}`,
              variant: "default"
            });
          }
        }}
        onClose={() => setIsPrivateMessageDialogOpen(false)}
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
          
          {/* Leaderboard, Friends & Settings Toggles */}
          <div className="flex items-center gap-2">
            <Button
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                toggleLeaderboard();
              }}
              variant={isLeaderboardVisible ? "default" : "outline"}
              size="sm"
              aria-pressed={isLeaderboardVisible}
              aria-label="Toggle Leaderboard"
            >
              <Trophy className="h-4 w-4 mr-1" />
              <span className="text-xs font-medium">Leaderboard</span>
            </Button>
            
            <Button
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFriendPanel();
              }}
              variant={isFriendPanelVisible ? "default" : "outline"}
              size="sm"
              className="relative"
              aria-pressed={isFriendPanelVisible}
              aria-label="Toggle Friends Panel"
            >
              <UserPlus className="h-4 w-4 mr-1" />
              <span className="text-xs font-medium">Friends</span>
              {friendRequests.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {friendRequests.length}
                </span>
              )}
            </Button>
            
            <Button
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                toggleSettingsPanel();
              }}
              variant={isSettingsPanelVisible ? "default" : "outline"}
              size="sm"
              aria-pressed={isSettingsPanelVisible}
              aria-label="Toggle Settings Panel"
            >
              <Settings className="h-4 w-4 mr-1" />
              <span className="text-xs font-medium">Settings</span>
            </Button>
          </div>
        </div>
      </div>
      
      {/* Main Chat Area */}
      <main className="flex-1 flex overflow-hidden">
        {/* Chat Messages and Input */}
        <div className="flex-1 flex flex-col">
          {/* Chatroom Selector */}
          <div className="p-3 border-b">
            <ChatroomSelector 
              currentRoom={chatRoom}
              roomCounts={roomCounts}
              onRoomChange={setChatRoom}
            />
          </div>
          
          <MessageList 
            messages={messages} 
            currentUsername={username || ''}
            users={users}
            friends={friends}
            onAddReaction={addReaction}
            onRemoveReaction={removeReaction}
          />
          <MessageInput 
            onSendMessage={sendMessage}
            onSendVoiceMessage={sendVoiceMessage} 
            disabled={connectionStatus !== 'connected'}
          />
        </div>
        
        {/* Online Users Sidebar */}
        <OnlineUsers 
          users={users} 
          currentUsername={username || ''} 
          visible={isUsersVisible}
          friends={friends}
          onSendPrivateMessage={(recipient) => {
            // Find if this user is actually a friend
            const isFriend = friends.some(f => 
              f.username === recipient && f.status === FriendStatus.ACCEPTED
            );
            
            if (!isFriend) {
              toast({
                title: "Cannot send private message",
                description: "You can only send private messages to your friends",
                variant: "destructive"
              });
              return;
            }
            
            // Get friend color if available
            const friendColor = friends.find(f => 
              f.username === recipient && f.status === FriendStatus.ACCEPTED
            )?.color;
            
            // Open the private message dialog
            setPrivateMessageRecipient(recipient);
            setPrivateMessageRecipientColor(friendColor || "");
            setIsPrivateMessageDialogOpen(true);
          }}
          onToggleVisibility={toggleUsersSidebar}
        />
        
        {/* Leaderboard Sidebar */}
        {isLeaderboardVisible && (
          <div className="h-full border-l w-80 flex-shrink-0 bg-background overflow-y-auto md:relative absolute right-0 top-0 bottom-0 z-50">
            <div className="p-4 h-full">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg font-semibold">Leaderboard</h2>
                <Button
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleLeaderboard();
                  }}
                  variant="ghost"
                  size="sm"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </Button>
              </div>
              <Leaderboard visible={true} />
            </div>
          </div>
        )}
        
        {/* Friend Panel Sidebar */}
        {isFriendPanelVisible && (
          <div className="h-full border-l w-80 flex-shrink-0 bg-background overflow-y-auto md:relative absolute right-0 top-0 bottom-0 z-50">
            <FriendPanel
              visible={true}
              currentUsername={username || ''}
              allUsers={users}
              friends={friends}
              friendRequests={friendRequests}
              onSendFriendRequest={sendFriendRequest}
              onAcceptFriendRequest={acceptFriendRequest}
              onRejectFriendRequest={rejectFriendRequest}
              onRemoveFriend={removeFriend}
              onUpdateFriendColor={updateFriendColor}
              onClose={toggleFriendPanel}
            />
          </div>
        )}
        
        {/* Settings Panel Sidebar */}
        {isSettingsPanelVisible && (
          <div className="h-full border-l w-80 flex-shrink-0 bg-background overflow-y-auto md:relative absolute right-0 top-0 bottom-0 z-50">
            <SettingsPanel
              visible={true}
              currentUsername={username || ''}
              onClose={toggleSettingsPanel}
              siteStatus={siteStatus}
            />
          </div>
        )}
      </main>
    </div>
  );
}
