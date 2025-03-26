import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { BookOpen } from "lucide-react";

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
            <Badge variant="outline" className="bg-green-500 text-white hover:bg-green-600">
              {onlineCount} online
            </Badge>
          </div>
          <div className="flex items-center">
            <Link href="/homework-help">
              <Button 
                variant="outline" 
                size="sm" 
                className="mr-3 flex items-center gap-1 hidden sm:flex"
              >
                <BookOpen className="h-4 w-4" />
                <span>Homework Help</span>
              </Button>
            </Link>
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
        <div className="sm:hidden mt-2 flex justify-center">
          <Link href="/homework-help" className="w-full">
            <Button 
              variant="outline" 
              size="sm" 
              className="w-full flex items-center justify-center gap-1"
            >
              <BookOpen className="h-4 w-4" />
              <span>Homework Help</span>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
