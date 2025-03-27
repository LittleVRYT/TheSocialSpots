import React, { useState, useEffect } from 'react';
import { Friend, FriendStatus } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserPlus, Check, X, Trash2, PaintBucket, Users } from 'lucide-react';

interface FriendPanelProps {
  visible: boolean;
  currentUsername: string;
  allUsers: { username: string }[];
  friends: Friend[];
  friendRequests: Friend[];
  onSendFriendRequest: (username: string) => void;
  onAcceptFriendRequest: (username: string) => void;
  onRejectFriendRequest: (username: string) => void;
  onRemoveFriend: (username: string) => void;
  onUpdateFriendColor: (username: string, color: string) => void;
  onClose: () => void;
}

export function FriendPanel({
  visible,
  currentUsername,
  allUsers,
  friends,
  friendRequests,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRejectFriendRequest,
  onRemoveFriend,
  onUpdateFriendColor,
  onClose
}: FriendPanelProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [friendColor, setFriendColor] = useState('');
  const [selectedFriend, setSelectedFriend] = useState<string | null>(null);
  
  const filteredUsers = allUsers
    .filter(user => 
      user.username !== currentUsername && 
      user.username.toLowerCase().includes(searchTerm.toLowerCase())
    )
    .filter(user => !friends.some(friend => friend.username === user.username));
  
  const handleSelectColor = (username: string) => {
    setSelectedFriend(username);
    
    // Find the current color of the friend
    const friend = friends.find(f => f.username === username);
    if (friend && friend.color) {
      setFriendColor(friend.color);
    } else {
      setFriendColor('rgb(99, 102, 241)'); // Default indigo
    }
  };
  
  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFriendColor(e.target.value);
  };
  
  const handleColorSubmit = () => {
    if (selectedFriend) {
      onUpdateFriendColor(selectedFriend, friendColor);
      setSelectedFriend(null);
    }
  };
  
  // We're no longer returning null based on visibility since parent component handles that
  
  return (
    <div className="w-full h-full flex flex-col p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-lg font-semibold flex items-center">
          <Users className="w-5 h-5 mr-2" />
          Friends
        </h3>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
            console.log("Close button clicked");
          }}
          type="button"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <Tabs defaultValue="friends">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="friends">Friends</TabsTrigger>
          <TabsTrigger value="requests">
            Requests
            {friendRequests.length > 0 && (
              <Badge variant="destructive" className="ml-1">
                {friendRequests.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="add">Add</TabsTrigger>
        </TabsList>
        
        <TabsContent value="friends" className="space-y-4">
          <ScrollArea className="h-[300px]">
            {friends.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                You have no friends yet. Add some!
              </p>
            ) : (
              <div className="space-y-2">
                {friends.map(friend => (
                  <div key={friend.username} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <div className="flex items-center">
                      <UserAvatar 
                        username={friend.username} 
                        size="sm" 
                      />
                      <span 
                        className="ml-2 font-medium" 
                        style={{ color: friend.color || 'inherit' }}
                      >
                        {friend.username}
                      </span>
                    </div>
                    <div className="flex space-x-1">
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleSelectColor(friend.username)}
                          >
                            <PaintBucket className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-80">
                          <div className="space-y-2">
                            <h4 className="font-medium">Choose friend color</h4>
                            <div className="flex space-x-2">
                              <Input
                                type="color"
                                value={friendColor}
                                onChange={handleColorChange}
                                className="w-12 h-8 p-0"
                              />
                              <Input
                                type="text"
                                value={friendColor}
                                onChange={handleColorChange}
                                placeholder="rgb(99, 102, 241)"
                                className="flex-1"
                              />
                            </div>
                            <div className="flex justify-end">
                              <Button 
                                size="sm" 
                                onClick={handleColorSubmit}
                              >
                                Apply
                              </Button>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onRemoveFriend(friend.username)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="requests" className="space-y-4">
          <ScrollArea className="h-[300px]">
            {friendRequests.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                You have no friend requests.
              </p>
            ) : (
              <div className="space-y-2">
                {friendRequests.map(request => (
                  <div key={request.username} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <div className="flex items-center">
                      <UserAvatar username={request.username} size="sm" />
                      <span className="ml-2 font-medium">{request.username}</span>
                    </div>
                    <div className="flex space-x-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onAcceptFriendRequest(request.username)}
                      >
                        <Check className="h-4 w-4 text-green-500" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => onRejectFriendRequest(request.username)}
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
        
        <TabsContent value="add" className="space-y-4">
          <Input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          <ScrollArea className="h-[250px]">
            {filteredUsers.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                No users found.
              </p>
            ) : (
              <div className="space-y-2">
                {filteredUsers.map(user => (
                  <div key={user.username} className="flex items-center justify-between p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                    <div className="flex items-center">
                      <UserAvatar username={user.username} size="sm" />
                      <span className="ml-2">{user.username}</span>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => onSendFriendRequest(user.username)}
                    >
                      <UserPlus className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}