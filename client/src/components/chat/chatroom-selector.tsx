import { Button } from "@/components/ui/button";
import { ChatRoom } from "@shared/schema";
import { Hash, Gamepad2, Code, Coffee } from "lucide-react";

interface ChatroomSelectorProps {
  currentRoom: ChatRoom;
  roomCounts: Record<ChatRoom, number>;
  onRoomChange: (room: ChatRoom) => void;
}

function getChatRoomDisplayName(room: ChatRoom): string {
  switch (room) {
    case ChatRoom.GENERAL:
      return "General";
    case ChatRoom.GAMING:
      return "Gaming";
    case ChatRoom.TECH:
      return "Technology";
    case ChatRoom.CASUAL:
      return "Casual";
    default:
      return room;
  }
}

function getChatRoomIcon(room: ChatRoom) {
  switch (room) {
    case ChatRoom.GENERAL:
      return <Hash className="h-4 w-4" />;
    case ChatRoom.GAMING:
      return <Gamepad2 className="h-4 w-4" />;
    case ChatRoom.TECH:
      return <Code className="h-4 w-4" />;
    case ChatRoom.CASUAL:
      return <Coffee className="h-4 w-4" />;
    default:
      return <Hash className="h-4 w-4" />;
  }
}

export function ChatroomSelector({ currentRoom, roomCounts, onRoomChange }: ChatroomSelectorProps) {
  const rooms = [
    ChatRoom.GENERAL,
    ChatRoom.GAMING,
    ChatRoom.TECH,
    ChatRoom.CASUAL
  ];

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">Select Chatroom</h3>
      <div className="grid grid-cols-4 gap-2">
        {rooms.map((room) => (
          <Button
            key={room}
            variant={currentRoom === room ? "default" : "outline"}
            size="sm"
            className="relative"
            onClick={() => onRoomChange(room)}
          >
            <div className="flex items-center gap-1">
              {getChatRoomIcon(room)}
              <span className="text-xs">{getChatRoomDisplayName(room)}</span>
            </div>
            {roomCounts[room] > 0 && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {roomCounts[room]}
              </span>
            )}
          </Button>
        ))}
      </div>
    </div>
  );
}