import { users, type User, type InsertUser, type ChatUser, type ChatMessage, UserRole } from "@shared/schema";
import { v4 as uuidv4 } from 'uuid';
import { eq } from "drizzle-orm";
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
      const result = await pool.query(
        'SELECT * FROM chat_users WHERE username = $1 AND is_active = TRUE',
        [username]
      );
      
      if (result.rows.length > 0) {
        throw new Error('Username already taken');
      }
      
      // Create a unique user ID
      const userId = uuidv4();
      
      // Insert the new user
      const insertResult = await pool.query(
        'INSERT INTO chat_users (id, username, is_active, role) VALUES ($1, $2, TRUE, $3) RETURNING *',
        [userId, username, role]
      );
      
      const row = insertResult.rows[0];
      return {
        id: row.id,
        username: row.username,
        isActive: row.is_active,
        role: row.role as UserRole
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
      await pool.query(
        'UPDATE chat_users SET is_active = FALSE WHERE username = $1',
        [username]
      );
    } catch (error) {
      console.error("Error removing chat user:", error);
    }
  }
  
  async getChatUsers(): Promise<ChatUser[]> {
    try {
      const result = await pool.query(
        'SELECT * FROM chat_users WHERE is_active = TRUE'
      );
      
      return result.rows.map(row => ({
        id: row.id,
        username: row.username,
        isActive: row.is_active,
        role: row.role as UserRole
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
      const result = await pool.query(
        'INSERT INTO chat_messages (id, username, text, timestamp, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [messageId, username, text, timestamp, type]
      );
      
      const row = result.rows[0];
      return {
        id: row.id,
        username: row.username,
        text: row.text,
        timestamp: new Date(row.timestamp),
        type: row.type as 'user' | 'system'
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
      const limitClause = limit ? `LIMIT ${limit}` : '';
      
      const result = await pool.query(
        `SELECT * FROM chat_messages ORDER BY timestamp ASC ${limitClause}`
      );
      
      return result.rows.map(row => ({
        id: row.id,
        username: row.username,
        text: row.text,
        timestamp: new Date(row.timestamp),
        type: row.type as 'user' | 'system'
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
