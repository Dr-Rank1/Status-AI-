import { z } from 'zod';

const username = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores');

const email = z
  .string()
  .trim()
  .email('Valid email required')
  .max(255, 'Email must be at most 255 characters');

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

const displayName = z
  .string()
  .trim()
  .min(1, 'Display name is required')
  .max(64, 'Display name must be at most 64 characters');

export const registerSchema = z.object({
  username,
  email,
  password,
  displayName,
});

export const loginSchema = z.object({
  email: z.string().trim().min(1, 'Email or username is required').max(255),
  password: z.string().min(1, 'Password is required').max(128),
});

export const sendMessageSchema = z.object({
  characterId: z.string().uuid('characterId must be a valid UUID'),
  content: z.string().trim().min(1, 'content is required').max(4000, 'content too long'),
  threadId: z.string().uuid().optional(),
});

export const createPostSchema = z.object({
  content: z.string().trim().min(1, 'content is required').max(5000, 'content too long'),
  imageUrl: z.string().trim().max(2048).optional().nullable(),
});

export const refillEnergySchema = z.object({
  productId: z.string().trim().min(1, 'productId is required').max(64),
  receiptToken: z.string().trim().min(8, 'receiptToken is required').max(512),
});

export const replyToPostSchema = z.object({
  content: z.string().trim().min(1, 'content is required').max(4000, 'content too long'),
});
