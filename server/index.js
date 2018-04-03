const join = require('url-join');
const path = require('path');
const morgan = require('morgan');
const Express = require('express');
const bodyParser = require('body-parser');
const tools = require('auth0-extension-tools');
const { middlewares, routes } = require('auth0-extension-express-tools');

const api = require('./routes');
const logger = require('./lib/logger');
const config = require('./lib/config');

module.exports = (configProvider, storageProvider) => {
  config.setProvider(configProvider);

  const storage = storageProvider
    ? new tools.WebtaskStorageContext(storageProvider, { force: 1 })
    : new tools.FileStorageContext(path.join(__dirname, './data.json'), { mergeWrites: true });

  const app = new Express();
  app.use(morgan(':method :url :status :response-time ms - :res[content-length]', {
    stream: logger.stream
  }));
  app.use(bodyParser.json({
    verify: (req, res, buf, encoding) => {
      if (buf && buf.length) {
        req.rawBody = buf.toString(encoding || 'utf8'); // eslint-disable-line no-param-reassign
      }
    }
  }));
  app.use(bodyParser.urlencoded({ extended: false }));

  // Configure authentication.
  app.get('/login', (req, res) => {
    res.redirect(join(config('PUBLIC_WT_URL'), '/admins/login'));
  });
  app.use(routes.dashboardAdmins({
    secret: config('EXTENSION_SECRET'),
    audience: 'urn:gitlab-deploy',
    rta: config('AUTH0_RTA').replace('https://', ''),
    domain: config('AUTH0_DOMAIN'),
    baseUrl: config('PUBLIC_WT_URL'),
    clientName: 'GitLab Deploy Extension',
    urlPrefix: '/admins',
    sessionStorageKey: 'gitlab-deploy:apiToken',
    scopes: 'read:tenant_settings update:tenant_settings create:clients read:clients update:clients read:connections update:connections read:rules create:rules update:rules delete:rules delete:clients read:resource_servers create:resource_servers update:resource_servers read:rules_configs delete:rules_configs update:rules_configs'
  }));

  // Configure routes.
  app.use('/app', Express.static(path.join(__dirname, '../dist')));
  app.use('/', api(storage));

  // Generic error handler.
  app.use(middlewares.errorHandler(logger.error.bind(logger)));
  return app;
};
