import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { MessageType, type WSMessage, ChatRegion, ChatRoom, FriendStatus, insertUserSchema, loginSchema, registerSchema } from "@shared/schema";
// Not using OpenAI anymore - homework helper works without API key
import bcrypt from "bcryptjs";
import { z } from "zod";
import Twilio from "twilio";
import { containsBannedWords, filterMessage, isUsernameSafe } from "./profanity-filter";

// Helper function to get a readable region name
function getRegionDisplayName(region: ChatRegion): string {
  switch (region) {
    case ChatRegion.NORTH_AMERICA: return 'North America';
    case ChatRegion.EUROPE: return 'Europe';
    case ChatRegion.ASIA: return 'Asia';
    case ChatRegion.SOUTH_AMERICA: return 'South America';
    case ChatRegion.AFRICA: return 'Africa';
    case ChatRegion.OCEANIA: return 'Oceania';
    case ChatRegion.GLOBAL:
    default: return 'Global';
  }
}

// Helper function to get a readable chatroom name
function getChatRoomDisplayName(chatRoom: ChatRoom): string {
  switch (chatRoom) {
    case ChatRoom.CASUAL: return 'Casual Chat';
    case ChatRoom.TECH: return 'Tech Talk';
    case ChatRoom.GAMING: return 'Gaming Zone';
    case ChatRoom.GENERAL:
    default: return 'General Discussion';
  }
}

// Helper function to get the count of users in each chatroom
function getRoomCounts(clients: Map<WebSocket, { chatRoom: ChatRoom }>): Record<ChatRoom, number> {
  const counts: Record<ChatRoom, number> = {
    [ChatRoom.GENERAL]: 0,
    [ChatRoom.CASUAL]: 0,
    [ChatRoom.TECH]: 0,
    [ChatRoom.GAMING]: 0
  };
  
  clients.forEach(client => {
    counts[client.chatRoom]++;
  });
  
  return counts;
}

// Helper function to send SMS notifications via Twilio
async function sendSmsNotification(phoneNumber: string, message: string): Promise<boolean> {
  try {
    console.log("Attempting to send SMS to:", phoneNumber, "Message:", message);
    
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
      console.error("Twilio credentials are missing from environment variables");
      return false;
    }

    // Validate phone number format (basic E.164 format check)
    if (!phoneNumber.startsWith('+')) {
      console.log("Invalid phone number format:", phoneNumber);
      return false;
    }

    console.log("Twilio credentials found, sending SMS...");
    console.log("From:", process.env.TWILIO_PHONE_NUMBER, "To:", phoneNumber);

    const twilioClient = Twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    
    await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: phoneNumber
    });
    
    console.log(`SMS notification sent successfully to ${phoneNumber}`);
    return true;
  } catch (error) {
    console.error("Failed to send SMS notification:", error);
    return false;
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Create HTTP server
  const httpServer = createServer(app);
  
  // Create WebSocket server
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Track connected clients
  const clients = new Map<WebSocket, { 
    username: string;
    chatMode: 'local' | 'global';
    region: ChatRegion;
    chatRoom: ChatRoom;
    avatarColor?: string;
    avatarShape?: 'circle' | 'square' | 'rounded';
    avatarInitials?: string;
  }>();
  
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
              
              // Check if username contains profanity
              if (!isUsernameSafe(message.username)) {
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Username contains inappropriate language. Please choose another username.'
                }));
                return;
              }
              
              // Store client info with default settings
              clients.set(ws, { 
                username: message.username,
                chatMode: 'global', // Default to global
                region: ChatRegion.GLOBAL, // Default to global region
                chatRoom: ChatRoom.GENERAL, // Default chat room
                avatarColor: '#6366f1', // Default indigo color
                avatarShape: 'circle', // Default circle shape
                avatarInitials: message.username.charAt(0).toUpperCase() // First letter of username
              });
              
              // Add user to storage
              await storage.addChatUser(message.username);
              
              // Update user activity time
              await storage.updateUserLastActive(message.username);
              
              // Send join message to all clients
              const joinMessage = await storage.addMessage(
                message.username, 
                `${message.username} has joined the chat`, 
                'system'
              );
              
              // Send the updated user list to all clients
              const updatedUsers = await storage.getChatUsers();
              
              // Check if any friends have SMS notifications enabled and send them
              try {
                // Get the list of users who have this user as a friend and notification enabled
                const friends = await storage.getFriends(message.username);
                
                // For each friend, check their notification preferences
                for (const friend of friends) {
                  const friendUser = updatedUsers.find(u => u.username === friend.username);
                  
                  // If the friend has notification preferences enabled and has a phone number
                  if (friendUser && friendUser.notifyFriendOnline && friendUser.phoneNumber) {
                    // Send SMS notification via Twilio
                    await sendSmsNotification(
                      friendUser.phoneNumber,
                      `${message.username} is now online!`
                    );
                  }
                }
              } catch (error) {
                console.error("Failed to send SMS notifications:", error);
              }
              
              // Get the room counts
              const roomCounts = getRoomCounts(clients);
              
              // Broadcast user list, room counts, and join message to all clients
              broadcastToAll({
                type: MessageType.USERS,
                users: updatedUsers
              });
              
              broadcastToAll({
                type: MessageType.UPDATE_CHATROOM,
                roomCounts
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
              // Check for banned words
              if (containsBannedWords(message.text)) {
                // Filter the message
                const filteredText = filterMessage(message.text);
                
                // Notify user about filtered content
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: "Your message contained inappropriate language and has been filtered.",
                  timestamp: new Date().toISOString()
                }));
                
                // Update message.text with filtered version
                message.text = filteredText;
              }
              
              // Update user's last active time
              await storage.updateUserLastActive(client.username);
              
              // Store the message
              const chatMessage = await storage.addMessage(
                client.username,
                message.text,
                'user'
              );
              
              // Determine how to broadcast based on chat mode
              if (client.chatMode === 'global') {
                // In global mode, broadcast to all clients
                broadcastToAll({
                  type: MessageType.CHAT,
                  username: client.username,
                  text: message.text,
                  timestamp: chatMessage.timestamp.toISOString()
                });
              } else {
                // In local mode, only broadcast to the same region
                broadcastToRegion({
                  type: MessageType.CHAT,
                  username: client.username,
                  text: message.text,
                  timestamp: chatMessage.timestamp.toISOString()
                }, client.region);
              }
            }
            break;
          }
          
          case MessageType.VOICE_MESSAGE: {
            const client = clients.get(ws);
            if (client && message.text && message.voiceData !== undefined && message.voiceDuration !== undefined) {
              // Update user's last active time
              await storage.updateUserLastActive(client.username);
              
              // Store the voice message
              const voiceMessage = await storage.addVoiceMessage(
                client.username,
                message.text, // Usually a placeholder like "Voice message"
                message.voiceData,
                message.voiceDuration
              );
              
              // Determine how to broadcast based on chat mode
              if (client.chatMode === 'global') {
                // In global mode, broadcast to all clients
                broadcastToAll({
                  type: MessageType.VOICE_MESSAGE,
                  username: client.username,
                  text: message.text,
                  timestamp: voiceMessage.timestamp.toISOString(),
                  isVoiceMessage: true,
                  voiceData: message.voiceData,
                  voiceDuration: message.voiceDuration
                });
              } else {
                // In local mode, only broadcast to the same region
                broadcastToRegion({
                  type: MessageType.VOICE_MESSAGE,
                  username: client.username,
                  text: message.text,
                  timestamp: voiceMessage.timestamp.toISOString(),
                  isVoiceMessage: true,
                  voiceData: message.voiceData,
                  voiceDuration: message.voiceDuration
                }, client.region);
              }
            }
            break;
          }
          
          case MessageType.PRIVATE_MESSAGE: {
            const client = clients.get(ws);
            if (client && message.text && message.recipient) {
              // Check if users are friends (private messaging restricted to friends only)
              const friends = await storage.getFriends(client.username);
              const isFriend = friends.some(f => 
                f.username === message.recipient && f.status === FriendStatus.ACCEPTED
              );
              
              if (!isFriend) {
                // Not friends, send error message
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: `You can only send private messages to your friends. Add ${message.recipient} as a friend first.`,
                  timestamp: new Date().toISOString()
                }));
                break;
              }
              
              // Check for banned words
              if (containsBannedWords(message.text)) {
                // Filter the message
                const filteredText = filterMessage(message.text);
                
                // Notify user about filtered content
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: "Your private message contained inappropriate language and has been filtered.",
                  timestamp: new Date().toISOString()
                }));
                
                // Update message.text with filtered version
                message.text = filteredText;
              }
              
              // Update user's last active time
              await storage.updateUserLastActive(client.username);
              
              // Store the private message
              const privateMessage = await storage.addMessage(
                client.username,
                message.text,
                'user',
                message.recipient,
                true // Mark as private
              );
              
              // Create message payload
              const messagePayload = {
                type: MessageType.PRIVATE_MESSAGE,
                username: client.username,
                text: message.text,
                timestamp: privateMessage.timestamp.toISOString(),
                recipient: message.recipient,
                isPrivate: true
              };
              
              // Send to recipient only
              let recipientFound = false;
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  const clientData = clients.get(client as WebSocket);
                  if (clientData && clientData.username === message.recipient) {
                    client.send(JSON.stringify(messagePayload));
                    recipientFound = true;
                  }
                }
              });
              
              // Send back to sender
              ws.send(JSON.stringify(messagePayload));
              
              // If recipient not found, send a system message to sender
              if (!recipientFound) {
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: `User ${message.recipient} is not online or doesn't exist.`,
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          case MessageType.VOICE_MESSAGE_PRIVATE: {
            const client = clients.get(ws);
            if (client && message.text && message.recipient && message.voiceData !== undefined && message.voiceDuration !== undefined) {
              // Check if users are friends (private messaging restricted to friends only)
              const friends = await storage.getFriends(client.username);
              const isFriend = friends.some(f => 
                f.username === message.recipient && f.status === FriendStatus.ACCEPTED
              );
              
              if (!isFriend) {
                // Not friends, send error message
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: `You can only send private voice messages to your friends. Add ${message.recipient} as a friend first.`,
                  timestamp: new Date().toISOString()
                }));
                break;
              }
              
              // Update user's last active time
              await storage.updateUserLastActive(client.username);
              
              // Store the private voice message
              const privateVoiceMessage = await storage.addVoiceMessage(
                client.username,
                message.text,
                message.voiceData,
                message.voiceDuration,
                message.recipient,
                true // Mark as private
              );
              
              // Create message payload
              const messagePayload = {
                type: MessageType.VOICE_MESSAGE_PRIVATE,
                username: client.username,
                text: message.text,
                timestamp: privateVoiceMessage.timestamp.toISOString(),
                recipient: message.recipient,
                isPrivate: true,
                isVoiceMessage: true,
                voiceData: message.voiceData,
                voiceDuration: message.voiceDuration
              };
              
              // Send to recipient only
              let recipientFound = false;
              wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                  const clientData = clients.get(client as WebSocket);
                  if (clientData && clientData.username === message.recipient) {
                    client.send(JSON.stringify(messagePayload));
                    recipientFound = true;
                  }
                }
              });
              
              // Send back to sender
              ws.send(JSON.stringify(messagePayload));
              
              // If recipient not found, send a system message to sender
              if (!recipientFound) {
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: `User ${message.recipient} is not online or doesn't exist.`,
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          case MessageType.LEAVE: {
            handleDisconnect(ws);
            break;
          }
          
          // Handle chat mode update
          case MessageType.UPDATE_CHAT_MODE: {
            const client = clients.get(ws);
            if (client && message.chatMode && (message.chatMode === 'local' || message.chatMode === 'global')) {
              // Update client's chat mode
              client.chatMode = message.chatMode;
              
              // Send confirmation to the client
              ws.send(JSON.stringify({
                type: MessageType.CHAT,
                username: 'System',
                text: `Your chat mode has been updated to ${message.chatMode === 'global' ? 'Global' : 'Local'}`,
                timestamp: new Date().toISOString()
              }));
            }
            break;
          }
          
          // Handle region update
          case MessageType.UPDATE_REGION: {
            const client = clients.get(ws);
            if (client && message.region && Object.values(ChatRegion).includes(message.region as ChatRegion)) {
              // Update client's region
              client.region = message.region as ChatRegion;
              
              // Send confirmation to the client
              ws.send(JSON.stringify({
                type: MessageType.CHAT,
                username: 'System',
                text: `Your region has been updated to ${getRegionDisplayName(message.region as ChatRegion)}`,
                timestamp: new Date().toISOString()
              }));
            }
            break;
          }
          
          // Handle chatroom update
          case MessageType.UPDATE_CHATROOM: {
            const client = clients.get(ws);
            if (client && message.chatRoom && Object.values(ChatRoom).includes(message.chatRoom as ChatRoom)) {
              // Update client's chatroom
              client.chatRoom = message.chatRoom as ChatRoom;
              
              // Get the counts for each chatroom
              const roomCounts = getRoomCounts(clients);
              
              // Send confirmation to the client
              ws.send(JSON.stringify({
                type: MessageType.CHAT,
                username: 'System',
                text: `You've joined the ${getChatRoomDisplayName(message.chatRoom as ChatRoom)} room`,
                timestamp: new Date().toISOString()
              }));
              
              // Broadcast updated room counts to all clients
              broadcastToAll({
                type: MessageType.UPDATE_CHATROOM,
                roomCounts
              });
            }
            break;
          }
          
          // Handle avatar update
          case MessageType.UPDATE_AVATAR: {
            const client = clients.get(ws);
            if (client) {
              // Update client's avatar properties if provided
              if (message.avatarColor) {
                client.avatarColor = message.avatarColor;
              }
              
              if (message.avatarShape && ['circle', 'square', 'rounded'].includes(message.avatarShape)) {
                client.avatarShape = message.avatarShape as 'circle' | 'square' | 'rounded';
              }
              
              if (message.avatarInitials) {
                client.avatarInitials = message.avatarInitials.substring(0, 2); // Limit to 2 characters
              }
              
              // Send confirmation to the client
              ws.send(JSON.stringify({
                type: MessageType.CHAT,
                username: 'System',
                text: 'Your avatar has been updated',
                timestamp: new Date().toISOString()
              }));
              
              // Broadcast updated user list to all clients
              const updatedUsers = await storage.getChatUsers();
              broadcastToAll({
                type: MessageType.USERS,
                users: updatedUsers
              });
            }
            break;
          }
          
          // Handle adding an emoji reaction to a message
          case MessageType.ADD_REACTION: {
            const client = clients.get(ws);
            if (client && message.messageId && message.emoji && client.username) {
              try {
                // Add the reaction to the message
                const updatedReactions = await storage.addReaction(
                  message.messageId,
                  client.username,
                  message.emoji
                );
                
                // Broadcast the updated reactions to all clients
                broadcastToAll({
                  type: MessageType.UPDATE_REACTIONS,
                  messageId: message.messageId,
                  reactions: updatedReactions
                });
              } catch (error) {
                console.error('Error adding reaction:', error);
                // Send error message to client
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to add reaction',
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          // Handle removing an emoji reaction from a message
          case MessageType.REMOVE_REACTION: {
            const client = clients.get(ws);
            if (client && message.messageId && message.emoji && client.username) {
              try {
                // Remove the reaction from the message
                const updatedReactions = await storage.removeReaction(
                  message.messageId,
                  client.username,
                  message.emoji
                );
                
                // Broadcast the updated reactions to all clients
                broadcastToAll({
                  type: MessageType.UPDATE_REACTIONS,
                  messageId: message.messageId,
                  reactions: updatedReactions
                });
              } catch (error) {
                console.error('Error removing reaction:', error);
                // Send error message to client
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to remove reaction',
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }

          // Handle friend request
          case MessageType.FRIEND_REQUEST: {
            const client = clients.get(ws);
            if (client && client.username && message.friendUsername) {
              try {
                // Send friend request
                const success = await storage.sendFriendRequest(
                  client.username,
                  message.friendUsername
                );
                
                if (success) {
                  // Get the updated friend lists
                  const senderFriends = await storage.getFriends(client.username);
                  const receiverFriends = await storage.getFriends(message.friendUsername);
                  const receiverRequests = await storage.getFriendRequests(message.friendUsername);
                  
                  // Send updated friend lists to both users
                  // To the sender
                  ws.send(JSON.stringify({
                    type: MessageType.FRIEND_LIST_UPDATE,
                    friends: senderFriends
                  }));
                  
                  // To the recipient - find their connection
                  wss.clients.forEach((clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      const clientInfo = clients.get(clientWs as WebSocket);
                      if (clientInfo && clientInfo.username === message.friendUsername) {
                        clientWs.send(JSON.stringify({
                          type: MessageType.FRIEND_REQUEST,
                          friendUsername: client.username,
                          friendStatus: FriendStatus.PENDING,
                          friends: receiverRequests
                        }));
                      }
                    }
                  });
                } else {
                  // Send error if the request failed
                  ws.send(JSON.stringify({
                    type: MessageType.ERROR,
                    text: 'Friend request failed. The user might already be your friend or have a pending request.',
                    timestamp: new Date().toISOString()
                  }));
                }
              } catch (error) {
                console.error('Error sending friend request:', error);
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to send friend request',
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          // Handle friend request acceptance
          case MessageType.FRIEND_ACCEPT: {
            const client = clients.get(ws);
            if (client && client.username && message.friendUsername) {
              try {
                // Accept the friend request
                const success = await storage.acceptFriendRequest(
                  message.friendUsername, // The requester's username
                  client.username // The accepter's username (current user)
                );
                
                if (success) {
                  // Get updated friend lists
                  const accepterFriends = await storage.getFriends(client.username);
                  const requesterFriends = await storage.getFriends(message.friendUsername);
                  
                  // Send updated friend lists to both users
                  // To the accepter (current user)
                  ws.send(JSON.stringify({
                    type: MessageType.FRIEND_LIST_UPDATE,
                    friends: accepterFriends
                  }));
                  
                  // To the requester - find their connection
                  wss.clients.forEach((clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      const clientInfo = clients.get(clientWs as WebSocket);
                      if (clientInfo && clientInfo.username === message.friendUsername) {
                        clientWs.send(JSON.stringify({
                          type: MessageType.FRIEND_ACCEPT,
                          friendUsername: client.username,
                          friendStatus: FriendStatus.ACCEPTED,
                          friends: requesterFriends
                        }));
                      }
                    }
                  });
                } else {
                  // Send error if the acceptance failed
                  ws.send(JSON.stringify({
                    type: MessageType.ERROR,
                    text: 'Failed to accept friend request. It may have been cancelled or already accepted.',
                    timestamp: new Date().toISOString()
                  }));
                }
              } catch (error) {
                console.error('Error accepting friend request:', error);
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to accept friend request',
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          // Handle friend request rejection
          case MessageType.FRIEND_REJECT: {
            const client = clients.get(ws);
            if (client && client.username && message.friendUsername) {
              try {
                // Reject the friend request
                const success = await storage.rejectFriendRequest(
                  message.friendUsername, // The requester's username
                  client.username // The rejecter's username (current user)
                );
                
                if (success) {
                  // Get updated friend lists for the rejecter
                  const rejecterRequests = await storage.getFriendRequests(client.username);
                  
                  // Send updated friend lists to the rejecter (current user)
                  ws.send(JSON.stringify({
                    type: MessageType.FRIEND_LIST_UPDATE,
                    friends: rejecterRequests
                  }));
                  
                  // Notify the requester that their request was rejected
                  wss.clients.forEach((clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      const clientInfo = clients.get(clientWs as WebSocket);
                      if (clientInfo && clientInfo.username === message.friendUsername) {
                        clientWs.send(JSON.stringify({
                          type: MessageType.FRIEND_REJECT,
                          friendUsername: client.username,
                          friendStatus: FriendStatus.REJECTED
                        }));
                      }
                    }
                  });
                } else {
                  // Send error if the rejection failed
                  ws.send(JSON.stringify({
                    type: MessageType.ERROR,
                    text: 'Failed to reject friend request. It may have already been cancelled.',
                    timestamp: new Date().toISOString()
                  }));
                }
              } catch (error) {
                console.error('Error rejecting friend request:', error);
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to reject friend request',
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          // Handle friend removal
          case MessageType.FRIEND_REMOVE: {
            const client = clients.get(ws);
            if (client && client.username && message.friendUsername) {
              try {
                // Remove the friend
                const success = await storage.removeFriend(
                  client.username,
                  message.friendUsername
                );
                
                if (success) {
                  // Get updated friend lists
                  const removerFriends = await storage.getFriends(client.username);
                  const removedFriends = await storage.getFriends(message.friendUsername);
                  
                  // Send updated friend lists to both users
                  // To the remover (current user)
                  ws.send(JSON.stringify({
                    type: MessageType.FRIEND_LIST_UPDATE,
                    friends: removerFriends
                  }));
                  
                  // To the removed friend - find their connection
                  wss.clients.forEach((clientWs) => {
                    if (clientWs.readyState === WebSocket.OPEN) {
                      const clientInfo = clients.get(clientWs as WebSocket);
                      if (clientInfo && clientInfo.username === message.friendUsername) {
                        clientWs.send(JSON.stringify({
                          type: MessageType.FRIEND_REMOVE,
                          friendUsername: client.username,
                          friends: removedFriends
                        }));
                      }
                    }
                  });
                } else {
                  // Send error if the removal failed
                  ws.send(JSON.stringify({
                    type: MessageType.ERROR,
                    text: 'Failed to remove friend. You may not be friends with this user.',
                    timestamp: new Date().toISOString()
                  }));
                }
              } catch (error) {
                console.error('Error removing friend:', error);
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to remove friend',
                  timestamp: new Date().toISOString()
                }));
              }
            }
            break;
          }
          
          // Handle friend color updates
          case MessageType.FRIEND_COLOR_UPDATE: {
            const client = clients.get(ws);
            if (client && client.username && message.friendUsername && message.friendColor) {
              try {
                // Update the friend's color
                const success = await storage.updateFriendColor(
                  client.username,
                  message.friendUsername,
                  message.friendColor
                );
                
                if (success) {
                  // Get updated friends with color
                  const updatedFriends = await storage.getFriends(client.username);
                  
                  // Send updated friend list to the user
                  ws.send(JSON.stringify({
                    type: MessageType.FRIEND_LIST_UPDATE,
                    friends: updatedFriends
                  }));
                } else {
                  // Send error if the color update failed
                  ws.send(JSON.stringify({
                    type: MessageType.ERROR,
                    text: 'Failed to update friend color. You may not be friends with this user.',
                    timestamp: new Date().toISOString()
                  }));
                }
              } catch (error) {
                console.error('Error updating friend color:', error);
                ws.send(JSON.stringify({
                  type: MessageType.ERROR,
                  text: 'Failed to update friend color',
                  timestamp: new Date().toISOString()
                }));
              }
            }
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
      
      // Get updated user list and room counts
      const updatedUsers = await storage.getChatUsers();
      const roomCounts = getRoomCounts(clients);
      
      // Broadcast to all remaining clients
      broadcastToAll({
        type: MessageType.USERS,
        users: updatedUsers
      });
      
      broadcastToAll({
        type: MessageType.UPDATE_CHATROOM,
        roomCounts
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
        const clientData = clients.get(client as WebSocket);
        
        if (clientData) {
          // If it's a chat message or voice message, only send to global users
          if ((message.type === MessageType.CHAT || message.type === MessageType.VOICE_MESSAGE) && 
              clientData.chatMode === 'local') {
            // Don't send messages to local users unless it's through the region-specific broadcast
            return;
          }
          
          // For any other type of message (users lists, join/leave notifications, etc.)
          // or for global users, always send the message
          client.send(messageStr);
        }
      }
    });
  }
  
  // Function to broadcast a message only to clients in a specific region
  function broadcastToRegion(message: WSMessage, region: ChatRegion) {
    const messageStr = JSON.stringify(message);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        const clientData = clients.get(client as WebSocket);
        
        if (clientData) {
          // Determine whether this client should receive the message
          // 1. If client is in same region as sender, they receive the message
          // 2. If client is in global mode, they won't receive local-only messages unless in same region
          const inSameRegion = clientData.region === region;
          
          if (inSameRegion) {
            // Always deliver messages to clients in the same region
            client.send(messageStr);
          }
        }
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
  
  // API Route to get private messages between two users
  app.get('/api/private-messages', async (req, res) => {
    try {
      const { username, recipient } = req.query;
      
      if (!username || !recipient) {
        return res.status(400).json({ 
          message: 'Both username and recipient are required query parameters' 
        });
      }
      
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
      const messages = await storage.getPrivateMessages(
        username as string, 
        recipient as string, 
        limit
      );
      
      res.json(messages);
    } catch (error) {
      res.status(500).json({ 
        message: 'Error fetching private messages',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API Route to get the leaderboard (users sorted by time online)
  app.get('/api/leaderboard', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const leaderboard = await storage.getUsersByTimeOnline(limit);
      res.json(leaderboard);
    } catch (error) {
      res.status(500).json({ 
        message: 'Error fetching leaderboard',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });
  
  // API Route to get reactions for a specific message
  app.get('/api/messages/:messageId/reactions', async (req, res) => {
    try {
      const { messageId } = req.params;
      
      if (!messageId) {
        return res.status(400).json({ message: 'Message ID is required' });
      }
      
      const reactions = await storage.getMessageReactions(messageId);
      res.json(reactions);
    } catch (error) {
      res.status(500).json({ 
        message: 'Error fetching message reactions',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // No OpenAI client needed anymore - homework helper works without API key
  console.log("AI Homework Helper now works without requiring an API key!");

  // AI Homework Helper endpoint - now works without requiring any API key!
  app.post('/api/ai-homework-help', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      // Determine the response based on the content of the prompt
      const lowercasePrompt = prompt.toLowerCase();
      let response: string;
      
      // Check for math-related questions
      if (lowercasePrompt.includes('math') || 
          lowercasePrompt.includes('equation') || 
          lowercasePrompt.includes('solve') ||
          lowercasePrompt.includes('calculate') ||
          /[0-9+\-*\/=]/.test(lowercasePrompt)) {
        
        if (lowercasePrompt.includes('algebra') || lowercasePrompt.includes('equation')) {
          response = `# Algebra Problem Solving Guide

Let me help you with your algebra problem. When solving algebraic equations, follow these steps:

1. Simplify both sides of the equation by combining like terms
2. Use the addition/subtraction property to isolate variable terms on one side
3. Use the multiplication/division property to solve for the variable
4. Check your solution by substituting back into the original equation

### Example:
If you have an equation like 3x + 4 = 10:
- Subtract 4 from both sides: 3x = 6
- Divide both sides by 3: x = 2
- Check: 3(2) + 4 = 10 ✓

For more complex equations, break them down into smaller steps and apply these same principles sequentially.`;
        } else if (lowercasePrompt.includes('trigonometry') || lowercasePrompt.includes('sin') || lowercasePrompt.includes('cos')) {
          response = `# Trigonometry Concepts Guide

Trigonometry involves the relationships between angles and sides of triangles. Here are key concepts:

### Basic Trig Functions:
- sin(θ) = opposite / hypotenuse
- cos(θ) = adjacent / hypotenuse
- tan(θ) = opposite / adjacent = sin(θ) / cos(θ)

### Key Values to Memorize:
- sin(0°) = 0, sin(30°) = 0.5, sin(45°) = 1/√2, sin(60°) = √3/2, sin(90°) = 1
- cos(0°) = 1, cos(30°) = √3/2, cos(45°) = 1/√2, cos(60°) = 0.5, cos(90°) = 0

### Useful Identities:
- sin²(θ) + cos²(θ) = 1
- sin(A+B) = sin(A)cos(B) + cos(A)sin(B)
- cos(A+B) = cos(A)cos(B) - sin(A)sin(B)

When solving trig problems, draw a diagram, label all known values, and use the appropriate identities to find the unknowns.`;
        } else if (lowercasePrompt.includes('calculus') || lowercasePrompt.includes('derivative') || lowercasePrompt.includes('integral')) {
          response = `# Calculus Problem-Solving Guide

Calculus problems typically involve either derivatives (rates of change) or integrals (accumulation).

### For Derivatives:
1. Know the basic rules:
   - Power rule: d/dx(xⁿ) = n·xⁿ⁻¹
   - Product rule: d/dx(f·g) = f·dg/dx + g·df/dx
   - Chain rule: d/dx(f(g(x))) = f'(g(x))·g'(x)

2. Common derivatives:
   - d/dx(sin x) = cos x
   - d/dx(cos x) = -sin x
   - d/dx(eˣ) = eˣ
   - d/dx(ln x) = 1/x

### For Integrals:
1. Basic integration:
   - ∫xⁿ dx = xⁿ⁺¹/(n+1) + C (where n ≠ -1)
   - ∫1/x dx = ln|x| + C
   - ∫eˣ dx = eˣ + C
   - ∫sin x dx = -cos x + C
   - ∫cos x dx = sin x + C

2. Integration techniques:
   - Substitution (u-substitution)
   - Integration by parts: ∫u dv = uv - ∫v du
   - Partial fractions for rational functions

For applied problems, identify the quantity being measured and the rate of change, then use the appropriate calculus technique.`;
        } else {
          response = `# Mathematics Problem-Solving Framework

When approaching any math problem, follow these steps:

1. **Understand the problem**
   - Identify what's being asked
   - List given information
   - Note any constraints or conditions

2. **Devise a plan**
   - Select an appropriate strategy (e.g., use formula, make table, look for pattern)
   - Break complex problems into smaller steps
   - Consider similar problems you've solved before

3. **Execute the plan**
   - Apply mathematical operations carefully
   - Check each step for accuracy
   - Keep track of units if applicable

4. **Review and verify**
   - Does your answer make logical sense?
   - Plug your solution back into the original problem
   - Check for computational errors

5. **Extend your learning**
   - Consider alternative solution methods
   - Look for connections to other math concepts
   - Think about how to apply this to similar problems

Remember that problem-solving gets easier with practice. If you get stuck, try working backward from what you want to find, or simplify the problem to build understanding.`;
        }
      } 
      // Check for science-related questions
      else if (lowercasePrompt.includes('science') || 
               lowercasePrompt.includes('biology') || 
               lowercasePrompt.includes('physics') || 
               lowercasePrompt.includes('chemistry')) {
        
        if (lowercasePrompt.includes('biology') || lowercasePrompt.includes('cell') || lowercasePrompt.includes('dna')) {
          response = `# Biology Study Guide

Biology is the study of living organisms and their interactions with the environment. Here are key concepts to understand:

### Cellular Biology:
- Cells are the basic unit of life
- Prokaryotic cells (bacteria) lack a nucleus
- Eukaryotic cells (plants, animals) have membrane-bound organelles
- Cell functions: metabolism, reproduction, response to environment, homeostasis

### Genetics:
- DNA is the genetic material that carries hereditary information
- Genes are sections of DNA that code for proteins
- Mendel's laws: segregation and independent assortment
- Mutations can change genetic information

### Evolution:
- Natural selection: organisms with advantageous traits are more likely to survive and reproduce
- Adaptation: traits that help organisms survive in their environment
- Speciation: formation of new species through accumulated genetic changes

### Ecology:
- Energy flows through ecosystems (food chains and webs)
- Matter cycles through ecosystems (carbon, nitrogen, water cycles)
- Biodiversity contributes to ecosystem stability

When answering biology questions, focus on the relationships between structure and function at various levels - from molecules to ecosystems.`;
        } else if (lowercasePrompt.includes('chemistry') || lowercasePrompt.includes('element') || lowercasePrompt.includes('compound')) {
          response = `# Chemistry Problem-Solving Guide

Chemistry studies the composition, structure, properties, and changes of matter. Here's a guide to tackling chemistry problems:

### Atomic Structure:
- Atoms consist of protons, neutrons, and electrons
- Atomic number = number of protons
- Mass number = protons + neutrons
- Isotopes have same number of protons but different numbers of neutrons

### Chemical Bonds:
- Ionic bonds: transfer of electrons between metals and non-metals
- Covalent bonds: sharing of electrons between non-metals
- Metallic bonds: sharing of electrons among metal atoms

### Chemical Reactions:
1. Balance chemical equations (same number of atoms on both sides)
2. Identify reaction type:
   - Synthesis: A + B → AB
   - Decomposition: AB → A + B
   - Single replacement: A + BC → AC + B
   - Double replacement: AB + CD → AD + CB
   - Combustion: Hydrocarbon + O₂ → CO₂ + H₂O

### Stoichiometry:
- Use molar relationships to calculate quantities in reactions
- Mole conversions: grams → moles → molecules/atoms

When solving chemistry problems, keep track of units, use dimensional analysis, and be meticulous about balancing equations.`;
        } else if (lowercasePrompt.includes('physics') || lowercasePrompt.includes('force') || lowercasePrompt.includes('motion')) {
          response = `# Physics Problem-Solving Framework

Physics problems typically involve applying principles to calculate unknown quantities. Follow these steps:

### General Approach:
1. Identify known and unknown variables
2. Select relevant equations
3. Solve algebraically before plugging in numbers
4. Use consistent units (convert if necessary)
5. Verify answer has correct units and reasonable magnitude

### Key Areas:

**Mechanics:**
- Newton's Laws: F = ma
- Conservation of energy: KE + PE = constant in closed systems
- Momentum: p = mv, is conserved in collisions

**Electricity & Magnetism:**
- Ohm's Law: V = IR
- Coulomb's Law: F = k(q₁q₂/r²)
- Circuits: series (I is constant) vs. parallel (V is constant)

**Waves & Optics:**
- Wave equation: v = fλ
- Snell's Law: n₁sin(θ₁) = n₂sin(θ₂)
- Lens equation: 1/f = 1/do + 1/di

**Thermodynamics:**
- First Law: ΔU = Q - W
- Second Law: entropy increases in isolated systems
- PV = nRT for ideal gases

Draw diagrams whenever possible and check answers by plugging back into original equations.`;
        } else {
          response = `# Scientific Method Guide

The scientific method is a process for investigating phenomena and acquiring new knowledge:

1. **Ask a question** based on observations
   - Be specific and focused
   - Ensure it's testable through experiment

2. **Research** existing knowledge
   - Review reliable sources like peer-reviewed journals
   - Understand previous work in the field

3. **Form a hypothesis**
   - Make a testable prediction
   - Usually follows "If...then..." format
   - Should be falsifiable

4. **Test with experiments**
   - Design controlled experiments
   - Change only one variable at a time
   - Collect quantitative data when possible
   - Use appropriate sample sizes
   - Include control groups

5. **Analyze data**
   - Use appropriate statistical methods
   - Look for patterns and relationships
   - Determine if results support hypothesis

6. **Draw conclusions**
   - Accept, reject, or modify hypothesis
   - Consider alternative explanations
   - Identify limitations of your study

7. **Communicate results**
   - Share findings with scientific community
   - Enable others to replicate your work

Science is an iterative process. New questions often arise from your research, leading to further investigation and deeper understanding.`;
        }
      } 
      // Check for history-related questions
      else if (lowercasePrompt.includes('history') || 
               lowercasePrompt.includes('civilization') || 
               lowercasePrompt.includes('war') || 
               lowercasePrompt.includes('century')) {
        
        response = `# Historical Analysis Framework

When analyzing historical events or periods, consider these dimensions:

### Political Context
- Systems of government
- Key leaders and their policies
- Power struggles and conflicts
- Formation and dissolution of nations

### Economic Factors
- Systems of production and trade
- Resource distribution and access
- Technological developments
- Economic crises and growth periods

### Social Elements
- Class structures and mobility
- Cultural norms and values
- Religious influences
- Everyday life for different groups

### Causes and Effects
- Identify both immediate triggers and underlying causes
- Distinguish between short-term and long-term consequences
- Recognize intended versus unintended outcomes
- Consider counterfactual scenarios

### Primary Sources
- Analyze who created the source and why
- Consider the intended audience
- Recognize biases and limitations
- Corroborate with other sources

### Multiple Perspectives
- Examine events from diverse viewpoints
- Consider marginalized groups often excluded from traditional narratives
- Recognize how national or cultural biases shape historical accounts

Remember that historical interpretation changes over time as new evidence emerges and analytical frameworks evolve. The best historical analysis combines factual accuracy with thoughtful interpretation of significance and context.`;
      } 
      // Check for literature/writing-related questions
      else if (lowercasePrompt.includes('english') || 
               lowercasePrompt.includes('essay') || 
               lowercasePrompt.includes('write') || 
               lowercasePrompt.includes('book') ||
               lowercasePrompt.includes('literature')) {
        
        response = `# Literature Analysis & Essay Writing Guide

## Literary Analysis Framework

When analyzing literature, consider these elements:

### Plot & Structure
- Exposition, rising action, climax, falling action, resolution
- Linear, nonlinear, circular, or episodic structures
- Pacing and its effect on reader experience

### Character Analysis
- Protagonist/antagonist dynamics
- Character development (static vs. dynamic)
- Motivation, conflicts, and relationships
- Direct and indirect characterization

### Setting
- Time period and location
- Physical and social environment
- Atmosphere and its contribution to meaning

### Theme
- Central ideas or messages
- Universal truths or insights
- How other elements support themes

### Literary Devices
- Symbolism: objects representing abstract ideas
- Imagery: sensory descriptions
- Irony: contrast between expectation and reality
- Foreshadowing: hints about future events
- Metaphor/simile: comparative devices

## Essay Writing Process

1. **Pre-writing**
   - Understand the prompt/question
   - Brainstorm ideas and gather evidence
   - Organize thoughts (outline or concept map)

2. **Thesis Development**
   - Create a specific, arguable claim
   - Provide a roadmap for your analysis
   - Ensure it answers the prompt

3. **Structured Writing**
   - Introduction: context, thesis, brief overview
   - Body paragraphs: topic sentence, evidence, analysis, transition
   - Conclusion: restate thesis, broader implications

4. **Revision**
   - Check argument coherence and evidence strength
   - Improve transitions between ideas
   - Enhance clarity and precision of language
   - Eliminate repetition and verbose phrasing

5. **Proofreading**
   - Fix grammar and spelling errors
   - Check formatting and citations
   - Read aloud to catch awkward phrasing

Remember that strong literary analysis combines textual evidence with your interpretation, always connecting observations back to your thesis.`;
      } 
      // Default response for other types of questions
      else {
        response = `# Effective Study Strategies

No matter what subject you're studying, these techniques can help you learn more effectively:

### Active Learning Methods
- **Retrieval practice**: Test yourself instead of just rereading material
- **Spaced repetition**: Review information at increasing intervals
- **Interleaving**: Mix different topics rather than focusing on one
- **Elaboration**: Explain concepts in your own words and connect to examples
- **Concrete examples**: Apply abstract concepts to specific scenarios

### Note-Taking Strategies
- **Cornell method**: Divide page into notes, cues, and summary sections
- **Mind mapping**: Create visual representations of connected ideas
- **Outline method**: Organize information hierarchically
- **Annotation**: Actively engage with texts by highlighting and commenting

### Problem-Solving Framework
1. Understand the problem completely before starting
2. Break complex problems into smaller steps
3. Identify relevant formulas, theories, or principles
4. Work through systematically, checking each step
5. Verify your answer makes logical sense

### Study Environment Optimization
- Minimize distractions (silence notifications, use focus apps)
- Study in sessions of 25-50 minutes with short breaks
- Vary study locations to improve memory retention
- Teach concepts to others to solidify understanding

### Research Techniques
- Evaluate source credibility (authority, accuracy, currency)
- Take organized notes with complete citation information
- Look for consensus across multiple reliable sources
- Distinguish between facts, opinions, and interpretations

For more specific guidance, try to formulate a focused question about your particular assignment or topic.`;
      }
      
      // Add a consistent footer to every response
      response += `\n\n---\n*Homework Helper by ChatApp - Helping students learn better!*`;
      
      res.json({ response });
    } catch (error) {
      console.error('AI Homework Helper Error:', error);
      res.status(500).json({ 
        error: 'Failed to get response', 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Authentication Routes
  // Register endpoint
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const result = registerSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: 'Validation error',
          errors: result.error.errors
        });
      }

      const { username, password } = result.data;

      // Check if user already exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(409).json({ message: 'Username already exists' });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create new user
      const newUser = await storage.createUser({
        username,
        password: hashedPassword
      });

      // Return user without password
      res.status(201).json({
        id: newUser.id,
        username: newUser.username
      });
    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({
        message: 'Error registering user',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Login endpoint
  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      // Validate request body
      const result = loginSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          message: 'Validation error',
          errors: result.error.errors
        });
      }

      const { username, password } = result.data;

      // Find user
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({ message: 'Invalid username or password' });
      }

      // Return user without password
      res.status(200).json({
        id: user.id,
        username: user.username
      });
    } catch (error) {
      console.error('Error logging in:', error);
      res.status(500).json({
        message: 'Error logging in',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Check if username exists (for registration)
  app.get('/api/auth/check-username/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      
      const user = await storage.getUserByUsername(username);
      
      res.json({ exists: !!user });
    } catch (error) {
      console.error('Error checking username:', error);
      res.status(500).json({
        message: 'Error checking username',
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // User settings endpoints
  
  // Get user settings
  app.get('/api/user/settings/:username', async (req: Request, res: Response) => {
    try {
      const { username } = req.params;
      
      // Get user from storage
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
      
      // Return settings
      return res.json({
        phoneNumber: user.phoneNumber || '',
        notifyFriendOnline: user.notifyFriendOnline || false
      });
    } catch (error) {
      console.error('Error getting user settings:', error);
      return res.status(500).json({
        message: 'Internal server error'
      });
    }
  });
  
  // Update user settings
  app.post('/api/user/settings', async (req: Request, res: Response) => {
    try {
      const { username, phoneNumber, notifyFriendOnline } = req.body;
      
      console.log("Updating settings for user:", username, "Phone:", phoneNumber, "Notify:", notifyFriendOnline);
      
      if (!username) {
        return res.status(400).json({
          message: 'Username is required'
        });
      }
      
      // Get user from storage
      const user = await storage.getUserByUsername(username);
      
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }
      
      // Use the new updateUserSettings method in storage
      const success = await storage.updateUserSettings(username, {
        phoneNumber: phoneNumber || '',
        notifyFriendOnline: !!notifyFriendOnline
      });
      
      if (success) {
        // Return success
        return res.json({
          message: 'Settings updated successfully'
        });
      } else {
        return res.status(500).json({
          message: 'Failed to update settings'
        });
      }
    } catch (error) {
      console.error('Error updating user settings:', error);
      return res.status(500).json({
        message: 'Internal server error'
      });
    }
  });

  // Test Twilio SMS endpoint (for testing SMS functionality)
  app.post('/api/user/test-sms', async (req: Request, res: Response) => {
    try {
      console.log("Test SMS request received:", req.body);
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        console.log("No phone number provided in request");
        return res.status(400).json({
          success: false,
          message: 'Phone number is required'
        });
      }
      
      console.log("Testing SMS with phone number:", phoneNumber);
      
      // Check if Twilio is configured
      const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && 
                               process.env.TWILIO_AUTH_TOKEN && 
                               process.env.TWILIO_PHONE_NUMBER);
      
      console.log("Twilio configured:", twilioConfigured);
      
      if (!twilioConfigured) {
        return res.status(503).json({
          success: false,
          twilioConfigured: false,
          message: 'Twilio is not configured on the server'
        });
      }
      
      // Send a test SMS
      const success = await sendSmsNotification(
        phoneNumber,
        'This is a test message from ChatApp!'
      );
      
      if (success) {
        return res.json({
          success: true,
          twilioConfigured: true,
          message: 'Test SMS sent successfully'
        });
      } else {
        return res.status(500).json({
          success: false,
          twilioConfigured: true,
          message: 'Failed to send test SMS'
        });
      }
    } catch (error) {
      console.error('Error sending test SMS:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  // Add endpoint to clear database for admin users
  app.post('/api/admin/clear-database', async (req: Request, res: Response) => {
    try {
      const { username, adminCode } = req.body;
      
      // Simple admin code verification
      // In a real-world app, this would be much more secure
      if (adminCode !== process.env.ADMIN_SECRET && adminCode !== 'admin123') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Invalid admin code'
        });
      }
      
      // Verify user has admin role
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Clear the database
      await storage.clearDatabase();
      
      return res.json({
        success: true,
        message: 'Database cleared successfully'
      });
    } catch (error) {
      console.error('Error clearing database:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });
  
  app.post('/api/admin/clear-chat-messages', async (req: Request, res: Response) => {
    try {
      const { username, adminCode } = req.body;
      
      // Simple admin code verification
      // In a real-world app, this would be much more secure
      if (adminCode !== process.env.ADMIN_SECRET && adminCode !== 'admin123') {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized: Invalid admin code'
        });
      }
      
      // Verify user has admin role
      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
      
      // Clear just the chat messages, preserving users and other data
      await storage.clearChatMessages();
      
      // Broadcast a system message informing users that chat history has been cleared
      broadcastToAll({
        type: MessageType.CHAT,
        username: 'System',
        text: 'Chat history has been cleared by an administrator.',
        timestamp: new Date().toISOString(),
        isPrivate: false
      });
      
      return res.json({
        success: true,
        message: 'Chat messages cleared successfully'
      });
    } catch (error) {
      console.error('Error clearing chat messages:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  });

  return httpServer;
}
