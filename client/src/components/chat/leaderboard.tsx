import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ChatUser } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';

interface LeaderboardProps {
  visible: boolean;
}

export function Leaderboard({ visible }: LeaderboardProps) {
  const [leaderboardUsers, setLeaderboardUsers] = useState<ChatUser[]>([]);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    if (visible) {
      fetchLeaderboard();
    }
  }, [visible]);
  
  const fetchLeaderboard = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<ChatUser[]>('/api/leaderboard');
      setLeaderboardUsers(data);
    } catch (error) {
      console.error('Error fetching leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Helper function to format time
  const formatTime = (seconds: number = 0): string => {
    if (!seconds) return '0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  if (!visible) return null;
  
  return (
    <Card className="shadow-md">
      <CardHeader className="bg-primary/10 pb-2">
        <CardTitle className="text-xl flex items-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
            <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
            <path d="M4 22h16" />
            <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
            <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
            <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
          </svg>
          Leaderboard
        </CardTitle>
        <CardDescription>
          Users who've spent the most time on The Social Spot
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-4">
            {leaderboardUsers.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-4">
                No active users yet. Be the first to join the leaderboard!
              </p>
            ) : (
              leaderboardUsers.map((user, index) => (
                <div 
                  key={user.username} 
                  className={`flex items-center justify-between p-3 rounded-lg ${
                    index === 0 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 
                    index === 1 ? 'bg-gray-100 dark:bg-gray-800/50' : 
                    index === 2 ? 'bg-amber-100 dark:bg-amber-900/30' : 
                    'bg-background'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div className="flex-shrink-0 w-6 text-center font-bold">
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`}
                    </div>
                    <UserAvatar 
                      username={user.username}
                      avatarColor={user.avatarColor}
                      avatarShape={user.avatarShape}
                      avatarInitials={user.avatarInitials}
                      size="sm"
                    />
                    <div>
                      <span className="font-medium">{user.username}</span>
                      {user.isActive && (
                        <Badge variant="outline" className="ml-2 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          Online
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {formatTime(user.totalTimeOnline)}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}