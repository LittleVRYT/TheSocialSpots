import { useState, useEffect } from "react";
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { PhoneIcon, Bell, X, AlertTriangle, Check, LockIcon, UnlockIcon } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SiteStatus } from "@shared/schema";

interface SettingsPanelProps {
  visible: boolean;
  currentUsername: string;
  onClose: () => void;
  siteStatus: SiteStatus;
}

export function SettingsPanel({ visible, currentUsername, onClose, siteStatus }: SettingsPanelProps) {
  // User settings
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [notifyFriendOnline, setNotifyFriendOnline] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [testingSMS, setTestingSMS] = useState<boolean>(false);
  const [twilioConfigured, setTwilioConfigured] = useState<boolean>(true); // Assume configured until we know otherwise

  // Load user settings when component mounts
  useEffect(() => {
    if (visible && currentUsername) {
      loadUserSettings();
    }
  }, [visible, currentUsername]);

  // Load user settings from the server
  const loadUserSettings = async () => {
    try {
      setIsLoading(true);
      
      // Check Twilio configuration by making a simple request
      try {
        // We're not actually sending anything, just checking configuration
        const testResponse = await apiRequest<{ 
          success: boolean; 
          twilioConfigured?: boolean 
        }>('/api/user/test-sms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            phoneNumber: '+12345678900', // Sample number that won't actually be used
          }),
        });
        
        // Update Twilio configuration status
        setTwilioConfigured(testResponse.twilioConfigured !== false);
      } catch (error: any) {
        // If we get a 503 status, it means Twilio isn't configured
        if (error?.status === 503) {
          setTwilioConfigured(false);
        }
        // Other errors we ignore for this test
      }
      
      // Load user settings
      const response = await apiRequest<{
        phoneNumber?: string;
        notifyFriendOnline?: boolean;
      }>(`/api/user/settings/${currentUsername}`);
      
      setPhoneNumber(response.phoneNumber || '');
      setNotifyFriendOnline(response.notifyFriendOnline || false);
    } catch (error) {
      console.error('Failed to load user settings:', error);
      toast({
        title: "Error",
        description: "Failed to load your settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Save user settings
  const saveSettings = async () => {
    try {
      setIsLoading(true);
      
      // Validate phone number if provided
      if (phoneNumber && !isValidPhoneNumber(phoneNumber)) {
        toast({
          title: "Invalid Phone Number",
          description: "Please enter a valid phone number in the format +1234567890",
          variant: "destructive",
        });
        return;
      }
      
      console.log("Saving settings for username:", currentUsername);
      
      // Send settings to the server
      await apiRequest('/api/user/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: currentUsername,
          phoneNumber: phoneNumber || '',
          notifyFriendOnline,
        }),
      });
      
      toast({
        title: "Settings Saved",
        description: "Your settings have been updated successfully",
      });
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast({
        title: "Error",
        description: "Failed to save your settings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Test SMS notification
  const testSMSNotification = async () => {
    try {
      setTestingSMS(true);
      
      // Validate phone number
      if (!phoneNumber || !isValidPhoneNumber(phoneNumber)) {
        toast({
          title: "Invalid Phone Number",
          description: "Please enter a valid phone number in the format +1234567890",
          variant: "destructive",
        });
        return;
      }
      
      console.log("Testing SMS with phone number:", phoneNumber);
      
      // Send test SMS request
      const response = await apiRequest<{ success: boolean; twilioConfigured?: boolean }>('/api/user/test-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber,
        }),
      });
      
      // Update Twilio configuration status
      setTwilioConfigured(response.twilioConfigured !== false);
      
      if (response.success) {
        toast({
          title: "Test SMS Sent",
          description: "A test SMS notification has been sent to your phone number",
        });
      } else if (response.twilioConfigured === false) {
        toast({
          title: "Twilio Not Configured",
          description: "SMS notifications are not available because Twilio has not been configured on the server.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Send SMS",
          description: "There was an issue sending the test SMS. Please check your phone number and try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Failed to send test SMS:', error);
      toast({
        title: "Error",
        description: "Failed to send the test SMS",
        variant: "destructive",
      });
    } finally {
      setTestingSMS(false);
    }
  };

  // Validate phone number format
  const isValidPhoneNumber = (number: string): boolean => {
    // Basic validation for international format: +1234567890
    return /^\+[1-9]\d{1,14}$/.test(number);
  };

  if (!visible) return null;

  return (
    <div className="p-4 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold">Settings</h2>
        <button 
          onClick={onClose}
          className="p-1 rounded-md text-gray-500 hover:bg-gray-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      
      <div className="space-y-6 flex-1 overflow-auto pb-4">
        {/* Twilio Configuration Warning */}
        {!twilioConfigured && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Twilio Not Configured</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <p>
                SMS notifications are currently unavailable because Twilio has not been configured on the server.
                The following environment variables are required for SMS functionality:
              </p>
              <ul className="list-disc pl-5 text-sm">
                <li>TWILIO_ACCOUNT_SID</li>
                <li>TWILIO_AUTH_TOKEN</li>
                <li>TWILIO_PHONE_NUMBER</li>
              </ul>
              <div className="flex gap-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="flex-1"
                  onClick={() => {
                    // Ask for Twilio credentials
                    toast({
                      title: "Configure Twilio",
                      description: "Redirecting to configure Twilio credentials...",
                    });
                    
                    // We'll ask for the required Twilio secrets
                    // This will open a prompt for the user to enter these values
                    window.parent.postMessage({ type: "ask_secrets", secrets: [
                      "TWILIO_ACCOUNT_SID",
                      "TWILIO_AUTH_TOKEN",
                      "TWILIO_PHONE_NUMBER"
                    ]}, "*");
                  }}
                >
                  Configure Twilio
                </Button>
                <Button 
                  variant="secondary" 
                  size="sm"
                  className="flex-initial"
                  onClick={async () => {
                    toast({
                      title: "Checking Configuration",
                      description: "Verifying Twilio configuration status...",
                    });
                    
                    try {
                      // Check Twilio configuration through a test request
                      const testResponse = await apiRequest<{ 
                        success: boolean; 
                        twilioConfigured?: boolean 
                      }>('/api/user/test-sms', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          phoneNumber: '+12345678900', // Sample number that won't actually be used
                        }),
                      });
                      
                      // Update Twilio configuration status
                      const configured = testResponse.twilioConfigured !== false;
                      setTwilioConfigured(configured);
                      
                      // Show configuration status
                      toast({
                        title: configured ? "Twilio Configured" : "Twilio Not Configured",
                        description: configured 
                          ? "Twilio is properly configured. SMS notifications are available."
                          : "Twilio is still not properly configured. Check your credentials.",
                        variant: configured ? "default" : "destructive",
                      });
                      
                      // If configured, reload the settings panel to refresh UI
                      if (configured) {
                        await loadUserSettings();
                      }
                      
                    } catch (error) {
                      console.error('Failed to check Twilio configuration:', error);
                      toast({
                        title: "Error",
                        description: "Failed to check Twilio configuration status.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Refresh Status
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}
        
        {/* Notification Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              <span>Notification Settings</span>
              {twilioConfigured && (
                <span className="ml-2 flex items-center text-xs font-normal text-green-600">
                  <Check className="h-3 w-3 mr-1" /> Twilio Configured
                </span>
              )}
            </CardTitle>
            <CardDescription>
              Configure how you want to be notified about activities
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number (for SMS notifications)</Label>
              <div className="flex items-center gap-2">
                <PhoneIcon className="h-4 w-4 text-gray-500" />
                <Input
                  id="phoneNumber"
                  type="text"
                  placeholder="+12345678900"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  disabled={isLoading}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Enter your phone number in international format (e.g., +12345678900)
              </p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="notifyFriendsOnline">
                  SMS Notifications when friends come online
                </Label>
                <p className="text-xs text-muted-foreground">
                  Receive an SMS when your friends come online
                </p>
              </div>
              <Switch
                id="notifyFriendsOnline"
                checked={notifyFriendOnline}
                onCheckedChange={setNotifyFriendOnline}
                disabled={isLoading || !phoneNumber}
              />
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={testSMSNotification}
                disabled={!phoneNumber || testingSMS || isLoading || !twilioConfigured}
              >
                {testingSMS ? "Sending..." : "Test SMS"}
              </Button>
              {!twilioConfigured && (
                <span className="text-xs text-muted-foreground">
                  Twilio required
                </span>
              )}
            </div>
            <Button 
              onClick={saveSettings}
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : "Save Settings"}
            </Button>
          </CardFooter>
        </Card>

        {/* Admin Card */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <span>Admin Settings</span>
            </CardTitle>
            <CardDescription>
              Advanced settings for administrators only
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adminCode">Admin Code</Label>
              <Input
                id="adminCode"
                type="password"
                placeholder="Enter admin code"
                onChange={(e) => e.target.value} // Intentionally not storing this in state for security
              />
              <p className="text-xs text-muted-foreground">
                Required for administrative operations
              </p>
            </div>

            <div className="border-t pt-4">
              <h4 className="text-sm font-semibold mb-2">Database Operations</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Warning: These operations are destructive and cannot be undone
              </p>
              
              <div className="flex flex-col gap-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full"
                  onClick={async (e) => {
                    e.preventDefault();
                    
                    // Get the admin code from the input field
                    const adminCodeInput = document.getElementById("adminCode") as HTMLInputElement;
                    const adminCode = adminCodeInput?.value;
                    
                    if (!adminCode) {
                      toast({
                        title: "Admin Code Required",
                        description: "Please enter the admin code to proceed",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Confirm the action
                    const confirmed = window.confirm(
                      "This action will delete all chat messages but keep users, friendships, and user settings. Are you sure you want to proceed?"
                    );
                    
                    if (!confirmed) {
                      return;
                    }
                    
                    try {
                      // Call the API to clear chat messages
                      const response = await apiRequest('/api/admin/clear-chat-messages', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          username: currentUsername,
                          adminCode,
                        }),
                      });
                      
                      if (response.success) {
                        toast({
                          title: "Chat Messages Cleared",
                          description: "All chat messages have been successfully cleared.",
                        });
                        
                        // Clear the admin code field
                        if (adminCodeInput) {
                          adminCodeInput.value = '';
                        }
                      } else {
                        toast({
                          title: "Operation Failed",
                          description: response.message || "Failed to clear chat messages",
                          variant: "destructive",
                        });
                      }
                    } catch (error: any) {
                      console.error('Failed to clear chat messages:', error);
                      toast({
                        title: "Operation Failed",
                        description: error?.message || "Failed to clear chat messages",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Clear Chat Messages
                </Button>
                
                <Button 
                  variant="destructive" 
                  size="sm"
                  className="w-full"
                  onClick={async (e) => {
                    e.preventDefault();
                    
                    // Get the admin code from the input field
                    const adminCodeInput = document.getElementById("adminCode") as HTMLInputElement;
                    const adminCode = adminCodeInput?.value;
                    
                    if (!adminCode) {
                      toast({
                        title: "Admin Code Required",
                        description: "Please enter the admin code to proceed",
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Confirm the destructive action
                    const confirmed = window.confirm(
                      "WARNING: This action will delete ALL data from the database, including users, messages, and friendships. This action CANNOT be undone. Are you absolutely sure you want to proceed?"
                    );
                    
                    if (!confirmed) {
                      return;
                    }
                    
                    try {
                      // Call the API to clear the database
                      const response = await apiRequest('/api/admin/clear-database', {
                        method: 'POST',
                        headers: {
                          'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                          username: currentUsername,
                          adminCode,
                        }),
                      });
                      
                      if (response.success) {
                        toast({
                          title: "Database Cleared",
                          description: "The database has been successfully cleared. You will be redirected to the login page.",
                        });
                        
                        // Clear the admin code field
                        if (adminCodeInput) {
                          adminCodeInput.value = '';
                        }
                        
                        // Redirect to refresh the application after a short delay
                        setTimeout(() => {
                          window.location.href = '/';
                        }, 2000);
                      } else {
                        toast({
                          title: "Operation Failed",
                          description: response.message || "Failed to clear database",
                          variant: "destructive",
                        });
                      }
                    } catch (error: any) {
                      console.error('Failed to clear database:', error);
                      toast({
                        title: "Operation Failed",
                        description: error?.message || "Failed to clear database",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Clear All Database
                </Button>
              </div>
            </div>

            {/* Site Status Controls */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-2">Site Status Controls</h4>
              <p className="text-xs text-muted-foreground mb-3">
                Control whether the site is accessible to users
              </p>
              
              <div className="mb-4 p-3 border rounded-md flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    {siteStatus.isOpen ? (
                      <UnlockIcon className="h-5 w-5 text-green-500 mr-2" />
                    ) : (
                      <LockIcon className="h-5 w-5 text-red-500 mr-2" />
                    )}
                    <span className="font-medium">
                      Site is currently {siteStatus.isOpen ? "OPEN" : "CLOSED"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {siteStatus.closedAt && !siteStatus.isOpen 
                      ? `Closed at ${new Date(siteStatus.closedAt).toLocaleString()}` 
                      : ''}
                  </span>
                </div>
                
                {!siteStatus.isOpen && (
                  <div className="mt-1 text-sm">
                    <p className="font-medium">Closure Message:</p>
                    <p className="text-sm border p-2 rounded bg-muted">{siteStatus.message}</p>
                    {siteStatus.closedBy && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Closed by: {siteStatus.closedBy}
                      </p>
                    )}
                  </div>
                )}
              </div>
              
              <div className="space-y-3">
                {siteStatus.isOpen ? (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="closureMessage">Closure Message</Label>
                      <Textarea
                        id="closureMessage"
                        placeholder="Enter a message explaining why the site is closed..."
                        className="min-h-[80px]"
                      />
                    </div>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      className="w-full"
                      onClick={async (e) => {
                        e.preventDefault();
                        
                        // Get the admin code from the input field
                        const adminCodeInput = document.getElementById("adminCode") as HTMLInputElement;
                        const adminCode = adminCodeInput?.value;
                        
                        if (!adminCode) {
                          toast({
                            title: "Admin Code Required",
                            description: "Please enter the admin code to proceed",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        // Get the closure message
                        const closureMessageInput = document.getElementById("closureMessage") as HTMLTextAreaElement;
                        const message = closureMessageInput?.value || "The site is temporarily closed for maintenance.";
                        
                        // Confirm the action
                        const confirmed = window.confirm(
                          "This action will close the site for all users. They will be unable to access the chat until it is reopened. Are you sure you want to proceed?"
                        );
                        
                        if (!confirmed) {
                          return;
                        }
                        
                        try {
                          // Call the API to close the site
                          const response = await apiRequest('/api/admin/close-site', {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                              username: currentUsername,
                              adminCode,
                              message
                            }),
                          });
                          
                          if (response.success) {
                            toast({
                              title: "Site Closed",
                              description: "The site has been closed for all users.",
                            });
                            
                            // Clear the admin code field and closure message field
                            if (adminCodeInput) {
                              adminCodeInput.value = '';
                            }
                            if (closureMessageInput) {
                              closureMessageInput.value = '';
                            }
                          } else {
                            toast({
                              title: "Operation Failed",
                              description: response.message || "Failed to close the site",
                              variant: "destructive",
                            });
                          }
                        } catch (error: any) {
                          console.error('Failed to close the site:', error);
                          toast({
                            title: "Operation Failed",
                            description: error?.message || "Failed to close the site",
                            variant: "destructive",
                          });
                        }
                      }}
                    >
                      Close Site
                    </Button>
                  </div>
                ) : (
                  <Button 
                    variant="outline" 
                    size="sm"
                    className="w-full"
                    onClick={async (e) => {
                      e.preventDefault();
                      
                      // Get the admin code from the input field
                      const adminCodeInput = document.getElementById("adminCode") as HTMLInputElement;
                      const adminCode = adminCodeInput?.value;
                      
                      if (!adminCode) {
                        toast({
                          title: "Admin Code Required",
                          description: "Please enter the admin code to proceed",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      // Confirm the action
                      const confirmed = window.confirm(
                        "This action will reopen the site for all users. Are you sure you want to proceed?"
                      );
                      
                      if (!confirmed) {
                        return;
                      }
                      
                      try {
                        // Call the API to open the site
                        const response = await apiRequest('/api/admin/open-site', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json'
                          },
                          body: JSON.stringify({
                            username: currentUsername,
                            adminCode
                          }),
                        });
                        
                        if (response.success) {
                          toast({
                            title: "Site Reopened",
                            description: "The site has been reopened for all users.",
                          });
                          
                          // Clear the admin code field
                          if (adminCodeInput) {
                            adminCodeInput.value = '';
                          }
                        } else {
                          toast({
                            title: "Operation Failed",
                            description: response.message || "Failed to reopen the site",
                            variant: "destructive",
                          });
                        }
                      } catch (error: any) {
                        console.error('Failed to reopen the site:', error);
                        toast({
                          title: "Operation Failed",
                          description: error?.message || "Failed to reopen the site",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Reopen Site
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}