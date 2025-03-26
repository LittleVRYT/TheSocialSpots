import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface UserAvatarProps {
  username: string;
  isCurrentUser?: boolean;
  avatarColor?: string;
  avatarShape?: 'circle' | 'square' | 'rounded';
  avatarInitials?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function UserAvatar({ 
  username, 
  isCurrentUser, 
  avatarColor, 
  avatarShape = 'circle',
  avatarInitials,
  size = 'sm'
}: UserAvatarProps) {
  // Get initials from username (first letter or first two letters)
  const getInitials = (name: string) => {
    if (!name) return "?";
    
    // If custom initials are provided, use those
    if (avatarInitials) return avatarInitials;
    
    const parts = name.split(/[\s-_]+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].charAt(0).toUpperCase();
    } else if (parts.length > 1) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    
    return name.charAt(0).toUpperCase();
  };
  
  // Determine background color
  const bgColor = avatarColor 
    ? avatarColor 
    : isCurrentUser 
      ? 'var(--primary)' // Use CSS variable for primary color
      : '#6b7280'; // gray-500
  
  // Determine size class
  const sizeClass = size === 'lg' 
    ? 'h-12 w-12 text-lg' 
    : size === 'md' 
      ? 'h-10 w-10 text-base' 
      : 'h-8 w-8 text-xs';
  
  // Determine shape class
  const shapeClass = avatarShape === 'square' 
    ? 'rounded-none' 
    : avatarShape === 'rounded' 
      ? 'rounded-md' 
      : 'rounded-full';

  return (
    <Avatar 
      className={`${sizeClass} ${shapeClass}`}
      style={{ backgroundColor: bgColor }}
    >
      <AvatarFallback 
        className={`${shapeClass} text-white`}
        style={{ backgroundColor: bgColor }}
      >
        {getInitials(username)}
      </AvatarFallback>
    </Avatar>
  );
}
