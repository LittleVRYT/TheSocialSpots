import { users, chatUsers, chatMessages, friendships, friendColors, type User, type InsertUser, type ChatUser, type ChatMessage, UserRole, FriendStatus, type Friend } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, or, asc } from "drizzle-orm";
import { db, pool } from './db';

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Chat specific methods
  addChatUser(username: string): Promise<ChatUser>;
  removeChatUser(username: string): Promise<void>;
  getChatUsers(): Promise<ChatUser[]>;
  
  // Message methods
  addMessage(username: string, text: string, type: 'user' | 'system', recipient?: string, isPrivate?: boolean): Promise<ChatMessage>;
  addVoiceMessage(username: string, text: string, voiceData: string, voiceDuration: number, recipient?: string, isPrivate?: boolean): Promise<ChatMessage>;
  getMessages(limit?: number): Promise<ChatMessage[]>;
  getPrivateMessages(username: string, recipient: string, limit?: number): Promise<ChatMessage[]>;
  
  // Reaction methods
  addReaction(messageId: string, username: string, emoji: string): Promise<Record<string, string[]>>;
  removeReaction(messageId: string, username: string, emoji: string): Promise<Record<string, string[]>>;
  getMessageReactions(messageId: string): Promise<Record<string, string[]>>;
  
  // Time tracking methods
  updateUserLastActive(username: string): Promise<void>;
  getUsersByTimeOnline(limit?: number): Promise<ChatUser[]>;
  
  // Friend system methods
  sendFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean>;
  acceptFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean>;
  rejectFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean>;
  removeFriend(requesterUsername: string, addresseeUsername: string): Promise<boolean>;
  getFriends(username: string): Promise<Friend[]>;
  getFriendRequests(username: string): Promise<Friend[]>;
  updateFriendColor(username: string, friendUsername: string, color: string): Promise<boolean>;
  getFriendColor(username: string, friendUsername: string): Promise<string | undefined>;
  
  // Database initialization
  initialize(): Promise<void>;
}

export class PgStorage implements IStorage {
  // Implement time tracking methods
  async updateUserLastActive(username: string): Promise<void> {
    try {
      const now = new Date();
      // Get the current user to calculate time online
      const [currentUser] = await db.select()
        .from(chatUsers)
        .where(and(
          eq(chatUsers.username, username),
          eq(chatUsers.isActive, true)
        ));
        
      if (currentUser) {
        const lastActive = currentUser.lastActive ? new Date(currentUser.lastActive) : now;
        const currentTotalTime = currentUser.totalTimeOnline || 0;
        // Calculate additional time since last active (in seconds)
        const additionalTime = Math.floor((now.getTime() - lastActive.getTime()) / 1000);
        // Update the user's last active time and total time online
        await db.update(chatUsers)
          .set({ 
            lastActive: now,
            totalTimeOnline: currentTotalTime + additionalTime
          })
          .where(eq(chatUsers.username, username));
      }
    } catch (error) {
      console.error("Error updating user's last active time:", error);
    }
  }
  
  async getUsersByTimeOnline(limit: number = 10): Promise<ChatUser[]> {
    try {
      const users = await db.select()
        .from(chatUsers)
        .orderBy(desc(chatUsers.totalTimeOnline))
        .limit(limit);
      
      return users.map(user => ({
        id: user.id,
        username: user.username,
        isActive: user.isActive || false,
        role: user.role as UserRole,
        avatarColor: user.avatarColor || undefined,
        avatarShape: (user.avatarShape as 'circle' | 'square' | 'rounded') || undefined,
        avatarInitials: user.avatarInitials || undefined,
        joinTime: user.joinTime ? new Date(user.joinTime) : undefined,
        lastActive: user.lastActive ? new Date(user.lastActive) : undefined,
        totalTimeOnline: user.totalTimeOnline || 0
      }));
    } catch (error) {
      console.error("Error getting users sorted by time online:", error);
      return [];
    }
  }
  async initialize(): Promise<void> {
    try {
      // Create tables if they don't exist
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS chat_users (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL UNIQUE,
          is_active BOOLEAN DEFAULT TRUE,
          role TEXT DEFAULT 'user',
          avatar_color TEXT DEFAULT '#6366f1',
          avatar_shape TEXT DEFAULT 'circle',
          avatar_initials TEXT
        );
        
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          type TEXT NOT NULL,
          recipient TEXT,
          is_private BOOLEAN DEFAULT FALSE,
          reactions JSONB DEFAULT '{}'
        );
        
        -- Create friendship tables
        CREATE TABLE IF NOT EXISTS friendships (
          id SERIAL PRIMARY KEY,
          requester_id TEXT NOT NULL,
          addressee_id TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE TABLE IF NOT EXISTS friend_colors (
          id SERIAL PRIMARY KEY,
          user_id TEXT NOT NULL,
          friend_id TEXT NOT NULL,
          color TEXT NOT NULL DEFAULT 'rgb(99, 102, 241)',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);
      
      // Check and add required columns if they don't exist
      await pool.query(`
        DO $$
        BEGIN
          -- Check for reactions column
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_messages' AND column_name = 'reactions'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN reactions JSONB DEFAULT '{}';
          END IF;
          
          -- Check for voice message related columns
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_messages' AND column_name = 'is_voice_message'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN is_voice_message BOOLEAN DEFAULT FALSE;
          END IF;
          
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_messages' AND column_name = 'voice_data'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN voice_data TEXT;
          END IF;
          
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_messages' AND column_name = 'voice_duration'
          ) THEN
            ALTER TABLE chat_messages ADD COLUMN voice_duration INTEGER;
          END IF;
          
          -- Add join and last active time tracking to chat_users if they don't exist
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_users' AND column_name = 'join_time'
          ) THEN
            ALTER TABLE chat_users ADD COLUMN join_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          END IF;
          
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_users' AND column_name = 'last_active'
          ) THEN
            ALTER TABLE chat_users ADD COLUMN last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
          END IF;
          
          IF NOT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'chat_users' AND column_name = 'total_time_online'
          ) THEN
            ALTER TABLE chat_users ADD COLUMN total_time_online INTEGER DEFAULT 0;
          END IF;
        END
        $$;
      `);
      console.log("Database initialized successfully");
    } catch (error) {
      console.error("Error initializing database:", error);
    }
  }
  
  async getUser(id: number): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.id, id));
      return user;
    } catch (error) {
      console.error("Error getting user:", error);
      return undefined;
    }
  }
  
  async getUserByUsername(username: string): Promise<User | undefined> {
    try {
      const [user] = await db.select().from(users).where(eq(users.username, username));
      return user;
    } catch (error) {
      console.error("Error getting user by username:", error);
      return undefined;
    }
  }
  
  async createUser(insertUser: InsertUser): Promise<User> {
    try {
      const [user] = await db.insert(users).values(insertUser).returning();
      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }
  
  async addChatUser(username: string): Promise<ChatUser> {
    // Assign owner role if username is "Charles F"
    const role = username === "Charles F" ? UserRole.OWNER : UserRole.USER;
    
    try {
      // Check if user already exists and is active
      const existingActiveUsers = await db.select()
        .from(chatUsers)
        .where(eq(chatUsers.username, username));
      
      const activeUser = existingActiveUsers.find(user => user.isActive === true);
      
      if (activeUser) {
        throw new Error('Username already taken');
      }
      
      // Check if the user exists but is inactive
      const inactiveUser = existingActiveUsers.find(user => user.isActive === false);
      
      // If the user exists but is inactive, reactivate them
      if (inactiveUser) {
        const [reactivatedUser] = await db.update(chatUsers)
          .set({ isActive: true })
          .where(eq(chatUsers.username, username))
          .returning();
        
        return {
          id: reactivatedUser.id,
          username: reactivatedUser.username,
          isActive: true, // Force to true since we're reactivating
          role: reactivatedUser.role as UserRole,
          avatarColor: reactivatedUser.avatarColor || undefined,
          avatarShape: (reactivatedUser.avatarShape as 'circle' | 'square' | 'rounded') || undefined,
          avatarInitials: reactivatedUser.avatarInitials || undefined
        };
      }
      
      // Create a unique user ID for new users
      const userId = uuidv4();
      
      // Generate avatar initials (default to first letter of username)
      const avatarInitials = username.charAt(0).toUpperCase();
      
      // Insert the new user
      const [newUser] = await db.insert(chatUsers)
        .values({
          id: userId,
          username,
          isActive: true,
          role,
          avatarColor: '#6366f1', // Default indigo color
          avatarShape: 'circle',  // Default circle shape
          avatarInitials
        })
        .returning();
      
      return {
        id: newUser.id,
        username: newUser.username,
        isActive: true, // Force to true to avoid null issues
        role: newUser.role as UserRole,
        avatarColor: newUser.avatarColor || undefined,
        avatarShape: (newUser.avatarShape as 'circle' | 'square' | 'rounded') || undefined,
        avatarInitials: newUser.avatarInitials || undefined
      };
    } catch (error) {
      console.error("Error adding chat user:", error);
      
      // Fallback to create a user object without storing in case of errors
      const userId = uuidv4();
      return {
        id: userId,
        username,
        isActive: true,
        role
      };
    }
  }
  
  async removeChatUser(username: string): Promise<void> {
    try {
      await db.update(chatUsers)
        .set({ isActive: false })
        .where(eq(chatUsers.username, username));
    } catch (error) {
      console.error("Error removing chat user:", error);
    }
  }
  
  async getChatUsers(): Promise<ChatUser[]> {
    try {
      const users = await db.select()
        .from(chatUsers)
        .where(eq(chatUsers.isActive, true));
      
      return users.map(user => ({
        id: user.id,
        username: user.username,
        isActive: true, // Force to true since we're already filtering for active users
        role: user.role as UserRole,
        avatarColor: user.avatarColor || undefined,
        avatarShape: (user.avatarShape as 'circle' | 'square' | 'rounded') || undefined,
        avatarInitials: user.avatarInitials || undefined
      }));
    } catch (error) {
      console.error("Error getting chat users:", error);
      return [];
    }
  }
  
  async addMessage(username: string, text: string, type: 'user' | 'system' = 'user', recipient?: string, isPrivate?: boolean): Promise<ChatMessage> {
    const messageId = uuidv4();
    const timestamp = new Date();
    
    try {
      const [message] = await db.insert(chatMessages)
        .values({
          id: messageId,
          username,
          text,
          timestamp,
          type,
          recipient,
          isPrivate: isPrivate || false,
          isVoiceMessage: false // Explicitly set to false for text messages
        })
        .returning();
      
      return {
        id: message.id,
        username: message.username,
        text: message.text,
        timestamp: message.timestamp ? new Date(message.timestamp) : timestamp,
        type: message.type as 'user' | 'system',
        recipient: message.recipient || undefined,
        isPrivate: message.isPrivate || false,
        isVoiceMessage: false
      };
    } catch (error) {
      console.error("Error adding message:", error);
      // Fallback to returning a message object without storing
      return {
        id: messageId,
        username,
        text,
        timestamp,
        type,
        recipient,
        isPrivate: isPrivate || false,
        isVoiceMessage: false
      };
    }
  }
  
  async addVoiceMessage(username: string, text: string, voiceData: string, voiceDuration: number, recipient?: string, isPrivate?: boolean): Promise<ChatMessage> {
    const messageId = uuidv4();
    const timestamp = new Date();
    
    try {
      const [message] = await db.insert(chatMessages)
        .values({
          id: messageId,
          username,
          text, // Usually a placeholder like "Voice message"
          timestamp,
          type: 'user',
          recipient,
          isPrivate: isPrivate || false,
          isVoiceMessage: true,
          voiceData,
          voiceDuration
        })
        .returning();
      
      return {
        id: message.id,
        username: message.username,
        text: message.text,
        timestamp: message.timestamp ? new Date(message.timestamp) : timestamp,
        type: message.type as 'user' | 'system',
        recipient: message.recipient || undefined,
        isPrivate: message.isPrivate || false,
        isVoiceMessage: true,
        voiceData,
        voiceDuration
      };
    } catch (error) {
      console.error("Error adding voice message:", error);
      // Fallback to returning a message object without storing
      return {
        id: messageId,
        username,
        text,
        timestamp,
        type: 'user',
        recipient,
        isPrivate: isPrivate || false,
        isVoiceMessage: true,
        voiceData,
        voiceDuration
      };
    }
  }
  
  async getMessages(limit?: number): Promise<ChatMessage[]> {
    try {
      const query = db.select().from(chatMessages)
        .where(eq(chatMessages.isPrivate, false)) // Only get public messages
        .orderBy(chatMessages.timestamp);
      
      const messages = limit 
        ? await query.limit(limit) 
        : await query;
      
      return messages.map(msg => ({
        id: msg.id,
        username: msg.username,
        text: msg.text,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        type: msg.type as 'user' | 'system',
        recipient: msg.recipient || undefined,
        isPrivate: msg.isPrivate || false,
        isVoiceMessage: msg.isVoiceMessage || false,
        voiceData: msg.voiceData || undefined,
        voiceDuration: msg.voiceDuration || undefined,
        reactions: msg.reactions as Record<string, string[]> || {}
      }));
    } catch (error) {
      console.error("Error getting messages:", error);
      return [];
    }
  }
  
  async getPrivateMessages(username: string, recipient: string, limit?: number): Promise<ChatMessage[]> {
    try {
      // Get messages where the user is either the sender or recipient of private messages
      const query = db.select().from(chatMessages)
        .where(
          and(
            eq(chatMessages.isPrivate, true),
            and(
              or(
                and(
                  eq(chatMessages.username, username),
                  eq(chatMessages.recipient, recipient)
                ),
                and(
                  eq(chatMessages.username, recipient),
                  eq(chatMessages.recipient, username)
                )
              )
            )
          )
        )
        .orderBy(chatMessages.timestamp);
      
      const messages = limit 
        ? await query.limit(limit) 
        : await query;
      
      return messages.map(msg => ({
        id: msg.id,
        username: msg.username,
        text: msg.text,
        timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
        type: msg.type as 'user' | 'system',
        recipient: msg.recipient || undefined,
        isPrivate: true,
        isVoiceMessage: msg.isVoiceMessage || false,
        voiceData: msg.voiceData || undefined,
        voiceDuration: msg.voiceDuration || undefined,
        reactions: msg.reactions as Record<string, string[]> || {}
      }));
    } catch (error) {
      console.error("Error getting private messages:", error);
      return [];
    }
  }
  
  // Reaction methods
  async addReaction(messageId: string, username: string, emoji: string): Promise<Record<string, string[]>> {
    try {
      // Get the current message's reactions
      const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
      
      if (!message) {
        throw new Error(`Message with ID ${messageId} not found`);
      }
      
      // Initialize reactions object if it doesn't exist
      const reactions = message.reactions as Record<string, string[]> || {};
      
      // Initialize emoji array if it doesn't exist
      if (!reactions[emoji]) {
        reactions[emoji] = [];
      }
      
      // Add username to the emoji's reactions if not already present
      if (!reactions[emoji].includes(username)) {
        reactions[emoji].push(username);
      }
      
      // Update the message with the new reactions
      await db.update(chatMessages)
        .set({ reactions })
        .where(eq(chatMessages.id, messageId));
      
      return reactions;
    } catch (error) {
      console.error("Error adding reaction:", error);
      return {};
    }
  }
  
  async removeReaction(messageId: string, username: string, emoji: string): Promise<Record<string, string[]>> {
    try {
      // Get the current message's reactions
      const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
      
      if (!message) {
        throw new Error(`Message with ID ${messageId} not found`);
      }
      
      // Get the reactions object
      const reactions = message.reactions as Record<string, string[]> || {};
      
      // If this emoji has reactions and the user has reacted with it
      if (reactions[emoji] && reactions[emoji].includes(username)) {
        // Remove the user from the emoji's reactions
        reactions[emoji] = reactions[emoji].filter(user => user !== username);
        
        // If no users have this reaction anymore, remove the emoji key
        if (reactions[emoji].length === 0) {
          delete reactions[emoji];
        }
        
        // Update the message with the new reactions
        await db.update(chatMessages)
          .set({ reactions })
          .where(eq(chatMessages.id, messageId));
      }
      
      return reactions;
    } catch (error) {
      console.error("Error removing reaction:", error);
      return {};
    }
  }
  
  async getMessageReactions(messageId: string): Promise<Record<string, string[]>> {
    try {
      // Get the message
      const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, messageId));
      
      if (!message) {
        throw new Error(`Message with ID ${messageId} not found`);
      }
      
      // Return the reactions
      return message.reactions as Record<string, string[]> || {};
    } catch (error) {
      console.error("Error getting message reactions:", error);
      return {};
    }
  }
  
  // Friend system methods
  async sendFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean> {
    try {
      if (requesterUsername === addresseeUsername) {
        console.error("Cannot send friend request to yourself");
        return false;
      }
      
      // Check if a request already exists
      const existingRequests = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, requesterUsername),
            eq(friendships.addresseeId, addresseeUsername)
          )
        );
      
      if (existingRequests.length > 0) {
        console.log("Friend request already exists");
        return false;
      }
      
      // Create a new friend request
      await db.insert(friendships)
        .values({
          requesterId: requesterUsername,
          addresseeId: addresseeUsername,
          status: FriendStatus.PENDING
        });
      
      return true;
    } catch (error) {
      console.error("Error sending friend request:", error);
      return false;
    }
  }
  
  async acceptFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean> {
    try {
      // Find the request
      const [request] = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, requesterUsername),
            eq(friendships.addresseeId, addresseeUsername),
            eq(friendships.status, FriendStatus.PENDING)
          )
        );
      
      if (!request) {
        console.error("Friend request not found");
        return false;
      }
      
      // Update the request status
      await db.update(friendships)
        .set({ 
          status: FriendStatus.ACCEPTED,
          updatedAt: new Date()
        })
        .where(eq(friendships.id, request.id));
      
      // Create default friend colors if they don't exist
      const defaultColor = 'rgb(99, 102, 241)'; // Default indigo
      
      // Set color for requester
      const requesterColorExists = await db.select()
        .from(friendColors)
        .where(
          and(
            eq(friendColors.userId, addresseeUsername),
            eq(friendColors.friendId, requesterUsername)
          )
        );
      
      if (requesterColorExists.length === 0) {
        await db.insert(friendColors)
          .values({
            userId: addresseeUsername,
            friendId: requesterUsername,
            color: defaultColor
          });
      }
      
      // Set color for addressee
      const addresseeColorExists = await db.select()
        .from(friendColors)
        .where(
          and(
            eq(friendColors.userId, requesterUsername),
            eq(friendColors.friendId, addresseeUsername)
          )
        );
      
      if (addresseeColorExists.length === 0) {
        await db.insert(friendColors)
          .values({
            userId: requesterUsername,
            friendId: addresseeUsername,
            color: defaultColor
          });
      }
      
      return true;
    } catch (error) {
      console.error("Error accepting friend request:", error);
      return false;
    }
  }
  
  async rejectFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean> {
    try {
      // Find the request
      const [request] = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, requesterUsername),
            eq(friendships.addresseeId, addresseeUsername),
            eq(friendships.status, FriendStatus.PENDING)
          )
        );
      
      if (!request) {
        console.error("Friend request not found");
        return false;
      }
      
      // Update the request status
      await db.update(friendships)
        .set({ 
          status: FriendStatus.REJECTED,
          updatedAt: new Date()
        })
        .where(eq(friendships.id, request.id));
      
      return true;
    } catch (error) {
      console.error("Error rejecting friend request:", error);
      return false;
    }
  }
  
  async removeFriend(username: string, friendUsername: string): Promise<boolean> {
    try {
      // Find all friend relationships between these users
      const friendships1 = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, username),
            eq(friendships.addresseeId, friendUsername),
            eq(friendships.status, FriendStatus.ACCEPTED)
          )
        );
      
      const friendships2 = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, friendUsername),
            eq(friendships.addresseeId, username),
            eq(friendships.status, FriendStatus.ACCEPTED)
          )
        );
      
      // Delete the friendships
      if (friendships1.length > 0) {
        await db.delete(friendships)
          .where(eq(friendships.id, friendships1[0].id));
      }
      
      if (friendships2.length > 0) {
        await db.delete(friendships)
          .where(eq(friendships.id, friendships2[0].id));
      }
      
      // Remove color preferences
      await db.delete(friendColors)
        .where(
          or(
            and(
              eq(friendColors.userId, username),
              eq(friendColors.friendId, friendUsername)
            ),
            and(
              eq(friendColors.userId, friendUsername),
              eq(friendColors.friendId, username)
            )
          )
        );
      
      return true;
    } catch (error) {
      console.error("Error removing friend:", error);
      return false;
    }
  }
  
  async getFriends(username: string): Promise<Friend[]> {
    try {
      // Find friends where the user was the requester
      const sentRequests = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, username),
            eq(friendships.status, FriendStatus.ACCEPTED)
          )
        );
      
      // Find friends where the user was the addressee
      const receivedRequests = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.addresseeId, username),
            eq(friendships.status, FriendStatus.ACCEPTED)
          )
        );
      
      // Combine the results
      const friendsList: Friend[] = [];
      
      for (const request of sentRequests) {
        const color = await this.getFriendColor(username, request.addresseeId);
        friendsList.push({
          username: request.addresseeId,
          status: FriendStatus.ACCEPTED,
          color: color || 'rgb(99, 102, 241)'
        });
      }
      
      for (const request of receivedRequests) {
        const color = await this.getFriendColor(username, request.requesterId);
        friendsList.push({
          username: request.requesterId,
          status: FriendStatus.ACCEPTED,
          color: color || 'rgb(99, 102, 241)'
        });
      }
      
      return friendsList;
    } catch (error) {
      console.error("Error getting friends:", error);
      return [];
    }
  }
  
  async getFriendRequests(username: string): Promise<Friend[]> {
    try {
      // Find pending requests where the user is the addressee
      const requests = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.addresseeId, username),
            eq(friendships.status, FriendStatus.PENDING)
          )
        );
      
      // Convert to Friend objects
      return requests.map(request => ({
        username: request.requesterId,
        status: FriendStatus.PENDING
      }));
    } catch (error) {
      console.error("Error getting friend requests:", error);
      return [];
    }
  }
  
  async updateFriendColor(username: string, friendUsername: string, color: string): Promise<boolean> {
    try {
      // Check if these users are friends
      const isFriend = await this.areFriends(username, friendUsername);
      
      if (!isFriend) {
        console.error("Users are not friends");
        return false;
      }
      
      // Find existing color preference
      const colorPrefs = await db.select()
        .from(friendColors)
        .where(
          and(
            eq(friendColors.userId, username),
            eq(friendColors.friendId, friendUsername)
          )
        );
      
      if (colorPrefs.length > 0) {
        // Update existing preference
        await db.update(friendColors)
          .set({ 
            color: color,
            updatedAt: new Date()
          })
          .where(eq(friendColors.id, colorPrefs[0].id));
      } else {
        // Create new preference
        await db.insert(friendColors)
          .values({
            userId: username,
            friendId: friendUsername,
            color: color
          });
      }
      
      return true;
    } catch (error) {
      console.error("Error updating friend color:", error);
      return false;
    }
  }
  
  async getFriendColor(username: string, friendUsername: string): Promise<string | undefined> {
    try {
      const [colorPref] = await db.select()
        .from(friendColors)
        .where(
          and(
            eq(friendColors.userId, username),
            eq(friendColors.friendId, friendUsername)
          )
        );
      
      return colorPref?.color;
    } catch (error) {
      console.error("Error getting friend color:", error);
      return undefined;
    }
  }
  
  // Helper method to check if users are friends
  private async areFriends(user1: string, user2: string): Promise<boolean> {
    try {
      const friendship1 = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, user1),
            eq(friendships.addresseeId, user2),
            eq(friendships.status, FriendStatus.ACCEPTED)
          )
        );
      
      const friendship2 = await db.select()
        .from(friendships)
        .where(
          and(
            eq(friendships.requesterId, user2),
            eq(friendships.addresseeId, user1),
            eq(friendships.status, FriendStatus.ACCEPTED)
          )
        );
      
      return friendship1.length > 0 || friendship2.length > 0;
    } catch (error) {
      console.error("Error checking friendship status:", error);
      return false;
    }
  }
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chatUsers: Map<string, ChatUser>;
  private messages: ChatMessage[];
  private friendRequests: Map<string, { requester: string, addressee: string, status: FriendStatus }>;
  private friendColors: Map<string, { user: string, friend: string, color: string }>;
  currentId: number;

  constructor() {
    this.users = new Map();
    this.chatUsers = new Map();
    this.messages = [];
    this.friendRequests = new Map();
    this.friendColors = new Map();
    this.currentId = 1;
  }
  
  async initialize(): Promise<void> {
    // Nothing to initialize for memory storage
    return;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentId++;
    const user: User = { 
      ...insertUser, 
      id, 
      phoneNumber: null, 
      notifyFriendOnline: false 
    };
    this.users.set(id, user);
    return user;
  }
  
  // Chat specific methods
  async addChatUser(username: string): Promise<ChatUser> {
    // Check if user already exists and is active
    const existingUser = Array.from(this.chatUsers.values()).find(
      user => user.username === username && user.isActive
    );
    
    if (existingUser) {
      throw new Error('Username already taken');
    }
    
    const id = uuidv4();
    // Assign owner role if username is "Charles F"
    const role = username === "Charles F" ? UserRole.OWNER : UserRole.USER;
    
    // Generate initials (using first letter of username)
    const avatarInitials = username.charAt(0).toUpperCase();
    
    // Get phone number and notification preferences from the user account if available
    let phoneNumber: string | undefined = undefined;
    let notifyFriendOnline: boolean = false;
    
    // Find the user in the database if they are registered
    const userRecord = await this.getUserByUsername(username);
    if (userRecord) {
      phoneNumber = userRecord.phoneNumber || undefined;
      notifyFriendOnline = userRecord.notifyFriendOnline || false;
    }
    
    const newUser: ChatUser = {
      id,
      username,
      isActive: true,
      role,
      avatarColor: '#6366f1',
      avatarShape: 'circle',
      avatarInitials,
      phoneNumber,
      notifyFriendOnline
    };
    this.chatUsers.set(username, newUser);
    return newUser;
  }
  
  async removeChatUser(username: string): Promise<void> {
    this.chatUsers.delete(username);
  }
  
  async getChatUsers(): Promise<ChatUser[]> {
    return Array.from(this.chatUsers.values());
  }
  
  async addMessage(username: string, text: string, type: 'user' | 'system' = 'user', recipient?: string, isPrivate?: boolean): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: uuidv4(),
      username,
      text,
      timestamp: new Date(),
      type,
      recipient,
      isPrivate: isPrivate || false,
      isVoiceMessage: false
    };
    this.messages.push(message);
    return message;
  }
  
  async addVoiceMessage(username: string, text: string, voiceData: string, voiceDuration: number, recipient?: string, isPrivate?: boolean): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: uuidv4(),
      username,
      text, // Usually a placeholder like "Voice message"
      timestamp: new Date(),
      type: 'user',
      recipient,
      isPrivate: isPrivate || false,
      isVoiceMessage: true,
      voiceData,
      voiceDuration
    };
    this.messages.push(message);
    return message;
  }
  
  async getMessages(limit?: number): Promise<ChatMessage[]> {
    // Filter out private messages
    const publicMessages = this.messages.filter(msg => !msg.isPrivate);
    const sortedMessages = [...publicMessages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (limit) {
      return sortedMessages.slice(-limit);
    }
    return sortedMessages;
  }
  
  async getPrivateMessages(username: string, recipient: string, limit?: number): Promise<ChatMessage[]> {
    // Get messages where the user is either the sender or recipient of private messages
    const privateMessages = this.messages.filter(msg => 
      msg.isPrivate && (
        (msg.username === username && msg.recipient === recipient) || 
        (msg.username === recipient && msg.recipient === username)
      )
    );
    
    // Sort by timestamp
    const sortedMessages = [...privateMessages].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    
    if (limit) {
      return sortedMessages.slice(-limit);
    }
    return sortedMessages;
  }
  
  async updateUserLastActive(username: string): Promise<void> {
    const user = Array.from(this.chatUsers.values()).find(u => u.username === username && u.isActive);
    if (user) {
      const now = new Date();
      
      // Calculate time since last active
      if (user.lastActive) {
        const additionalTime = Math.floor((now.getTime() - user.lastActive.getTime()) / 1000);
        user.totalTimeOnline = (user.totalTimeOnline || 0) + additionalTime;
      }
      
      // Update last active time
      user.lastActive = now;
      
      // Set join time if not set
      if (!user.joinTime) {
        user.joinTime = now;
      }
    }
  }
  
  async getUsersByTimeOnline(limit: number = 10): Promise<ChatUser[]> {
    const users = Array.from(this.chatUsers.values())
      .filter(user => user.totalTimeOnline !== undefined)
      .sort((a, b) => {
        const aTime = a.totalTimeOnline || 0;
        const bTime = b.totalTimeOnline || 0;
        return bTime - aTime; // Sort in descending order
      });
    
    return users.slice(0, limit);
  }
  
  // Reaction methods
  async addReaction(messageId: string, username: string, emoji: string): Promise<Record<string, string[]>> {
    // Find the message by ID
    const message = this.messages.find(msg => msg.id === messageId);
    
    if (!message) {
      console.error(`Message with ID ${messageId} not found`);
      return {};
    }
    
    // Initialize reactions object if it doesn't exist
    if (!message.reactions) {
      message.reactions = {};
    }
    
    // Initialize emoji array if it doesn't exist
    if (!message.reactions[emoji]) {
      message.reactions[emoji] = [];
    }
    
    // Add username to the emoji's reactions if not already present
    if (!message.reactions[emoji].includes(username)) {
      message.reactions[emoji].push(username);
    }
    
    return message.reactions;
  }
  
  async removeReaction(messageId: string, username: string, emoji: string): Promise<Record<string, string[]>> {
    // Find the message by ID
    const message = this.messages.find(msg => msg.id === messageId);
    
    if (!message) {
      console.error(`Message with ID ${messageId} not found`);
      return {};
    }
    
    // If no reactions object exists, return empty object
    if (!message.reactions) {
      return {};
    }
    
    // If this emoji has reactions and the user has reacted with it
    if (message.reactions[emoji] && message.reactions[emoji].includes(username)) {
      // Remove the user from the emoji's reactions
      message.reactions[emoji] = message.reactions[emoji].filter(user => user !== username);
      
      // If no users have this reaction anymore, remove the emoji key
      if (message.reactions[emoji].length === 0) {
        delete message.reactions[emoji];
      }
    }
    
    return message.reactions;
  }
  
  async getMessageReactions(messageId: string): Promise<Record<string, string[]>> {
    // Find the message by ID
    const message = this.messages.find(msg => msg.id === messageId);
    
    if (!message) {
      console.error(`Message with ID ${messageId} not found`);
      return {};
    }
    
    return message.reactions || {};
  }
  
  // Friend system implementation for memory storage
  
  async sendFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean> {
    if (requesterUsername === addresseeUsername) {
      console.error("Cannot send friend request to yourself");
      return false;
    }
    
    // Generate a unique ID for the request
    const requestId = `${requesterUsername}_${addresseeUsername}`;
    
    // Check if a request already exists
    if (this.friendRequests.has(requestId)) {
      console.log("Friend request already exists");
      return false;
    }
    
    // Create a new friend request
    this.friendRequests.set(requestId, {
      requester: requesterUsername,
      addressee: addresseeUsername,
      status: FriendStatus.PENDING
    });
    
    return true;
  }
  
  async acceptFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean> {
    const requestId = `${requesterUsername}_${addresseeUsername}`;
    const request = this.friendRequests.get(requestId);
    
    if (!request || request.status !== FriendStatus.PENDING) {
      console.error("Friend request not found or not pending");
      return false;
    }
    
    // Update the request status
    request.status = FriendStatus.ACCEPTED;
    
    // Set default colors
    const defaultColor = 'rgb(99, 102, 241)'; // Default indigo
    
    // Create color preferences for both users
    const color1Id = `${addresseeUsername}_${requesterUsername}`;
    const color2Id = `${requesterUsername}_${addresseeUsername}`;
    
    this.friendColors.set(color1Id, {
      user: addresseeUsername,
      friend: requesterUsername,
      color: defaultColor
    });
    
    this.friendColors.set(color2Id, {
      user: requesterUsername,
      friend: addresseeUsername,
      color: defaultColor
    });
    
    return true;
  }
  
  async rejectFriendRequest(requesterUsername: string, addresseeUsername: string): Promise<boolean> {
    const requestId = `${requesterUsername}_${addresseeUsername}`;
    const request = this.friendRequests.get(requestId);
    
    if (!request || request.status !== FriendStatus.PENDING) {
      console.error("Friend request not found or not pending");
      return false;
    }
    
    // Update the request status
    request.status = FriendStatus.REJECTED;
    
    return true;
  }
  
  async removeFriend(username: string, friendUsername: string): Promise<boolean> {
    const requestId1 = `${username}_${friendUsername}`;
    const requestId2 = `${friendUsername}_${username}`;
    
    // Remove from friendRequests
    this.friendRequests.delete(requestId1);
    this.friendRequests.delete(requestId2);
    
    // Remove color preferences
    const colorId1 = `${username}_${friendUsername}`;
    const colorId2 = `${friendUsername}_${username}`;
    
    this.friendColors.delete(colorId1);
    this.friendColors.delete(colorId2);
    
    return true;
  }
  
  async getFriends(username: string): Promise<Friend[]> {
    const friends: Friend[] = [];
    
    // Check all friend requests where the user is involved
    // Convert Map to array to avoid Iterator issues in TS
    const friendRequestEntries = Array.from(this.friendRequests.entries());
    
    for (const [requestId, request] of friendRequestEntries) {
      if (request.status === FriendStatus.ACCEPTED) {
        if (request.requester === username) {
          // User is the requester
          const colorId = `${username}_${request.addressee}`;
          const colorPref = this.friendColors.get(colorId);
          
          friends.push({
            username: request.addressee,
            status: FriendStatus.ACCEPTED,
            color: colorPref?.color || 'rgb(99, 102, 241)'
          });
        } else if (request.addressee === username) {
          // User is the addressee
          const colorId = `${username}_${request.requester}`;
          const colorPref = this.friendColors.get(colorId);
          
          friends.push({
            username: request.requester,
            status: FriendStatus.ACCEPTED,
            color: colorPref?.color || 'rgb(99, 102, 241)'
          });
        }
      }
    }
    
    return friends;
  }
  
  async getFriendRequests(username: string): Promise<Friend[]> {
    const requests: Friend[] = [];
    
    // Check all friend requests where the user is the addressee
    // Convert Map to array to avoid Iterator issues in TS
    const friendRequestEntries = Array.from(this.friendRequests.entries());
    
    for (const [requestId, request] of friendRequestEntries) {
      if (request.status === FriendStatus.PENDING && request.addressee === username) {
        requests.push({
          username: request.requester,
          status: FriendStatus.PENDING
        });
      }
    }
    
    return requests;
  }
  
  async updateFriendColor(username: string, friendUsername: string, color: string): Promise<boolean> {
    // Check if these users are friends
    const isFriend = await this.areFriends(username, friendUsername);
    
    if (!isFriend) {
      console.error("Users are not friends");
      return false;
    }
    
    // Update the color preference
    const colorId = `${username}_${friendUsername}`;
    
    this.friendColors.set(colorId, {
      user: username,
      friend: friendUsername,
      color: color
    });
    
    return true;
  }
  
  async getFriendColor(username: string, friendUsername: string): Promise<string | undefined> {
    const colorId = `${username}_${friendUsername}`;
    const colorPref = this.friendColors.get(colorId);
    
    return colorPref?.color;
  }
  
  private async areFriends(user1: string, user2: string): Promise<boolean> {
    const requestId1 = `${user1}_${user2}`;
    const requestId2 = `${user2}_${user1}`;
    
    const request1 = this.friendRequests.get(requestId1);
    const request2 = this.friendRequests.get(requestId2);
    
    return (request1?.status === FriendStatus.ACCEPTED) || (request2?.status === FriendStatus.ACCEPTED);
  }
}

// Choose which storage implementation to use based on environment
export const storage = process.env.DATABASE_URL ? new PgStorage() : new MemStorage();
