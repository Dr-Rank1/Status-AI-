/**
 * OpenAPI 3.0 specification for the Status public developer API.
 */

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Status Public Developer API',
    version: '1.0.0',
    description:
      'OAuth2-secured API for third-party integrations — social feed, AI characters, and webhooks.',
    contact: { name: 'Status Platform', url: 'https://status.dev' },
  },
  servers: [{ url: '/api/v1/public', description: 'Public API base path' }],
  tags: [
    { name: 'OAuth', description: 'Client credentials token exchange' },
    { name: 'Feed', description: 'Public social feed' },
    { name: 'Characters', description: 'AI character integrations' },
    { name: 'Webhooks', description: 'Real-time event subscriptions' },
    { name: 'Federated', description: 'Privacy-preserving model sync' },
  ],
  paths: {
    '/oauth/token': {
      post: {
        tags: ['OAuth'],
        summary: 'Obtain access token (client_credentials)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['grant_type', 'client_id', 'client_secret'],
                properties: {
                  grant_type: { type: 'string', enum: ['client_credentials'] },
                  client_id: { type: 'string' },
                  client_secret: { type: 'string' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Access token',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    access_token: { type: 'string' },
                    token_type: { type: 'string' },
                    expires_in: { type: 'integer' },
                    scope: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/feed': {
      get: {
        tags: ['Feed'],
        security: [{ bearerAuth: [] }],
        summary: 'List public feed posts',
        parameters: [
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'fandom', in: 'query', schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Feed posts' } },
      },
    },
    '/characters': {
      get: {
        tags: ['Characters'],
        security: [{ bearerAuth: [] }],
        summary: 'List published AI characters',
        responses: { 200: { description: 'Character list' } },
      },
    },
    '/characters/{id}': {
      get: {
        tags: ['Characters'],
        security: [{ bearerAuth: [] }],
        summary: 'Get character profile',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { 200: { description: 'Character detail' } },
      },
    },
    '/characters/{id}/chat': {
      post: {
        tags: ['Characters'],
        security: [{ bearerAuth: [] }],
        summary: 'Send a message to an AI character',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message'],
                properties: { message: { type: 'string', maxLength: 2000 } },
              },
            },
          },
        },
        responses: { 200: { description: 'Character reply' } },
      },
    },
    '/webhooks': {
      get: {
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        summary: 'List registered webhooks',
        responses: { 200: { description: 'Webhook list' } },
      },
      post: {
        tags: ['Webhooks'],
        security: [{ bearerAuth: [] }],
        summary: 'Register a webhook',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['url'],
                properties: {
                  url: { type: 'string', format: 'uri' },
                  events: { type: 'array', items: { type: 'string' } },
                  secret: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Webhook created' } },
      },
    },
    '/federated/submit': {
      post: {
        tags: ['Federated'],
        summary: 'Submit encrypted model weight delta',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['userCommitment', 'encryptedPayload'],
                properties: {
                  userCommitment: { type: 'string' },
                  encryptedPayload: { type: 'string' },
                  sampleCount: { type: 'integer' },
                },
              },
            },
          },
        },
        responses: { 202: { description: 'Contribution accepted' } },
      },
    },
    '/federated/status': {
      get: {
        tags: ['Federated'],
        summary: 'Federated learning round status',
        responses: { 200: { description: 'Round and global model info' } },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'OAuth2',
      },
    },
  },
};
