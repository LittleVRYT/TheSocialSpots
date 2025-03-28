import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatUser, ChatMessage, MessageType, WSMessage, ChatRegion, ChatRoom, Friend, FriendStatus, SiteStatus } from '@shared/schema';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

// Room counts for displaying users in each room
type RoomCounts = Record<ChatRoom, number>;

// Default site status
const defaultSiteStatus: SiteStatus = {
  isOpen: true,
  message: "Welcome to the Chat Application!"
};

interface UseChatResult {
  users: ChatUser[];
  messages: ChatMessage[];
  privateMessages: Map<string, ChatMessage[]>; // Keyed by username of the other participant
  connectionStatus: ConnectionStatus;
  error: string | null;
  chatMode: 'local' | 'global';
  region: ChatRegion;
  chatRoom: ChatRoom;
  roomCounts: RoomCounts;
  friends: Friend[];
  friendRequests: Friend[];
  siteStatus: SiteStatus;
  connect: (username: string) => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  sendPrivateMessage: (text: string, recipient: string) => void;
  sendVoiceMessage: (text: string, voiceData: string, voiceDuration: number) => void;
  sendPrivateVoiceMessage: (text: string, recipient: string, voiceData: string, voiceDuration: number) => void;
  setChatMode: (mode: 'local' | 'global') => void;
  setRegion: (region: ChatRegion) => void;
  setChatRoom: (room: ChatRoom) => void;
  updateAvatar: (avatarColor: string, avatarShape: 'circle' | 'square' | 'rounded', avatarInitials: string) => void;
  addReaction: (messageId: string, emoji: string) => void;
  removeReaction: (messageId: string, emoji: string) => void;
  // Friend system methods
  sendFriendRequest: (username: string) => void;
  acceptFriendRequest: (username: string) => void;
  rejectFriendRequest: (username: string) => void;
  removeFriend: (username: string) => void;
  updateFriendColor: (username: string, color: string) => void;
}

export function useChat(): UseChatResult {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [privateMessages, setPrivateMessages] = useState<Map<string, ChatMessage[]>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  const [chatMode, setChatModeState] = useState<'local' | 'global'>('global');
  const [region, setRegionState] = useState<ChatRegion>(ChatRegion.GLOBAL);
  const [chatRoom, setChatRoomState] = useState<ChatRoom>(ChatRoom.GENERAL);
  const [roomCounts, setRoomCounts] = useState<RoomCounts>({
    [ChatRoom.GENERAL]: 0,
    [ChatRoom.CASUAL]: 0,
    [ChatRoom.TECH]: 0,
    [ChatRoom.GAMING]: 0
  });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendRequests, setFriendRequests] = useState<Friend[]>([]);
  const [siteStatus, setSiteStatus] = useState<SiteStatus>(defaultSiteStatus);
  
  const socketRef = useRef<WebSocket | null>(null);
  const usernameRef = useRef<string | null>(null);
  
  // Setup WebSocket connection
  const connect = useCallback((username: string) => {
    if (connectionStatus === 'connecting' || connectionStatus === 'connected') {
      return;
    }
    
    setError(null);
    setConnectionStatus('connecting');
    usernameRef.current = username;
    
    try {
      // Create WebSocket connection
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;
      
      // Connection opened
      socket.addEventListener('open', () => {
        setConnectionStatus('connected');
        
        // Send join message
        socket.send(JSON.stringify({
          type: MessageType.JOIN,
          username
        }));
      });
      
      // Listen for messages
      socket.addEventListener('message', (event) => {
        const data: WSMessage = JSON.parse(event.data);
        
        switch (data.type) {
          case MessageType.JOIN:
          case MessageType.LEAVE:
            if (data.text && data.timestamp) {
              addMessage({
                id: self.crypto.randomUUID(),
                username: data.username || 'System',
                text: data.text,
                timestamp: new Date(data.timestamp),
                type: 'system'
              });
            }
            break;
            
          case MessageType.CHAT:
            if (data.username && data.text && data.timestamp) {
              addMessage({
                id: self.crypto.randomUUID(),
                username: data.username,
                text: data.text,
                timestamp: new Date(data.timestamp),
                type: 'user'
              });
            }
            break;
            
          case MessageType.VOICE_MESSAGE:
            if (data.username && data.text && data.timestamp && data.voiceData !== undefined && data.voiceDuration !== undefined) {
              addMessage({
                id: self.crypto.randomUUID(),
                username: data.username,
                text: data.text,
                timestamp: new Date(data.timestamp),
                type: 'user',
                isVoiceMessage: true,
                voiceData: data.voiceData,
                voiceDuration: data.voiceDuration
              });
            }
            break;
            
          case MessageType.PRIVATE_MESSAGE:
            if (data.username && data.text && data.timestamp && data.recipient && data.isPrivate) {
              const privateMsg: ChatMessage = {
                id: self.crypto.randomUUID(),
                username: data.username,
                text: data.text,
                timestamp: new Date(data.timestamp),
                type: 'user',
                recipient: data.recipient,
                isPrivate: true
              };
              
              // Determine the key to use for storing the private message
              // If this user sent the message, use the recipient's name as the key
              // If this user received the message, use the sender's name as the key
              const otherUser = data.username === usernameRef.current ? data.recipient : data.username;
              
              // Add to private messages map
              setPrivateMessages(prev => {
                const newMap = new Map(prev);
                const existingMessages = newMap.get(otherUser) || [];
                newMap.set(otherUser, [...existingMessages, privateMsg]);
                return newMap;
              });
            }
            break;
            
          case MessageType.VOICE_MESSAGE_PRIVATE:
            if (data.username && data.text && data.timestamp && data.recipient && data.isPrivate && 
                data.voiceData !== undefined && data.voiceDuration !== undefined) {
              const privateVoiceMsg: ChatMessage = {
                id: self.crypto.randomUUID(),
                username: data.username,
                text: data.text,
                timestamp: new Date(data.timestamp),
                type: 'user',
                recipient: data.recipient,
                isPrivate: true,
                isVoiceMessage: true,
                voiceData: data.voiceData,
                voiceDuration: data.voiceDuration
              };
              
              // Determine the key to use for storing the private message
              // If this user sent the message, use the recipient's name as the key
              // If this user received the message, use the sender's name as the key
              const otherUser = data.username === usernameRef.current ? data.recipient : data.username;
              
              // Add to private messages map
              setPrivateMessages(prev => {
                const newMap = new Map(prev);
                const existingMessages = newMap.get(otherUser) || [];
                newMap.set(otherUser, [...existingMessages, privateVoiceMsg]);
                return newMap;
              });
            }
            break;
            
          case MessageType.USERS:
            if (data.users) {
              setUsers(data.users);
            }
            break;
            
          case MessageType.HISTORY:
            if (Array.isArray(data.messages)) {
              const formattedMessages: ChatMessage[] = data.messages.map((msg: any) => ({
                id: self.crypto.randomUUID(),
                username: msg.username || 'System',
                text: msg.text,
                timestamp: new Date(msg.timestamp),
                type: msg.type === MessageType.JOIN ? 'system' : 'user'
              }));
              setMessages(formattedMessages);
            }
            break;
            
          case MessageType.ERROR:
            setError(data.text || 'Unknown error');
            break;
            
          case MessageType.UPDATE_CHAT_MODE:
            if (data.chatMode) {
              setChatModeState(data.chatMode);
              
              // Add a system message about mode change
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `Chat mode changed to ${data.chatMode}`,
                timestamp: new Date(),
                type: 'system'
              });
            }
            break;
            
          case MessageType.UPDATE_REGION:
            if (data.region) {
              setRegionState(data.region);
              
              // Add a system message about region change
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `Region changed to ${data.region}`,
                timestamp: new Date(),
                type: 'system'
              });
            }
            break;
            
          case MessageType.UPDATE_CHATROOM:
            // Update room counts if provided
            if (data.roomCounts) {
              setRoomCounts(data.roomCounts);
            }
            
            // Update this client's chatroom if specified
            if (data.chatRoom) {
              setChatRoomState(data.chatRoom);
              
              // Add a system message about chatroom change
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `Chatroom changed to ${data.chatRoom}`,
                timestamp: new Date(),
                type: 'system'
              });
            }
            break;
            
          case MessageType.UPDATE_AVATAR:
            // We don't need to update local state as we'll get an updated user list from the server
            addMessage({
              id: self.crypto.randomUUID(),
              username: 'System',
              text: 'Avatar updated',
              timestamp: new Date(),
              type: 'system'
            });
            break;
            
          case MessageType.UPDATE_REACTIONS:
            if (data.messageId && data.reactions) {
              // Update the reactions for the specific message
              setMessages(prev => prev.map(msg => 
                msg.id === data.messageId 
                  ? { ...msg, reactions: data.reactions } 
                  : msg
              ));
            }
            break;
            
          // Friend system message types
          case MessageType.FRIEND_LIST_UPDATE:
            if (data.friends) {
              setFriends(data.friends);
            }
            break;
            
          case MessageType.FRIEND_REQUEST:
            if (data.friendUsername && data.friendStatus === FriendStatus.PENDING) {
              // Add to friend requests
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `You received a friend request from ${data.friendUsername}`,
                timestamp: new Date(),
                type: 'system'
              });
              
              // Update friend requests list
              if (data.friends) {
                setFriendRequests(data.friends.filter(f => f.status === FriendStatus.PENDING));
              }
            }
            break;
            
          case MessageType.FRIEND_ACCEPT:
            if (data.friendUsername && data.friendStatus === FriendStatus.ACCEPTED) {
              // Add system message
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `${data.friendUsername} accepted your friend request`,
                timestamp: new Date(),
                type: 'system'
              });
              
              // Update friends list
              if (data.friends) {
                setFriends(data.friends.filter(f => f.status === FriendStatus.ACCEPTED));
              }
            }
            break;
            
          case MessageType.FRIEND_REJECT:
            if (data.friendUsername && data.friendStatus === FriendStatus.REJECTED) {
              // Add system message
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `${data.friendUsername} rejected your friend request`,
                timestamp: new Date(),
                type: 'system'
              });
            }
            break;
            
          case MessageType.FRIEND_REMOVE:
            if (data.friendUsername) {
              // Add system message
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `You are no longer friends with ${data.friendUsername}`,
                timestamp: new Date(),
                type: 'system'
              });
              
              // Update friends list
              if (data.friends) {
                setFriends(data.friends.filter(f => f.status === FriendStatus.ACCEPTED));
              }
            }
            break;
            
          case MessageType.FRIEND_COLOR_UPDATE:
            if (data.friendUsername && data.friendColor) {
              // Update color in friend list
              setFriends(prev => 
                prev.map(friend => 
                  friend.username === data.friendUsername
                    ? { ...friend, color: data.friendColor }
                    : friend
                )
              );
            }
            break;
            
          // Site status messages
          case MessageType.SITE_CLOSED:
            if (data.siteStatus) {
              setSiteStatus(data.siteStatus);
              
              // Add system message
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `The site has been closed: ${data.siteStatus.message}`,
                timestamp: new Date(),
                type: 'system'
              });
              
              // Disconnect if site is closed
              if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
                setTimeout(() => disconnect(), 2000); // Give user time to see the message
              }
            }
            break;
            
          case MessageType.SITE_OPENED:
            if (data.siteStatus) {
              setSiteStatus(data.siteStatus);
              
              // Add system message
              addMessage({
                id: self.crypto.randomUUID(),
                username: 'System',
                text: `The site has been reopened: ${data.siteStatus.message}`,
                timestamp: new Date(),
                type: 'system'
              });
            }
            break;
            
          case MessageType.SITE_STATUS_UPDATE:
            if (data.siteStatus) {
              setSiteStatus(data.siteStatus);
            }
            break;
        }
      });
      
      // Connection closed
      socket.addEventListener('close', () => {
        setConnectionStatus('disconnected');
      });
      
      // Connection error
      socket.addEventListener('error', (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error. Please try again.');
        setConnectionStatus('disconnected');
      });
    } catch (err) {
      console.error('Error establishing WebSocket connection:', err);
      setError('Connection error. Please try again.');
      setConnectionStatus('disconnected');
    }
  }, [connectionStatus]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);
  
  // Add message to the messages list
  const addMessage = useCallback((message: ChatMessage) => {
    setMessages(prev => [...prev, message]);
  }, []);
  
  // Send message through WebSocket
  const sendMessage = useCallback((text: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && text.trim()) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.CHAT,
        text
      }));
    }
  }, []);
  
  // Send private message to specific user
  const sendPrivateMessage = useCallback((text: string, recipient: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && text.trim() && recipient) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.PRIVATE_MESSAGE,
        text,
        recipient,
        isPrivate: true
      }));
    }
  }, []);

  // Send voice message
  const sendVoiceMessage = useCallback((text: string, voiceData: string, voiceDuration: number) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && voiceData) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.VOICE_MESSAGE,
        text: text || "Voice message",
        voiceData,
        voiceDuration,
        isVoiceMessage: true
      }));
    }
  }, []);

  // Send private voice message
  const sendPrivateVoiceMessage = useCallback((text: string, recipient: string, voiceData: string, voiceDuration: number) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && voiceData && recipient) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.VOICE_MESSAGE_PRIVATE,
        text: text || "Voice message",
        recipient,
        voiceData,
        voiceDuration,
        isVoiceMessage: true,
        isPrivate: true
      }));
    }
  }, []);
  
  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      if (socketRef.current.readyState === WebSocket.OPEN) {
        // Send leave message
        socketRef.current.send(JSON.stringify({
          type: MessageType.LEAVE,
          username: usernameRef.current
        }));
      }
      
      socketRef.current.close();
      socketRef.current = null;
    }
    
    usernameRef.current = null;
    setConnectionStatus('disconnected');
    setUsers([]);
    setMessages([]);
    setPrivateMessages(new Map());
  }, []);
  
  // Set chat mode and send update to server
  const setChatMode = useCallback((mode: 'local' | 'global') => {
    if (mode !== chatMode && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.UPDATE_CHAT_MODE,
        chatMode: mode
      }));
      setChatModeState(mode);
    }
  }, [chatMode]);
  
  // Set region and send update to server
  const setRegion = useCallback((newRegion: ChatRegion) => {
    if (newRegion !== region && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.UPDATE_REGION,
        region: newRegion
      }));
      setRegionState(newRegion);
    }
  }, [region]);
  
  // Set chatroom and send update to server
  const setChatRoom = useCallback((newChatRoom: ChatRoom) => {
    if (newChatRoom !== chatRoom && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.UPDATE_CHATROOM,
        chatRoom: newChatRoom
      }));
      setChatRoomState(newChatRoom);
    }
  }, [chatRoom]);
  
  // Update avatar and send to server
  const updateAvatar = useCallback((
    avatarColor: string, 
    avatarShape: 'circle' | 'square' | 'rounded', 
    avatarInitials: string
  ) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.UPDATE_AVATAR,
        avatarColor,
        avatarShape, 
        avatarInitials
      }));
    }
  }, []);
  
  // Add reaction to message
  const addReaction = useCallback((messageId: string, emoji: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && messageId && emoji) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.ADD_REACTION,
        messageId,
        emoji
      }));
    }
  }, []);
  
  // Remove reaction from message
  const removeReaction = useCallback((messageId: string, emoji: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && messageId && emoji) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.REMOVE_REACTION,
        messageId,
        emoji
      }));
    }
  }, []);
  
  // Friend system methods
  const sendFriendRequest = useCallback((username: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && username) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.FRIEND_REQUEST,
        friendUsername: username
      }));
    }
  }, []);
  
  const acceptFriendRequest = useCallback((username: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && username) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.FRIEND_ACCEPT,
        friendUsername: username
      }));
    }
  }, []);
  
  const rejectFriendRequest = useCallback((username: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && username) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.FRIEND_REJECT,
        friendUsername: username
      }));
    }
  }, []);
  
  const removeFriend = useCallback((username: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && username) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.FRIEND_REMOVE,
        friendUsername: username
      }));
    }
  }, []);
  
  const updateFriendColor = useCallback((username: string, color: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && username && color) {
      socketRef.current.send(JSON.stringify({
        type: MessageType.FRIEND_COLOR_UPDATE,
        friendUsername: username,
        friendColor: color
      }));
    }
  }, []);

  return {
    users,
    messages,
    privateMessages,
    connectionStatus,
    error,
    chatMode,
    region,
    chatRoom,
    roomCounts,
    friends,
    friendRequests,
    siteStatus,
    connect,
    disconnect,
    sendMessage,
    sendPrivateMessage,
    sendVoiceMessage,
    sendPrivateVoiceMessage,
    setChatMode,
    setRegion,
    setChatRoom,
    updateAvatar,
    addReaction,
    removeReaction,
    // Friend system methods
    sendFriendRequest,
    acceptFriendRequest,
    rejectFriendRequest,
    removeFriend,
    updateFriendColor
  };
}
