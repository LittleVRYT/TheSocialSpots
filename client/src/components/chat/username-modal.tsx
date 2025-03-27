import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { ChatRoom, SiteStatus } from "@shared/schema";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { LockIcon } from "lucide-react";

interface UsernameModalProps {
  isVisible: boolean;
  onSubmit: (username: string, selectedRoom?: ChatRoom) => void;
  takenUsernames: string[];
  siteStatus?: SiteStatus;
}

export function UsernameModal({ isVisible, onSubmit, takenUsernames, siteStatus }: UsernameModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");
  const [selectedRoom, setSelectedRoom] = useState<ChatRoom>(ChatRoom.GENERAL);
  const [localSiteStatus, setLocalSiteStatus] = useState<SiteStatus>({ isOpen: true, message: '' });
  const { toast } = useToast();
  
  // Fetch site status if not provided
  useEffect(() => {
    if (!isVisible) return;
    
    // If site status is provided via props, use it
    if (siteStatus) {
      setLocalSiteStatus(siteStatus);
      return;
    }
    
    // Otherwise fetch from the API
    const fetchSiteStatus = async () => {
      try {
        const response = await apiRequest<SiteStatus>('/api/site-status');
        setLocalSiteStatus(response);
      } catch (error) {
        console.error('Failed to fetch site status:', error);
        // Default to site open if we can't fetch the status
        setLocalSiteStatus({ isOpen: true, message: '' });
      }
    };
    
    fetchSiteStatus();
  }, [isVisible, siteStatus]);

  const validateUsername = (username: string): boolean => {
    const trimmedUsername = username.trim();
    
    if (!trimmedUsername) {
      setError("Username cannot be empty");
      return false;
    }
    
    if (trimmedUsername.length < 3) {
      setError("Username must be at least 3 characters");
      return false;
    }
    
    if (trimmedUsername.length > 20) {
      setError("Username must be less than 20 characters");
      return false;
    }
    
    return true;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!validateUsername(username)) {
      return;
    }
    
    if (!password) {
      setError("Password cannot be empty");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      
      setError("");
      setIsLoading(false);
      onSubmit(username.trim(), selectedRoom);
    } catch (error: any) {
      setError(error.message || "Login failed. Please check your credentials.");
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!validateUsername(username)) {
      return;
    }
    
    if (takenUsernames.some(name => name.toLowerCase() === username.trim().toLowerCase())) {
      setError("Username is already taken");
      toast({
        title: "Username taken",
        description: "Please choose a different username",
        variant: "destructive"
      });
      return;
    }
    
    if (!password) {
      setError("Password cannot be empty");
      return;
    }
    
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiRequest('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          username: username.trim(), 
          password,
          confirmPassword
        }),
      });
      
      setError("");
      setIsLoading(false);
      toast({
        title: "Registration successful",
        description: "You can now login with your credentials",
      });
      setActiveTab("login");
    } catch (error: any) {
      setError(error.message || "Registration failed. Please try again.");
      setIsLoading(false);
    }
  };

  // For users who just want to jump in without creating an account
  const handleGuestLogin = () => {
    const guestUsername = `Guest_${Math.floor(Math.random() * 10000)}`;
    onSubmit(guestUsername, selectedRoom);
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <Card className="w-full max-w-md mx-4">
        <CardHeader>
          <CardTitle className="text-center">Welcome to The Social Spot</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Site Closed Alert */}
          {localSiteStatus && !localSiteStatus.isOpen && (
            <Alert variant="destructive" className="mb-4">
              <LockIcon className="h-4 w-4" />
              <AlertTitle>Site is currently closed</AlertTitle>
              <AlertDescription>
                <p className="mt-1">{localSiteStatus.message}</p>
                {localSiteStatus.closedBy && (
                  <p className="text-xs mt-2">
                    Closed by {localSiteStatus.closedBy} {localSiteStatus.closedAt && `at ${new Date(localSiteStatus.closedAt).toLocaleString()}`}
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "login" | "register")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="register">Register</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="login-username">Username</Label>
                  <Input
                    id="login-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className={error ? 'border-red-500' : ''}
                    autoComplete="username"
                    autoFocus
                  />
                </div>
                
                <div>
                  <Label htmlFor="login-password">Password</Label>
                  <Input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className={error ? 'border-red-500' : ''}
                    autoComplete="current-password"
                  />
                </div>
                
                <div>
                  <Label>Select Chatroom</Label>
                  <RadioGroup 
                    value={selectedRoom} 
                    onValueChange={(value) => setSelectedRoom(value as ChatRoom)}
                    className="mt-2 grid grid-cols-2 gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.GENERAL} id="general" />
                      <Label htmlFor="general" className="font-normal">General</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.GAMING} id="gaming" />
                      <Label htmlFor="gaming" className="font-normal">Gaming</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.TECH} id="technology" />
                      <Label htmlFor="technology" className="font-normal">Technology</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.CASUAL} id="casual" />
                      <Label htmlFor="casual" className="font-normal">Casual</Label>
                    </div>
                  </RadioGroup>
                </div>
                
                {error && <p className="text-sm text-red-500">{error}</p>}
                
                <div className="flex justify-between">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={handleGuestLogin}
                    disabled={isLoading || !localSiteStatus.isOpen}
                  >
                    Join as Guest
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !localSiteStatus.isOpen}
                  >
                    {isLoading ? "Logging in..." : "Login"}
                  </Button>
                </div>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleRegister} className="space-y-4 pt-4">
                <div>
                  <Label htmlFor="register-username">Username</Label>
                  <Input
                    id="register-username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className={error ? 'border-red-500' : ''}
                    autoComplete="username"
                  />
                </div>
                
                <div>
                  <Label htmlFor="register-password">Password</Label>
                  <Input
                    id="register-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a password"
                    className={error ? 'border-red-500' : ''}
                    autoComplete="new-password"
                  />
                </div>
                
                <div>
                  <Label htmlFor="confirm-password">Confirm Password</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className={error ? 'border-red-500' : ''}
                    autoComplete="new-password"
                  />
                </div>
                
                <div>
                  <Label>Select Chatroom</Label>
                  <RadioGroup 
                    value={selectedRoom} 
                    onValueChange={(value) => setSelectedRoom(value as ChatRoom)}
                    className="mt-2 grid grid-cols-2 gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.GENERAL} id="register-general" />
                      <Label htmlFor="register-general" className="font-normal">General</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.GAMING} id="register-gaming" />
                      <Label htmlFor="register-gaming" className="font-normal">Gaming</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.TECH} id="register-technology" />
                      <Label htmlFor="register-technology" className="font-normal">Technology</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value={ChatRoom.CASUAL} id="register-casual" />
                      <Label htmlFor="register-casual" className="font-normal">Casual</Label>
                    </div>
                  </RadioGroup>
                </div>
                
                {error && <p className="text-sm text-red-500">{error}</p>}
                
                <div className="flex justify-between">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => setActiveTab("login")}
                    disabled={isLoading}
                  >
                    Back to Login
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={isLoading || !localSiteStatus.isOpen}
                  >
                    {isLoading ? "Registering..." : "Register"}
                  </Button>
                </div>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
