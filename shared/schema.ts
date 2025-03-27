import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Define tables to match existing database structure
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const chatUsers = pgTable("chat_users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  isActive: boolean("is_active").default(true),
  role: text("role").default('user'),
  avatarColor: text("avatar_color").default('#6366f1'), // Default to indigo
  avatarShape: text("avatar_shape").default('circle'), // circle, square, rounded
  avatarInitials: text("avatar_initials"), // For custom initials (otherwise use first letter of username)
  joinTime: timestamp("join_time").defaultNow(), // When the user first joined
  lastActive: timestamp("last_active").defaultNow(), // Last activity timestamp
  totalTimeOnline: integer("total_time_online").default(0), // Total time in seconds
});

export const chatMessages = pgTable("chat_messages", {
  id: text("id").primaryKey(),
  username: text("username").notNull(),
  text: text("text").notNull(),
  timestamp: timestamp("timestamp").defaultNow(),
  type: text("type").notNull(),
  recipient: text("recipient"),  // For private messages; null means public message
  isPrivate: boolean("is_private").default(false),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;

// Authentication schemas
export const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

export const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

export type LoginRequest = z.infer<typeof loginSchema>;
export type RegisterRequest = z.infer<typeof registerSchema>;
export type User = typeof users.$inferSelect;

// Chat specific schemas and types
export enum UserRole {
  USER = 'user',
  OWNER = 'owner',
  MODERATOR = 'moderator'
}

export enum ChatRegion {
  GLOBAL = 'global',
  NORTH_AMERICA = 'north_america',
  EUROPE = 'europe',
  ASIA = 'asia',
  SOUTH_AMERICA = 'south_america',
  AFRICA = 'africa',
  OCEANIA = 'oceania'
}

export type ChatUser = {
  id: string;
  username: string;
  isActive: boolean;
  role?: UserRole;
  chatMode?: 'local' | 'global';
  region?: ChatRegion;
  avatarColor?: string;
  avatarShape?: 'circle' | 'square' | 'rounded';
  avatarInitials?: string;
  joinTime?: Date;
  lastActive?: Date;
  totalTimeOnline?: number; // Total time in seconds
};

export type ChatMessage = {
  id: string;
  username: string;
  text: string;
  timestamp: Date;
  type: 'user' | 'system';
  recipient?: string;  // For private messages
  isPrivate?: boolean; // Whether this is a private message
};

// WebSocket message types
export enum MessageType {
  JOIN = 'join',
  LEAVE = 'leave',
  CHAT = 'chat',
  PRIVATE_MESSAGE = 'private_message',  // New message type for private messages
  USERS = 'users',
  HISTORY = 'history',
  ERROR = 'error',
  UPDATE_CHAT_MODE = 'update_chat_mode',
  UPDATE_REGION = 'update_region',
  UPDATE_AVATAR = 'update_avatar'
}

export type WSMessage = {
  type: MessageType | string; // Allow string for custom message types
  username?: string;
  text?: string;
  timestamp?: string;
  recipient?: string; // For private messages
  isPrivate?: boolean; // Flag for private messages
  users?: ChatUser[];
  messages?: Array<{
    type: string;
    username: string;
    text: string;
    timestamp: string;
    recipient?: string;
    isPrivate?: boolean;
  }>;
  chatMode?: 'global' | 'local'; // For chat mode updates
  region?: ChatRegion; // For region updates
  avatarColor?: string; // For avatar color updates
  avatarShape?: 'circle' | 'square' | 'rounded'; // For avatar shape updates
  avatarInitials?: string; // For avatar initials updates
};
