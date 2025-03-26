import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { MessageType, type WSMessage } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track connected clients
  const clients = new Map<WebSocket, { username: string }>();
  
  // WebSocket server connection handler
  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');
    
    // Message handler
    ws.on('message', async (messageData) => {
      try {
        const message: WSMessage = JSON.parse(messageData.toString());
        
        // Handle different message types
        switch (message.type) {
          case MessageType.JOIN: {
            if (message.username) {
              // Check if username is already taken
              const existingUsers = await storage.getChatUsers();
              const usernameTaken = existingUsers.some(user => 
                user.username.toLowerCase() === message.username?.toLowerCase()
              );
              
              if (usernameTaken) {
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Username already taken'
                }));
                return;
              }
              
              // Store client info
              clients.set(ws, { username: message.username });
              
              // Add user to storage
              await storage.addChatUser(message.username);
              
              // Send join message to all clients
              const joinMessage = await storage.addMessage(
                message.username, 
                `${message.username} has joined the chat`, 
                'system'
              );
              
              // Send the updated user list to all clients
              const updatedUsers = await storage.getChatUsers();
              
              // Broadcast user list and join message to all clients
              broadcastToAll({
                type: MessageType.USERS,
                users: updatedUsers
              });
              
              broadcastToAll({
                type: MessageType.JOIN,
                username: message.username,
                text: joinMessage.text,
                timestamp: joinMessage.timestamp.toISOString()
              });
              
              // Send existing messages to the new client
              const existingMessages = await storage.getMessages(100);
              ws.send(JSON.stringify({
                type: MessageType.HISTORY,
                messages: existingMessages.map(msg => ({
                  type: msg.type === 'system' ? MessageType.JOIN : MessageType.CHAT,
                  username: msg.username,
                  text: msg.text,
                  timestamp: msg.timestamp.toISOString()
                }))
              }));
            }
            break;
          }
          
          case MessageType.CHAT: {
            const client = clients.get(ws);
            if (client && message.text) {
              // Store the message
              const chatMessage = await storage.addMessage(
                client.username,
                message.text,
                'user'
              );
              
              // Broadcast to all clients
              broadcastToAll({
                type: MessageType.CHAT,
                username: client.username,
                text: message.text,
                timestamp: chatMessage.timestamp.toISOString()
              });
            }
            break;
          }
          
          case MessageType.LEAVE: {
            handleDisconnect(ws);
            break;
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    });
    
    // Handle disconnection
    ws.on('close', () => {
      handleDisconnect(ws);
    });
  });
  
  // Function to handle client disconnection
  async function handleDisconnect(ws: WebSocket) {
    const client = clients.get(ws);
    if (client) {
      const { username } = client;
      
      // Remove from clients map
      clients.delete(ws);
      
      // Remove from storage
      await storage.removeChatUser(username);
      
      // Add system message for user leaving
      const leaveMessage = await storage.addMessage(
        username,
        `${username} has left the chat`,
        'system'
      );
      
      // Get updated user list
      const updatedUsers = await storage.getChatUsers();
      
      // Broadcast to all remaining clients
      broadcastToAll({
        type: MessageType.USERS,
        users: updatedUsers
      });
      
      broadcastToAll({
        type: MessageType.LEAVE,
        username: username,
        text: leaveMessage.text,
        timestamp: leaveMessage.timestamp.toISOString()
      });
    }
  }
  
  // Function to broadcast a message to all connected clients
  function broadcastToAll(message: WSMessage) {
    const messageStr = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  // API Route to get all active users
  app.get('/api/users', async (req, res) => {
    try {
      const users = await storage.getChatUsers();
      res.json(users);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching users' });
    }
  });
  
  // API Route to get recent messages
  app.get('/api/messages', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const messages = await storage.getMessages(limit);
      res.json(messages);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching messages' });
    }
  });

  return httpServer;
}
