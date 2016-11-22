import { Router as router } from 'express';
import { middlewares, routes } from 'auth0-extension-express-tools';

import api from './api';
import html from './html';
import meta from './meta';
import hooks from './hooks';
import webhooks from './webhooks';
import config from '../lib/config';

export default (storage) => {
  const app = router();
  const scopes = [
    'read:tenant_settings',
    'update:tenant_settings',
    'update:clients',
    'read:clients',
    'delete:clients',
    'read:connections',
    'update:connections',
    'read:rules',
    'create:rules',
    'update:rules',
    'delete:rules'
  ];
  const authenticateAdmins = middlewares.authenticateAdmins({
    credentialsRequired: false,
    secret: config('EXTENSION_SECRET'),
    audience: 'urn:gitlab-deploy',
    baseUrl: config('WT_URL'),
    onLoginSuccess: (req, res, next) => {
      next();
    }
  });
  const managementApiClient = middlewares.managementApiClient({
    domain: config('AUTH0_DOMAIN'),
    clientId: config('AUTH0_CLIENT_ID'),
    clientSecret: config('AUTH0_CLIENT_SECRET')
  });

  app.use(routes.dashboardAdmins({
    secret: config('EXTENSION_SECRET'),
    audience: 'urn:gitlab-deploy',
    rta: config('AUTH0_RTA'),
    domain: config('AUTH0_DOMAIN'),
    baseUrl: config('WT_URL'),
    clientName: 'Gitlab Deploy Extension',
    sessionStorageKey: 'token',
    scopes: scopes.join(' ')
  }));
  app.use('/.extensions', managementApiClient, hooks());
  app.get('/', html());
  app.use('/meta', meta());
  app.use('/webhooks', managementApiClient, webhooks(storage));
  app.use('/api', authenticateAdmins, middlewares.requireAuthentication, managementApiClient, api(storage));
  return app;
};
