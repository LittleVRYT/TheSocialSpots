import { users, chatUsers, chatMessages, type User, type InsertUser, type ChatUser, type ChatMessage, UserRole } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import { eq, desc, and, or } from "drizzle-orm";
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
  getMessages(limit?: number): Promise<ChatMessage[]>;
  getPrivateMessages(username: string, recipient: string, limit?: number): Promise<ChatMessage[]>;
  
  // Time tracking methods
  updateUserLastActive(username: string): Promise<void>;
  getUsersByTimeOnline(limit?: number): Promise<ChatUser[]>;
  
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
          is_private BOOLEAN DEFAULT FALSE
        );
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
          isPrivate: isPrivate || false
        })
        .returning();
      
      return {
        id: message.id,
        username: message.username,
        text: message.text,
        timestamp: message.timestamp ? new Date(message.timestamp) : timestamp,
        type: message.type as 'user' | 'system',
        recipient: message.recipient || undefined,
        isPrivate: message.isPrivate || false
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
        isPrivate: isPrivate || false
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
        isPrivate: msg.isPrivate || false
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
        isPrivate: true
      }));
    } catch (error) {
      console.error("Error getting private messages:", error);
      return [];
    }
  }
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private chatUsers: Map<string, ChatUser>;
  private messages: ChatMessage[];
  currentId: number;

  constructor() {
    this.users = new Map();
    this.chatUsers = new Map();
    this.messages = [];
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
    const user: User = { ...insertUser, id };
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
    
    const newUser: ChatUser = {
      id,
      username,
      isActive: true,
      role,
      avatarColor: '#6366f1',
      avatarShape: 'circle',
      avatarInitials
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
      isPrivate: isPrivate || false
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
}

// Choose which storage implementation to use based on environment
export const storage = process.env.DATABASE_URL ? new PgStorage() : new MemStorage();
