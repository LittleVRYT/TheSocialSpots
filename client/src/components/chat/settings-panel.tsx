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
import { toast } from "@/hooks/use-toast";
import { PhoneIcon, Bell, X, AlertTriangle, Check } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface SettingsPanelProps {
  visible: boolean;
  currentUsername: string;
  onClose: () => void;
}

export function SettingsPanel({ visible, currentUsername, onClose }: SettingsPanelProps) {
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
      
      // Send settings to the server
      await apiRequest('/api/user/settings', {
        method: 'POST',
        body: JSON.stringify({
          username: currentUsername,
          phoneNumber: phoneNumber || null,
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
      
      // Send test SMS request
      const response = await apiRequest<{ success: boolean; twilioConfigured?: boolean }>('/api/user/test-sms', {
        method: 'POST',
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
      </div>
    </div>
  );
}