import { ChatUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import { UserAvatar } from "@/components/ui/user-avatar";

interface OnlineUsersProps {
  users: ChatUser[];
  currentUsername: string;
  visible: boolean;
  onToggleVisibility: () => void;
}

export function OnlineUsers({ users, currentUsername, visible, onToggleVisibility }: OnlineUsersProps) {
  const sortedUsers = [...users].sort((a, b) => {
    // Current user always at the top
    if (a.username === currentUsername) return -1;
    if (b.username === currentUsername) return 1;
    // Then sort alphabetically
    return a.username.localeCompare(b.username);
  });

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
            <div key={user.id} className="flex items-center p-3 hover:bg-gray-50">
              <div className="w-2 h-2 bg-success rounded-full mr-3"></div>
              <span className="text-gray-800 font-medium">{user.username}</span>
              {user.username === currentUsername && (
                <span className="ml-2 text-xs bg-primary bg-opacity-10 text-primary px-2 py-0.5 rounded-full">You</span>
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
