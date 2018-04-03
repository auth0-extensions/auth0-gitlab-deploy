const express = require('express');
const { middlewares } = require('auth0-extension-express-tools');

const config = require('../lib/config');
const deploy = require('../lib/deploy');
const { hasChanges } = require('../lib/gitlab');
const { gitlabWebhook } = require('../lib/middlewares');

module.exports = (storage) => {
  const activeBranch = config('GITLAB_BRANCH');
  const gitlabSecret = config('EXTENSION_SECRET');

  const webhooks = express.Router(); // eslint-disable-line new-cap

  webhooks.use(middlewares.managementApiClient({
    domain: config('AUTH0_DOMAIN'),
    clientId: config('AUTH0_CLIENT_ID'),
    clientSecret: config('AUTH0_CLIENT_SECRET')
  }));

  webhooks.post('/deploy', gitlabWebhook(gitlabSecret), (req, res, next) => {
    const { id, project_id, branch, commits, repository, user, sha } = req.webhook;

    // Only for the active branch.
    if (branch !== activeBranch) {
      return res.status(202).json({ message: `Request ignored, '${branch}' is not the active branch.` });
    }

    // Only run if there really are changes.
    if (!hasChanges(commits)) {
      return res.status(202).json({ message: 'Request ignored, none of the Rules or Database Connection scripts were changed.' });
    }

    // Deploy the changes.
    res.status(201).send();

    return deploy(storage, id, project_id, branch, repository, sha, user, req.auth0);
  });

  return webhooks;
};
