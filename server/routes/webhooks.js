import express from 'express';
import { middlewares } from 'auth0-extension-express-tools';

import config from '../lib/config';
import deploy from '../lib/deploy';
import { hasChanges } from '../lib/gitlab';
import { gitlabWebhook } from '../lib/middlewares';

export default (storage) => {
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
    return deploy(storage, id, project_id, branch, repository, sha, user, req.auth0)
      .then(stats => res.status(200).json(stats))
      .catch(next);
  });

  return webhooks;
};
