import { pgTable, text, serial, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Chat specific schemas and types
export enum UserRole {
  USER = 'user',
  OWNER = 'owner',
  MODERATOR = 'moderator'
}

export type ChatUser = {
  id: string;
  username: string;
  isActive: boolean;
  role?: UserRole;
};

export type ChatMessage = {
  id: string;
  username: string;
  text: string;
  timestamp: Date;
  type: 'user' | 'system';
};

// WebSocket message types
export enum MessageType {
  JOIN = 'join',
  LEAVE = 'leave',
  CHAT = 'chat',
  USERS = 'users',
  HISTORY = 'history',
  ERROR = 'error'
}

export type WSMessage = {
  type: MessageType;
  username?: string;
  text?: string;
  timestamp?: string;
  users?: ChatUser[];
  messages?: Array<{
    type: string;
    username: string;
    text: string;
    timestamp: string;
  }>;
};
