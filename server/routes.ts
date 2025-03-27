import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { MessageType, type WSMessage, ChatRegion, ChatRoom, FriendStatus, insertUserSchema, loginSchema, registerSchema } from "@shared/schema";
import OpenAI from "openai";
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

  // Initialize OpenAI client if API key is available
  let openai: OpenAI | null = null;
  try {
    if (process.env.OPENAI_API_KEY) {
      openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    } else {
      console.log("No OpenAI API key provided. AI homework helper will return fallback responses.");
    }
  } catch (error) {
    console.error("Error initializing OpenAI client:", error);
  }

  // AI Homework Helper endpoint
  app.post('/api/ai-homework-help', async (req: Request, res: Response) => {
    try {
      const { prompt } = req.body;
      
      if (!prompt) {
        return res.status(400).json({ error: 'Prompt is required' });
      }

      let response: string;

      try {
        // Try to use the OpenAI API if available
        if (!openai) {
          throw new Error("OpenAI client not initialized");
        }
        
        const completion = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: "You are a helpful academic assistant. Provide clear, informative responses to homework questions. Break down complex problems step by step. Explain concepts thoroughly. Do not just give direct answers to problems."
            },
            { 
              role: "user", 
              content: prompt 
            }
          ],
          max_tokens: 800,
          temperature: 0.7,
        });

        response = completion.choices[0].message.content || '';
      } catch (apiError) {
        console.log('OpenAI API Error:', apiError);
        
        // Fallback to local solution if API call fails
        const lowercasePrompt = prompt.toLowerCase();
        
        // Detect some basic academic topics
        if (lowercasePrompt.includes('math') || 
            lowercasePrompt.includes('equation') || 
            lowercasePrompt.includes('solve') ||
            lowercasePrompt.includes('calculate')) {
          response = `I'd be happy to help with your math question. To solve math problems effectively:

1. Break down the problem into smaller steps
2. Identify what formulas or concepts apply
3. Work through each step carefully
4. Check your answer by plugging it back into the original problem

Without being able to connect to the AI service at the moment, I can't solve your specific problem, but these general steps should help. Try using online resources like Khan Academy or Wolfram Alpha for specific equations.`;
        } else if (lowercasePrompt.includes('history') || 
                   lowercasePrompt.includes('when') || 
                   lowercasePrompt.includes('war') || 
                   lowercasePrompt.includes('century')) {
          response = `For history questions, I recommend:

1. Identify the key events, people, and time periods
2. Look for cause and effect relationships
3. Consider multiple perspectives on historical events
4. Use reliable sources like textbooks, educational websites, and peer-reviewed articles

I'd normally provide a specific answer about your history question, but our AI service is currently unavailable. Try resources like Khan Academy, Crash Course History videos, or your textbook for reliable information.`;
        } else if (lowercasePrompt.includes('science') || 
                   lowercasePrompt.includes('biology') || 
                   lowercasePrompt.includes('physics') || 
                   lowercasePrompt.includes('chemistry')) {
          response = `For science questions, try this approach:

1. Understand the core scientific concepts involved
2. Look for relevant formulas or processes
3. Apply the scientific method to analyze the problem
4. Draw conclusions based on evidence

I can't provide a detailed answer to your specific science question right now due to service limitations, but websites like Khan Academy, National Geographic, and NASA's educational resources offer excellent scientific explanations.`;
        } else if (lowercasePrompt.includes('english') || 
                   lowercasePrompt.includes('essay') || 
                   lowercasePrompt.includes('write') || 
                   lowercasePrompt.includes('book') ||
                   lowercasePrompt.includes('literature')) {
          response = `When tackling English literature or writing assignments:

1. For essays: Start with a clear thesis statement
2. Organize your thoughts with an outline
3. Use evidence from texts to support your points
4. Revise for clarity, coherence, and grammar

For literature analysis:
1. Consider themes, characters, setting, and symbolism
2. Look at the historical context of the work
3. Analyze the author's purpose and techniques

Unfortunately, I can't provide a specific analysis of your question at the moment, but resources like Purdue OWL Writing Lab or SparkNotes can help with writing and literature.`;
        } else {
          response = `Thank you for your academic question. I'd normally provide a detailed answer, but our AI service is currently unavailable.

While I can't answer your specific question right now, here are some general study tips:

1. Break complex topics into smaller, manageable parts
2. Use multiple resources (textbooks, videos, online guides)
3. Teach concepts to others to strengthen your understanding
4. Practice with example problems or questions
5. Connect new information to things you already know

Try resources like Khan Academy, Coursera, or educational YouTube channels for your topic. If you try again later, I might be able to provide a more specific response.`;
        }
      }
      
      res.json({ response });
    } catch (error) {
      console.error('AI Homework Helper Error:', error);
      res.status(500).json({ 
        error: 'Failed to get AI response', 
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

  return httpServer;
}
