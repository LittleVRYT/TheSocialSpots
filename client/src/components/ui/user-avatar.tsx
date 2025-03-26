import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserAvatarProps {
  username: string;
  isCurrentUser?: boolean;
}

export function UserAvatar({ username, isCurrentUser }: UserAvatarProps) {
  // Get initials from username (first letter or first two letters)
  const getInitials = (name: string) => {
    if (!name) return "?";
    
    const parts = name.split(/[\s-_]+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    } else if (parts.length > 1) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    
    return name.charAt(0).toUpperCase();
  };

  return (
    <Avatar className={`h-8 w-8 ${isCurrentUser ? 'bg-primary' : 'bg-gray-500'}`}>
      <AvatarFallback className={`text-xs ${isCurrentUser ? 'text-primary-foreground' : 'text-white'}`}>
        {getInitials(username)}
      </AvatarFallback>
    </Avatar>
  );
}
