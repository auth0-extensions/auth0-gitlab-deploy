import { ArgumentError, UnauthorizedError } from 'auth0-extension-tools';

const parse = (headers, { ref = '', commits = [], project = {}, projectId = '', userEmail = '', eventName = '', checkoutSha = '' }) => {
  const refParts = ref.split('/');

  return {
    id: checkoutSha,
    project_id: projectId,
    event: eventName,
    branch: refParts.length === 3 ? refParts[2] : '',
    commits,
    repository: project.path_with_namespace,
    user: userEmail,
    sha: checkoutSha
  };
};

module.exports = (secret) => (req, res, next) => {
  if (!secret || secret.length === 0) {
    return next(new UnauthorizedError('The extension secret is not set, unable to verify webhook signature.'));
  }

  if (!req.headers['x-gitlab-event']) {
    return next(new ArgumentError('The GitLab event name is missing.'));
  }

  if (secret !== req.headers['x-gitlab-token']) {
    return next(new UnauthorizedError('The GitLab webhook secret is incorrect.'));
  }

  req.webhook = parse(req.headers, req.body); // eslint-disable-line no-param-reassign
  return next();
};
