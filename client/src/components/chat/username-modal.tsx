import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface UsernameModalProps {
  isVisible: boolean;
  onSubmit: (username: string) => void;
  takenUsernames: string[];
}

export function UsernameModal({ isVisible, onSubmit, takenUsernames }: UsernameModalProps) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setError("Username cannot be empty");
      return;
    }
    
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters");
      return;
    }
    
    if (trimmedUsername.length > 20) {
      setError("Username must be less than 20 characters");
      return;
    }
    
    if (takenUsernames.some(name => name.toLowerCase() === trimmedUsername.toLowerCase())) {
      setError("Username is already taken");
      toast({
        title: "Username taken",
        description: "Please choose a different username",
        variant: "destructive"
      });
      return;
    }
    
    setError("");
    onSubmit(trimmedUsername);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Enter your username</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                Username
              </Label>
              <Input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter a username to join the chat"
                className={`w-full ${error ? 'border-red-500 focus:ring-red-500' : ''}`}
                autoComplete="off"
                autoFocus
              />
              {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
            </div>
            <div className="flex justify-end">
              <Button type="submit">
                Join Chat
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
