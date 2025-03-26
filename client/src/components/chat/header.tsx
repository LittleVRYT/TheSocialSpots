import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface HeaderProps {
  username: string;
  onlineCount: number;
  onLogout: () => void;
}

export function Header({ username, onlineCount, onLogout }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h1 className="text-xl font-bold text-primary">ChatRoom</h1>
            <Badge variant="success" className="bg-green-500 hover:bg-green-600">
              {onlineCount} online
            </Badge>
          </div>
          <div className="flex items-center">
            <span className="hidden md:block text-sm mr-2">Logged in as:</span>
            <span className="font-medium text-secondary">{username}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onLogout}
              className="ml-3 text-sm text-gray-500 hover:text-red-500"
            >
              Logout
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
