import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './openapi.js';

export function mountDeveloperPortal(app) {
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec, {
    customSiteTitle: 'Status Developer Portal',
    swaggerOptions: {
      persistAuthorization: true,
      displayRequestDuration: true,
    },
  }));

  app.get('/api/docs/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
}
