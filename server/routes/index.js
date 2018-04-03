const router = require('express').Router;

const api = require('./api');
const html = require('./html');
const meta = require('./meta');
const hooks = require('./hooks');
const webhooks = require('./webhooks');

module.exports = (storage) => {
  const routes = router();
  routes.use('/.extensions', hooks());
  routes.get('/', html());
  routes.use('/meta', meta());
  routes.use('/webhooks', webhooks(storage));
  routes.use('/api', api(storage));
  return routes;
};
