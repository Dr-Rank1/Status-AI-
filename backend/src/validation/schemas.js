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

export const encryptionMetaSchema = z.object({
  algorithm: z.string().trim().max(32),
  iv: z.string().trim().max(256),
  senderKeyId: z.string().trim().max(256),
  version: z.number().int().min(1).max(99).optional(),
});

export const sendMessageSchema = z
  .object({
    characterId: z.string().uuid('characterId must be a valid UUID'),
    content: z.string().trim().max(4000, 'content too long').optional(),
    encrypted: z.boolean().optional().default(false),
    ciphertext: z.string().max(65536).optional(),
    encryptionMeta: encryptionMetaSchema.optional(),
    contentPreview: z.string().trim().max(64).optional(),
    threadId: z.string().uuid().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.encrypted) {
      if (!data.ciphertext?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'ciphertext is required when encrypted=true',
          path: ['ciphertext'],
        });
      }
      if (!data.encryptionMeta) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'encryptionMeta is required when encrypted=true',
          path: ['encryptionMeta'],
        });
      }
    } else if (!data.content?.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'content is required',
        path: ['content'],
      });
    }
  });

export const e2eeRegisterKeySchema = z.object({
  deviceId: z.string().trim().min(1).max(128),
  identityKeyPublic: z.string().trim().min(16).max(4096),
  signedPrekeyPublic: z.string().trim().max(4096).optional(),
});

export const zkpVerifySchema = z.object({
  proof: z.string().trim().min(16).max(8192),
  claimType: z.enum(['reputation_min', 'account_age_days', 'vip']),
  threshold: z.number().int().min(0).max(100000).optional(),
});

export const storagePinUrlSchema = z.object({
  url: z.string().trim().url().max(2048),
});

export const storagePinCharacterSchema = z.object({
  assetType: z.enum(['avatar', 'model']).optional().default('avatar'),
  url: z.string().trim().url().max(2048).optional(),
});

export const createPostSchema = z.object({
  content: z.string().trim().min(1, 'content is required').max(5000, 'content too long'),
  imageUrl: z.string().trim().max(2048).optional().nullable(),
});

export const refillEnergySchema = z.object({
  productId: z.string().trim().min(1, 'productId is required').max(64),
  receiptToken: z.string().trim().min(8, 'receiptToken is required').max(512),
});

export const feedbackSchema = z.object({
  category: z.enum(['bug', 'suggestion', 'other']),
  message: z.string().trim().min(10, 'message must be at least 10 characters').max(4000),
  deviceState: z.record(z.unknown()).optional().default({}),
  featureFlags: z.record(z.unknown()).optional().default({}),
});

export const replyToPostSchema = z.object({
  content: z.string().trim().min(1, 'content is required').max(4000, 'content too long'),
});

export const oauthTokenSchema = z.object({
  grant_type: z.literal('client_credentials'),
  client_id: z.string().trim().min(8).max(64),
  client_secret: z.string().trim().min(16).max(256),
});

export const publicChatSchema = z.object({
  message: z.string().trim().min(1).max(2000),
});

export const webhookRegisterSchema = z.object({
  url: z.string().trim().url().max(2048),
  events: z.array(z.enum(['narrative.event', 'character.status', 'feed.post', 'character.message'])).optional(),
  secret: z.string().trim().min(16).max(128).optional(),
});

export const federatedSubmitSchema = z.object({
  userCommitment: z.string().trim().min(16).max(128),
  encryptedPayload: z.string().trim().min(32).max(65536),
  sampleCount: z.number().int().min(1).max(100000).optional(),
});

export const devClientRegisterSchema = z.object({
  name: z.string().trim().min(2).max(128),
  scopes: z.array(z.string()).optional(),
});

export const pqRegisterKeySchema = z.object({
  deviceId: z.string().trim().min(1).max(128),
  kyberPublicKey: z.string().trim().min(32).max(4096),
  algorithm: z.enum(['kyber768', 'kyber1024']).optional().default('kyber768'),
});

export const bciIntentSchema = z.object({
  valence: z.number().min(-1).max(1),
  arousal: z.number().min(0).max(1),
  focusLevel: z.number().min(0).max(1).optional(),
  intentType: z.enum(['ambient', 'focus_character', 'navigate', 'disengage', 'engage']).optional().default('ambient'),
  characterId: z.string().uuid().optional(),
});

export const syntheticBatchSchema = z.object({
  personaCount: z.number().int().min(1).max(5000).optional(),
  characterIds: z.array(z.string().uuid()).optional(),
});

export const affectiveMetricsSchema = z.object({
  hrvScore: z.number().min(0).max(1).optional(),
  facialValence: z.number().min(-1).max(1).optional(),
  voiceStress: z.number().min(0).max(1).optional(),
  characterId: z.string().uuid().optional(),
});

export const meshRegisterSchema = z.object({
  peerId: z.string().trim().min(8).max(128),
  clusterId: z.string().trim().min(1).max(64),
  capabilities: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const meshSignalSchema = z.object({
  fromPeerId: z.string().trim().min(8).max(128),
  toPeerId: z.string().trim().min(8).max(128).optional(),
  signalType: z.enum(['offer', 'answer', 'ice', 'gossip', 'embedding_sync']),
  payload: z.record(z.unknown()),
});

export const meshGossipSchema = z.object({
  clusterId: z.string().trim().min(1).max(64),
  recordType: z.enum(['thread', 'embedding', 'memory', 'character_state']),
  recordKey: z.string().trim().min(1).max(256),
  payload: z.record(z.unknown()),
  originPeerId: z.string().trim().min(8).max(128).optional(),
});

export const metaverseSyncSchema = z.object({
  characterId: z.string().uuid(),
  engineType: z.enum(['generic', 'unreal', 'unity', 'openxr']).optional().default('generic'),
  exportFormat: z.enum(['vrm', 'openxr']).optional().default('vrm'),
});

export const tenantThemeSchema = z.object({
  appName: z.string().trim().min(1).max(64).optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  surfaceColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().trim().max(64).optional(),
  logoUrl: z.string().url().optional().nullable(),
});

export const tenantAiConfigSchema = z.object({
  defaultProvider: z.enum(['mock', 'openai', 'anthropic', 'gemini', 'vllm']).optional(),
  systemPromptPrefix: z.string().max(2000).optional(),
  empathyDefault: z.number().min(0).max(1).optional(),
});

export const tenantProvisionSchema = z.object({
  slug: z.string().trim().min(2).max(32).regex(/^[a-z0-9-]+$/),
  name: z.string().trim().min(2).max(128),
  themeConfig: tenantThemeSchema.optional(),
  aiConfig: tenantAiConfigSchema.optional(),
});

export const subscriptionSyncSchema = z.object({
  appUserId: z.string().trim().min(1).max(128).optional(),
  activeEntitlements: z.array(z.string()).optional(),
});
