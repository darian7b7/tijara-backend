import { Request } from 'express';
import { Prisma } from '@prisma/client';

export interface AuthRequest extends Request {
  user: {
    id: string;
    email: string;
    username: string;
    role: string;
  };
}

export interface UserPreferences {
  language: string;
  theme: 'light' | 'dark';
  notifications: {
    enabledTypes: string[];
    emailNotifications: boolean;
    pushNotifications: boolean;
  };
  emailPreferences: {
    newMessages: boolean;
    listingUpdates: boolean;
    promotions: boolean;
  };
  autoLocalization: boolean;
}

export interface MessageData {
  senderId: string;
  recipientId: string;
  content: string;
  listingId?: string;
}

export interface ConversationData {
  userId: string;
  listingId?: string;
}

export type preferences = null

export type InputJsonValue = Prisma.InputJsonValue;
