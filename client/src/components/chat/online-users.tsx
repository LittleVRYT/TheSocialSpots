import { ChatUser, Friend, FriendStatus } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Users, MessageSquare } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface OnlineUsersProps {
  users: ChatUser[];
  currentUsername: string;
  visible: boolean;
  friends: Friend[];
  onSendPrivateMessage?: (username: string) => void;
  onToggleVisibility: () => void;
}

export function OnlineUsers({ users, currentUsername, visible, friends, onSendPrivateMessage, onToggleVisibility }: OnlineUsersProps) {
  const sortedUsers = [...users].sort((a, b) => {
    // Current user always at the top
    if (a.username === currentUsername) return -1;
    if (b.username === currentUsername) return 1;
    
    // Friends next
    const aIsFriend = friends.some(f => f.username === a.username && f.status === FriendStatus.ACCEPTED);
    const bIsFriend = friends.some(f => f.username === b.username && f.status === FriendStatus.ACCEPTED);
    
    if (aIsFriend && !bIsFriend) return -1;
    if (!aIsFriend && bIsFriend) return 1;
    
    // Then sort alphabetically
    return a.username.localeCompare(b.username);
  });

  // Function to check if a user is an accepted friend
  const isFriend = (username: string): boolean => {
    return friends.some(f => f.username === username && f.status === FriendStatus.ACCEPTED);
  };
  
  // Function to get friend's color if available
  const getFriendColor = (username: string): string | undefined => {
    const friend = friends.find(f => f.username === username && f.status === FriendStatus.ACCEPTED);
    return friend?.color;
  };

  return (
    <>
      <div 
        className={`md:block w-72 bg-white border-l border-gray-200 overflow-y-auto 
                   ${visible ? 'fixed inset-0 z-40' : 'hidden'} md:static md:z-0`}
      >
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800">Online Users</h2>
          <p className="text-sm text-gray-500">{users.length} users online</p>
        </div>
        <div className="divide-y divide-gray-100">
          {sortedUsers.map(user => (
            <div key={user.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
              <div className="flex items-center">
                <div className="w-2 h-2 bg-success rounded-full mr-2"></div>
                <UserAvatar 
                  username={user.username} 
                  isCurrentUser={user.username === currentUsername}
                  avatarColor={user.avatarColor}
                  avatarShape={user.avatarShape}
                  avatarInitials={user.avatarInitials}
                  size="sm"
                />
                <span className={`font-medium ml-2 ${user.username !== currentUsername && isFriend(user.username) && getFriendColor(user.username) ? '' : 'text-gray-800'}`} 
                      style={
                        user.username !== currentUsername && 
                        isFriend(user.username) && 
                        getFriendColor(user.username) 
                          ? { color: getFriendColor(user.username) } 
                          : {}
                      }>
                  {user.username}
                  {user.username === currentUsername && (
                    <span className="ml-2 text-xs bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded-full">You</span>
                  )}
                  {isFriend(user.username) && user.username !== currentUsername && (
                    <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">Friend</span>
                  )}
                </span>
              </div>
              
              {/* Private Message Button - Only visible for friends */}
              {user.username !== currentUsername && isFriend(user.username) && onSendPrivateMessage && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="h-8 w-8 rounded-full"
                        onClick={() => onSendPrivateMessage(user.username)}
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Send private message</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          ))}
        </div>
      </div>

      <Button 
        className="md:hidden fixed bottom-20 right-4 bg-primary text-white rounded-full w-12 h-12 flex items-center justify-center shadow-lg z-10"
        onClick={onToggleVisibility}
      >
        <Users className="h-5 w-5" />
      </Button>
    </>
  );
}
