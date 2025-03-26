import { users, chatUsers, chatMessages, type User, type InsertUser, type ChatUser, type ChatMessage, UserRole } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import { eq, desc } from "drizzle-orm";
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
  
  addMessage(username: string, text: string, type: 'user' | 'system'): Promise<ChatMessage>;
  getMessages(limit?: number): Promise<ChatMessage[]>;
  
  // Database initialization
  initialize(): Promise<void>;
}

export class PgStorage implements IStorage {
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
          role TEXT DEFAULT 'user'
        );
        
        CREATE TABLE IF NOT EXISTS chat_messages (
          id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          text TEXT NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          type TEXT NOT NULL
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
      const existingUsers = await db.select()
        .from(chatUsers)
        .where(eq(chatUsers.username, username))
        .where(eq(chatUsers.isActive, true));
      
      if (existingUsers.length > 0) {
        throw new Error('Username already taken');
      }
      
      // Create a unique user ID
      const userId = uuidv4();
      
      // Insert the new user
      const [newUser] = await db.insert(chatUsers)
        .values({
          id: userId,
          username,
          isActive: true,
          role
        })
        .returning();
      
      return {
        id: newUser.id,
        username: newUser.username,
        isActive: newUser.isActive,
        role: newUser.role as UserRole
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
        isActive: user.isActive,
        role: user.role as UserRole
      }));
    } catch (error) {
      console.error("Error getting chat users:", error);
      return [];
    }
  }
  
  async addMessage(username: string, text: string, type: 'user' | 'system' = 'user'): Promise<ChatMessage> {
    const messageId = uuidv4();
    const timestamp = new Date();
    
    try {
      const [message] = await db.insert(chatMessages)
        .values({
          id: messageId,
          username,
          text,
          timestamp,
          type
        })
        .returning();
      
      return {
        id: message.id,
        username: message.username,
        text: message.text,
        timestamp: new Date(message.timestamp),
        type: message.type as 'user' | 'system'
      };
    } catch (error) {
      console.error("Error adding message:", error);
      // Fallback to returning a message object without storing
      return {
        id: messageId,
        username,
        text,
        timestamp,
        type
      };
    }
  }
  
  async getMessages(limit?: number): Promise<ChatMessage[]> {
    try {
      let query = db.select().from(chatMessages).orderBy(chatMessages.timestamp);
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const messages = await query;
      
      return messages.map(msg => ({
        id: msg.id,
        username: msg.username,
        text: msg.text,
        timestamp: new Date(msg.timestamp),
        type: msg.type as 'user' | 'system'
      }));
    } catch (error) {
      console.error("Error getting messages:", error);
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
    
    const newUser: ChatUser = {
      id,
      username,
      isActive: true,
      role
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
  
  async addMessage(username: string, text: string, type: 'user' | 'system' = 'user'): Promise<ChatMessage> {
    const message: ChatMessage = {
      id: uuidv4(),
      username,
      text,
      timestamp: new Date(),
      type
    };
    this.messages.push(message);
    return message;
  }
  
  async getMessages(limit?: number): Promise<ChatMessage[]> {
    const allMessages = [...this.messages];
    if (limit) {
      return allMessages.slice(-limit);
    }
    return allMessages;
  }
}

// Choose which storage implementation to use based on environment
export const storage = process.env.DATABASE_URL ? new PgStorage() : new MemStorage();
