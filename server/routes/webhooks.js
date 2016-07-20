import express from 'express';

import config from '../lib/config';
import deploy from '../lib/deploy';

import { hasChanges } from '../lib/gitlab';
import { gitlabWebhook } from '../lib/middlewares';

export default (storageContext) => {
  const activeBranch = config('GITLAB_BRANCH');
  const gitlabSecret = config('EXTENSION_SECRET');

  const webhooks = express.Router();
  webhooks.post('/deploy', gitlabWebhook(gitlabSecret), (req, res, next) => {
    const { id, project_id, branch, commits, repository, user, sha } = req.webhook;

    // Only accept push requests.
    if (req.webhook.event !== 'push') {
      return res.status(202).json({ message: `Request ignored, the '${req.webhook.event}' event is not supported.` });
    }

    // Only for the active branch.
    if (branch !== activeBranch) {
      return res.status(202).json({ message: `Request ignored, '${branch}' is not the active branch.` });
    }

    // Only run if there really are changes.
    if (!hasChanges(commits)) {
      return res.status(202).json({ message: 'Request ignored, none of the Rules or Database Connection scripts were changed.' });
    }

    // Deploy the changes.
    return deploy(storageContext, id, project_id, branch, repository, sha, user)
      .then(stats => res.status(200).json(stats))
      .catch(next);
  });

  return webhooks;
};
