import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatUser, ChatMessage, MessageType, WSMessage } from '@shared/schema';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

interface UseChatResult {
  users: ChatUser[];
  messages: ChatMessage[];
  connectionStatus: ConnectionStatus;
  error: string | null;
  connect: (username: string) => void;
  disconnect: () => void;
  sendMessage: (text: string) => void;
}

export function useChat(): UseChatResult {
  const [users, setUsers] = useState<ChatUser[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<string | null>(null);
  
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
  }, []);
  
  return {
    users,
    messages,
    connectionStatus,
    error,
    connect,
    disconnect,
    sendMessage
  };
}
